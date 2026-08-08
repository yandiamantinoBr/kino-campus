'use strict';

/**
 * Cliente fino de REFERENCIA para o Cadu publicar via Edge Function `cadu-publish`.
 *
 * Por que existe:
 *   Os scripts do servidor OpenClaw (cadu-curador-v4.1.js, publish_auto.js) faziam
 *   INSERT direto no Supabase e caiam em 'pending' (anti-spam por >3 links). A partir
 *   de agora, toda a logica de montar campos por modulo, publicar sem 'pending'
 *   (conta confiavel), subir imagem, editar e listar vive no repositorio, dentro da
 *   Edge Function `supabase/functions/cadu-publish/`.
 *
 *   O servidor passa a ser um CLIENTE FINO: autentica a conta do Cadu, monta um
 *   "item" semi-estruturado (o que o curador ja extrai) e chama o endpoint.
 *
 * Como sincronizar no servidor:
 *   1. Copie a ideia deste arquivo para publish_auto.js (ou importe-o).
 *   2. Garanta as variaveis de ambiente abaixo.
 *   3. Substitua o INSERT direto por `caduPublish(item)`.
 *
 * Variaveis de ambiente esperadas:
 *   SUPABASE_URL              ex.: https://wacyrkwhkvzwkqpolrbg.supabase.co
 *   SUPABASE_ANON_KEY         anon key (NUNCA a service_role aqui)
 *   CADU_EMAIL                e-mail da conta do Cadu
 *   CADU_PASSWORD             senha da conta do Cadu
 *
 * Requer @supabase/supabase-js (ja presente no workspace).
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/cadu-publish`;

let _client = null;
let _accessToken = '';

async function getAccessToken() {
  if (_accessToken) return _accessToken;
  _client = _client || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await _client.auth.signInWithPassword({
    email: process.env.CADU_EMAIL,
    password: process.env.CADU_PASSWORD,
  });
  if (error || !data || !data.session) {
    throw new Error(`Falha ao autenticar o Cadu: ${error ? error.message : 'sem sessao'}`);
  }
  _accessToken = data.session.access_token;
  return _accessToken;
}

async function callEndpoint(payload) {
  const token = await getAccessToken();
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const result = await resp.json().catch(() => ({ ok: false, code: 'BAD_RESPONSE' }));
  return result;
}

/** Publica um item curado. Retorna { ok, code, post_id, status, url, ... }. */
async function caduPublish(item, options = {}) {
  return callEndpoint({ action: 'publish', item, options });
}

/** Edita um post do Cadu (texto, metadata e/ou imagem). */
async function caduEdit(postId, { fields, metadata, image, images, allowExternalImageFallback } = {}) {
  return callEndpoint({ action: 'edit', postId, fields, metadata, image, images, allowExternalImageFallback });
}

/** Lista posts do Cadu para saber o que ja foi postado / esta pendente. */
async function caduList(filters = {}) {
  return callEndpoint({ action: 'list', filters });
}

/** Verifica se um conteudo (por fonte) ja foi publicado — evita duplicar. */
async function caduCheck({ sourceId, sourceUrl }) {
  return callEndpoint({ action: 'check', sourceId, sourceUrl });
}

async function caduPublishIfNew(item, options = {}) {
  const dup = await caduCheck({ sourceId: item.sourceId, sourceUrl: item.sourceUrl });
  if (dup && dup.exists) {
    return { ok: false, code: 'DUPLICATE', post_id: dup.post_id, status: dup.status };
  }
  const result = await caduPublish(item, options);
  if (result && result.code === 'QUALITY_BLOCKED') {
    console.error('[cadu-publish] QUALITY_BLOCKED:', result.quality && result.quality.blockingWarnings);
  }
  return result;
}

