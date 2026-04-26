/**
 * kc-post-model.js — v13.6.1
 * Extraído de kc-core.js (v13.6.1 split).
 * Expõe: window.KCPostModel
 */

/* KinoCampus kc-core.js */

/**
 * KinoCampus - Core UI scripts (V8.1.2.4.5)
 *
 * Mantém apenas funcionalidades compartilhadas para evitar conflitos com scripts
 * específicos de páginas (ex.: filtros/feeds inline).
 *
 * NOTE (V7.1.2): renderização de cards centralizada em KCUtils.renderPostCard para preparar MVC.
 */


// -----------------------------
// Model layer (V8.1.2.4.5) - contrato único de Post
// -----------------------------
// Objetivo: garantir que todo post (de API/mock/localStorage) seja normalizado
// com os mesmos campos esperados pela View (KCUtils.renderPostCard).
//
// Exposição: window.KCPostModel.from(raw, { module })
//
// Obs.: não adiciona dependências e mantém compatibilidade com KCAPI.normalizePost.

window.KCPostModel = {
  from: function (raw, context) {
    const ctx = context || {};
    let post = raw || {};


    // --- Time/Badges helpers (V8.1.2.4.5) ---
    function _kcLooksISO(s) {
      return /^\d{4}-\d{2}-\d{2}T/.test(String(s || ''));
    }

    function _kcMonthIndex(name) {
      const n = String(name || '').toLowerCase();
      const map = {
        january: 0, janeiro: 0,
        february: 1, fevereiro: 1,
        march: 2, marco: 2, março: 2,
        april: 3, abril: 3,
        may: 4, maio: 4,
        june: 5, junho: 5,
        july: 6, julho: 6,
        august: 7, agosto: 7,
        september: 8, setembro: 8,
        october: 9, outubro: 9,
        november: 10, novembro: 10,
        december: 11, dezembro: 11,
      };
      return (map[n] != null) ? map[n] : 1;
    }

    function _kcGetNowFor(dateObj) {
      let now = new Date();
      try {
        const clamp = (KC_ENV && KC_ENV.clamp) ? KC_ENV.clamp : null;
        if (clamp && typeof clamp.year === 'number' && clamp.month) {
          const mi = _kcMonthIndex(clamp.month);
          if (dateObj && dateObj.getUTCFullYear && dateObj.getUTCFullYear() === clamp.year && dateObj.getUTCMonth() === mi) {
            // Base fixa para UX do protótipo (temporal clamp)
            now = new Date(Date.UTC(clamp.year, mi, 15, 14, 0, 0));
          }
        }
      } catch (_) { }
      return now;
    }



    // Normalização base (preferir KCAPI)
    if (KCAPI && typeof KCAPI.normalizePost === 'function') {
      post = KCAPI.normalizePost(post);
    } else {
      post = { ...(post || {}) };
    }

    // Garantias mínimas de contrato
    if (post.id == null && post._id != null) post.id = post._id;
    if (post.id == null) post.id = Date.now();

    // módulo
    if (!post.modulo && (post.module || ctx.module)) post.modulo = post.module || ctx.module;

    // authorId: manter string (quando existir)
    if (post.authorId != null) post.authorId = String(post.authorId);

    // Compatibilidade com dados legados
    if (!post._legacyAuthorName && (post.autor || post.author)) post._legacyAuthorName = post.autor || post.author;
    if (!post._legacyAuthorAvatar && (post.autorAvatar || post.authorAvatar)) post._legacyAuthorAvatar = post.autorAvatar || post.authorAvatar;



    // Link de módulo (breadcrumbs/UX do product)
    if (!post._kcModulePage) {
      const mk = String(post.modulo || '').toLowerCase();
      const map = {
        'compra-venda': 'compra-venda-feed.html',
        'livros': 'compra-venda-feed.html?filter=livros',
        'caronas': 'caronas-feed.html',
        'moradia': 'moradia.html',
        'eventos': 'eventos.html',
        'oportunidades': 'oportunidades.html',
        'achados-perdidos': 'achados-perdidos.html'
      };
      post._kcModulePage = map[mk] || 'index.html';
    }

    // V8.1.4.1: applyPresentationRules deve ser aplicado no ponto de renderização
    // (KCUtils.renderPostCard), evitando dupla aplicação entre Model e View.

    return post;
  }
};


