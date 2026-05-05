/*
  KinoCampus - Utils / Presentation Domain (v12.2.6)

  Sub-modulo do kc-utils.js - dominio de presentation
  (cards, badges, markers, inferencias e regras visuais de feed).
  Expoe window._KCU.presentation com 9 funcoes.

  Carregamento: deve ser incluido APOS kc-utils.string.js, kc-utils.format.js,
  kc-utils.taxonomy.js e kc-utils.location.js, e ANTES de kc-utils.js.
  Dependencias: window._KCU.string, window._KCU.format,
                window._KCU.taxonomy, window._KCU.location,
                window.KC_CONSTANTS - todos acessados lazily.
  Contrato: window._KCU.presentation e Object.freeze() - imutavel em runtime.
*/
(function () {
  'use strict';

  // -- Lazy accessors ----------------------------------------------------

  function _str() {
    return (window._KCU && window._KCU.string) ? window._KCU.string : null;
  }

  function _fmt() {
    return (window._KCU && window._KCU.format) ? window._KCU.format : null;
  }

  function _tax() {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy : null;
  }

  function _loc() {
    return (window._KCU && window._KCU.location) ? window._KCU.location : null;
  }

  function _const() {
    return window.KC_CONSTANTS || {};
  }

  function _normalizeText(v) {
    const s = _str();
    return s ? s.normalizeText(v) : String(v || '').toLowerCase().trim();
  }

  function _escapeHtml(v) {
    const s = _str();
    return s ? s.escapeHtml(v) : String(v || '');
  }

  function _renderMarkdown(v) {
    const s = _str();
    return s ? s.renderMarkdownInline(v) : String(v || '');
  }

  function _beautifyKey(v) {
    const s = _str();
    return s ? s.beautifyKey(v) : String(v || '');
  }

  function _canonicalCategory(v) {
    const s = _str();
    return s ? s.canonicalCategory(v) : String(v || '');
  }

  function _timeAgo(v) {
    const f = _fmt();
    return f ? f.timeAgo(v) : '';
  }

  function _formatCurrencyBRL(v) {
    const f = _fmt();
    return f ? f.formatCurrencyBRL(v) : 'R$ 0,00';
  }

  function _splitPriceText(v) {
    const f = _fmt();
    return f ? f.splitPriceText(v) : { main: String(v || ''), small: '' };
  }

  function _buildProductDetailHref(v) {
    const f = _fmt();
    return f ? f.buildProductDetailHref(v) : '';
  }

  function _getConditionLabel(v) {
    const f = _fmt();
    return f ? f.getConditionLabel(v) : String(v || '');
  }

  function _getModuleLabel(k) {
    const t = _tax();
    return t ? t.getModuleLabel(k) : String(k || '');
  }

  function _getModuleIconClass(k) {
    const t = _tax();
    return t ? t.getModuleIconClass(k) : 'fas fa-layer-group';
  }

  function _getCategoryLabel(m, c) {
    const t = _tax();
    return t ? t.getCategoryLabel(m, c) : String(c || '');
  }

  function _getSubcategoryLabel(m, s) {
    const t = _tax();
    return t ? t.getSubcategoryLabel(m, s) : String(s || '');
  }

  function _resolveOpportunityArea(s, o) {
    const t = _tax();
    return t ? t.resolveOpportunityArea(s, o) : { key: '', label: '' };
  }

  function _getOpportunityAreaEmoji(k) {
    const t = _tax();
    return t ? t.getOpportunityAreaEmoji(k) : '';
  }

  function _resolveHousingRegion(s, o) {
    const l = _loc();
    return l ? l.resolveHousingRegion(s, o) : { key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false };
  }

  function _resolveHousingFeatures(s, o) {
    const l = _loc();
    return l ? l.resolveHousingFeatures(s, o) : [];
  }

  function _resolveHousingTypeFromCandidates(values) {
    const l = _loc();
    return l ? l.resolveHousingTypeFromCandidates(values) : '';
  }

  function _resolveLostFoundLocation(s, o) {
    const l = _loc();
    return l ? l.resolveLostFoundLocation(s, o) : { key: '', label: '', icon: 'fas fa-map-marker-alt', emoji: '\u{1F4CD}', isKnown: false };
  }

  function _getLostFoundLocationEmoji(k) {
    const l = _loc();
    return l ? l.getLostFoundLocationEmoji(k) : '\u{1F4CD}';
  }

  function _getHousingFeatureEmoji(k) {
    const l = _loc();
    return l ? l.getHousingFeatureEmoji(k) : '\u{1F3F7}\u{FE0F}';
  }

  // -- Presentation functions ---------------------------------------------

function cssEscape(str) {
  // fallback simples (suficiente para ids/classes gerados localmente)
  return String(str ?? '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function inferCaronasRoute(title) {
  const s = String(title || '').trim();
  if (!s) return { from: '', to: '' };
  const arrow = s.includes('→') ? '→' : (s.includes('->') ? '->' : (s.includes('➡') ? '➡' : ''));
  if (!arrow) return { from: '', to: '' };
  const parts = s.split(arrow).map(x => x.trim());
  if (parts.length < 2) return { from: '', to: '' };
  const left = parts[0].replace(/^carona\s*/i, '').trim();
  const right = parts[1].trim();
  return { from: _beautifyKey(left), to: _beautifyKey(right) };
}

function inferAchadosLocation(source, tags = []) {
  const resolved = _resolveLostFoundLocation(source, { tags });
  return resolved && resolved.label ? resolved.label : '';
}

function inferOportunidadesSubcategory(source, tags = []) {
  const resolved = _resolveOpportunityArea(source, { tags });
  return resolved && resolved.label ? resolved.label : '';
}

function inferEventosCategory(rawCat, tags = []) {
  const base = _normalizeText(rawCat);
  const t = (Array.isArray(tags) ? tags : []).map(x => _normalizeText(x));

  // Se já veio uma categoria "boa", respeitar
  if (base && base !== 'eventos') return base;

  const has = (needle) => t.some(x => x.includes(needle) || needle.includes(x));
  if (has('sustent') || has('feira')) return 'sustentabilidade';
  if (has('festival') || has('cultural') || has('musica') || has('arte')) return 'cultural';
  if (has('torneio') || has('futsal') || has('esport')) return 'esportivo';
  if (has('palestra') || has('workshop') || has('academ')) return 'academico';
  return base || 'eventos';
}

function applyPresentationRules(post, context = {}) {
  const p = { ...(post || {}) };

  const moduleKey = String(p.modulo || '').toLowerCase();
  const tags = Array.isArray(p.tags) ? p.tags : (Array.isArray(p.tagKeys) ? p.tagKeys : []);
  const normTags = (Array.isArray(tags) ? tags : []).map(t => _normalizeText(t));
  const meta = (p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)) ? p.metadata : {};
  const housingTypeKey = moduleKey === 'moradia'
    ? _resolveHousingTypeFromCandidates([
      meta.housingTypeKey,
      meta.housingTypeLabel,
      p.housingTypeKey,
      p.housingTypeLabel,
      p.categoriaKey,
      p.categoria,
      meta.categoriaKey,
      meta.categoria,
      p.titulo,
      p.title,
      p.descricao,
      p.description
    ])
    : '';
  const housingRegionInfo = moduleKey === 'moradia'
    ? _resolveHousingRegion(p, { tags })
    : null;
  const housingFeatures = moduleKey === 'moradia'
    ? _resolveHousingFeatures(p, { tags })
    : [];
  const lostFoundLocationInfo = moduleKey === 'achados-perdidos'
    ? _resolveLostFoundLocation(p, { tags })
    : null;

  // Derivar chaves (mantém consistência para filtros)
  if (!p.categoriaKey) {
    const rawCat = String(p.categoria || meta.category || meta.categoryKey || '').trim();
    let key = _canonicalCategory(rawCat);

    if (moduleKey === 'caronas') {
      if (key.includes('procuro')) key = 'procuro';
      else if (key.includes('ofereco') || key.includes('ofereço')) key = 'ofereco';
    }

    if (moduleKey === 'achados-perdidos') {
      if (key.includes('perd')) key = 'perdido';
      else if (key.includes('achad') || key.includes('encontr')) key = 'encontrado';
    }

    if (moduleKey === 'eventos') {
      key = inferEventosCategory(key, normTags);
    }

    if (moduleKey === 'moradia') {
      key = housingTypeKey || key;
    }

    p.categoriaKey = key || '';
  }

  if (!p.subcategoriaKey) {
    const rawSub = String(p.subcategoria || meta.subcategory || '').trim();
    p.subcategoriaKey = _canonicalCategory(rawSub) || '';
  }

  // UI: comentários compactos (ícone + número)
  if (p._kcCompactComments == null) p._kcCompactComments = true;

  const isClosed = String(p.status || p.estado || '').trim().toLowerCase() === 'closed' || p.isClosed === true;
  p.isClosed = isClosed;

  // Tempo Relativo (timeAgo)
  const effectiveTime = p.effective_at || p.effectiveAt || p.bumped_at || p.bumpedAt || p.created_at || p.createdAt || p.timestamp;
  if (effectiveTime) {
    p._kcRelativeTime = _timeAgo(effectiveTime);
  }


  // Labels (sem quebrar caso já existam)
  if (!p.categoriaLabel) p.categoriaLabel = _getCategoryLabel(moduleKey, p.categoriaKey || p.categoria);
  if (moduleKey === 'moradia') {
    if ((!p.categoriaKey || _normalizeText(p.categoriaKey) === 'moradia') && housingTypeKey) p.categoriaKey = housingTypeKey;
    if (!p.categoriaLabel) p.categoriaLabel = _getCategoryLabel(moduleKey, housingTypeKey || p.categoria);

    const tagKeys = Array.isArray(p.tagKeys) ? p.tagKeys.slice() : [];
    const tagLabels = Array.isArray(p.tags) ? p.tags.slice() : [];
    const appendTag = (key, label) => {
      const normalizedKey = String(key || '').trim();
      const normalizedLabel = String(label || '').trim();
      if (normalizedKey && !tagKeys.includes(normalizedKey)) tagKeys.push(normalizedKey);
      if (normalizedLabel && !tagLabels.includes(normalizedLabel)) tagLabels.push(normalizedLabel);
    };

    if (housingRegionInfo && housingRegionInfo.key) {
      p.regionKey = p.regionKey || housingRegionInfo.key;
      p.regionLabel = p.regionLabel || housingRegionInfo.label;
      p.regionZoneKey = p.regionZoneKey || housingRegionInfo.zoneKey || '';
      p.regionZoneLabel = p.regionZoneLabel || housingRegionInfo.zoneLabel || '';
      appendTag(housingRegionInfo.key, housingRegionInfo.label);
      if (housingRegionInfo.zoneKey && housingRegionInfo.zoneKey !== housingRegionInfo.key) {
        appendTag(housingRegionInfo.zoneKey, housingRegionInfo.zoneLabel || housingRegionInfo.zoneKey);
      }
    }

    const featureKeys = [];
    const featureLabels = [];
    housingFeatures.forEach((feature) => {
      if (!feature || !feature.key || !feature.label) return;
      featureKeys.push(feature.key);
      featureLabels.push(feature.label);
      appendTag(feature.key, feature.label);
    });

    p.tagKeys = tagKeys;
    p.tags = tagLabels;
    p.housingFeatureKeys = featureKeys;
    p.housingFeatureLabels = featureLabels;
    p._kcHousingInfo = {
      typeKey: housingTypeKey || p.categoriaKey || '',
      region: housingRegionInfo && housingRegionInfo.key ? housingRegionInfo : null,
      features: housingFeatures.slice(),
    };
    if (!p.subcategoriaLabel && housingRegionInfo && housingRegionInfo.label) p.subcategoriaLabel = housingRegionInfo.label;
  } else if (moduleKey === 'achados-perdidos') {
    if (lostFoundLocationInfo && lostFoundLocationInfo.key) {
      const tagKeys = Array.isArray(p.tagKeys) ? p.tagKeys.slice() : [];
      const tagLabels = Array.isArray(p.tags) ? p.tags.slice() : [];
      if (!tagKeys.includes(lostFoundLocationInfo.key)) tagKeys.push(lostFoundLocationInfo.key);
      if (!tagLabels.includes(lostFoundLocationInfo.label)) tagLabels.push(lostFoundLocationInfo.label);
      p.tagKeys = tagKeys;
      p.tags = tagLabels;
      p.lostFoundLocationKey = p.lostFoundLocationKey || lostFoundLocationInfo.key;
      p.lostFoundLocationLabel = p.lostFoundLocationLabel || lostFoundLocationInfo.label;
      p.lostFoundLocationIcon = p.lostFoundLocationIcon || lostFoundLocationInfo.icon;
      p.lostFoundLocationEmoji = p.lostFoundLocationEmoji || lostFoundLocationInfo.emoji;
      p._kcLostFoundInfo = {
        location: lostFoundLocationInfo,
      };
      if (!p.subcategoriaLabel && lostFoundLocationInfo.label) p.subcategoriaLabel = lostFoundLocationInfo.label;
    }
    if (!p.subcategoriaLabel) p.subcategoriaLabel = _getSubcategoryLabel(moduleKey, p.subcategoriaKey || p.subcategoria);
  } else if (moduleKey === 'oportunidades') {
    const areaInfo = _resolveOpportunityArea(p, { tags });
    if (!p.subcategoriaKey && areaInfo.key) p.subcategoriaKey = areaInfo.key;
    if (!p.subcategoriaLabel) p.subcategoriaLabel = areaInfo.label || inferOportunidadesSubcategory(p, tags);
  } else if (!p.subcategoriaLabel) {
    p.subcategoriaLabel = _getSubcategoryLabel(moduleKey, p.subcategoriaKey || p.subcategoria);
  }

  // Contexto (páginas de módulo podem omitir o nome do módulo)
  const pageModule = String(context.pageModule || '').toLowerCase();
  const isModulePage = !!pageModule;
  const showModuleLabelOnPage = (moduleKey === 'moradia' || moduleKey === 'eventos');
  const hideModuleLabel = isModulePage && pageModule === moduleKey && !showModuleLabelOnPage;
  p._kcShowModuleLabel = !hideModuleLabel;

  // Prefixo do autor
  if (p._kcAuthorPrefix == null || String(p._kcAuthorPrefix).trim() === '') {
    if (moduleKey === 'eventos') p._kcAuthorPrefix = 'Organizado por';
    else if (moduleKey === 'achados-perdidos') p._kcAuthorPrefix = 'Reportado por';
    else p._kcAuthorPrefix = 'Anunciado por';
  }

  // CTA
  // V8.1.3.1.4: Unificação de CTA no footer de TODOS os módulos
  // Motivo: textos longos (ex.: "Reservar Vaga", "Inscrever-se") quebravam o layout do kc-card__footer no mobile.
  // Regra: sempre "Ver Mais".
  p._kcCtaText = isClosed ? 'Ver historico' : 'Ver Mais';

  // Verificação (V8.1.3.2)
  // - Agora é atributo do AUTOR (profiles.verified), mas mantemos compatibilidade com o legado.
  const isVerified = (p.authorVerified === true || p.verificado === true);
  p.verificado = isVerified; // garante consistência para data-verified / estilos

  if (isVerified) {
    if (!p._kcVerifiedTag) {
      p._kcVerifiedTag = (moduleKey === 'eventos') ? '@oficial' : '@verificado';
    }
  } else {
    p._kcVerifiedTag = p._kcVerifiedTag || '';
  }
  // Badge (status/promo/sustentável)
  // + Badges de topo (contexto + tempo) (V8.1.2.4.5)
  let _kcStatusLabel = '';

  if (!p._kcBadgeText) {
    // Achados/Perdidos: sempre mostrar status
    if (moduleKey === 'achados-perdidos') {
      const statusLost = String(p.categoriaKey || '').includes('perd');
      _kcStatusLabel = statusLost ? 'perdido' : 'encontrado';
      p._kcBadgeIconClass = statusLost ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
      p._kcBadgeText = statusLost ? 'Perdido' : 'Encontrado';
      p._kcBadgeStyle = statusLost ? 'background-color: var(--kc-red-alert);' : '';
      // Badge de contexto (product + cards): pill com ícone
      p._kcStatusBadgeHtml = `<span class="kc-badge"><i class="fas fa-tag" aria-hidden="true"></i> ${_kcStatusLabel}</span>`;
    }

    // Promoção em compra-venda
    if (!p._kcBadgeText && moduleKey === 'compra-venda') {
      const po = typeof p.precoOriginal === 'number' ? p.precoOriginal : null;
      const pr = typeof p.preco === 'number' ? p.preco : null;
      if (Number.isFinite(po) && Number.isFinite(pr) && po > pr && pr > 0) {
        p._kcBadgeIconClass = 'fas fa-percent';
        p._kcBadgeText = 'Promoção';
        p._kcBadgeStyle = '';
      }
    }

    // Sustentável (eventos/caronas)
    if (!p._kcBadgeText) {
      const hasSust = normTags.some(t => t.includes('sustent')) || _normalizeText(p.descricao || '').includes('sustent');
      if (hasSust && (moduleKey === 'eventos' || moduleKey === 'caronas')) {
        p._kcBadgeIconClass = 'fas fa-leaf';
        p._kcBadgeText = (moduleKey === 'eventos') ? 'Evento Sustentável' : 'Sustentável';
        p._kcBadgeStyle = '';
      }
    }

    // Badge explícito (metadata/local) — garante "kc-cashback-badge" quando o post trouxer esse atributo
    if (!p._kcBadgeText) {
      const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
      const explicitText = (
        p.cashbackBadgeText || p.cashbackBadge || p.cornerBadgeText ||
        meta.cashbackBadgeText || meta.cashbackBadge || meta.cornerBadgeText ||
        meta.badgeText || meta.badge
      );

      // Ex.: meta.co2_kg = 22 => "22kg CO₂ evitado"
      const co2 = (meta.co2_kg != null) ? Number(meta.co2_kg) : (meta.co2Kg != null ? Number(meta.co2Kg) : null);
      const co2Text = (co2 != null && Number.isFinite(co2) && co2 > 0) ? `${co2}kg CO₂ evitado` : '';

      const finalText = co2Text || (explicitText != null ? String(explicitText).trim() : '');
      if (finalText) {
        p._kcBadgeIconClass = (meta.badgeIconClass && String(meta.badgeIconClass).trim()) ? String(meta.badgeIconClass).trim() : 'fas fa-leaf';
        p._kcBadgeText = finalText;
        p._kcBadgeStyle = (meta.badgeStyle && String(meta.badgeStyle).trim()) ? String(meta.badgeStyle).trim() : '';
      }
    }
  }


  // Preço (ícone/estilo e split main/small)
  if (p._kcPriceIconClass == null || String(p._kcPriceIconClass).trim() === '') {
    if (moduleKey === 'compra-venda') p._kcPriceIconClass = 'fas fa-tag';
    else if (moduleKey === 'eventos') p._kcPriceIconClass = 'fas fa-gift';
    else if (moduleKey === 'caronas') {
      const looking = String(p.categoriaKey || '').includes('procuro');
      p._kcPriceIconClass = looking ? 'fas fa-handshake' : 'fas fa-money-bill-wave';
    } else p._kcPriceIconClass = 'fas fa-money-bill-wave';
  }

  if (p._kcPriceStyle == null || String(p._kcPriceStyle).trim() === '') {
    if (moduleKey === 'compra-venda') p._kcPriceStyle = 'color: var(--kc-hot-color);';
    else if (moduleKey === 'eventos') p._kcPriceStyle = 'color: var(--kc-green-check);';
    else if (moduleKey === 'oportunidades') p._kcPriceStyle = 'color: var(--kc-green-check);';
    else if (moduleKey === 'caronas') {
      const looking = String(p.categoriaKey || '').includes('procuro');
      p._kcPriceStyle = looking ? 'color: var(--kc-secondary-brand);' : 'color: var(--kc-green-check);';
    } else p._kcPriceStyle = '';
  }

  // Esconder preço em Achados/Perdidos
  if (moduleKey === 'achados-perdidos' && p._kcHidePrice == null) p._kcHidePrice = true;

  // Normalizar texto de preço
  if (!p._kcPriceTextMain) {
    let text = '';
    if (p.precoTexto) text = String(p.precoTexto);
    else if (p.preco != null && p.preco !== '') text = (typeof p.preco === 'number') ? _formatCurrencyBRL(p.preco) : String(p.preco);
    const split = _splitPriceText(text);
    p._kcPriceTextMain = split.main;
    p._kcPriceTextSmall = split.small;
  }

  // Category segments (texto puro; render adiciona marcador de verificação)
  if (!Array.isArray(p._kcCategorySegments)) {
    const segments = [];
    if (p._kcShowModuleLabel) segments.push(_getModuleLabel(moduleKey));

    if (moduleKey === 'caronas') {
      const route = inferCaronasRoute(p.titulo);
      segments.push(_getCategoryLabel(moduleKey, p.categoriaKey || p.categoria));
      if (route.from) segments.push(route.from);
      if (route.to) segments.push(route.to);
    } else if (moduleKey === 'compra-venda') {
      if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
      if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
      if (p.condicao) segments.push(_getConditionLabel(p.condicao));
    } else if (moduleKey === 'moradia') {
      if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
      if (housingRegionInfo && housingRegionInfo.label) segments.push(String(housingRegionInfo.label));
    } else if (moduleKey === 'achados-perdidos') {
      const lost = String(p.categoriaKey || '').includes('perd');
      segments.push(lost ? 'Perdido' : 'Encontrado');
      if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
      const loc = inferAchadosLocation(p, tags);
      if (loc) segments.push(loc);
    } else if (moduleKey === 'oportunidades') {
      if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
      if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
    } else {
      if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
      if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
    }

    p._kcCategorySegments = segments.filter(Boolean);
  }

  // Categoria usada para tabs (data-category). Ex.: módulo "livros" aparece como aba "Livros" em compra-venda.
  if (!p._kcTabCategoryKey) {
    if (moduleKey === 'livros') p._kcTabCategoryKey = 'livros';
    else if (moduleKey === 'moradia') p._kcTabCategoryKey = housingTypeKey || p.categoriaKey || _canonicalCategory(p.categoria) || '';
    else p._kcTabCategoryKey = p.categoriaKey || _canonicalCategory(p.categoria) || '';
  }

  return p;
}

function getDisplayMarkerTags(post, options = {}) {
  const p = applyPresentationRules(post, options.context || {});
  const moduleKey = String(p.modulo || '').toLowerCase();
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : Infinity;
  const tags = [];

  if (moduleKey === 'moradia') {
    const housingInfo = (p._kcHousingInfo && typeof p._kcHousingInfo === 'object') ? p._kcHousingInfo : {};
    const features = Array.isArray(housingInfo.features) ? housingInfo.features : [];
    features.forEach((feature) => {
      if (!feature || !feature.key || !feature.label) return;
      tags.push({
        key: `moradia:${feature.key}`,
        label: feature.label,
        emoji: feature.emoji || _getHousingFeatureEmoji(feature.key),
      });
    });
  }

  if (moduleKey === 'oportunidades') {
    const areaInfo = _resolveOpportunityArea(p, { tags: Array.isArray(p.tags) ? p.tags : [] });
    if (areaInfo && areaInfo.key && areaInfo.label) {
      tags.push({
        key: `oportunidades:${areaInfo.key}`,
        label: areaInfo.label,
        emoji: areaInfo.emoji || _getOpportunityAreaEmoji(areaInfo.key),
      });
    }
  }

  if (moduleKey === 'achados-perdidos') {
    const locationInfo = _resolveLostFoundLocation(p, { tags: Array.isArray(p.tags) ? p.tags : [] });
    if (locationInfo && locationInfo.key && locationInfo.label) {
      tags.push({
        key: `achados:${locationInfo.key}`,
        label: locationInfo.label,
        emoji: locationInfo.emoji || _getLostFoundLocationEmoji(locationInfo.key),
      });
    }
  }

  return tags.slice(0, limit);
}

function renderMarkerTags(tags, options = {}) {
  const items = Array.isArray(tags) ? tags.filter((tag) => tag && tag.label) : [];
  if (!items.length) return '';

  const containerClass = String(options.containerClass || 'kc-card__tag-row').trim();
  const itemClass = String(options.itemClass || 'kc-card__tag').trim();
  const emojiClass = itemClass.includes('kc-tag') ? 'kc-tag__emoji' : 'kc-card__tag-emoji';

  return `<div class="${_escapeHtml(containerClass)}">` + items.map((tag) => {
    const emoji = String(tag.emoji || '🏷️').trim();
    const label = String(tag.label || '').trim();
    return `<span class="${_escapeHtml(itemClass)}">${emoji ? `<span class="${_escapeHtml(emojiClass)}">${_escapeHtml(emoji)}</span>` : ''}<span>${_escapeHtml(label)}</span></span>`;
  }).join('') + '</div>';
}

// Renderizacao padrao de um card (estrutura identica aos .kc-card do HTML)
// - Recebe um post normalizado (authorId)
// - Busca autor via KCAPI.getAuthorById(post.authorId)
// - Retorna HTML (string) do <article class="kc-card">...</article>
function renderPostCard(post, options) {
  // Compat: alguns usos antigos podem passar index do Array.map como 2º arg
  const ctx = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
  const p = applyPresentationRules(post, ctx);

  const id = p.id != null ? String(p.id) : '';
  const emoji = (p.emoji || '✨');

  const moduleKey = String(p.modulo || '').toLowerCase();
  const isClosed = p.isClosed === true || String(p.status || p.estado || '').trim().toLowerCase() === 'closed';

  const ts = (p.timestamp != null ? String(p.timestamp) : '');

  // Overrides de contexto (mantém assinatura KCUtils.renderPostCard(post) e prepara MVC)
  const authorPrefix = (p._kcAuthorPrefix != null && String(p._kcAuthorPrefix).trim() !== '')
    ? String(p._kcAuthorPrefix)
    : 'Anunciado por';

  let ctaText = (p._kcCtaText != null && String(p._kcCtaText).trim() !== '')
    ? String(p._kcCtaText)
    : 'Ver Mais';

  // V8.1.3.1.4: garante CTA curto e consistente (desktop + mobile)
  ctaText = 'Ver Mais';
  if (isClosed) ctaText = 'Ver historico';

  const compactComments = true; // V8.1.2.4.5: padrão obrigatório (ícone + número)

  // Badge (opcional)
  const badgeHtml = (p._kcBadgeText)
    ? `<span class="kc-cashback-badge"${p._kcBadgeStyle ? ` style="${_escapeHtml(String(p._kcBadgeStyle))}"` : ''}>
        <i class="${_escapeHtml(String(p._kcBadgeIconClass || 'fas fa-tag'))}" aria-hidden="true"></i>
        ${_escapeHtml(String(p._kcBadgeText))}
      </span>`
    : '';

  // Badges (pills) — alinhados ao padrão do product (módulo/condição/tempo)
  const badges = [];

  // Módulo
  if (p.modulo) {
    const modLabel = _getModuleLabel(p.modulo);
    const modIcon = _getModuleIconClass(p.modulo);
    badges.push(`<span class="kc-badge"><i class="${_escapeHtml(modIcon)}" aria-hidden="true"></i> ${_escapeHtml(modLabel)}</span>`);
  }

  // Status (Achados/Perdidos)
  if (isClosed) {
    badges.push('<span class="kc-badge kc-badge--closed"><i class="fas fa-lock" aria-hidden="true"></i> Encerrado</span>');
  }

  // Status (Achados/Perdidos)
  if (p._kcStatusBadgeHtml) badges.push(p._kcStatusBadgeHtml);

  // Condição (Compra e Venda)
  if (p.condicao) {
    badges.push(`<span class="kc-badge"><i class="fas fa-star" aria-hidden="true"></i> ${_escapeHtml(String(p.condicao))}</span>`);
  }

  // Tempo relativo (único lugar no card)
  const relTime = p._kcRelativeTime || p.timestamp;
  if (relTime) {
    badges.push(`<span class="kc-badge"><i class="fas fa-clock" aria-hidden="true"></i> ${_escapeHtml(String(relTime))}</span>`);
  }

  const topBadgesHtml = badges.length
    ? `<div class="kc-card__badges">${badges.join(' ')}</div>`
    : '';

  // Category line (com marcador de verificação quando aplicável)
  const segments = Array.isArray(p._kcCategorySegments) ? p._kcCategorySegments : [];
  let categoryLineHtml = segments.map(s => _escapeHtml(String(s))).join(' • ');
  if (p._kcVerifiedTag) {
    categoryLineHtml = `${categoryLineHtml}${categoryLineHtml ? ' • ' : ''}<a href="#">${_escapeHtml(String(p._kcVerifiedTag))}</a> <i class="fas fa-check-circle" aria-hidden="true"></i>`;
  }

  // Imagem (quando existir), senão emoji (mantém Offline First)
  const images = Array.isArray(p.imagens) ? p.imagens : (Array.isArray(p.images) ? p.images : []);
  const imgSrc = images.length ? String(images[0]) : '';
  const productHref = id ? `product.html?id=${encodeURIComponent(id)}` : '#';
  const isLegacyExample = !!String(p.legacyId || p.legacy_id || '').trim();
  // Ribbon fora do image-wrapper para não ser cortado pelo overflow:hidden
  const legacyExampleBadgeHtml = isLegacyExample
    ? `<span class="kc-card__example-ribbon" aria-label="Exemplo de uso"><i class="fas fa-flask" aria-hidden="true"></i><span>Exemplo</span></span>`
    : '';
  const imageWrapperHtml = imgSrc
    ? `<a class="kc-card__image-wrapper" href="${productHref}" aria-label="Abrir anúncio ${_escapeHtml(String(p.titulo || ''))}">
         <img alt="${_escapeHtml(String(p.titulo || 'Imagem'))}" src="${_escapeHtml(imgSrc)}" width="400" height="300" loading="lazy" decoding="async"/>
       </a>`
    : `<a class="kc-card__image-wrapper kc-image-fallback" href="${productHref}" aria-label="Abrir anúncio ${_escapeHtml(String(p.titulo || ''))}" style="font-size: 3em; display: flex; align-items: center; justify-content: center;">
         <span class="kc-card__emoji">${_escapeHtml(String(emoji))}</span>
       </a>`;

  // Preço (com suporte a <small>)
  let priceHtml = '';
  const priceIconClass = (p._kcPriceIconClass != null && String(p._kcPriceIconClass).trim() !== '')
    ? String(p._kcPriceIconClass)
    : 'fas fa-money-bill-wave';

  const priceStyle = (p._kcPriceStyle != null && String(p._kcPriceStyle).trim() !== '')
    ? String(p._kcPriceStyle)
    : '';

  const styleAttr = priceStyle ? ` style="${_escapeHtml(priceStyle)}"` : '';
  const mainPriceText = String(p._kcPriceTextMain || '').trim();
  const smallPriceText = String(p._kcPriceTextSmall || '').trim();
  const shouldShowPrice = !p._kcHidePrice && (mainPriceText || smallPriceText);

  if (shouldShowPrice) {
    priceHtml = `
      <div class="kc-card__price"${styleAttr}>
        <i class="${_escapeHtml(priceIconClass)}" aria-hidden="true"></i>
        ${_escapeHtml(mainPriceText)}
        ${smallPriceText ? `<small>${_escapeHtml(smallPriceText)}</small>` : ''}
      </div>
    `.trim();
  }

  const housingInfo = (moduleKey === 'moradia' && p._kcHousingInfo && typeof p._kcHousingInfo === 'object')
    ? p._kcHousingInfo
    : null;
  const markerTagsHtml = renderMarkerTags(getDisplayMarkerTags(p, { limit: 3 }), {
    containerClass: 'kc-card__tag-row kc-card__tag-row--markers',
    itemClass: 'kc-card__tag',
  });

  // Descrição (preview com markdown)
  const rawDesc = String(p.descricao || '').trim();
  const previewRaw = rawDesc.length > 140 ? (rawDesc.slice(0, 140).trim() + '...') : rawDesc;
  const preview = _renderMarkdown(previewRaw);

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
    : (p._legacyAuthorAvatar || p.autorAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || ''));
  const authorAvatarAlt = String(authorName || '').trim()
    ? `Avatar de ${String(authorName).trim()}`
    : 'Avatar do autor';

  const rating = (p.rating != null && p.rating !== '') ? Number(p.rating) : null;
  const ratingCount = Math.max(0, parseInt(String(p.ratingCount != null ? p.ratingCount : (p.rating_count != null ? p.rating_count : 0)), 10) || 0);
  const ratingShown = Number.isFinite(rating) ? rating.toFixed(1) : '';
  const ratingNoun = ratingCount === 1 ? 'avaliacao' : 'avaliacoes';
  const ratingLabel = `Avaliacao media ${ratingShown} em ${ratingCount} ${ratingNoun}`;
  const ratingHtml = (Number.isFinite(rating) && ratingCount > 0)
    ? `<span class="kc-card__rating" title="${_escapeHtml(ratingLabel)}" aria-label="${_escapeHtml(ratingLabel)}"><i class="fas fa-star" aria-hidden="true"></i> ${_escapeHtml(ratingShown)}<span class="kc-card__rating-count">(${_escapeHtml(String(ratingCount))})</span></span>`
    : '';

  // Interações
  const votos = (p.votos != null && p.votos !== '') ? Number(p.votos) : 0;
  const rawComments = (p.comentarios != null && p.comentarios !== '')
    ? p.comentarios
    : ((p.comments_count != null && p.comments_count !== '') ? p.comments_count : p.commentsCount);
  const comentarios = (rawComments != null && rawComments !== '') ? Number(rawComments) : 0;
  const commentsCount = Math.max(0, Number.isFinite(comentarios) ? comentarios : 0);
  const commentsNoun = commentsCount === 1 ? 'comentario' : 'comentarios';
  const commentsTitle = String(p.titulo || '').trim();
  const commentsFullLabel = commentsTitle
    ? `Ver ${commentsCount} ${commentsNoun} do anuncio ${commentsTitle}`
    : `Ver ${commentsCount} ${commentsNoun} do anuncio`;
  const commentsShown = String(commentsCount);
  const commentsAria = ` aria-label="${_escapeHtml(commentsFullLabel)}"`;

  // Atributos para filtros/compatibilidade
  const attrs = [];
  attrs.push(`class="kc-card${badgeHtml ? " kc-card--has-corner-badge" : ""}${isLegacyExample ? " kc-card--example" : ""}${isClosed ? " kc-card--closed" : ""}"`);
  if (id) attrs.push(`data-post-id="${_escapeHtml(id)}"`);
  attrs.push(`data-status="${_escapeHtml(isClosed ? 'closed' : String(p.status || p.estado || 'published'))}"`);
  attrs.push(`data-verified="${_escapeHtml(String(!!p.verificado))}"`);
  if (moduleKey) attrs.push(`data-module="${_escapeHtml(String(moduleKey))}"`);
  const numericPrice = Number(p.preco != null ? p.preco : p.price);
  if (Number.isFinite(numericPrice)) attrs.push(`data-kc-price="${_escapeHtml(String(numericPrice))}"`);

  // Marcação de post do usuário (evita duplicação de injeção pelo kc-core.js)
  if (p._kcUserPost === true) attrs.push('data-kc-user-post="true"');

  if (p.condicao) {
    const raw = String(p.condicao).toLowerCase();
    const norm = raw.includes('semi') ? 'seminovo' : (raw.includes('novo') ? 'novo' : raw.replace(/\s+/g, ''));
    attrs.push(`data-condition="${_escapeHtml(norm)}"`);
  }

  // data-category: preferir chave (categoriaKey) para filtros; label fica no texto
  const dataCategory = (p._kcTabCategoryKey || p.categoriaKey || p.categoria || '');
  if (dataCategory) attrs.push(`data-category="${_escapeHtml(String(dataCategory))}"`);

  // data-subcategory (novo): usado por filtros de compra-venda e afins
  const dataSub = (p.subcategoriaKey || p.subcategoria || '');
  if (dataSub) attrs.push(`data-subcategory="${_escapeHtml(String(dataSub))}"`);

  // data-kc-tags: preferir tagKeys para filtros
  const tagKeysRaw = Array.isArray(p.tagKeys) ? p.tagKeys : (Array.isArray(p.tags) ? p.tags : []);
  const tagKeys = tagKeysRaw.map(String);
  // garantir que a categoria principal participe do filtro por tabs
  if (p.categoriaKey && !tagKeys.includes(String(p.categoriaKey))) tagKeys.push(String(p.categoriaKey));
  if (tagKeys.length) attrs.push(`data-kc-tags="${_escapeHtml(tagKeys.join(' '))}"`);
  if (housingInfo && housingInfo.typeKey) attrs.push(`data-kc-housing-type="${_escapeHtml(String(housingInfo.typeKey))}"`);
  if (housingInfo && housingInfo.region && housingInfo.region.key) attrs.push(`data-kc-housing-region="${_escapeHtml(String(housingInfo.region.key))}"`);
  if (housingInfo && housingInfo.region && housingInfo.region.zoneKey) attrs.push(`data-kc-housing-zone="${_escapeHtml(String(housingInfo.region.zoneKey))}"`);
  if (housingInfo && Array.isArray(housingInfo.features) && housingInfo.features.length) {
    attrs.push(`data-kc-housing-features="${_escapeHtml(housingInfo.features.map((feature) => String(feature && feature.key || '')).filter(Boolean).join(' '))}"`);
  }

  // Caronas: expor origem, destino, horário e características como data attributes para filtros
  if (moduleKey === 'caronas') {
    var cardMeta = (p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)) ? p.metadata : {};
    var cOrigem = String(cardMeta.origem || p.origem || '').trim();
    var cDestino = String(cardMeta.destino || p.destino || '').trim();
    var cHorario = String(cardMeta.horario || p.horario || '').trim();
    if (cOrigem) attrs.push('data-kc-carona-origem="' + _escapeHtml(cOrigem) + '"');
    if (cDestino) attrs.push('data-kc-carona-destino="' + _escapeHtml(cDestino) + '"');
    if (cHorario) attrs.push('data-kc-carona-horario="' + _escapeHtml(cHorario) + '"');
    var cFeatureKeys = Array.isArray(cardMeta.caronasFeatureKeys) ? cardMeta.caronasFeatureKeys : [];
    if (cFeatureKeys.length) {
      attrs.push('data-kc-carona-features="' + _escapeHtml(cFeatureKeys.filter(Boolean).join(' ')) + '"');
    }
  }

  const votePostId = String(id);
  const votePostUuid = (p && p.uuid) ? String(p.uuid) : '';
  const voteUuidAttr = votePostUuid ? ` data-post-uuid="${encodeURIComponent(votePostUuid)}"` : '';
  const voteDisabledAttr = isClosed ? ' disabled aria-disabled="true" title="Publicacao encerrada"' : '';

  return `
    <article ${attrs.join(' ')}>
      ${legacyExampleBadgeHtml}
      <div class="kc-card__main">
        ${badgeHtml}
        ${imageWrapperHtml}
        <div class="kc-card__content">
          <div class="kc-card__header">
            <div class="kc-card__category-source">
              ${categoryLineHtml}
            </div>
          </div>
          <a class="kc-card__title" href="product.html?id=${encodeURIComponent(id)}">
            ${_escapeHtml(String(p.titulo || ''))}
          </a>
          ${topBadgesHtml}
          ${priceHtml ? priceHtml : ''}
          ${markerTagsHtml}
          <div class="kc-card__description-preview">
            ${preview}
          </div>
          <div class="kc-card__author"${authorId ? ' data-author-id="' + _escapeHtml(String(authorId)) + '"' : ''}>
            <img alt="${_escapeHtml(authorAvatarAlt)}" src="${_escapeHtml(authorAvatar)}"/>
            <span>${_escapeHtml(authorPrefix)} <strong>${_escapeHtml(String(authorName))}</strong></span>
            ${ratingHtml}
          </div>
        </div>
      </div>
      <div class="kc-card__footer">
        <div class="kc-card__interactions">
          <div class="kc-vote-box" data-kc-vote-box="true">
            <button type="button" class="hot" data-action="vote-hot" data-post-id="${encodeURIComponent(votePostId)}" data-post-legacy-id="${encodeURIComponent(String(id))}"${voteUuidAttr}${voteDisabledAttr} aria-label="Voto positivo">
              <i class="fas fa-fire" aria-hidden="true"></i>
            </button>
            <span class="kc-vote-score" data-kc-vote-score="true" aria-live="polite">${_escapeHtml(String(Number.isFinite(votos) ? votos : 0))}</span>
            <button type="button" class="cold" data-action="vote-cold" data-post-id="${encodeURIComponent(votePostId)}" data-post-legacy-id="${encodeURIComponent(String(id))}"${voteUuidAttr}${voteDisabledAttr} aria-label="Voto negativo">
              <i class="fas fa-snowflake" aria-hidden="true"></i>
            </button>
          </div>
          <a class="kc-comment-link" href="product.html?id=${encodeURIComponent(id)}#comments"${commentsAria}>
            <i class="fas fa-comment" aria-hidden="true"></i>
            <span>${_escapeHtml(String(commentsShown))}</span>
          </a>
        </div>
        <div class="kc-card__actions">

          <button type="button" class="kc-share-whatsapp" data-share-url="product.html?id=${encodeURIComponent(id)}" data-share-title="${_escapeHtml(String(p.titulo || ""))}" aria-label="Compartilhar no WhatsApp">
          <svg viewBox="0 0 448 512" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
          </svg>
        </button>

          <a class="kc-action-button kc-get-coupon-button" href="product.html?id=${encodeURIComponent(id)}">
          ${_escapeHtml(ctaText)}
        </a>

        </div>
      </div>
    </article>
  `.trim();
}

  // -- Public namespace ---------------------------------------------------

  window._KCU = window._KCU || {};
  window._KCU.presentation = Object.freeze({
    cssEscape,
    inferCaronasRoute,
    inferAchadosLocation,
    inferOportunidadesSubcategory,
    inferEventosCategory,
    applyPresentationRules,
    getDisplayMarkerTags,
    renderMarkerTags,
    renderPostCard,
  });

})();
