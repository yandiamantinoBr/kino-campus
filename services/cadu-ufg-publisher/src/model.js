'use strict';

const { clamp, safeJsonParse } = require('./utils');

async function summarizeWithDeepSeek(config, item, classification) {
  if (!config.deepseekApiKey || !config.useModel) return '';

  const prompt = [
    'Resuma para uma publicacao do Kino Campus em portugues do Brasil.',
    'Retorne apenas texto curto, sem markdown pesado, com informacoes acionaveis.',
    'Use emojis com moderacao.',
    `Modulo: ${classification.module}`,
    `Categoria: ${classification.category}`,
    `Titulo: ${item.title}`,
    `Fonte: ${item.sourceUrl}`,
    `Conteudo: ${clamp(`${item.summary}\n${item.text}`, 5000)}`,
  ].join('\n');

  const response = await fetch(config.deepseekBaseUrl || 'https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.deepseekApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.deepseekModel || 'deepseek-chat',
      temperature: 0.2,
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
  summarizeWithDeepSeek,
};
