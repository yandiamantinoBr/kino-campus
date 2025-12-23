/**
 * KinoCampus - Sistema de Busca Global (V8.1.2.4.3)
 * Objetivo do saneamento:
 * - Remover montagem manual redundante de .kc-card (usa KCUtils.renderPostCard)
 * - Reaproveitar normalização via KCAPI quando disponível
 * - Manter UX da página de resultados ("Por [Autor]")
 * - Offline-first (vanilla JS, sem libs)
 */

(function () {
  'use strict';

  const KCUtils = (typeof window !== 'undefined' && window.KCUtils) ? window.KCUtils : null;
  const KCAPI = (typeof window !== 'undefined' && window.KCAPI) ? window.KCAPI : null;

  const DB_FALLBACK_URL = 'data/database.json';

  // Cache em memória
  let kcDbPosts = null; // posts do database.json (normalizados quando possível)

  // Sinônimos para busca inteligente
  const SYNONYMS = {
    notebook: ['laptop', 'computador portátil', 'note', 'computador', 'pc'],
    celular: ['smartphone', 'telefone', 'iphone', 'android', 'mobile', 'fone'],
    livro: ['livros', 'apostila', 'material didático', 'book'],
    roupa: ['roupas', 'vestuário', 'vestimenta', 'blusa', 'camisa', 'calça'],
    cama: ['colchão', 'box', 'móvel quarto', 'cama box'],
    fone: ['headphone', 'fone de ouvido', 'earphone', 'airpod', 'fones', 'audio'],
    bicicleta: ['bike', 'bici', 'mountain bike'],
    carona: ['transporte', 'viagem', 'ida', 'volta', 'caronas'],
    estágio: ['estagio', 'trainee', 'jovem aprendiz'],
    emprego: ['vaga', 'trabalho', 'job', 'oportunidade'],
    cálculo: ['calculo', 'matemática', 'exatas'],
    iphone: ['apple', 'ios', 'celular apple'],
    dell: ['notebook dell', 'laptop dell'],
    jbl: ['fone jbl', 'headphone jbl', 'audio jbl']
  };

  function normalizeText(text) {
    if (KCUtils && typeof KCUtils.normalizeText === 'function') return KCUtils.normalizeText(text);
    if (!text) return '';
    return String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function escapeHtml(str) {
    if (KCUtils && typeof KCUtils.escapeHtml === 'function') return KCUtils.escapeHtml(str);
    const s = String(str ?? '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      const v = url.searchParams.get(name);
      return v ? String(v) : '';
    } catch (_) {
      return '';
    }
  }

  function getUserPostsRaw() {
    try {
      const list = window.kcUserPosts?.list ? window.kcUserPosts.list() : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeAnyPost(raw) {
    // Preferir a normalização padrão do projeto
    if (KCAPI && typeof KCAPI.normalizePost === 'function') {
      const p = KCAPI.normalizePost(raw);
      // marcação para evitar duplicação (kc-core injeta no feed em páginas de listagem)
      if (raw && raw._kcUserPost === true) p._kcUserPost = true;
      return p;
    }

    // Fallback mínimo (mantém compat com database.json)
    const r = raw || {};
    return {
      id: r.id,
      modulo: r.modulo || 'publicacao',
      titulo: r.titulo || '',
      descricao: r.descricao || '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      emoji: r.emoji || '✨',
      verificado: !!r.verificado,
      votos: r.votos ?? 0,
      comentarios: r.comentarios ?? 0,
      timestamp: r.timestamp || '',
      autor: r.autor || 'Autor',
      autorAvatar: r.autorAvatar || '',
      categoria: r.categoria || '',
      subcategoria: r.subcategoria || '',
      preco: r.preco,
      precoTexto: r.precoTexto || null,
    };
  }

  function normalizeUserPost(raw) {
    // Posts do usuário podem vir com chaves legadas. Garantir o essencial.
    const base = raw || {};
    const fixed = {
      ...base,
      modulo: base.modulo || 'publicacao',
      titulo: base.titulo || '',
      descricao: base.descricao || '',
      tags: Array.isArray(base.tags) ? base.tags : [],
      emoji: base.emoji || '✨',
      verificado: !!base.verificado,
      votos: base.votos ?? 0,
      comentarios: base.comentarios ?? 0,
      timestamp: base.timestamp || 'Agora',
      autor: base.autor || 'Você',
      autorAvatar: base.autorAvatar || (base.autor ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(base.autor)}` : '')
    };
    fixed._kcUserPost = true;
    return normalizeAnyPost(fixed);
  }

  async function loadDbPosts() {
    if (kcDbPosts) return kcDbPosts;

    try {
      // Preferir a fonte padrão do projeto
      if (KCAPI && typeof KCAPI.getDatabaseNormalized === 'function') {
        const db = await KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db?.posts) ? db.posts : [];
        kcDbPosts = posts.map(normalizeAnyPost);
        return kcDbPosts;
      }

      // Fallback direto no JSON
      const res = await fetch(DB_FALLBACK_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      const list = Array.isArray(db?.anuncios) ? db.anuncios : [];
      kcDbPosts = list.map(normalizeAnyPost);
      return kcDbPosts;
    } catch (err) {
      console.error('[KinoCampus] Erro ao carregar database para busca:', err);
      kcDbPosts = [];
      return kcDbPosts;
    }
  }

  async function getAllPosts() {
    const db = await loadDbPosts();
    const user = getUserPostsRaw().map(normalizeUserPost);
    // Usuário primeiro (melhor feedback de criação)
    return [...user, ...db];
  }

  function expandSearchTerm(term) {
    const normalized = normalizeText(term);
    const expanded = [normalized];

    for (const [key, values] of Object.entries(SYNONYMS)) {
      const k = normalizeText(key);
      const v = values.map((x) => normalizeText(x));
      if (k === normalized || v.includes(normalized)) {
        expanded.push(k);
        expanded.push(...v);
      }
    }

    return [...new Set(expanded)].filter(Boolean);
  }

  async function searchPosts(query, options = {}) {
    const q = String(query || '').trim();
    if (!q) return [];

    const {
      modulo = null,
      categoria = null,
      limit = 50,
      minScore = 0.3
    } = options;

    const all = await getAllPosts();

    const normalizedQuery = normalizeText(q);
    const queryTerms = normalizedQuery.split(/\s+/).filter((t) => t.length > 1);
    const expandedTerms = queryTerms.flatMap((t) => expandSearchTerm(t));

    const results = [];

    for (const anuncio of all) {
      if (modulo && anuncio.modulo !== modulo) continue;
      if (categoria && anuncio.categoria !== categoria) continue;

      let score = 0;

      const title = normalizeText(anuncio.titulo);
      const desc = normalizeText(anuncio.descricao);
      const tags = (Array.isArray(anuncio.tags) ? anuncio.tags : []).map((t) => normalizeText(t));
      const cat = normalizeText(anuncio.categoria || anuncio.categoriaLabel || '');
      const sub = normalizeText(anuncio.subcategoria || anuncio.subcategoriaLabel || '');

      for (const term of expandedTerms) {
        if (!term) continue;
        if (title.includes(term)) score += 0.5;
        if (desc.includes(term)) score += 0.2;
        if (tags.some((tg) => tg.includes(term) || term.includes(tg))) score += 0.3;
      }

      if (cat.includes(normalizedQuery) || sub.includes(normalizedQuery)) score += 0.2;

      if (score >= minScore) {
        results.push({ ...anuncio, relevanceScore: score });
      }
    }

    results.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    return results.slice(0, limit);
  }

  // Filtrar cards já existentes na página (fallback em páginas sem kc-filters)
  function filterCurrentPageCards(query) {
    const cards = document.querySelectorAll('.kc-card');
    const q = String(query || '').trim();
    const normalizedQuery = normalizeText(q);
    const expandedTerms = q ? expandSearchTerm(normalizedQuery) : [];

    let visibleCount = 0;

    cards.forEach((card) => {
      const title = card.querySelector('.kc-card__title')?.textContent || '';
      const description = card.querySelector('.kc-card__description-preview')?.textContent || '';
      const categorySource = card.querySelector('.kc-card__category-source')?.textContent || '';

      const nTitle = normalizeText(title);
      const nDesc = normalizeText(description);
      const nCat = normalizeText(categorySource);

      let matches = false;

      if (!q) {
        matches = true;
      } else {
        for (const term of expandedTerms) {
          if (nTitle.includes(term) || nDesc.includes(term) || nCat.includes(term)) {
            matches = true;
            break;
          }
        }
      }

      // manter layout original do card
      card.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';

    return visibleCount;
  }

  function globalSearch(query, redirectToResults = false) {
    const q = String(query || '').trim();
    if (!q) return;

    if (redirectToResults) {
      window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
      return;
    }

    // Se existir filtro da página (kc-filters), use-o; senão, fallback local
    if (typeof window.filterPosts === 'function') {
      window.filterPosts(q);
    } else {
      filterCurrentPageCards(q);
    }
  }

  function isResultsPage() {
    const file = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return file === 'search-results.html' || !!document.getElementById('searchResultsList');
  }

  function buildResultCard(raw) {
    // Resultado deve manter o texto "Por [Autor]" na UX
    const post = normalizeAnyPost(raw);
    const modeled = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(post, {})
      : post;

    // Regras centrais de apresentação (mantém UX "Por [Autor]" nos resultados)
    if (KCUtils && typeof KCUtils.applyPresentationRules === 'function') {
      KCUtils.applyPresentationRules(modeled, { view: 'searchResults' });
    } else {
      // fallback mínimo
      modeled._kcAuthorPrefix = 'Por';
      modeled._kcCompactComments = true;
      modeled._kcCtaText = 'Ver Detalhes';
      modeled._kcPriceIconClass = 'fas fa-money-bill-wave';
      modeled._kcPriceStyle = '';
    }

if (KCUtils && typeof KCUtils.renderPostCard === 'function') {
      return KCUtils.renderPostCard(modeled);
    }

    // Fallback mínimo (não deveria acontecer)
    const href = `product.html?id=${encodeURIComponent(post.id ?? '')}`;
    return `
      <article class="kc-card">
        <div class="kc-card__main">
          <div class="kc-card__image-wrapper" style="font-size: 3em; display:flex; align-items:center; justify-content:center;">${escapeHtml(post.emoji || '✨')}</div>
          <div class="kc-card__content">
            <div class="kc-card__header"><div class="kc-card__category-source">${escapeHtml(post.modulo || '')}</div><div class="kc-card__timestamp">${escapeHtml(post.timestamp || '')}</div></div>
            <a class="kc-card__title" href="${href}">${escapeHtml(post.titulo || '')}</a>
            <div class="kc-card__description-preview">${escapeHtml(post.descricao || '')}</div>
            <div class="kc-card__author"><span>Por <strong>${escapeHtml(post.autor || 'Autor')}</strong></span></div>
          </div>
        </div>
      </article>
    `.trim();
  }

  async function renderResultsToPage(query) {
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) return;

    const q = String(query || '').trim();

    const titleEl = document.getElementById('searchQueryText');
    if (titleEl) titleEl.textContent = q ? `“${q}”` : '';

    if (!q) {
      listEl.innerHTML = '';
      const no = document.getElementById('noResults');
      if (no) no.style.display = 'block';
      const countEl = document.getElementById('resultsCount');
      if (countEl) countEl.textContent = '0';
      return;
    }

    const results = await searchPosts(q, { limit: 50, minScore: 0.2 });
    listEl.innerHTML = results.map(buildResultCard).join('\n');

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.style.display = results.length ? 'none' : 'block';
    const countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = String(results.length);
  }

  function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.querySelector('.kc-search-bar button');
    const resultsPage = isResultsPage();

    // Se a página tem kc-filters, respeitar a função padrão (tab-search)
    const hasPageFilter = (!resultsPage) && (typeof window.filterPosts === 'function');

    // Pré-carregar DB para reduzir atraso nas primeiras teclas
    loadDbPosts();

    // Se estiver na página de resultados, renderizar ao carregar
    if (resultsPage) {
      const qParam = getQueryParam('q');
      if (searchInput && qParam) searchInput.value = qParam;
      renderResultsToPage(searchInput ? searchInput.value : qParam);
    }

    // Input de busca
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        const q = e.target.value;
        if (resultsPage) {
          renderResultsToPage(q);
          return;
        }
        if (hasPageFilter) {
          window.filterPosts(q);
          return;
        }
        filterCurrentPageCards(q);
      });

      searchInput.addEventListener('keypress', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = this.value;
        if (resultsPage) {
          renderResultsToPage(q);
          return;
        }
        if (hasPageFilter) {
          window.filterPosts(q);
          return;
        }
        globalSearch(q, true);
      });
    }

    if (searchButton) {
      searchButton.addEventListener('click', function (e) {
        e.preventDefault();
        const q = searchInput ? searchInput.value : '';
        if (resultsPage) {
          renderResultsToPage(q);
          return;
        }
        if (hasPageFilter) {
          window.filterPosts(q);
          return;
        }
        globalSearch(q, true);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initSearch);

  // Exportar API pública (mantém compat com chamadas existentes)
  window.kcSearch = {
    search: (q, opts) => searchPosts(q, opts),
    filter: filterCurrentPageCards,
    globalSearch,
    loadDatabase: loadDbPosts
  };
})();
