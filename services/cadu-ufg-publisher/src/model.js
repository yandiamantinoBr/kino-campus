'use strict';

const { clamp, safeJsonParse } = require('./utils');

function resolveDeepSeekEndpoint(config) {
  const raw = String(config.deepseekEndpoint || config.deepseekBaseUrl || 'https://api.deepseek.com').trim();
  try {
    const url = new URL(raw);
    if (/\/chat\/completions\/?$/i.test(url.pathname)) return url.toString();
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
    return url.toString();
  } catch (_) {
    return 'https://api.deepseek.com/chat/completions';
  }
}

function resolveDeepSeekModel(config) {
  const raw = String(config.deepseekModel || '').trim();
  if (!raw) return 'deepseek-v4-flash';
  if (raw === 'deepseek-chat' || raw === 'deepseek-reasoner') return 'deepseek-v4-flash';
  return raw;
}

async function summarizeWithDeepSeek(config, item, classification) {
  if (!config.deepseekApiKey || !config.useModel) return '';

  const prompt = [
    'Resuma para uma publicacao do Kino Campus em portugues do Brasil.',
    'Retorne apenas texto curto em Markdown seguro, sem HTML.',
    'Nao comece com "Resumo" ou titulo de secao; entre direto no conteudo acionavel.',
    'Priorize informacoes acionaveis: quem pode participar, prazos, cronograma, inscricao, beneficios/bolsas, numero de editais e documentos citados.',
    'Ignore frases institucionais genericas quando houver dados especificos de edital, chamada ou evento.',
    'Se listar datas, use uma linha por etapa e evite repetir datas em outro paragrafo.',
    'Se houver varios editais, diga isso claramente sem inventar links ou requisitos.',
    'Use emojis com moderacao.',
    `Modulo: ${classification.module}`,
    `Categoria: ${classification.category}`,
    `Titulo: ${item.title}`,
    `Fonte: ${item.sourceUrl}`,
    `Conteudo: ${clamp(`${item.summary}\n${item.text}`, 5000)}`,
  ].join('\n');

  const response = await fetch(resolveDeepSeekEndpoint(config), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.deepseekApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: resolveDeepSeekModel(config),
      temperature: 0.2,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: 'Voce e um editor de utilidade publica universitaria.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${text.slice(0, 300)}`);
  const data = safeJsonParse(text, {});
  return data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '').trim()
    : '';
}

module.exports = {
  resolveDeepSeekEndpoint,
  resolveDeepSeekModel,
  summarizeWithDeepSeek,
};
