'use strict';

function resolveActionLabel(record, description = '') {
  const item = record || {};
  const dates = item.dates || {};
  const normalized = String(item.actionLabel || description || item.formattedDescription || item.description || item.text || '').toLowerCase();
  const suggestsApplication = normalized.includes('inscreva') || normalized.includes('formulário') ||
    normalized.includes('inscrições abertas') || normalized.includes('submeta') ||
    normalized.includes('submissão') || normalized.includes('candidate');

  // A future event remains useful after registration closes, but the CTA must
  // stop inviting the user to apply. The source link becomes informational.
  if (item.module === 'eventos' && dates.applicationStatus === 'closed') {
    return 'Ver detalhes';
  }

  // `canApply=false` is authoritative when the semantic gate emitted it.
  // Legacy records omit the field and preserve their historical label.
  if (dates.canApply === false && suggestsApplication) {
    return item.module === 'eventos' ? 'Ver detalhes' : 'Saiba mais';
  }

  if (item.actionLabel) return item.actionLabel;

  if (normalized.includes('inscreva') || normalized.includes('formulário') || normalized.includes('inscrições abertas')) return 'Inscreva-se';
  if (normalized.includes('submeta') || normalized.includes('submissão')) return 'Submeter trabalho';
  if (normalized.includes('acesse') || normalized.includes('edital')) return 'Acessar edital';
  if (normalized.includes('candidate')) return 'Candidate-se';
  if (normalized.includes('participe')) return 'Participar';
  if (item.module === 'eventos') return 'Ver detalhes';
  if (item.module === 'oportunidades') return 'Saiba mais';
  return '';
}

module.exports = { resolveActionLabel };
