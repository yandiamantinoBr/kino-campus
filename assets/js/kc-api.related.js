/*
  KinoCampus - KCAPI Related Posts Module (v11.33.5)

  Sub-modulo do dominio related para a fachada KCAPI.
  Registrado em window._KCAPI.related e carregado antes de kc-api.client.js.

  Contrato preservado: os 2 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  o algoritmo de scoring puro de rankRelatedPosts (helpers internos + scoring)
  e a delegacao ao driver para getRelatedPosts.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver,  // () => driver ativo
    normalizePost,    // (raw) => post normalizado (usado por rankRelatedPosts)
  }
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  // ── Helpers internos ───────────────────────────────────────────

  function getNormalizedPostValue(post, keys) {
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (let index = 0; index < list.length; index += 1) {
      const key = list[index];
      if (!key) continue;
      const value = source[key];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function normalizeRelatedToken(value) {
    if (window.KCUtils && typeof window.KCUtils.normalizeText === 'function') {
      return window.KCUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function buildRelatedTokenSet(post) {
    const metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata))
      ? post.metadata
      : {};
    const rawTags = []
      .concat(Array.isArray(post && post.tagKeys) ? post.tagKeys : [])
      .concat(Array.isArray(post && post.tags) ? post.tags : [])
      .concat(Array.isArray(metadata.tagKeys) ? metadata.tagKeys : [])
      .concat(Array.isArray(metadata.tags) ? metadata.tags : []);

    const rawText = [
      getNormalizedPostValue(post, ['titulo', 'title']),
      getNormalizedPostValue(post, ['descricao', 'description']),
      getNormalizedPostValue(post, ['categoriaLabel', 'categoryLabel', 'categoria', 'category']),
      getNormalizedPostValue(post, ['subcategoriaLabel', 'subcategoryLabel', 'subcategoria', 'subcategory']),
    ].join(' ');

    const tokens = new Set();
    rawTags.forEach((tag) => {
      const normalized = normalizeRelatedToken(tag);
      if (normalized) tokens.add(normalized);
    });
    rawText.split(/[^a-zA-Z0-9\u00C0-\u00FF]+/).forEach((token) => {
      const normalized = normalizeRelatedToken(token);
      if (normalized && normalized.length >= 3) tokens.add(normalized);
    });
    return tokens;
  }

  function getRelatedPostAuthorId(post) {
    return getNormalizedPostValue(post, ['authorId', 'autorId', 'author_id']);
  }

  function getRelatedPostModule(post) {
    return getNormalizedPostValue(post, ['modulo', 'module']);
  }

  function getRelatedPostCategory(post) {
    return getNormalizedPostValue(post, ['categoriaKey', 'categoryKey', 'categoria', 'category']);
  }

  function getRelatedPostSubcategory(post) {
    const metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata))
      ? post.metadata
      : {};
    return getNormalizedPostValue(
      { ...(post || {}), metadataSubcategory: metadata.subcategory, metadataSubcategoryKey: metadata.subcategoryKey },
      ['subcategoriaKey', 'subcategoryKey', 'subcategoria', 'subcategory', 'metadataSubcategoryKey', 'metadataSubcategory']
    );
  }

  function getRelatedPostTimestamp(post) {
    const raw = getNormalizedPostValue(post, ['created_at', 'createdAt', 'timestamp', 'criadoEm']);
    if (!raw) return 0;
    const date = new Date(raw).getTime();
    return Number.isFinite(date) ? date : 0;
  }

  function getRelatedPostScore(candidate, currentPost, options) {
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const currentAuthor = normalizeRelatedToken(getRelatedPostAuthorId(currentPost));
    const candidateAuthor = normalizeRelatedToken(getRelatedPostAuthorId(candidate));
    const currentModule = normalizeRelatedToken(getRelatedPostModule(currentPost));
    const candidateModule = normalizeRelatedToken(getRelatedPostModule(candidate));
    const currentCategory = normalizeRelatedToken(getRelatedPostCategory(currentPost));
    const candidateCategory = normalizeRelatedToken(getRelatedPostCategory(candidate));
    const currentSubcategory = normalizeRelatedToken(getRelatedPostSubcategory(currentPost));
    const candidateSubcategory = normalizeRelatedToken(getRelatedPostSubcategory(candidate));
    const currentTokens = buildRelatedTokenSet(currentPost);
    const candidateTokens = buildRelatedTokenSet(candidate);

    let score = 0;
    let reason = 'Relacionado';

    if (currentAuthor && candidateAuthor && currentAuthor === candidateAuthor) {
      if (currentModule && candidateModule && currentModule === candidateModule) {
        score += 160;
        reason = 'Mesmo autor e módulo';
      } else {
        score += 120;
        reason = 'Mesmo autor';
      }
    }

    if (currentModule && candidateModule && currentModule === candidateModule) {
      score += 60;
      if (reason === 'Relacionado') reason = 'Mesmo módulo';
    }

    if (currentCategory && candidateCategory && currentCategory === candidateCategory) {
      score += 40;
      if (reason === 'Relacionado') reason = 'Mesma categoria';
    }

    if (currentSubcategory && candidateSubcategory && currentSubcategory === candidateSubcategory) {
      score += 30;
      if (reason === 'Relacionado') reason = 'Mesma subcategoria';
    }

    let overlap = 0;
    currentTokens.forEach((token) => {
      if (candidateTokens.has(token)) overlap += 1;
    });
    score += Math.min(overlap * 6, 48);
    if (overlap >= 2 && reason === 'Relacionado') reason = 'Termos parecidos';

    const votes = Number(candidate && candidate.votos);
    if (Number.isFinite(votes) && votes > 0) {
      score += Math.min(Math.floor(votes / 2), 12);
    }

    const currentTime = getRelatedPostTimestamp(currentPost);
    const candidateTime = getRelatedPostTimestamp(candidate);
    if (candidateTime > 0) {
      const deltaDays = Math.max(0, (Date.now() - candidateTime) / 86400000);
      if (deltaDays <= 2) score += 8;
      else if (deltaDays <= 7) score += 5;
      else if (deltaDays <= 21) score += 2;

      if (currentTime > 0 && Math.abs(currentTime - candidateTime) <= 1000 * 60 * 60 * 24 * 10) {
        score += 3;
      }
    }

    if (opts.viewerAuthenticated !== true) {
      const visibility = normalizeRelatedToken(getNormalizedPostValue(candidate, ['visibility']));
      if (visibility && visibility !== 'public') {
        score = -9999;
      }
    }

    return { score, reason };
  }

  // ── Métodos públicos ───────────────────────────────────────────

  async function getRelatedPosts(postId, options, deps) {
    const getActiveDriver = (deps && typeof deps.getActiveDriver === 'function') ? deps.getActiveDriver : () => null;
    const driver = getActiveDriver();
    if (!driver || typeof driver.getRelatedPosts !== 'function') return [];
    return driver.getRelatedPosts(postId, options || {});
  }

  function rankRelatedPosts(currentPost, candidates, options, deps) {
    const normalize = (deps && typeof deps.normalizePost === 'function') ? deps.normalizePost : ((p) => p);
    const current = (currentPost && typeof currentPost === 'object') ? currentPost : null;
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!current || !list.length) return [];

    const currentIds = new Set([
      String(current.id || '').trim(),
      String(current.uuid || '').trim(),
    ].filter(Boolean));

    const scored = [];
    list.forEach((candidate) => {
      const candidateIds = [
        String(candidate && candidate.id || '').trim(),
        String(candidate && candidate.uuid || '').trim(),
      ].filter(Boolean);
      if (candidateIds.some((value) => currentIds.has(value))) return;

      const normalizedCandidate = normalize(candidate);
      const result = getRelatedPostScore(normalizedCandidate, current, options);
      if (!Number.isFinite(result.score) || result.score <= -9999) return;

      scored.push({
        ...normalizedCandidate,
        _kcRelatedScore: result.score,
        _kcRelatedReason: result.reason,
      });
    });

    scored.sort((left, right) => {
      const scoreDiff = Number(right._kcRelatedScore || 0) - Number(left._kcRelatedScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return getRelatedPostTimestamp(right) - getRelatedPostTimestamp(left);
    });

    const seen = new Set();
    return scored.filter((item) => {
      const key = String(item.uuid || item.id || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  window._KCAPI.related = {
    getRelatedPosts,
    rankRelatedPosts,
  };
})();
