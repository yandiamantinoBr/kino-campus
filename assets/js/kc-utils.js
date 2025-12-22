/*
  KinoCampus - Shared Utils (V7.1.2)

  Principal função:
  - Centralizar utilitários repetidos (normalize/escape/currency/debounce)
  - Evitar divergência entre scripts (search, filters, etc.)

  Exposição:
  - window.KCUtils
*/

(function () {
  'use strict';

  // Labels para exibição (mantém consistência visual com os feeds)
  const MODULE_LABEL_MAP = Object.freeze({
    'moradia': 'Moradia',
    'eventos': 'Eventos',
    'oportunidades': 'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos',
    'caronas': 'Caronas',
    'compra-venda': 'Compra e Venda',
    'livros': 'Livros',
  });

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

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cssEscape(str) {
    // fallback simples (suficiente para ids/classes gerados localmente)
    return String(str ?? '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
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

  function debounce(fn, wait = 120) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Renderização padrão de um card (estrutura idêntica aos .kc-card do HTML)
  // - Recebe um post normalizado (authorId)
  // - Busca autor via KCAPI.getAuthorById(post.authorId)
  // - Retorna HTML (string) do <article class="kc-card">...</article>
  function renderPostCard(post) {
    const p = post || {};
    const id = p.id != null ? String(p.id) : '';
    const emoji = (p.emoji || '✨');

    const moduleLabel = MODULE_LABEL_MAP[String(p.modulo || '').toLowerCase()] || 'Kino Campus';

    // Preferir labels amigáveis quando existirem; senão, usar a categoria "raw"
    const catLabel = (p.categoriaLabel || p.categoria || '');
    const subLabel = (p.subcategoriaLabel || p.subcategoria || '');
    const categoryLine = [moduleLabel, catLabel, subLabel].filter(Boolean).join(' • ');

    const ts = (p.timestamp != null ? String(p.timestamp) : '');

    // Preço
    let priceHtml = '';
    if (p.precoTexto) {
      priceHtml = `
        <div class="kc-card__price">
          <i class="fas fa-money-bill-wave"></i>
          ${escapeHtml(String(p.precoTexto))}
        </div>
      `.trim();
    } else if (p.preco != null && p.preco !== '') {
      const priceText = (typeof p.preco === 'number') ? formatCurrencyBRL(p.preco) : String(p.preco);
      priceHtml = `
        <div class="kc-card__price">
          <i class="fas fa-money-bill-wave"></i>
          ${escapeHtml(priceText)}
        </div>
      `.trim();
    }

    // Descrição (preview)
    const rawDesc = String(p.descricao || '').trim();
    const preview = rawDesc.length > 140 ? (rawDesc.slice(0, 140).trim() + '...') : rawDesc;

    // Autor (via authorId)
    const authorId = p.authorId || null;
    const author = (window.KCAPI && typeof window.KCAPI.getAuthorById === 'function')
      ? window.KCAPI.getAuthorById(authorId)
      : null;

    // Compatibilidade: KCAPI pode expor {displayName, avatarUrl} (legado) OU {name, avatar} (novo)
    const authorName = (author && (author.name || author.displayName))
      ? (author.name || author.displayName)
      : (p._legacyAuthorName || p.autor || p.author || 'Autor');

    const authorAvatar = (author && (author.avatar || author.avatarUrl))
      ? (author.avatar || author.avatarUrl)
      : (p._legacyAuthorAvatar || p.autorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=kc');

    const rating = (p.rating != null && p.rating !== '') ? Number(p.rating) : null;
    const ratingHtml = Number.isFinite(rating)
      ? `<i class="fas fa-star"></i> ${escapeHtml(rating.toFixed(1))}`
      : '';

    // Interações
    const votos = (p.votos != null && p.votos !== '') ? Number(p.votos) : 0;
    const comentarios = (p.comentarios != null && p.comentarios !== '') ? Number(p.comentarios) : 0;

    // Atributos para filtros/compatibilidade
    const attrs = [];
    attrs.push(`class="kc-card"`);
    if (id) attrs.push(`data-post-id="${escapeHtml(id)}"`);
    attrs.push(`data-verified="${escapeHtml(String(!!p.verificado))}"`);

    // Marcação de post do usuário (evita duplicação de injeção pelo kc-core.js)
    if (p._kcUserPost === true) attrs.push('data-kc-user-post="true"');

    if (p.condicao) {
      const raw = String(p.condicao).toLowerCase();
      const norm = raw.includes('semi') ? 'seminovo' : (raw.includes('novo') ? 'novo' : raw.replace(/\s+/g, ''));
      attrs.push(`data-condition="${escapeHtml(norm)}"`);
    }
    // data-category: preferir chave (categoriaKey) para filtros; label fica no texto
    const dataCategory = (p.categoriaKey || p.categoria || '');
    if (dataCategory) attrs.push(`data-category="${escapeHtml(String(dataCategory))}"`);

    // data-kc-tags: preferir tagKeys para filtros
    const tagKeys = Array.isArray(p.tagKeys) ? p.tagKeys : (Array.isArray(p.tags) ? p.tags : []);
    if (tagKeys.length) attrs.push(`data-kc-tags="${escapeHtml(tagKeys.map(String).join(' '))}"`);

    // Estrutura do card (mesmas classes)
    return `
      <article ${attrs.join(' ')}>
        <div class="kc-card__main">
          <div class="kc-card__image-wrapper" style="font-size: 3em; display: flex; align-items: center; justify-content: center;">
            ${escapeHtml(String(emoji))}
          </div>
          <div class="kc-card__content">
            <div class="kc-card__header">
              <div class="kc-card__category-source">
                ${escapeHtml(String(categoryLine))}
              </div>
              <div class="kc-card__timestamp">${escapeHtml(ts)}</div>
            </div>
            <a class="kc-card__title" href="product.html?id=${encodeURIComponent(id)}">
              ${escapeHtml(String(p.titulo || ''))}
            </a>
            ${priceHtml ? priceHtml : ''}
            <div class="kc-card__description-preview">
              ${escapeHtml(preview)}
            </div>
            <div class="kc-card__author">
              <img alt="${escapeHtml(String(authorName).split(' ')[0] || 'Autor')}" src="${escapeHtml(authorAvatar)}"/>
              <span>Anunciado por <strong>${escapeHtml(String(authorName))}</strong></span>
              ${ratingHtml}
            </div>
          </div>
        </div>
        <div class="kc-card__footer">
          <div class="kc-card__interactions">
            <div class="kc-vote-box">
              <button class="hot" onclick="vote(this, 'hot')">
                <i class="fas fa-fire"></i>
              </button>
              <span>${escapeHtml(String(Number.isFinite(votos) ? votos : 0))}</span>
              <button class="cold" onclick="vote(this, 'cold')">
                <i class="fas fa-snowflake"></i>
              </button>
            </div>
            <a class="kc-comment-link" href="product.html?id=${encodeURIComponent(id)}#comments">
              <i class="fas fa-comment"></i>
              <span>${escapeHtml(String(Number.isFinite(comentarios) ? comentarios : 0))} comentários</span>
            </a>
          </div>
          <a class="kc-action-button kc-get-coupon-button" href="product.html?id=${encodeURIComponent(id)}">
            Ver Detalhes
          </a>
        </div>
      </article>
    `.trim();
  }

  window.KCUtils = Object.freeze({
    normalizeText,
    canonicalCategory,
    escapeHtml,
    cssEscape,
    formatCurrencyBRL,
    parseBRLNumber,
    clamp,
    debounce,
    renderPostCard,
  });
})();