// Exemplo de uso (rode com: node publish_via_endpoint.example.js)
async function _demo() {
  // 1) Dedup antes de publicar
  const dup = await caduCheck({ sourceId: 'eventos-ufg-2026-semana-tec', sourceUrl: 'https://eventos.ufg.br/exemplo' });
  if (dup.exists) {
    console.log('Ja publicado:', dup.post_id, dup.status);
    return;
  }

  // 2) Publicar um EVENTO multi-dia com imagem
  const evento = await caduPublish({
    module: 'eventos',
    title: 'Semana de Tecnologia da UFG 2026',
    description: 'Palestras, oficinas e feira de projetos abertos a toda a comunidade.',
    formattedDescription: [
      '📢 **A Semana de Tecnologia da UFG 2026 reúne palestras, oficinas e feira de projetos para a comunidade acadêmica.**',
      '',
      '📅 **Data:** 10 a 14 de junho de 2026',
      '📍 **Local:** Centro de Eventos — Campus Samambaia',
      '',
      '🔗 **Inscrição:** [https://eventos.ufg.br/exemplo/inscricao](https://eventos.ufg.br/exemplo/inscricao)',
    ].join('\n'),
    category: 'academicos',
    location: 'Centro de Eventos — Campus Samambaia',
    dateStart: '2026-06-10',
    dateEnd: '2026-06-14',
    time: '08:00',
    gratuito: true,
    link: 'https://eventos.ufg.br/exemplo/inscricao',
    linkAsCta: true,
    actionLabel: 'Realizar inscrição',
    image: 'https://files.cercomp.ufg.br/weby/up/exemplo/capa.jpg',
    images: [
      'https://files.cercomp.ufg.br/weby/up/exemplo/capa.jpg',
      'https://files.cercomp.ufg.br/weby/up/exemplo/programacao.jpg',
    ],
    allowExternalImageFallback: true,
    sourceUrl: 'https://eventos.ufg.br/exemplo',
    sourceId: 'eventos-ufg-2026-semana-tec',
    sourceName: 'Eventos UFG',
    enrichmentSources: [
      { url: 'https://eventos.ufg.br/exemplo', label: 'Fonte oficial UFG', type: 'official' },
      { url: 'https://instagram.com/eventosufg', label: 'Instagram oficial', type: 'instagram' },
    ],
  });
  console.log('Evento:', evento.code, evento.post_id, evento.url);

  // 3) Publicar uma OPORTUNIDADE (modalidade detectada do texto, com varios links)
  const vaga = await caduPublish({
    module: 'oportunidades',
    category: 'empregos',
    type: 'emprego',
    title: 'Vaga: Pessoa Desenvolvedora (CLT, hibrido em Goiania)',
    description: 'Atuacao hibrida. Regime CLT. Envie curriculo pelo link oficial.',
    area: 'Tecnologia',
    contato: 'rh@empresa.com.br',
    remuneracao: '4500,00',
    link: 'https://empresa.com.br/vaga',
    images: [
      'https://files.cercomp.ufg.br/weby/up/oportunidades/vaga-capa.jpg',
      'https://files.cercomp.ufg.br/weby/up/oportunidades/vaga-card.jpg',
    ],
    sourceUrl: 'https://oportunidades.ufg.br/vaga-123',
    sourceId: 'op-ufg-vaga-123',
    sourceName: 'Oportunidades UFG',
    enrichmentSources: [
      { url: 'https://oportunidades.ufg.br/vaga-123', label: 'Fonte oficial', type: 'official' },
      { url: 'https://empresa.com.br/vaga', label: 'Pagina da vaga', type: 'registration' },
    ],
    pdfLinks: [
      'https://files.cercomp.ufg.br/edital-1.pdf',
      'https://files.cercomp.ufg.br/edital-2.pdf',
      'https://files.cercomp.ufg.br/anexo.pdf',
    ],
  });
  console.log('Oportunidade:', vaga.code, vaga.post_id, vaga.url);
}

if (require.main === module) {
  _demo().catch((err) => {
    console.error('[publish_via_endpoint] erro:', err);
    process.exit(1);
  });
}

module.exports = { caduPublish, caduEdit, caduList, caduCheck, caduPublishIfNew };
