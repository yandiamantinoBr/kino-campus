/*
  KinoCampus - KCAPI post normalization internals (V76)

  Extracted from kc-api.client.js to keep the post contract normalization
  outside the public facade while preserving:
  - window.KCAPI.normalizePost(raw)

  Internal exposure:
  - window._KCAPI.postsNormalize
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  function pickFirstNonEmpty(values) {
    if (!Array.isArray(values)) return '';
    for (const item of values) {
      const value = String(item == null ? '' : item).trim();
      if (value) return value;
    }
    return '';
  }

  function resolveAuthorIdWithDeps(deps, legacyAuthorName, legacyAuthorAvatar) {
    if (!deps || typeof deps.resolveAuthorId !== 'function') return null;
    return deps.resolveAuthorId(legacyAuthorName, legacyAuthorAvatar);
  }

  /**
   * Standard post contract (V7.x):
   * id, modulo, categoria, titulo, descricao, preco, authorId, timestamp, emoji, verificado.
   */
  function normalizePost(raw, deps = {}) {
    const r = raw || {};

    const id = (r.id != null) ? r.id : ((r._id != null) ? r._id : Date.now());
    const modulo = r.modulo || r.module || '';
    const categoria = r.categoria || r.category || '';
    const titulo = r.titulo || r.title || '';
    const descricao = r.descricao || r.description || '';
    const preco = (typeof r.preco === 'number') ? r.preco : ((r.price != null) ? r.price : null);

    const meta = (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)) ? { ...r.metadata } : {};
    const location = pickFirstNonEmpty([r.localizacao, r.location, meta.localizacao, meta.location, meta.local]);
    const authorProfile = (r.authorProfile && typeof r.authorProfile === 'object' && !Array.isArray(r.authorProfile))
      ? { ...r.authorProfile }
      : null;
    const legacyAuthorName = pickFirstNonEmpty([r.autor, r.author, meta.autorNome]);
    const legacyAuthorAvatar = pickFirstNonEmpty([r.autorAvatar, r.authorAvatar, meta.autorAvatar]);

    const authorId = r.authorId
      || resolveAuthorIdWithDeps(deps, legacyAuthorName, legacyAuthorAvatar)
      || null;

    const normalizedAuthorName = pickFirstNonEmpty([r.authorName, legacyAuthorName, 'Autor']);
    const normalizedAuthorAvatar = pickFirstNonEmpty([
      r.authorAvatar,
      legacyAuthorAvatar,
      deps.defaultAvatar || '',
    ]);

    const createdAt = r.createdAt || r.created_at || null;
    const created_at = r.created_at || r.createdAt || null;
    const bumpedAt = r.bumpedAt || r.bumped_at || null;
    const bumped_at = r.bumped_at || r.bumpedAt || null;
    const effectiveAt = r.effectiveAt || r.effective_at || bumpedAt || createdAt || null;
    const effective_at = r.effective_at || r.effectiveAt || bumped_at || created_at || null;
    const timestamp = r.timestamp || effectiveAt || createdAt || '';
    const emoji = r.emoji || '\u2728';

    const authorVerified = Boolean(
      r.authorVerified ??
      r.author_verified ??
      (r.profiles && r.profiles.verified) ??
      (r.author && r.author.verified) ??
      false
    );

    const verificado = (Boolean(r.verificado ?? r.verified ?? false) || authorVerified);

    const status = String(r.status || '').trim().toLowerCase() || 'published';
    const isClosed = status === 'closed' || [
      r.isClosed, r.is_closed, r.isExpired, r.is_expired, r.expired,
      meta.isClosed, meta.is_closed, meta.isExpired, meta.is_expired, meta.expired,
    ].some((value) => value === true);
    const visibility = String(r.visibility || meta.visibility || '').trim().toLowerCase() || 'public';
    // Supabase rows keep the historical pair inside metadata.  Expose it on
    // the normalized model as well so legacy tags survive every read/edit path
    // while the canonical editable pair is being backfilled.
    const tagLabels = Array.isArray(r.tags) ? r.tags : (Array.isArray(meta.tags) ? meta.tags : []);
    const tagKeys = Array.isArray(r.tagKeys)
      ? r.tagKeys
      : (Array.isArray(meta.tagKeys) ? meta.tagKeys : (tagLabels.length ? tagLabels : []));
    const userTags = Array.isArray(r.userTags) ? r.userTags : (Array.isArray(meta.userTags) ? meta.userTags : []);
    const userTagKeys = Array.isArray(r.userTagKeys) ? r.userTagKeys : (Array.isArray(meta.userTagKeys) ? meta.userTagKeys : userTags);
    const ratingRaw = (r.rating != null)
      ? r.rating
      : (r.rating_avg != null ? r.rating_avg : (authorProfile && authorProfile.rating_avg != null ? authorProfile.rating_avg : null));
    const rating = (ratingRaw != null && ratingRaw !== '') ? Number(ratingRaw) : null;
    const ratingCountRaw = (r.ratingCount != null)
      ? r.ratingCount
      : (r.rating_count != null ? r.rating_count : (authorProfile && authorProfile.rating_count != null ? authorProfile.rating_count : 0));
    const ratingCount = Math.max(0, parseInt(String(ratingCountRaw != null ? ratingCountRaw : 0), 10) || 0);
    const normalizedImages = (() => {
      const direct = Array.isArray(r.imagens) ? r.imagens : (Array.isArray(r.images) ? r.images : []);
      // v13.6.2: também ler galerias em metadata (gallery_image_urls / galleryImageUrls / image_urls)
      // — comum em posts manuais e em posts vindos de cadu-publish onde só metadata é preenchido.
      // pickFirstNonEmpty só devolve 1 valor, aqui precisamos de um ARRAY, então pegamos o primeiro
      // candidato que já seja array.
      const metaGalleryCandidates = [
        meta && meta.gallery_image_urls,
        meta && meta.galleryImageUrls,
        meta && meta.image_urls,
        meta && meta.imageUrls,
        r.gallery_image_urls,
        r.galleryImageUrls,
        r.image_urls,
      ];
      let metaGalleryArr = [];
      for (const cand of metaGalleryCandidates) {
        if (Array.isArray(cand) && cand.length) { metaGalleryArr = cand; break; }
      }
      const fallback = pickFirstNonEmpty([r.cover_url, r.coverUrl, r.image_url, r.imageUrl, meta.cover_url, meta.coverUrl, meta.image_url, meta.imageUrl]);
      // Prioridade inteligente:
      // 1) Se direct (r.imagens) tem MAIS itens que metaGallery, usar direct (galeria real do post_media)
      // 2) Se metaGallery tem MAIS ou IGUAL a direct, usar metaGallery (gallery_image_urls é o source of truth manual)
      // 3) Fallback: image_url único
      let values;
      if (direct.length > 1 && direct.length >= metaGalleryArr.length) {
        values = direct;
      } else if (metaGalleryArr.length) {
        values = metaGalleryArr;
      } else if (direct.length) {
        values = direct;
      } else {
        values = fallback ? [fallback] : [];
      }
      // Deduplicar preservando ordem
      const seen = new Set();
      return values.map((value) => String(value || '').trim()).filter(Boolean).filter((v) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
    })();
    const expiresAt = r.expires_at != null ? r.expires_at : (r.expiresAt != null ? r.expiresAt : null);

    if (authorProfile) {
      authorProfile.rating_avg = Number.isFinite(rating) ? rating : null;
      authorProfile.rating_count = ratingCount;
      authorProfile.ratingAvg = authorProfile.rating_avg;
      authorProfile.ratingCount = authorProfile.rating_count;
    }

    const out = {
      id,
      modulo,
      categoria,
      titulo,
      descricao,
      preco,
      authorId,
      authorVerified,
      timestamp,
      createdAt,
      created_at,
      bumpedAt,
      bumped_at,
      effectiveAt,
      effective_at,
      expiresAt,
      expires_at: expiresAt,
      emoji,
      verificado,
      status,
      isClosed,
      visibility,
      authorVerified,
      categoriaKey: r.categoriaKey || r.categoryKey || '',
      categoriaLabel: r.categoriaLabel || r.categoryLabel || '',
      subcategoria: r.subcategoria || r.subcategory || '',
      subcategoriaKey: r.subcategoriaKey || r.subcategoryKey || '',
      subcategoriaLabel: r.subcategoriaLabel || r.subcategoryLabel || '',
      tags: tagLabels,
      tagKeys,
      userTags,
      userTagKeys,
      rating: Number.isFinite(rating) && ratingCount > 0 ? rating : null,
      ratingCount,
      rating_count: ratingCount,
      votos: (r.votos != null ? r.votos : null),
      comentarios: (r.comentarios != null ? r.comentarios : null),
      condicao: r.condicao || r.condition || null,
      localizacao: location,
      location,
      precoOriginal: (r.precoOriginal != null ? r.precoOriginal : null),
      precoTexto: r.precoTexto || r.priceText || null,
      imagens: normalizedImages,
      images: normalizedImages,
      image_url: r.image_url || r.imageUrl || normalizedImages[0] || '',
      imageUrl: r.imageUrl || r.image_url || normalizedImages[0] || '',
      cover_url: r.cover_url || r.coverUrl || normalizedImages[0] || '',
      coverUrl: r.coverUrl || r.cover_url || normalizedImages[0] || '',
      metadata: meta,
      authorProfile,
      autor: normalizedAuthorName,
      author: normalizedAuthorName,
      autorAvatar: normalizedAuthorAvatar,
      authorAvatar: normalizedAuthorAvatar,
      authorName: normalizedAuthorName,
      _legacyAuthorName: legacyAuthorName || null,
      _legacyAuthorAvatar: legacyAuthorAvatar || null,
      legacyId: r.legacyId || r.legacy_id || null,
      legacy_id: r.legacy_id || r.legacyId || null,
    };

    try {
      const mk = String(out.modulo || '').toLowerCase();

      if (!out.categoriaKey && meta.categoryKey) out.categoriaKey = meta.categoryKey;
      if (!meta.categoryKey && out.categoriaKey) meta.categoryKey = out.categoriaKey;

      if (!out.subcategoriaKey && meta.subcategoryKey) out.subcategoriaKey = meta.subcategoryKey;
      if (!out.subcategoriaKey && meta.subcategory) out.subcategoriaKey = meta.subcategory;

      const desiredSub = String(out.subcategoriaKey || meta.subcategory || '').trim();
      if (!meta.subcategory && desiredSub) meta.subcategory = desiredSub;
      if (!meta.subcategoryKey && desiredSub) meta.subcategoryKey = desiredSub;

      if (mk === 'compra-venda') {
        const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doa\u00e7\u00e3o', 'procuro'];
        const subk = String(out.subcategoriaKey || '').toLowerCase();
        if (out.categoriaKey && actionish.includes(subk)) {
          out.subcategoriaKey = out.categoriaKey;
          meta.subcategory = out.categoriaKey;
          meta.subcategoryKey = out.categoriaKey;
        }
        if (out.categoriaKey && !meta.subcategory) {
          meta.subcategory = out.categoriaKey;
          meta.subcategoryKey = out.categoriaKey;
        }
      }
      if (!meta.visibility && visibility) meta.visibility = visibility;
      if (location) {
        if (!meta.location) meta.location = location;
        if (!meta.localizacao) meta.localizacao = location;
      }
    } catch (_e) { }

    return out;
  }

  window._KCAPI.postsNormalize = Object.freeze({
    normalizePost,
    pickFirstNonEmpty,
  });
})();
