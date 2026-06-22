// scripts/audit-posts.cjs
// Auditoria de publicações ativas no KinoCampus.
// Foco: encoding, coerência módulo/categoria, prazo, imagens, duplicatas, links.

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'published-posts-raw.json');
let raw = fs.readFileSync(INPUT, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
const posts = JSON.parse(raw);

// === Contadores
const stats = {
  total: posts.length,
  byModule: {},
  byCategory: {},
  byVisibility: {},
  encodingIssues: 0,
  descEncodingIssues: 0,
  vencido: 0,
  semImagem: 0,
  imagemStorage: 0,
  imagemUfG: 0,
  imagemExterna: 0,
  semLink: 0,
  linkUfG: 0,
  linkExterno: 0,
  incoerenciaModulo: 0,
  incoerenciaEvento: 0,
  duplicatas: 0,
  semDescricao: 0,
  descCurta: 0,
  descMuitoLonga: 0,
  imagensCaduSuspeitas: 0
};

const issues = [];
const titlesWithMojibake = [];
const duplicateTitles = [];
const duplicateLinks = [];
const vencidos = [];
const semImagem = [];
const imagensQuebradas = [];
const semLink = [];
const incoerentes = [];
const suspeito = [];

// === Detecção de mojibake
// Mojibake UTF-8 → Latin-1 (ou vice-versa) gera sequências específicas:
//   "Ã©" (e com acento), "Ã£" (a com til), "Ã§" (c com cedilha), "â€™" (apóstrofo)
//   "Â " (espaço + Â antes de caractere Latin-1)
//   "??" consecutivos indicam bytes 0x80-0xBF que viraram "?"
//   "ðŸ" antes de emoji (BOM intermediário)
// Critério conservador: só conta se 3+ sinais de mojibake OU "?? " consecutivos.

const MOJIBAKE_PATTERNS = [
  /\?\?/,                         // ?? duplo
  /ðŸ[^\s]{1,3}/,                // ðŸ… ou ðŸŽ etc. (BOM intermediário de UTF-8 mal decodificado)
  /â€™/,                          // apóstrofo mal decodificado
  /â€œ|â€�/,                       // aspas tipográficas mal decodificadas
];

function hasMojibake(s) {
  if (!s) return false;
  for (const p of MOJIBAKE_PATTERNS) {
    if (p.test(s)) return true;
  }
  return false;
}

function hasLeadingMojibake(s) {
  if (!s) return false;
  return /^[\s]*(d\?\?|d\?|ðŸ)/.test(s);
}

// === Data de vencimento
const now = new Date('2026-06-22T11:18:58-03:00');
function isExpired(post) {
  if (post.expires_at) {
    return new Date(post.expires_at) < now;
  }
  return false;
}

// Eventos: checa se o evento JÁ PASSOU usando data_fim_evento (com fallback em data_evento)
  // === Análise por post
const titleCounts = {};
const linkCounts = {};

for (const p of posts) {
  // contadores
  stats.byModule[p.module] = (stats.byModule[p.module] || 0) + 1;
  stats.byCategory[p.category] = (stats.byCategory[p.category] || 0) + 1;
  stats.byVisibility[p.visibility] = (stats.byVisibility[p.visibility] || 0) + 1;

  // encoding título
  if (hasLeadingMojibake(p.title)) {
    stats.encodingIssues++;
    titlesWithMojibake.push({
      id: p.id, title: p.title, module: p.module, category: p.category
    });
  }

  // encoding descrição
  if (hasMojibake(p.description)) {
    stats.descEncodingIssues++;
    // também adicionar à lista para inspeção
    titlesWithMojibake.push({ id: p.id, title: p.description.slice(0, 100) + '...', module: p.module, category: p.category });
  }

  // descrição vazia / muito curta / muito longa
  if (!p.description || p.description.trim().length === 0) {
    stats.semDescricao++;
    semImagem.push({ id: p.id, title: p.title, motivo: 'sem descrição' });
  } else if (p.desc_len < 50) {
    stats.descCurta++;
  } else if (p.desc_len > 3000) {
    stats.descMuitoLonga++;
    suspeito.push({ id: p.id, title: p.title, motivo: `descrição muito longa (${p.desc_len} chars)` });
  }

  // imagem
  if (!p.image_url) {
    stats.semImagem++;
    semImagem.push({ id: p.id, title: p.title, motivo: 'sem image_url' });
  } else {
    if (p.image_url.includes('supabase.co/storage')) {
      stats.imagemStorage++;
    } else if (p.image_url.includes('files.cercomp.ufg.br') || p.image_url.includes('ufg.br')) {
      stats.imagemUfG++;
    } else {
      stats.imagemExterna++;
    }
    // imagem "cadu" usada em vários posts — pode estar sendo reusada de forma genérica
    if (/cadu-\d+-\w+\.(jpg|png|webp)$/.test(p.image_url)) {
      stats.imagensCaduSuspeitas++;
    }
  }

  // link
  if (!p.link) {
    stats.semLink++;
    semLink.push({ id: p.id, title: p.title });
  } else if (p.link.includes('ufg.br') || p.link.includes('institutoverbena.ufg.br')) {
    stats.linkUfG++;
  } else {
    stats.linkExterno++;
  }

  // coerência módulo
  if (p.module === 'eventos' && p.category !== 'culturais' && p.category !== 'academicos' && p.category !== 'workshops' && p.category !== 'esportivos') {
    // não é erro grave — categoria pode ser flexível
  }
  if (p.module === 'oportunidades' && ['imoveis', 'veiculos', 'roupas', 'eletronicos'].includes(p.category)) {
    stats.incoerenciaModulo++;
    incoerentes.push({ id: p.id, title: p.title, motivo: `categoria "${p.category}" não faz sentido em oportunidades` });
  }

  // eventos: data_fim_evento é o critério real (data_evento pode ser só início)
  if (p.module === 'eventos') {
    if (!p.data_evento || p.data_evento === '') {
      incoerentes.push({ id: p.id, title: p.title, motivo: 'evento sem metadata.data_evento' });
    }
  }

  // === NOVA VERIFICAÇÃO: data_fim_evento (precisa do JSON cru) ===
  // Note: esse bloco precisa do JSON cru porque metadata->>'data_fim_evento' não vem no SELECT
  // Vou puxar separadamente depois

  // oportunidades com data_evento (geralmente devem ter só date, mas algumas usam como vencimento)
  if (p.module === 'oportunidades' && p.data_evento && p.data_evento !== '') {
    const eventDate = new Date(p.data_evento + 'T00:00:00-03:00');
    if (eventDate < now && p.status === 'published') {
      // pode ser data de encerramento de inscrição
      // não necessariamente erro, mas chamo atenção
    }
  }

  // duplicatas
  const normalizedTitle = (p.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalizedTitle) {
    titleCounts[normalizedTitle] = (titleCounts[normalizedTitle] || []).concat([{ id: p.id, title: p.title }]);
  }
  if (p.link) {
    linkCounts[p.link] = (linkCounts[p.link] || []).concat([{ id: p.id, title: p.title }]);
  }
}

// processa duplicatas
for (const [title, list] of Object.entries(titleCounts)) {
  if (list.length > 1) {
    stats.duplicatas++;
    duplicateTitles.push({ title: list[0].title, count: list.length, ids: list.map(x => x.id) });
  }
}
for (const [link, list] of Object.entries(linkCounts)) {
  if (list.length > 1) {
    duplicateLinks.push({ link, count: list.length, titles: list.map(x => x.title.slice(0, 60)) });
  }
}

// === Output
const report = {
  stats,
  titlesWithMojibake: titlesWithMojibake.slice(0, 50),
  vencidos,
  semImagem,
  semLink,
  incoerentes: incoerentes.slice(0, 50),
  duplicateTitles: duplicateTitles.slice(0, 30),
  duplicateLinks: duplicateLinks.slice(0, 30),
  suspeito: suspeito.slice(0, 20)
};

console.log('=== STATS ===');
console.log(JSON.stringify(stats, null, 2));
console.log('\n=== TÍTULOS COM MOJIBAKE NO INÍCIO (', titlesWithMojibake.length, ') ===');
titlesWithMojibake.slice(0, 20).forEach(t => console.log(`  ${t.id.slice(0,8)} [${t.module}/${t.category}] ${t.title.slice(0, 80)}`));
console.log('\n=== EVENTOS VENCIDOS (', vencidos.length, ') ===');
vencidos.forEach(v => console.log(`  ${v.id.slice(0,8)} ${v.data_evento} ${v.title.slice(0, 60)}`));
console.log('\n=== SEM IMAGEM (', semImagem.length, ') ===');
semImagem.forEach(s => console.log(`  ${s.id.slice(0,8)} ${s.motivo} ${s.title.slice(0, 60)}`));
console.log('\n=== SEM LINK (', semLink.length, ') ===');
semLink.forEach(s => console.log(`  ${s.id.slice(0,8)} ${s.title.slice(0, 60)}`));
console.log('\n=== INCOERENTES (', incoerentes.length, ') ===');
incoerentes.slice(0, 30).forEach(i => console.log(`  ${i.id.slice(0,8)} ${i.motivo} ${i.title.slice(0, 60)}`));
console.log('\n=== TÍTULOS DUPLICADOS (', duplicateTitles.length, ') ===');
duplicateTitles.forEach(d => console.log(`  (x${d.count}) ${d.title.slice(0, 80)}`));
console.log('\n=== LINKS DUPLICADOS (', duplicateLinks.length, ') ===');
duplicateLinks.forEach(d => console.log(`  (x${d.count}) ${d.link}\n     → ${d.titles.join(' | ')}`));
console.log('\n=== SUSPEITOS GERAIS (', suspeito.length, ') ===');
suspeito.forEach(s => console.log(`  ${s.id.slice(0,8)} ${s.motivo} ${s.title.slice(0, 60)}`));

// Salva report completo
fs.writeFileSync(path.join(__dirname, 'audit-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('\nFull report → scripts/audit-report.json');