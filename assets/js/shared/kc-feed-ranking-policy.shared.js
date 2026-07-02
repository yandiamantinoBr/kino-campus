/*
  KinoCampus - feed ranking policy v1.

  This module is intentionally pure: it does not fetch, persist, mutate DOM or
  replace kc_get_feed_cursor ordering. It is a shared scoring contract for tests,
  Cadu/admin diagnostics and a future server-side/shadow rollout.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.KCFeedRankingPolicy = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = 1;
  var PURPOSE_VERSION = 'feed-personalization-v1';
  var DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var BR_DATE_RE = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var HALF_LIFE_MS = 30 * DAY_MS;
  var MAX_EXPLICIT_BOOST = 0.07;
  var MAX_AFFINITY_BOOST = 0.03;
  var MAX_TOTAL_BOOST = 0.10;

  var MODULE_ALIASES = Object.freeze({
    compra_venda: 'compra-venda',
    compraevenda: 'compra-venda',
    mercado: 'compra-venda',
    achados_perdidos: 'achados-perdidos',
    achadoseperdidos: 'achados-perdidos'
  });

  var GLOBAL_WEIGHTS = Object.freeze({
    quality: 0.28,
    temporal: 0.27,
    engagement: 0.20,
    sourceTrust: 0.12,
    community: 0.13
  });

  function clamp(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function round4(value) {
    return Math.round(clamp(Number(value) || 0, 0, 1) * 10000) / 10000;
  }

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);
  }

  function metadataOf(post) {
    var raw = post && post.metadata;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {}
    }
    return {};
  }

  function readPath(source, path) {
    var current = source;
    String(path || '').split('.').filter(Boolean).forEach(function (part) {
      current = current && typeof current === 'object' ? current[part] : undefined;
    });
    return current;
  }

  function firstValue(post, keys) {
    var metadata = metadataOf(post);
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var value = key.indexOf('.') !== -1 ? readPath(post, key) : post && post[key];
      if (value == null || value === '') value = metadata[key];
      if (value != null && value !== '') return value;
    }
    return null;
  }

  function firstString(post, keys) {
    var value = firstValue(post, keys);
    if (Array.isArray(value)) value = value.find(function (item) { return item != null && item !== ''; });
    if (value == null || typeof value === 'object') return '';
    return String(value).trim();
  }

  function firstNumber(post, keys) {
    var value = firstValue(post, keys);
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function appendList(target, value) {
    if (Array.isArray(value)) {
      value.forEach(function (item) { appendList(target, item); });
      return;
    }
    if (value == null || typeof value === 'object') return;
    String(value).split(',').forEach(function (part) {
      var key = normalizeKey(part);
      if (key && target.indexOf(key) === -1) target.push(key);
    });
  }

  function parseDateMs(value, mode) {
    if (value instanceof Date) {
      var time = value.getTime();
      return Number.isFinite(time) ? time : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value == null || typeof value === 'object') return null;
    var text = String(value).trim();
    if (!text) return null;
    var brMatch = text.match(BR_DATE_RE);
    var parsed = brMatch
      ? Date.parse(
        brMatch[3] + '-' + brMatch[2].padStart(2, '0') + '-' + brMatch[1].padStart(2, '0') +
        (mode === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z')
      )
      : DATE_ONLY_RE.test(text)
        ? Date.parse(text + (mode === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z'))
        : Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstDateMs(post, keys, mode) {
    for (var index = 0; index < keys.length; index += 1) {
      var value = firstValue(post, [keys[index]]);
      var parsed = parseDateMs(value, mode);
      if (parsed != null) return parsed;
    }
    return null;
  }

  function iso(ms) {
    return ms == null ? null : new Date(ms).toISOString();
  }

  function nowMs(options) {
    var parsed = parseDateMs(options && options.now);
    return parsed == null ? Date.now() : parsed;
  }

  function canonicalModule(post) {
    var raw = normalizeKey(firstString(post || {}, ['module', 'modulo', 'pageModule', 'type']));
    return MODULE_ALIASES[raw] || raw;
  }

  function canonicalStatus(post) {
    return normalizeKey(firstString(post || {}, ['status', 'state'])) || 'published';
  }

  function titleOf(post) {
    return firstString(post || {}, ['title', 'titulo', 'name', 'nome']);
  }

  function descriptionOf(post) {
    return firstString(post || {}, ['description', 'descricao', 'body', 'content', 'texto']);
  }

  function sourceUrl(post) {
    return firstString(post || {}, [
      'source_url', 'sourceUrl', 'official_url', 'officialUrl', 'url', 'link', 'external_url',
      'metadata.source_url', 'metadata.official_url'
    ]);
  }

  function hostFromUrl(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    try {
      return new URL(text).hostname.toLowerCase().replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  }

  function eventStartMs(post) {
    return firstDateMs(post || {}, [
      'event_start', 'eventStart', 'starts_at', 'startsAt', 'start_at', 'startAt',
      'data_inicio_evento', 'dataInicioEvento',
      'data_evento', 'dataEvento', 'event_date', 'eventDate', 'date', 'data'
    ], 'start');
  }

  function eventEndMs(post, start) {
    return firstDateMs(post || {}, [
      'event_end', 'eventEnd', 'ends_at', 'endsAt', 'end_at', 'endAt',
      'data_fim_evento', 'dataFimEvento', 'data_fim', 'dataFim',
      'active_until', 'activeUntil', 'expires_at', 'expiresAt'
    ], 'end') || (start == null ? null : parseDateMs(iso(start).slice(0, 10), 'end'));
  }

  function deadlineMs(post) {
    return firstDateMs(post || {}, [
      'deadline_at', 'deadlineAt', 'deadline', 'data_limite', 'dataLimite',
      'inscricoes_ate', 'inscricoesAte', 'application_deadline', 'applicationDeadline',
      'deadline_date', 'deadlineDate', 'prazo', 'prazo_inscricao', 'prazoInscricao',
      'submission_deadline', 'submissionDeadline'
    ], 'end');
  }

  function activeFromMs(post) {
    return firstDateMs(post || {}, ['active_from', 'activeFrom', 'published_at', 'publishedAt'], 'start');
  }

  function genericExpiryMs(post) {
    return firstDateMs(post || {}, [
      'active_until', 'activeUntil', 'expires_at', 'expiresAt', 'valid_until', 'validUntil'
    ], 'end');
  }

  function rideEndMs(post) {
    return firstDateMs(post || {}, [
      'departure_at', 'departureAt', 'ride_date', 'rideDate', 'data_carona', 'dataCarona',
      'date', 'data'
    ], 'end');
  }

  function resolveActiveWindow(post, options) {
    var opts = options || {};
    var current = nowMs(opts);
    var moduleKey = canonicalModule(post || {});
    var status = canonicalStatus(post || {});
    var reasons = [];
    var start = null;
    var end = null;
    var deadline = null;
    var activeFrom = activeFromMs(post || {});

    if (status === 'closed' || status === 'encerrado') {
      return {
        module: moduleKey,
        status: 'closed',
        state: 'closed',
        active: false,
        archiveEligible: true,
        reasons: [{ type: 'closed', label: 'Publicacao encerrada' }],
        activeFrom: iso(activeFrom),
        activeUntil: null,
        eventStart: null,
        eventEnd: null,
        deadlineAt: null
      };
    }

    if (status !== 'published' && status !== 'publicado' && status !== 'active') {
      return {
        module: moduleKey,
        status: status,
        state: 'hidden',
        active: false,
        archiveEligible: false,
        reasons: [{ type: 'status', label: 'Status nao elegivel para feed publico' }],
        activeFrom: iso(activeFrom),
        activeUntil: null,
        eventStart: null,
        eventEnd: null,
        deadlineAt: null
      };
    }

    if (activeFrom != null && activeFrom > current) {
      return {
        module: moduleKey,
        status: 'published',
        state: 'scheduled',
        active: false,
        archiveEligible: false,
        reasons: [{ type: 'scheduled', label: 'Publicacao programada para depois' }],
        activeFrom: iso(activeFrom),
        activeUntil: null,
        eventStart: null,
        eventEnd: null,
        deadlineAt: null
      };
    }

    if (moduleKey === 'eventos') {
      start = eventStartMs(post || {});
      end = eventEndMs(post || {}, start);
      deadline = deadlineMs(post || {});
      if (start == null) {
        reasons.push({ type: 'missing-event-date', label: 'Evento sem data de realizacao' });
        return {
          module: moduleKey,
          status: 'published',
          state: 'needs-review',
          active: false,
          archiveEligible: false,
          reasons: reasons,
          activeFrom: iso(activeFrom),
          activeUntil: iso(deadline),
          eventStart: null,
          eventEnd: null,
          deadlineAt: iso(deadline)
        };
      }
      if (end != null && end < current) reasons.push({ type: 'expired-event', label: 'Evento ja passou' });
      return {
        module: moduleKey,
        status: 'published',
        state: end != null && end < current ? 'expired' : 'active',
        active: !(end != null && end < current),
        archiveEligible: end != null && end < current,
        reasons: reasons,
        activeFrom: iso(activeFrom),
        activeUntil: iso(end || deadline),
        eventStart: iso(start),
        eventEnd: iso(end),
        deadlineAt: iso(deadline)
      };
    }

    if (moduleKey === 'oportunidades') {
      deadline = deadlineMs(post || {});
      end = genericExpiryMs(post || {});
      if (deadline == null) reasons.push({ type: 'missing-deadline', label: 'Oportunidade sem prazo normalizado' });
      if (deadline != null && deadline < current) reasons.push({ type: 'expired-deadline', label: 'Prazo da oportunidade encerrado' });
      if (deadline == null && end != null && end < current) reasons.push({ type: 'expired', label: 'Publicacao fora da janela util' });
      return {
        module: moduleKey,
        status: 'published',
        state: (deadline != null && deadline < current) || (deadline == null && end != null && end < current) ? 'expired' : 'active',
        active: !((deadline != null && deadline < current) || (deadline == null && end != null && end < current)),
        archiveEligible: (deadline != null && deadline < current) || (deadline == null && end != null && end < current),
        reasons: reasons,
        activeFrom: iso(activeFrom),
        activeUntil: iso(deadline || end),
        eventStart: null,
        eventEnd: null,
        deadlineAt: iso(deadline)
      };
    }

    end = moduleKey === 'caronas' ? rideEndMs(post || {}) : genericExpiryMs(post || {});
    if (end != null && end < current) reasons.push({ type: 'expired', label: 'Publicacao fora da janela util' });
    return {
      module: moduleKey,
      status: 'published',
      state: end != null && end < current ? 'expired' : 'active',
      active: !(end != null && end < current),
      archiveEligible: end != null && end < current,
      reasons: reasons,
      activeFrom: iso(activeFrom),
      activeUntil: iso(end),
      eventStart: null,
      eventEnd: null,
      deadlineAt: null
    };
  }

  function hasMedia(post) {
    var md = metadataOf(post || {});
    return !!(
      firstString(post || {}, ['image_url', 'imageUrl', 'thumbnail_url', 'thumbnailUrl', 'cover_url', 'coverUrl']) ||
      (Array.isArray(post && post.images) && post.images.length) ||
      (Array.isArray(md.images) && md.images.length) ||
      (Array.isArray(md.media) && md.media.length)
    );
  }

  function tagsOf(post) {
    var tags = [];
    appendList(tags, post && post.tags);
    appendList(tags, metadataOf(post || {}).tags);
    appendList(tags, metadataOf(post || {}).keywords);
    return tags;
  }

  function categoryOf(post) {
    return normalizeKey(firstString(post || {}, [
      'category', 'categoria', 'subcategory', 'subcategoria', 'metadata.categoryKey', 'metadata.topic'
    ]));
  }

  function sourceTrustScore(post) {
    var url = sourceUrl(post || {});
    var host = hostFromUrl(url);
    var explicitVerified = firstValue(post || {}, [
      'source_verified', 'sourceVerified', 'verified', 'author_verified', 'authorVerified'
    ]) === true;
    var label = normalizeKey(firstString(post || {}, ['source', 'fonte', 'author_name', 'authorName']));
    if (host === 'ufg.br' || /\.ufg\.br$/.test(host)) return 1;
    if (explicitVerified) return 0.9;
    if (label.indexOf('ufg') !== -1) return 0.75;
    if (/^https:\/\//i.test(url)) return 0.65;
    if (url) return 0.45;
    return 0.35;
  }

  function qualityScore(post, eligibility) {
    var score = 0.25;
    if (titleOf(post).length >= 18) score += 0.15;
    if (descriptionOf(post).length >= 80) score += 0.18;
    if (categoryOf(post)) score += 0.10;
    if (tagsOf(post).length) score += 0.07;
    if (hasMedia(post)) score += 0.10;
    if (sourceUrl(post)) score += 0.10;
    if (eligibility.module === 'eventos' && eligibility.eventStart) score += 0.10;
    if (eligibility.module === 'oportunidades' && eligibility.deadlineAt) score += 0.10;
    if (eligibility.reasons.some(function (reason) { return /^missing-/.test(reason.type); })) score -= 0.20;
    return clamp01(score);
  }

  function temporalScore(post, eligibility, current) {
    var created = firstDateMs(post || {}, ['bumped_at', 'bumpedAt', 'created_at', 'createdAt'], 'start');
    if (eligibility.module === 'eventos') {
      var start = parseDateMs(eligibility.eventStart);
      var end = parseDateMs(eligibility.eventEnd);
      if (start != null && end != null && start <= current && end >= current) return 1;
      if (start == null) return 0.25;
      var daysUntil = (start - current) / DAY_MS;
      if (daysUntil < 0) return 0.35;
      if (daysUntil <= 1) return 1;
      if (daysUntil <= 7) return 0.9;
      if (daysUntil <= 21) return 0.72;
      if (daysUntil <= 60) return 0.52;
      return 0.32;
    }
    if (eligibility.module === 'oportunidades') {
      var deadline = parseDateMs(eligibility.deadlineAt);
      if (deadline == null) return 0.45;
      var daysLeft = (deadline - current) / DAY_MS;
      if (daysLeft <= 1) return 0.95;
      if (daysLeft <= 7) return 1;
      if (daysLeft <= 30) return 0.75;
      if (daysLeft <= 90) return 0.55;
      return 0.35;
    }
    if (created == null) return 0.45;
    var ageDays = Math.max(0, (current - created) / DAY_MS);
    if (ageDays <= 2) return 0.95;
    if (ageDays <= 14) return 0.75;
    if (ageDays <= 45) return 0.55;
    if (ageDays <= 120) return 0.35;
    return 0.20;
  }

  function engagementScore(post) {
    var votes = firstNumber(post || {}, ['votos', 'votes', 'score', 'like_count', 'likeCount']);
    var comments = firstNumber(post || {}, ['comment_count', 'commentCount', 'comments_count', 'commentsCount', 'comentarios']);
    var shares = firstNumber(post || {}, ['share_count', 'shareCount', 'compartilhamentos']);
    var saves = firstNumber(post || {}, ['save_count', 'saveCount', 'saved_count', 'savedCount', 'favorites', 'favoritos']);
    var cta = firstNumber(post || {}, ['coupon_clicks', 'couponClicks', 'cta_clicks', 'ctaClicks']);
    return clamp01(
      0.35 * Math.min(1, Math.log1p(votes) / Math.log1p(40)) +
      0.25 * Math.min(1, Math.log1p(comments) / Math.log1p(25)) +
      0.15 * Math.min(1, Math.log1p(shares) / Math.log1p(20)) +
      0.15 * Math.min(1, Math.log1p(saves) / Math.log1p(25)) +
      0.10 * Math.min(1, Math.log1p(cta) / Math.log1p(40))
    );
  }

  function communityImportanceScore(post) {
    var raw = firstValue(post || {}, [
      'community_importance', 'communityImportance', 'importance', 'metadata.community_importance',
      'metadata.communityImportance', 'metadata.importance'
    ]);
    var numeric = Number(raw);
    var score = Number.isFinite(numeric) ? (numeric > 1 ? numeric / 100 : numeric) : 0;
    var major = firstValue(post || {}, ['major_event', 'majorEvent', 'metadata.major_event', 'metadata.majorEvent']) === true;
    var text = normalizeKey([titleOf(post), descriptionOf(post)].join(' '));
    if (major) score = Math.max(score, 0.9);
    if (/(^|-)conpeex($|-)|(^|-)compex($|-)|congresso-de-pesquisa/.test(text)) score = Math.max(score, 0.95);
    if (canonicalModule(post || {}) === 'eventos' && /(^|-)ufg($|-)/.test(text) && /(semana|congresso|festival|simposio|mostra)/.test(text)) {
      score = Math.max(score, 0.55);
    }
    return clamp01(score);
  }

  function penaltyScore(post, eligibility) {
    var reports = firstNumber(post || {}, ['report_count', 'reportCount', 'reports', 'denuncias']);
    var penalty = Math.min(0.25, reports * 0.05);
    if (eligibility.reasons.some(function (reason) { return reason.type === 'missing-event-date'; })) penalty += 0.12;
    if (eligibility.reasons.some(function (reason) { return reason.type === 'missing-deadline'; })) penalty += 0.05;
    return clamp(penalty, 0, 0.4);
  }

  function scoreGlobal(post, options) {
    var opts = options || {};
    var current = nowMs(opts);
    var eligibility = resolveActiveWindow(post || {}, opts);
    var reasons = eligibility.reasons.slice();
    if (!eligibility.active) {
      return Object.freeze({
        version: VERSION,
        score: 0,
        finalScore: 0,
        components: Object.freeze({ quality: 0, temporal: 0, engagement: 0, sourceTrust: 0, community: 0, penalty: 1 }),
        eligibility: Object.freeze(eligibility),
        reasons: Object.freeze(reasons)
      });
    }
    var components = {
      quality: qualityScore(post || {}, eligibility),
      temporal: temporalScore(post || {}, eligibility, current),
      engagement: engagementScore(post || {}),
      sourceTrust: sourceTrustScore(post || {}),
      community: communityImportanceScore(post || {}),
      penalty: penaltyScore(post || {}, eligibility)
    };
    var raw =
      GLOBAL_WEIGHTS.quality * components.quality +
      GLOBAL_WEIGHTS.temporal * components.temporal +
      GLOBAL_WEIGHTS.engagement * components.engagement +
      GLOBAL_WEIGHTS.sourceTrust * components.sourceTrust +
      GLOBAL_WEIGHTS.community * components.community -
      components.penalty;

    if (components.sourceTrust >= 0.9) reasons.push({ type: 'official-source', label: 'Fonte oficial ou verificada' });
    if (components.community >= 0.9) reasons.push({ type: 'community-major', label: 'Alta relevancia comunitaria' });
    if (components.engagement >= 0.55) reasons.push({ type: 'engagement', label: 'Engajamento comunitario relevante' });

    return Object.freeze({
      version: VERSION,
      score: round4(raw),
      finalScore: round4(raw),
      components: Object.freeze({
        quality: round4(components.quality),
        temporal: round4(components.temporal),
        engagement: round4(components.engagement),
        sourceTrust: round4(components.sourceTrust),
        community: round4(components.community),
        penalty: Math.round(components.penalty * 10000) / 10000
      }),
      eligibility: Object.freeze(eligibility),
      reasons: Object.freeze(reasons.slice(0, 6))
    });
  }

  function extractSignals(post) {
    var moduleKey = canonicalModule(post || {});
    var category = categoryOf(post || {});
    var host = hostFromUrl(sourceUrl(post || {}));
    var signals = [];
    if (moduleKey) signals.push({ key: 'module:' + moduleKey, type: 'module', value: moduleKey });
    if (moduleKey && category) signals.push({ key: 'category:' + moduleKey + ':' + category, type: 'category', module: moduleKey, value: category });
    tagsOf(post || {}).forEach(function (tag) { signals.push({ key: 'tag:' + tag, type: 'tag', value: tag }); });
    if (host) signals.push({ key: 'source:' + normalizeKey(host), type: 'source', value: host });
    return signals;
  }

  function isPersonalized(preferences) {
    return !!(preferences && preferences.mode === 'personalized' &&
      preferences.consent && preferences.consent.granted === true);
  }

  function listIncludes(list, key) {
    return (Array.isArray(list) ? list : []).map(normalizeKey).indexOf(normalizeKey(key)) !== -1;
  }

  function explicitBoost(signals, preferences) {
    var prefs = preferences || {};
    var boost = 0;
    var reasons = [];
    signals.forEach(function (signal) {
      if (signal.type === 'module' && listIncludes(prefs.modules, signal.value)) {
        boost += 0.035;
        reasons.push({ type: 'explicit-module', label: 'Modulo escolhido nas preferencias' });
      }
      if (signal.type === 'category') {
        var byModule = prefs.categories && prefs.categories[signal.module];
        var featureValues = prefs.features && (prefs.features[signal.module + ':categoria'] || prefs.features[signal.module + ':category']);
        if (listIncludes(byModule, signal.value) || listIncludes(featureValues, signal.value)) {
          boost += 0.025;
          reasons.push({ type: 'explicit-category', label: 'Categoria escolhida nas preferencias' });
        }
      }
      if (signal.type === 'tag' && listIncludes(prefs.tags, signal.value)) {
        boost += 0.015;
        reasons.push({ type: 'explicit-tag', label: 'Tag escolhida nas preferencias' });
      }
      if (signal.type === 'source' && listIncludes(prefs.sources, signal.value)) {
        boost += 0.015;
        reasons.push({ type: 'explicit-source', label: 'Fonte escolhida nas preferencias' });
      }
    });
    return {
      boost: Math.min(MAX_EXPLICIT_BOOST, boost),
      reasons: reasons.slice(0, 3)
    };
  }

  function parseTimestamp(value) {
    return parseDateMs(value);
  }

  function affinityStrength(row, current) {
    if (!row || typeof row !== 'object') return 0;
    if (typeof row.score === 'number' && Number.isFinite(row.score)) return clamp01(row.score);
    var count = Math.max(0, Number(row.count) || 0);
    var updated = parseTimestamp(row.updatedAt || row.updated_at);
    var decay = updated == null ? 1 : Math.pow(0.5, Math.max(0, current - updated) / HALF_LIFE_MS);
    var saturation = 1 - Math.exp(-count / 3);
    return clamp01(decay * saturation);
  }

  function affinityBoost(signals, affinity, current) {
    var features = affinity && affinity.features && typeof affinity.features === 'object' ? affinity.features : {};
    var best = { boost: 0, reason: null };
    signals.forEach(function (signal) {
      var strength = affinityStrength(features[signal.key], current);
      var boost = Math.min(MAX_AFFINITY_BOOST, strength * MAX_AFFINITY_BOOST);
      if (boost > best.boost) {
        best = {
          boost: boost,
          reason: boost > 0.001 ? { type: 'local-affinity', label: 'Afinidade local com ' + signal.type } : null
        };
      }
    });
    return best;
  }

  function blendPersonalScore(globalResult, post, options) {
    var opts = options || {};
    var base = globalResult || scoreGlobal(post || {}, opts);
    if (!base.eligibility || !base.eligibility.active || !isPersonalized(opts.preferences)) {
      return Object.freeze(Object.assign({}, base, {
        finalScore: base.finalScore,
        personalization: Object.freeze({ boost: 0, explicitBoost: 0, affinityBoost: 0, reasons: Object.freeze([]) })
      }));
    }
    var current = nowMs(opts);
    var signals = extractSignals(post || {});
    var explicit = explicitBoost(signals, opts.preferences);
    var affinity = opts.preferences && opts.preferences.localAffinityConsent === true
      ? affinityBoost(signals, opts.affinity, current)
      : { boost: 0, reason: null };
    var total = Math.min(MAX_TOTAL_BOOST, explicit.boost + affinity.boost);
    var reasons = explicit.reasons.slice();
    if (affinity.reason) reasons.push(affinity.reason);
    return Object.freeze(Object.assign({}, base, {
      finalScore: round4(base.score * (1 + total)),
      personalization: Object.freeze({
        boost: Math.round(total * 10000) / 10000,
        explicitBoost: Math.round(explicit.boost * 10000) / 10000,
        affinityBoost: Math.round(affinity.boost * 10000) / 10000,
        reasons: Object.freeze(reasons.slice(0, 4))
      })
    }));
  }

  function primaryDedupeKey(post) {
    var id = firstString(post || {}, ['id', 'uuid', 'post_id', 'postId']);
    if (id) return 'id:' + id;
    var url = sourceUrl(post || {});
    if (url) return 'url:' + url.toLowerCase().replace(/[?#].*$/, '');
    return 'title:' + normalizeKey(titleOf(post || {})).slice(0, 80);
  }

  function dedupeCandidates(posts) {
    var seen = {};
    return (Array.isArray(posts) ? posts : []).filter(function (post) {
      var key = primaryDedupeKey(post || {});
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function diversify(entries, options) {
    var opts = options || {};
    var maxSameModuleRun = Math.max(1, Number(opts.maxSameModuleRun) || 2);
    var remaining = entries.slice();
    var output = [];
    function runModuleCount(moduleKey) {
      var count = 0;
      for (var index = output.length - 1; index >= 0; index -= 1) {
        if (output[index].module !== moduleKey) break;
        count += 1;
      }
      return count;
    }
    while (remaining.length) {
      var pickIndex = remaining.findIndex(function (entry) {
        return runModuleCount(entry.module) < maxSameModuleRun;
      });
      if (pickIndex < 0) pickIndex = 0;
      output.push(remaining.splice(pickIndex, 1)[0]);
    }
    return output;
  }

  function rankForShadow(posts, options) {
    var opts = options || {};
    var list = opts.dedupe === false ? (Array.isArray(posts) ? posts.slice() : []) : dedupeCandidates(posts);
    var entries = list.map(function (post, index) {
      var global = scoreGlobal(post || {}, opts);
      var blended = blendPersonalScore(global, post || {}, opts);
      return Object.freeze({
        post: post,
        originalIndex: index,
        id: firstString(post || {}, ['id', 'uuid', 'post_id', 'postId']),
        module: canonicalModule(post || {}),
        score: blended.score,
        finalScore: blended.finalScore,
        components: blended.components,
        eligibility: blended.eligibility,
        personalization: blended.personalization,
        reasons: blended.reasons
      });
    }).sort(function (left, right) {
      return right.finalScore - left.finalScore || left.originalIndex - right.originalIndex;
    });
    if (opts.diversify === false) return entries;
    return diversify(entries, opts);
  }

  return Object.freeze({
    VERSION: VERSION,
    PURPOSE_VERSION: PURPOSE_VERSION,
    GLOBAL_WEIGHTS: GLOBAL_WEIGHTS,
    MAX_EXPLICIT_BOOST: MAX_EXPLICIT_BOOST,
    MAX_AFFINITY_BOOST: MAX_AFFINITY_BOOST,
    MAX_TOTAL_BOOST: MAX_TOTAL_BOOST,
    canonicalModule: canonicalModule,
    resolveActiveWindow: resolveActiveWindow,
    scoreGlobal: scoreGlobal,
    extractSignals: extractSignals,
    affinityStrength: affinityStrength,
    blendPersonalScore: blendPersonalScore,
    dedupeCandidates: dedupeCandidates,
    rankForShadow: rankForShadow
  });
}));
