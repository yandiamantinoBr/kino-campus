'use strict';

const { normalizeText, uniq } = require('./utils');

const INCLUDE_TERMS = [
  'edital', 'chamada', 'processo seletivo', 'inscricao', 'inscricoes', 'selecao',
  'bolsa', 'bolsas', 'monitoria', 'estagio', 'vagas', 'curso', 'oficina',
  'palestra', 'seminario', 'congresso', 'evento', 'extensao', 'voluntariado',
  'pibic', 'pivic', 'probec', 'mobilidade', 'calendario academico', 'prazo',
];

const EXCLUDE_TERMS = [
  'nota de pesar', 'luto oficial', 'visita institucional', 'reuniao institucional',
  'homenagem', 'posse', 'balanco de gestao', 'relatorio de gestao',
];

function has(text, term) {
  return text.includes(normalizeText(term));
}

function detectOpportunityCategory(text) {
  if (has(text, 'estagio')) return 'estagios';
  if (has(text, 'monitoria')) return 'monitoria';
  if (has(text, 'voluntariado') || has(text, 'voluntario')) return 'voluntariado';
  if (has(text, 'emprego') || has(text, 'trabalho') || has(text, 'contratacao')) return 'empregos';
  if (has(text, 'freelancer')) return 'freelancer';
  return 'monitoria';
}

function detectEventCategory(text) {
  if (has(text, 'sustentabilidade') || has(text, 'meio ambiente')) return 'sustentabilidade';
  if (has(text, 'oficina') || has(text, 'workshop') || has(text, 'curso')) return 'workshops';
  if (has(text, 'cultura') || has(text, 'cinema') || has(text, 'musica') || has(text, 'arte')) return 'culturais';
  if (has(text, 'esporte') || has(text, 'jogos') || has(text, 'danca')) return 'esportivos';
  if (has(text, 'festa')) return 'festas';
  return 'academicos';
}

function classifyItem(item, source = {}) {
  const text = normalizeText(`${item.title} ${item.summary} ${item.text}`);
  const includeHits = INCLUDE_TERMS.filter((term) => has(text, term));
  const excludeHits = EXCLUDE_TERMS.filter((term) => has(text, term));
  const hasDeadline = /\b(prazo|ate o dia|inscricoes? ate|encerra|termina)\b/i.test(text);
  const hasPdf = Array.isArray(item.pdfLinks) && item.pdfLinks.length > 0;
  const sourceBoost = Math.max(0, (5 - Number(source.tier || 3)) * 0.04);

  let score = 0.18 + sourceBoost;
  score += Math.min(includeHits.length * 0.09, 0.45);
  if (hasDeadline) score += 0.1;
  if (hasPdf) score += 0.08;
  if (/ufg|prograd|proex|prpi|secom|verbena/.test(text)) score += 0.04;
  score -= Math.min(excludeHits.length * 0.2, 0.5);
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  const opportunitySignals = ['edital', 'chamada', 'processo seletivo', 'bolsa', 'monitoria', 'estagio', 'vagas', 'selecao', 'pibic', 'pivic', 'probec'];
  const eventSignals = ['evento', 'curso', 'oficina', 'palestra', 'seminario', 'congresso', 'mostra', 'festival'];
  const opportunityScore = opportunitySignals.filter((term) => has(text, term)).length;
  const eventScore = eventSignals.filter((term) => has(text, term)).length;

  const module = opportunityScore > eventScore ? 'oportunidades' : 'eventos';
  const category = module === 'oportunidades' ? detectOpportunityCategory(text) : detectEventCategory(text);
  const decision = score >= 0.78 ? 'publish' : (score >= 0.55 ? 'review' : 'discard');

  return {
    decision,
    confidence: score,
    module,
    category,
    reasons: uniq(includeHits.concat(excludeHits.map((term) => `exclude:${term}`))),
    hasDeadline,
    hasPdf,
  };
}

module.exports = {
  classifyItem,
  detectEventCategory,
  detectOpportunityCategory,
};
