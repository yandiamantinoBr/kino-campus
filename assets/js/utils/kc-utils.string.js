/*
  KinoCampus - Utils / String Domain (v12.2.0)

  Sub-módulo do kc-utils.js — domínio de manipulação de strings.
  Expõe window._KCU.string com as 8 funções puras de texto.

  Carregamento: deve ser incluído ANTES de kc-utils.js em todos os HTMLs.
  Dependências: nenhuma (autossuficiente).
  Contrato: window._KCU.string é Object.freeze() — imutável em runtime.
*/
(function () {
  'use strict';

  // ── Funções do domínio string ─────────────────────────────────────────────

  function titleCase(str) {
    return String(str || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function beautifyKey(key) {
    const s = String(key || '').trim();
    if (!s) return '';
    return titleCase(s.replace(/[_-]+/g, ' '));
  }

  function normalizeText(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function canonicalCategory(str) {
    let s = normalizeText(str);
    s = s.replace(/^#/, '');
    // plural básico (pt-BR)
    if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
    return s;
  }

  function slugifyText(str) {
    return normalizeText(str).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function levenshteinDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left) return right.length;
    if (!right) return left.length;

    const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[left.length][right.length];
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdownInline(raw) {
    const source = String(raw || '');
    let html = escapeHtml(source);

    // Links [label](url) — extrair antes para não interferir com outros patterns
    // Aceita https://, http://, mailto:, tel: (v13.6.2)
    const links = [];
    html = html.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g, function (_, label, url) {
      const safeUrl = String(url || '').trim();
      const safeLabel = String(label || '').trim() || safeUrl;
      const token = `__KC_LINK_${links.length}__`;
      const lower = safeUrl.toLowerCase();
      const isMailto = lower.startsWith('mailto:');
      const isTel = lower.startsWith('tel:');
      // mailto:/tel: são navegação interna do device, sem target=_blank
      links.push((isMailto || isTel)
        ? `<a href="${safeUrl}">${safeLabel}</a>`
        : `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`);
      return token;
    });

    // v13.6.3: headings Markdown (# / ## / ### / ####) → h1..h4.
    // Tem que vir ANTES de outras regras pra não conflitar com listas.
    html = html
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    html = html
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>');

    html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/(?:^|\n)-\s+(.+)(?=\n|$)/g, '<li>$1</li>');
    // v13.6.3: agrupar TODOS os <li> consecutivos em um único <ul> (antes, cada li
    // virava um <ul> próprio, gerando listas de 1 item — visualmente confuso).
    html = html.replace(/(?:<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>');
    html = html.replace(/\n/g, '<br>');

    // Restore links before applying underline (__ delimiters would corrupt tokens)
    links.forEach((tag, idx) => {
      html = html.replace(`__KC_LINK_${idx}__`, tag);
    });

    // Apply underline after link restoration (no token conflict)
    html = html.replace(/__([^_]+)__/g, '<u>$1</u>');

    return html;
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCU = window._KCU || {};
  window._KCU.string = Object.freeze({
    titleCase,
    beautifyKey,
    normalizeText,
    canonicalCategory,
    slugifyText,
    levenshteinDistance,
    escapeHtml,
    renderMarkdownInline,
  });
})();
