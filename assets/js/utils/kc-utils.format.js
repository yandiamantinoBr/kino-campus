/*
  KinoCampus - Utils / Format Domain (v12.2.1)

  Sub-módulo do kc-utils.js — domínio de formatação de dados
  (data/tempo, moeda/número, URL canônica, condição de item, preço).
  Expõe window._KCU.format com 7 funções.

  Carregamento: deve ser incluído APÓS kc-utils.string.js e
  ANTES de kc-utils.js em todos os HTMLs.
  Dependências: window._KCU.string (para getConditionLabel).
  Contrato: window._KCU.format é Object.freeze() — imutável em runtime.
*/
(function () {
  'use strict';

  // ── Helpers internos ──────────────────────────────────────────────────────

  // Acesso lazy a _KCU.string (já carregado antes deste módulo)
  function _str() {
    return (window._KCU && window._KCU.string) ? window._KCU.string : null;
  }

  function _normalizeText(v) {
    const s = _str();
    return s ? s.normalizeText(v) : String(v || '').toLowerCase().trim();
  }

  function _beautifyKey(v) {
    const s = _str();
    return s ? s.beautifyKey(v) : String(v || '');
  }

  // ── Funções do domínio format ─────────────────────────────────────────────

  function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Se for no futuro (possível descompasso de relógio) ou acabou de ser publicado.
    // Aceita até 5 minutos de desvio de relógio (positivo ou negativo).
    if (diffMs <= 0 || diffMs < 300000) return 'Agora mesmo';

    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `Há ${diffMin} min`;

    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return diffHoras === 1 ? 'Há 1 hora' : `Há ${diffHoras} horas`;

    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 30) return diffDias === 1 ? 'Há 1 dia' : `Há ${diffDias} dias`;

    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses < 12) return diffMeses === 1 ? 'Há 1 mês' : `Há ${diffMeses} meses`;

    const diffAnos = Math.floor(diffDias / 365);
    return diffAnos === 1 ? 'Há 1 ano' : `Há ${diffAnos} anos`;
  }

  function formatCurrencyBRL(value) {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return 'R$ 0,00';
    try {
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_) {
      // fallback
      const fixed = (Math.round(num * 100) / 100).toFixed(2).replace('.', ',');
      return 'R$ ' + fixed;
    }
  }

  function parseBRLNumber(input) {
    const s = String(input ?? '')
      .replace(/\s/g, '')
      .replace(/R\$/i, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function buildProductDetailHref(postId) {
    const normalized = String(postId || '').trim();
    if (!normalized) return '';
    return `_product.html?id=${encodeURIComponent(normalized)}`;
  }

  function getConditionLabel(raw) {
    const r = _normalizeText(raw);
    if (!r) return '';
    if (r.includes('semi')) return 'Semi-novo';
    if (r.includes('novo')) return 'Novo';
    return _beautifyKey(r);
  }

  function splitPriceText(text) {
    const t = String(text || '').trim();
    if (!t) return { main: '', small: '' };

    // Quebra explícita por linha
    if (t.includes('\n')) {
      const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
      return { main: lines[0] || '', small: lines.slice(1).join(' ') };
    }

    // Conteúdo em parênteses como complemento
    const paren = t.match(/^(.*)\(([^)]+)\)\s*$/);
    if (paren) return { main: paren[1].trim(), small: paren[2].trim() };

    // Separadores comuns
    for (const sep of [' - ', ' • ', ' | ']) {
      if (t.includes(sep)) {
        const [a, ...rest] = t.split(sep);
        return { main: a.trim(), small: rest.join(sep).trim() };
      }
    }

    // Casos do protótipo: "R$ 5,00/trecho Ida e volta"
    const unitMatchers = ['/trecho', '/mês', '/mes', '/dia', '/hora', '/semana'];
    for (const unit of unitMatchers) {
      const idx = t.toLowerCase().indexOf(unit);
      if (idx >= 0) {
        const cut = idx + unit.length;
        const main = t.slice(0, cut).trim();
        const small = t.slice(cut).trim();
        if (small) return { main, small };
      }
    }

    return { main: t, small: '' };
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCU = window._KCU || {};
  window._KCU.format = Object.freeze({
    timeAgo,
    formatCurrencyBRL,
    parseBRLNumber,
    clamp,
    buildProductDetailHref,
    getConditionLabel,
    splitPriceText,
  });
})();
