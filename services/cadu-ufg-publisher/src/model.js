'use strict';

const { clamp, safeJsonParse } = require('./utils');

function resolveDeepSeekEndpoint(config = {}) {
  const raw = String(
    config.deepseekEndpoint || config.deepseekBaseUrl || 'https://api.deepseek.com/v1/chat/completions',
  ).trim();
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new Error('DeepSeek endpoint must be a valid URL');
  }
  if (url.protocol !== 'https:'
      || url.hostname !== 'api.deepseek.com'
      || url.port
      || url.username
      || url.password) {
    throw new Error('DeepSeek endpoint must use https://api.deepseek.com');
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!['/', '/v1', '/chat/completions', '/v1/chat/completions'].includes(path)) {
    throw new Error('DeepSeek endpoint must target /v1/chat/completions');
  }
  url.pathname = '/v1/chat/completions';
  url.search = '';
  url.hash = '';
  return url.toString();
}

// 2026-08-25: switched default to deepseek-v4-flash-vision-exp (V4-Flash
// Vision Exp) with reasoning_effort=max. Old text-only models remain
// allowed as a defensive fallback so an operator can roll back via env var
// (CADU_DEEPSEEK_MODEL) without a code change.
const ALLOWED_DEEPSEEK_MODELS = new Set([
  'deepseek-v4-flash-vision-exp',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
]);

function resolveDeepSeekModel(config = {}) {
  const model = String(config.deepseekModel || 'deepseek-v4-flash-vision-exp').trim();
  if (!ALLOWED_DEEPSEEK_MODELS.has(model)) {
    throw new Error('DeepSeek model must be deepseek-v4-flash-vision-exp, deepseek-v4-flash, or deepseek-v4-pro');
  }
  return model;
}

function resolveReasoningEffort(value = 'max') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '' || raw === 'max') return { thinking: { type: 'enabled' }, reasoning_effort: 'max' };
  if (raw === 'high') return { thinking: { type: 'enabled' }, reasoning_effort: 'high' };
  if (raw === 'low') return { thinking: { type: 'enabled' }, reasoning_effort: 'low' };
  if (raw === 'off' || raw === 'disabled') return { thinking: { type: 'disabled' } };
  throw new Error('Reasoning effort must be low|high|max|off');
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

  // 2026-08-04 (cost controls): a system message e o preamble do user sao
  // estaveis em todas as chamadas. Marcar a system com cache_control.ephemeral
  // faz o DeepSeek cobrar $0.0028/M (1/50 do cache-miss) para esse prefixo
  // em todas as chamadas depois da primeira.
  // 2026-08-25: switched to deepseek-v4-flash-vision-exp with
  // reasoning_effort=max. The summarizer runs on cached system prompt so
  // cache hit rate stays high; max reasoning is applied only to the user
  // turn which is short. max_tokens bumped to 4000 to fit the rich thinking
  // tail; the publisher still treats truncated content as revisao.
  const reasoning = resolveReasoningEffort(config.reasoningEffort || 'max');
  const response = await fetch(resolveDeepSeekEndpoint(config), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.deepseekApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: resolveDeepSeekModel(config),
      temperature: 0.2,
      max_tokens: 4000,
      ...reasoning,
      messages: [
        {
          role: 'system',
          content: 'Voce e um editor de utilidade publica universitaria.',
          cache_control: { type: 'ephemeral' },
        },
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
  resolveReasoningEffort,
  summarizeWithDeepSeek,
};
