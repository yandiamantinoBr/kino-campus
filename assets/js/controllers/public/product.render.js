/**
 * KinoCampus — product.render.js v13.4.2
 *
 * Sub-módulo de renderização pura para a página de produto (_product.html).
 * Extraído de product.controller.js (v13.4.1 split).
 *
 * Contém:
 *   - Utilitários DOM (esc, setText, setHTML, show, hide, formatCurrency, moduleLabel)
 *   - Funções de renderização de dados do post (showNotFound, setBreadcrumb, setBadges,
 *     setGallery, setPrice, setDescription, setSpecs, setOpenGraphTags, setLegacyBanner,
 *     buildTagEntries, buildTagsSpecHtml, getPostAuthorId, legacy markers)
 *
 * Expõe: window._KCProduct.render (Object.freeze)
 * Carregado: após product.controller.js, antes de product.load.js
 * Dependências: window.KCPostLifecycle (datas semânticas), window.KCUtils (opcional)
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  // ── Utilitários DOM ──────────────────────────────────────────────────────────

  function esc(str) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html || '';
  }

  function show(id, display) {
    var el = document.getElementById(id);
    if (el) el.style.display = display || '';
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function moduleLabel(key) {
    if (window.KCUtils && typeof window.KCUtils.getModuleLabel === 'function') return window.KCUtils.getModuleLabel(key);
    return String(key || '');
  }

  function closedLabel(post) {
    var moduleKey = String(post && (post.modulo || post.module) || '').trim().toLowerCase();
    if (moduleKey === 'eventos') return 'Evento encerrado';
    if (moduleKey === 'caronas') return 'Carona encerrada';
    if (moduleKey === 'compra-venda') return 'An\u00FAncio encerrado';
    return 'Publica\u00E7\u00E3o encerrada';
  }

  function syncClosedStatusNote(post, isClosed) {
    var current = document.getElementById('kcClosedStatusNote');
    if (current) current.remove();
    if (!isClosed) return;
    var details = document.querySelector('.kc-product-details');
    if (!details) return;
    var note = document.createElement('div');
    note.id = 'kcClosedStatusNote';
    note.className = 'kc-product-status-note kc-product-status-note--closed';
    note.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i><span><strong>' + esc(closedLabel(post)) + '.</strong> Esta publica\u00E7\u00E3o continua vis\u00EDvel como hist\u00F3rico, mas n\u00E3o est\u00E1 mais ativa. O dono pode reativ\u00E1-la a qualquer momento.</span>';
    details.insertAdjacentElement('afterbegin', note);
  }

  function formatCurrency(n) {
    if (window.KCUtils && typeof window.KCUtils.formatCurrencyBRL === 'function') return window.KCUtils.formatCurrencyBRL(n);
    try { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (_) { return String(n); }
  }

  function formatDateForDisplay(value) {
    var text = String(value == null ? '' : value).trim();
    var isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
    if (!isoDate) return text.slice(0, 10);
    return isoDate[3] + '/' + isoDate[2] + '/' + isoDate[1];
  }

  function formatLinkLabel(url) {
    var text = String(url || '').trim();
    var label = text;
    try {
      var parsed = new URL(text);
      var path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
      label = parsed.hostname.replace(/^www\./, '') + path;
      if (parsed.search && label.length < 42) label += parsed.search;
    } catch (_) {}
    return label.length > 56 ? label.slice(0, 53).trim() + '...' : label;
  }

  // Espelha kc-post-lifecycle.shared.js. A ordem e parte do contrato: para cada
  // alias, o valor na raiz precede o mesmo alias no metadata consolidado.
  var DEADLINE_PATHS = Object.freeze([
    'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
    'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline', 'dataLimite',
    'data_limite', 'inscricoesAte', 'inscricoes_ate', 'prazoInscricao', 'prazo_inscricao',
    'submissionDeadline', 'submission_deadline', 'prazo', 'dates.applicationDeadline',
    'dates.application_deadline', 'dates.deadlineAt', 'dates.deadline_at', 'dates.deadlineDate',
    'dates.deadline', 'dates.submissionDeadline', 'dates.submission_deadline'
  ]);

  // Quando a pipeline declara a fase ativa, aliases de outra finalidade deixam
  // de ser um fallback valido. A lista ampla acima continua sendo o contrato de
  // compatibilidade apenas para publicacoes legadas sem fase identificavel.
  var CURRENT_DEADLINE_PATHS = Object.freeze([
    'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
    'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline', 'dataLimite',
    'data_limite', 'inscricoesAte', 'inscricoes_ate', 'prazoInscricao', 'prazo_inscricao', 'prazo',
    'dates.applicationDeadline', 'dates.application_deadline', 'dates.deadlineAt', 'dates.deadline_at',
    'dates.deadlineDate', 'dates.deadline',
  ]);
  var APPLICATION_PURPOSE_PATHS = Object.freeze([
    'applicationPurpose', 'application_purpose',
    'dates.applicationPurpose', 'dates.application_purpose',
  ]);
  var ACTIVE_EPISODE_PATHS = Object.freeze([
    'applicationEpisode', 'application_episode',
    'dates.applicationEpisode', 'dates.application_episode',
  ]);
  var APPLICATION_EPISODES_PATHS = Object.freeze([
    'applicationEpisodes', 'application_episodes',
    'dates.applicationEpisodes', 'dates.application_episodes',
  ]);
  var EPISODE_DEADLINE_PATHS = Object.freeze([
    'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
    'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline',
  ]);
  var APPLICATION_PURPOSES = Object.freeze([
    'registration', 'submission', 'candidacy', 'enrollment', 'listener_registration',
  ]);

  function readPath(source, path) {
    var current = source;
    var parts = String(path || '').split('.').filter(Boolean);
    for (var i = 0; i < parts.length; i += 1) {
      if (!current || typeof current !== 'object') return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  function dateKeyInSaoPaulo(parsedMs) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date(parsedMs));
      var values = {};
      parts.forEach(function (part) {
        if (part.type !== 'literal') values[part.type] = part.value;
      });
      return values.year && values.month && values.day
        ? values.year + '-' + values.month + '-' + values.day
        : '';
    } catch (_) {
      return '';
    }
  }

  function normalizeApplicationPurpose(value) {
    if (typeof value !== 'string') return '';
    var normalized = value.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return APPLICATION_PURPOSES.indexOf(normalized) !== -1 ? normalized : '';
  }

  function episodePurpose(episode) {
    if (!episode || typeof episode !== 'object' || Array.isArray(episode)) return '';
    return normalizeApplicationPurpose(
      episode.purpose || episode.applicationPurpose || episode.application_purpose
    );
  }

  function isActiveEpisode(episode) {
    if (!episode || typeof episode !== 'object' || Array.isArray(episode)) return false;
    if (episode.active === true || episode.isActive === true || episode.is_active === true || episode.current === true) {
      return true;
    }
    var status = String(episode.status || '').trim().toLowerCase();
    return status === 'open' || status === 'active' || status === 'ongoing' || status === 'current';
  }

  function valuesAtPaths(source, metadata, paths) {
    var values = [];
    paths.forEach(function (path) {
      var direct = readPath(source, path);
      if (direct != null && direct !== '') values.push(direct);
      var nested = readPath(metadata, path);
      if (nested != null && nested !== '') values.push(nested);
    });
    return values;
  }

  function phaseContract(source, metadata) {
    var identified = false;
    var invalid = false;
    var purposes = [];
    var explicitEpisodes = [];

    valuesAtPaths(source, metadata, APPLICATION_PURPOSE_PATHS).forEach(function (value) {
      identified = true;
      var purpose = normalizeApplicationPurpose(value);
      if (purpose) purposes.push(purpose);
      else invalid = true;
    });

    valuesAtPaths(source, metadata, ACTIVE_EPISODE_PATHS).forEach(function (value) {
      identified = true;
      if (typeof value === 'string') {
        var purpose = normalizeApplicationPurpose(value);
        if (purpose) purposes.push(purpose);
        else invalid = true;
        return;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        var objectPurpose = episodePurpose(value);
        if (objectPurpose) {
          purposes.push(objectPurpose);
          explicitEpisodes.push(value);
        } else {
          invalid = true;
        }
        return;
      }
      invalid = true;
    });

    valuesAtPaths(source, metadata, APPLICATION_EPISODES_PATHS).forEach(function (value) {
      if (!Array.isArray(value)) return;
      value.filter(isActiveEpisode).forEach(function (episode) {
        identified = true;
        var purpose = episodePurpose(episode);
        if (purpose) {
          purposes.push(purpose);
          explicitEpisodes.push(episode);
        } else {
          invalid = true;
        }
      });
    });

    var uniquePurposes = purposes.filter(function (purpose, index) {
      return purposes.indexOf(purpose) === index;
    });
    if (!identified) return { identified: false, purpose: '', episodes: [] };
    if (invalid || uniquePurposes.length !== 1) {
      return { identified: true, purpose: '', episodes: [] };
    }

    var selectedPurpose = uniquePurposes[0];
    return {
      identified: true,
      purpose: selectedPurpose,
      episodes: explicitEpisodes.filter(function (episode) {
        return episodePurpose(episode) === selectedPurpose;
      }),
    };
  }

  function deadlineFromPaths(source, metadata, paths, lifecycle) {
    for (var i = 0; i < paths.length; i += 1) {
      var path = paths[i];
      var direct = readPath(source, path);
      if (direct != null && direct !== '') {
        var directParsed = lifecycle.parseDateMs(direct, 'end');
        if (directParsed != null) return dateKeyInSaoPaulo(directParsed);
      }
      var nested = readPath(metadata, path);
      if (nested != null && nested !== '') {
        var nestedParsed = lifecycle.parseDateMs(nested, 'end');
        if (nestedParsed != null) return dateKeyInSaoPaulo(nestedParsed);
      }
    }
    return '';
  }

  function purposeDeadlinePaths(purpose) {
    var parts = String(purpose || '').split('_').filter(Boolean);
    if (!parts.length) return [];
    var camel = parts[0] + parts.slice(1).map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
    var camelAlias = camel + 'Deadline';
    var snakeAlias = parts.join('_') + '_deadline';
    return [camelAlias, snakeAlias, 'dates.' + camelAlias, 'dates.' + snakeAlias];
  }

  function getDeclaredDeadline(post) {
    var lifecycle = window.KCPostLifecycle;
    if (!lifecycle || typeof lifecycle.metadataOf !== 'function' || typeof lifecycle.parseDateMs !== 'function') return '';

    var source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    var metadata = lifecycle.metadataOf(source);
    var phase = phaseContract(source, metadata);
    if (!phase.identified) return deadlineFromPaths(source, metadata, DEADLINE_PATHS, lifecycle);
    if (!phase.purpose) return '';

    var generalDeadline = deadlineFromPaths(source, metadata, CURRENT_DEADLINE_PATHS, lifecycle);
    if (generalDeadline) return generalDeadline;

    for (var i = 0; i < phase.episodes.length; i += 1) {
      var episodeDeadline = deadlineFromPaths(phase.episodes[i], {}, EPISODE_DEADLINE_PATHS, lifecycle);
      if (episodeDeadline) return episodeDeadline;
    }
    return deadlineFromPaths(source, metadata, purposeDeadlinePaths(phase.purpose), lifecycle);
  }

  // Absence of a source deadline is explicit, scoped and rechecked. Technical
  // expiry must never be displayed as the course's application deadline.
  function getSourceAvailability(post) {
    var metadata = post && post.metadata;
    var validity = metadata && metadata.validity;
    if (!validity || typeof validity !== 'object' || Array.isArray(validity)
        || String(post.modulo || post.module || '') !== 'oportunidades'
        || validity.contract !== 'cadu-self-paced-course-v1'
        || validity.mode !== 'no_final_deadline_informed'
        || validity.sourceRegistryId !== 'web.ufg.iptsp'
        || validity.sourceUrl !== 'https://iptsp.ufg.br/n/203499'
        || validity.courseKey !== 'leptospirosetdtp:1365'
        || validity.evidenceDigest !== '5e6c4dc953a90ff02f664d89a59bb75655a827d08f3663bc02fe2ab3f19ee223') return null;
    var checked = Date.parse(validity.checkedAt);
    var expiry = Date.parse(validity.verificationExpiresAt);
    var next = Date.parse(validity.nextCheckAt);
    if (!Number.isFinite(checked) || !Number.isFinite(expiry) || !Number.isFinite(next)
        || checked > Date.now() + 300000 || next - checked !== 86400000
        || expiry - checked !== 259200000) return null;
    return { checkedAt: validity.checkedAt, needsCheck: Date.now() >= next };
  }

  // ── Helpers de identificação ─────────────────────────────────────────────────

  function getPostAuthorId(post) {
    var raw = post && (post.autorId || post.authorId || post.author_id);
    return String(raw || '').trim() || null;
  }

  // ── Legacy example markers ───────────────────────────────────────────────────

  function isLegacyExamplePost(post) {
    if (!post || typeof post !== 'object') return false;
    return !!String(post.legacyId || post.legacy_id || '').trim();
  }

  function isLegacyExampleProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return !!String(profile.legacyId || profile.legacy_id || '').trim();
  }

  function buildLegacyExampleBadgeHtml(label, extraClass) {
    var text = String(label || 'Exemplo').trim() || 'Exemplo';
    var className = ['kc-product-example-ribbon', extraClass || ''].filter(Boolean).join(' ');
    return '<span class="' + className + '" aria-label="' + esc(text) + '"><i class="fas fa-flask"></i><span>' + esc(text) + '</span></span>';
  }

  function syncLegacyExampleMarker(container, shouldShow, label, extraClass) {
    if (!container) return;
    var current = container.querySelector('.kc-product-example-ribbon');
    if (current) current.remove();
    if (!shouldShow) return;
    container.insertAdjacentHTML('afterbegin', buildLegacyExampleBadgeHtml(label, extraClass));
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  function showNotFound() {
    show('notFound', 'block');
    hide('relatedSection');
    hide('sellerCard');
    setText('postTitle', 'Anúncio não encontrado ou removido');
    setHTML('postDescription', '');
    setHTML('badges', '');
    hide('priceBlock');
    hide('specsBlock');
    var emojiCover = document.getElementById('emojiCover');
    if (emojiCover) { emojiCover.textContent = '❓'; emojiCover.style.display = 'flex'; }
    hide('mainImage');
    hide('thumbnails');
  }

  // ── setBreadcrumb ────────────────────────────────────────────────────────────

  function setBreadcrumb(post) {
    var bc = document.getElementById('breadcrumb');
    if (!bc) return;
    var modKey = String(post.modulo || '');
    var modLbl = moduleLabel(modKey);
    var catLbl = post.categoriaLabel || post.categoria || '';
    var subLbl = post.subcategoriaLabel || post.subcategoria || '';
    var title = post.titulo || post.title || '';
    var parts = [];
    parts.push('<a class="kc-breadcrumb-segment kc-breadcrumb-segment--home" href="index.html"><i class="fas fa-home" aria-hidden="true"></i><span>KinoCampus</span></a>');
    var rawModulePage = String((post._kcModulePage || '') || 'index.html').trim();
    var safeModulePage = /^[a-z0-9_-]+\.html(?:[?#].*)?$/i.test(rawModulePage) ? rawModulePage : 'index.html';
    if (modKey) parts.push('<span class="kc-breadcrumb-segment"><i class="fas fa-chevron-right" aria-hidden="true"></i><a href="' + esc(safeModulePage) + '">' + esc(modLbl) + '</a></span>');
    if (catLbl) parts.push('<span class="kc-breadcrumb-segment"><i class="fas fa-chevron-right" aria-hidden="true"></i><span>' + esc(catLbl) + '</span></span>');
    if (subLbl) parts.push('<span class="kc-breadcrumb-segment"><i class="fas fa-chevron-right" aria-hidden="true"></i><span>' + esc(subLbl) + '</span></span>');
    if (title) parts.push('<span class="kc-breadcrumb-segment kc-breadcrumb-segment--current"><i class="fas fa-chevron-right" aria-hidden="true"></i><span aria-current="page">' + esc(title) + '</span></span>');
    if (parts.length === 1) parts.push('<span class="kc-breadcrumb-segment kc-breadcrumb-segment--current"><i class="fas fa-chevron-right" aria-hidden="true"></i><span aria-current="page">Detalhes</span></span>');
    bc.innerHTML = parts.join(' ');
  }

  // ── setBadges ────────────────────────────────────────────────────────────────

  function setBadges(post) {
    var el = document.getElementById('badges');
    if (!el) return;
    var metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    var badges = [];
    var isClosed = String(post && (post.status || post.estado) || '').trim().toLowerCase() === 'closed' || post.isClosed === true;
    syncClosedStatusNote(post, isClosed);
    if (post.modulo) {
      var icon = (window.KCUtils && typeof window.KCUtils.getModuleIconClass === 'function')
        ? window.KCUtils.getModuleIconClass(post.modulo)
        : 'fas fa-layer-group';
      badges.push('<span class="kc-badge"><i class="' + esc(icon) + '"></i> ' + esc(moduleLabel(post.modulo)) + '</span>');
    }
    // Categoria (se diferente do módulo, pra não duplicar)
    var catLbl = post.categoriaLabel || post.categoria || '';
    var catKey = String(post.categoriaKey || post.categoria || '').toLowerCase().trim();
    var modKey = String(post.modulo || '').toLowerCase().trim();
    if (catLbl && catKey !== modKey) {
      badges.push('<span class="kc-badge"><i class="fas fa-tag"></i> ' + esc(catLbl) + '</span>');
    }
    // Gratuito (se metadata.gratuito !== false)
    if (metadata.gratuito === true) {
      badges.push('<span class="kc-badge"><i class="fas fa-money-bill-wave"></i> Gratuito</span>');
    } else if (typeof post.preco === 'number' && post.preco > 0) {
      badges.push('<span class="kc-badge"><i class="fas fa-money-bill-wave"></i> ' + esc(formatCurrency(post.preco)) + '</span>');
    }
    // Prazo semantico declarado pela fonte; aliases de expiracao sao apenas ciclo de vida tecnico.
    var deadline = getDeclaredDeadline(post);
    if (deadline) {
      var datePart = formatDateForDisplay(deadline);
      badges.push('<span class="kc-badge"><i class="fas fa-calendar-check"></i> Prazo: ' + esc(datePart) + '</span>');
    } else if (getSourceAvailability(post)) {
      badges.push('<span class="kc-badge"><i class="fas fa-calendar-check"></i> Sem prazo final informado</span>');
    }
    if (isClosed) badges.push('<span class="kc-badge kc-badge--closed"><i class="fas fa-lock" aria-hidden="true"></i> Encerrado</span>');
    if (post._kcStatusBadgeHtml) badges.push(post._kcStatusBadgeHtml);
    if (post.verificado) badges.push(post._kcVerifiedTag || '<span class="kc-badge kc-badge--verified"><i class="fas fa-check-circle"></i> Verificado</span>');
    if (post.condicao) badges.push('<span class="kc-badge"><i class="fas fa-star"></i> ' + esc(post.condicao) + '</span>');
    var relTime = post._kcRelativeTime || (window.KCUtils && window.KCUtils.timeAgo ? window.KCUtils.timeAgo(post.timestamp || post.created_at) : (post.timestamp || post.created_at));
    if (relTime) badges.push('<span class="kc-badge"><i class="fas fa-clock"></i> ' + esc(relTime) + '</span>');
    el.innerHTML = badges.join(' ');
  }

  // ── setGallery ───────────────────────────────────────────────────────────────

  function buildGalleryCandidates(post, images) {
    // Mesmo contrato do data-kc-image-candidates dos cards (kc-utils.presentation):
    // URLs renderizáveis, dedupe preservando ordem, teto generoso para galerias.
    var meta = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
    var pool = (images || []).slice();
    [post && post.cover_url, post && post.coverUrl, post && post.image_url, post && post.imageUrl]
      .forEach(function (value) { if (value) pool.push(value); });
    ['cover_url', 'coverUrl', 'image_url', 'imageUrl'].forEach(function (key) {
      if (typeof meta[key] === 'string' && meta[key]) pool.push(meta[key]);
    });
    ['gallery_image_urls', 'galleryImageUrls', 'image_urls', 'imageUrls'].forEach(function (key) {
      if (Array.isArray(meta[key])) pool = pool.concat(meta[key]);
    });
    var seen = {};
    var out = [];
    pool.forEach(function (value) {
      var raw = String(value == null ? '' : value).trim();
      if (!raw || seen[raw]) return;
      var renderable = /^https?:\/\//i.test(raw)
        || /^data:image\//i.test(raw)
        || (raw.charAt(0) === '/' && raw.charAt(1) !== '/');
      if (!renderable) return;
      seen[raw] = true;
      out.push(raw);
    });
    return out.slice(0, 12);
  }

  function setGallery(post) {
    var mainImg = document.getElementById('mainImage');
    var emojiCover = document.getElementById('emojiCover');
    var thumbs = document.getElementById('thumbnails');
    var galleryMain = document.querySelector('.kc-gallery-main');
    var images = Array.isArray(post.imagens) ? post.imagens : (Array.isArray(post.images) ? post.images : []);
    // A capa (imagens[0]) também é a primeira miniatura, ativa por padrão.
    // As demais imagens seguem na mesma ordem. Isso mantém a galeria visível
    // consistente com o post_media e evita que a capa "suma" da faixa de
    // miniaturas quando a pipeline espelha gallery_image_urls com a capa
    // como primeiro item.
    var thumbImages = images;
    var isLegacy = isLegacyExamplePost(post);
    syncLegacyExampleMarker(galleryMain, isLegacy, 'Exemplo', 'kc-product-example-ribbon--gallery');
    var emoji = post.emoji || '✨';
    var title = String(post.titulo || post.title || 'publicação').trim() || 'publicação';
    var imageAlt = 'Imagem da publicação: ' + title;
    if (images && images.length) {
      // Resiliencia (v11.31.0): hero e miniaturas carregam data-kc-image-candidates;
      // o handler delegado de kc-utils.presentation.js troca a fonte em caso de
      // URL quebrada e, esgotada a galeria, revela o emojiCover do hero.
      var candidates = buildGalleryCandidates(post, images);
      var hasCandidates = candidates.length > 0;
      if (galleryMain && hasCandidates) {
        galleryMain.setAttribute('data-kc-image-candidates', JSON.stringify(candidates));
        galleryMain.setAttribute('data-kc-image-emoji', String(emoji || '\u2728'));
        galleryMain.setAttribute('data-kc-image-fallback-id', 'emojiCover');
        galleryMain.setAttribute('data-kc-image-candidate-index', '0');
      }
      if (mainImg) { mainImg.src = hasCandidates ? candidates[0] : images[0]; mainImg.alt = imageAlt; mainImg.style.display = 'block'; }
      if (emojiCover) emojiCover.style.display = 'none';
      if (thumbs) {
        thumbs.innerHTML = '';
        thumbImages.forEach(function (src, idx) {
          var img = document.createElement('img');
          img.src = src;
          img.alt = 'Miniatura ' + (idx + 1) + ' de ' + title;
          img.loading = 'lazy';
          img.decoding = 'async';
          img.className = 'kc-thumbnail' + (idx === 0 ? ' active' : '');
          img.setAttribute('data-full-src', src);
          if (hasCandidates) {
            // Cada miniatura caminha pelos proprios candidatos; o index inicial
            // e a posicao da fonte desta miniatura no pool do hero.
            img.setAttribute('data-kc-image-candidates', JSON.stringify(candidates));
            img.setAttribute('data-kc-image-candidate-index', String(Math.max(0, candidates.indexOf(src))));
          }
          img.addEventListener('click', function () {
            var all = thumbs.querySelectorAll('.kc-thumbnail');
            all.forEach(function (t) { t.classList.remove('active'); });
            img.classList.add('active');
            if (galleryMain && hasCandidates) {
              galleryMain.setAttribute('data-kc-image-candidate-index', String(Math.max(0, candidates.indexOf(src))));
            }
            if (mainImg) { mainImg.src = src; mainImg.alt = img.alt; }
          });
          thumbs.appendChild(img);
        });
        thumbs.style.display = images.length > 1 ? 'grid' : 'none';
      }
    } else {
      if (mainImg) mainImg.style.display = 'none';
      if (emojiCover) { emojiCover.style.display = 'flex'; emojiCover.textContent = emoji; }
      if (thumbs) thumbs.style.display = 'none';
    }
  }

  // ── setPrice ─────────────────────────────────────────────────────────────────

  function setPrice(post) {
    var block = document.getElementById('priceBlock');
    if (!block) return;
    if (post._kcHidePrice) { block.style.display = 'none'; return; }
    var iconEl = document.getElementById('priceIcon');
    var valueEl = document.getElementById('priceValue');
    var smallEl = document.getElementById('priceSmall');
    var origEl = document.getElementById('priceOriginal');
    var discEl = document.getElementById('priceDiscount');
    var iconClass = post._kcPriceIconClass || 'fas fa-money-bill-wave';
    if (iconEl) iconEl.className = iconClass;
    var main = post._kcPriceTextMain || (typeof post.preco === 'number' ? (post.preco === 0 ? 'Gratuito' : formatCurrency(post.preco)) : '');
    var small = post._kcPriceTextSmall || '';
    if (valueEl) valueEl.textContent = main;
    if (smallEl) smallEl.textContent = small;
    var showOriginal = !!post._kcShowOriginalPrice;
    var showDiscount = !!post._kcShowDiscount;
    if (origEl) {
      if (showOriginal && typeof post.precoOriginal === 'number') { origEl.textContent = formatCurrency(post.precoOriginal); origEl.style.display = ''; }
      else origEl.style.display = 'none';
    }
    if (discEl) {
      if (showDiscount && typeof post.descontoPercentual === 'number') { discEl.textContent = '-' + String(post.descontoPercentual) + '%'; discEl.style.display = ''; }
      else discEl.style.display = 'none';
    }
    if (post._kcPriceStyle && typeof post._kcPriceStyle === 'object') {
      try { Object.entries(post._kcPriceStyle).forEach(function (kv) { block.style.setProperty(kv[0], kv[1]); }); } catch (_) {}
    }
    block.style.display = 'flex';
  }

  // ── buildTagEntries, buildTagsSpecHtml ───────────────────────────────────────

  function buildTagEntries(post) {
    var metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    var tags = []
      .concat(Array.isArray(post.tags) ? post.tags : [])
      .concat(Array.isArray(post.userTags) ? post.userTags : [])
      .concat(Array.isArray(metadata.userTags) ? metadata.userTags : [])
      .filter(function (tag, index, list) {
        var key = String(tag || '').trim().toLowerCase();
        return !!key && list.findIndex(function (candidate) { return String(candidate || '').trim().toLowerCase() === key; }) === index;
      })
      .slice(0, 20);
    var markerTags = (window.KCUtils && typeof window.KCUtils.getDisplayMarkerTags === 'function')
      ? window.KCUtils.getDisplayMarkerTags(post, { limit: 14 }) : [];
    var normalize = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
      ? window.KCUtils.normalizeText : function (v) { return String(v || '').toLowerCase().trim(); };
    var markerLabels = new Set(markerTags.map(function (tag) { return normalize(tag && tag.label); }));
    var plainTags = tags.filter(function (tag) { return !markerLabels.has(normalize(tag)); })
      .map(function (tag) { return { label: tag, emoji: '🏷️' }; });
    return { markerTags: markerTags, plainTags: plainTags };
  }

  function buildTagsSpecHtml(post) {
    var entries = buildTagEntries(post);
    if (!entries.markerTags.length && !entries.plainTags.length) return '';
    function renderTag(tag, itemClass) {
      var emoji = esc(String(tag && tag.emoji || '🏷️').trim());
      var label = esc(String(tag && tag.label || '').trim());
      return '<span class="' + itemClass + '">' + (emoji ? '<span class="kc-tag__emoji">' + emoji + '</span>' : '') + '<span>' + label + '</span></span>';
    }
    return '<div class="kc-tags-list kc-tags-list--specs">'
      + entries.markerTags.map(function (t) { return renderTag(t, 'kc-tag kc-tag--marker'); }).join('')
      + entries.plainTags.map(function (t) { return renderTag(t, 'kc-tag'); }).join('')
      + '</div>';
  }

  // ── setOpenGraphTags ─────────────────────────────────────────────────────────

  function setOpenGraphTags(post) {
    var title = (post.titulo || post.title || 'KinoCampus') + ' — KinoCampus';
    var desc = String(post.descricao || post.description || 'Anúncios, eventos e oportunidades da comunidade universitária UFG.').trim().substring(0, 200);
    var metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    var images = [];
    function addImage(value) {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(addImage);
        return;
      }
      if (typeof value === 'object') {
        addImage(value.url || value.image_url || value.imageUrl || value.src || value.href);
        return;
      }
      var text = String(value || '').trim();
      if (/^https?:\/\/[^\s"'<>]+$/i.test(text) && images.indexOf(text) === -1) images.push(text);
    }
    addImage(post.image_url || post.imageUrl || post.cover_url || post.coverUrl);
    addImage(metadata.cover_url || metadata.coverUrl || metadata.image_url || metadata.imageUrl || metadata.og_image || metadata.ogImage);
    addImage(post.imagens || post.images || post.image_urls || post.gallery_image_urls);
    addImage(metadata.imagens || metadata.images || metadata.image_urls || metadata.gallery_image_urls || metadata.galleryImageUrls);
    addImage(post.post_media);
    var img = images.length ? String(images[0]) : '';
    var url = window.location.href;
    function setMeta(selector, attr, value) {
      var el = document.querySelector(selector);
      if (el && value) el.setAttribute(attr, value);
    }
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:image"]', 'content', img);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[name="twitter:image"]', 'content', img);
  }

  // ── setLegacyBanner ──────────────────────────────────────────────────────────

  function setLegacyBanner(post) {
    var el = document.getElementById('legacyNotice');
    if (!el) return;
    if (isLegacyExamplePost(post)) {
      el.innerHTML = '<div class="kc-legacy-banner"><span class="kc-legacy-banner__icon"><i class="fas fa-flask"></i></span><div><strong>Publicação de exemplo</strong>Este é um post fictício criado para demonstração da plataforma. Não representa um anúncio real.</div></div>';
      el.style.display = '';
    } else {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }

  // ── setDescription (versão canônica — v2 sobrepõe v1) ───────────────────────

  function setDescription(post) {
    var rawDesc = post.descricao || post.description || '';
    var renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline : esc;
    var descHtml = renderMd(rawDesc);
    var html = '';
    if (descHtml) {
      html += '<h3><i class="fas fa-align-left"></i> Descrição</h3><div class="kc-description-content">' + descHtml + '</div>';
    }
    setHTML('postDescription', html);
  }

  // ── addSpec / addSpecHtml (versão canônica — v2) ─────────────────────────────

  function addSpec(grid, iconClass, label, value) {
    var item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = '<i class="' + esc(iconClass) + '"></i><div class="kc-spec-item__body"><strong>' + esc(label) + '</strong><span>' + esc(value) + '</span></div>';
    grid.appendChild(item);
  }

  function addSpecHtml(grid, iconClass, label, html) {
    var item = document.createElement('div');
    item.className = 'kc-spec-item';
    item.innerHTML = '<i class="' + esc(iconClass) + '"></i><div class="kc-spec-item__body"><strong>' + esc(label) + '</strong><div class="kc-spec-item__html">' + (html || '') + '</div></div>';
    grid.appendChild(item);
  }

  // ── setSpecs (versão canônica — v2) ──────────────────────────────────────────

  function setSpecs(post) {
    var block = document.getElementById('specsBlock');
    var grid = document.getElementById('specsGrid');
    if (!block || !grid) return;
    grid.innerHTML = '';
    var metadata = (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    var pairs = [];
    var links = [];
    var tagsHtml = buildTagsSpecHtml(post);
    if (tagsHtml) addSpecHtml(grid, 'fas fa-hashtag', 'Tags', tagsHtml);
    if (post.modulo) pairs.push(['fas fa-layer-group', 'Módulo', moduleLabel(post.modulo)]);
    if ((post.categoriaLabel || post.categoria) && String(post.categoriaKey || post.categoria || '').toLowerCase().trim() !== String(post.modulo || '').toLowerCase().trim()) {
      pairs.push(['fas fa-tag', 'Categoria', post.categoriaLabel || post.categoria]);
    }
    if (post.subcategoriaLabel || post.subcategoria) pairs.push(['fas fa-hashtag', 'Subcategoria', post.subcategoriaLabel || post.subcategoria]);
    var local = post.location || metadata.location || metadata.local || '';
    if (local) pairs.push(['fas fa-map-marker-alt', 'Local', local.replace(/^\*\*\s*/, '').replace(/\*\*$/, '').trim() || local]);
    var dataEvento = metadata.data_evento || metadata.event_date || metadata.eventDate || '';
    if (dataEvento) pairs.push(['fas fa-calendar-day', 'Data do evento', formatDateForDisplay(dataEvento)]);
    var deadline = getDeclaredDeadline(post);
    if (deadline) pairs.push(['fas fa-calendar-check', 'Prazo', formatDateForDisplay(deadline)]);
    var sourceAvailability = !deadline && getSourceAvailability(post);
    if (sourceAvailability) {
      pairs.push(['fas fa-calendar-check', 'Prazo', 'Sem prazo final informado']);
      pairs.push(['fas fa-clock', 'Disponibilidade', 'Conferida em ' + formatDateForDisplay(sourceAvailability.checkedAt)
        + (sourceAvailability.needsCheck ? ' — nova conferência necessária' : ' — sujeita a vagas e às regras do curso')]);
    }
    var modalidade = metadata.modalidadeTrabalho || metadata.modalidade || metadata.workModeLabel || '';
    if (modalidade) pairs.push(['fas fa-laptop-house', 'Modalidade', modalidade]);
    var contato = metadata.contato || '';
    if (contato) pairs.push(['fas fa-envelope', 'Contato', contato]);
    var fonte = metadata.source_url || metadata.sourceUrl || '';
    if (fonte) links.push(['fas fa-external-link-alt', 'Fonte oficial', fonte]);
    var linkPrincipal = metadata.link || metadata.cta_url || metadata.inscricao_url || metadata.registration_url || metadata.source_url || '';
    if (linkPrincipal && linkPrincipal !== fonte) links.push(['fas fa-link', 'Link principal', linkPrincipal]);
    if (typeof post.preco === 'number' && post.preco > 0 && metadata.gratuito !== true) {
      pairs.push(['fas fa-money-bill-wave', 'Preço', formatCurrency(post.preco)]);
    } else if (metadata.gratuito === true) {
      pairs.push(['fas fa-money-bill-wave', 'Preço', 'Gratuito']);
    }
    if (post.verificado != null) pairs.push(['fas fa-check-circle', 'Verificação', post.verificado ? 'Sim' : 'Não']);
    if (post.condicao) pairs.push(['fas fa-star', 'Condição', post.condicao]);

    // Renderiza pairs (texto simples)
    pairs.forEach(function (pair) { addSpec(grid, pair[0], pair[1], pair[2]); });
    // Renderiza links como <a> clicável
    links.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'kc-spec-item kc-spec-item--link';
      var safeUrl = esc(entry[2]);
      var linkLabel = esc(formatLinkLabel(entry[2]));
      item.innerHTML = '<i class="' + esc(entry[0]) + '"></i><div class="kc-spec-item__body"><strong>' + esc(entry[1]) + '</strong><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" title="' + safeUrl + '">' + linkLabel + '</a></div>';
      grid.appendChild(item);
    });

    if (!pairs.length && !links.length && !tagsHtml) { block.style.display = 'none'; return; }
    block.style.display = 'block';
  }

  // ── Namespace público ─────────────────────────────────────────────────────────

  window._KCProduct.render = Object.freeze({
    esc:                        esc,
    setText:                    setText,
    setHTML:                    setHTML,
    show:                       show,
    hide:                       hide,
    moduleLabel:                moduleLabel,
    formatCurrency:             formatCurrency,
    getPostAuthorId:            getPostAuthorId,
    isLegacyExamplePost:        isLegacyExamplePost,
    isLegacyExampleProfile:     isLegacyExampleProfile,
    buildLegacyExampleBadgeHtml: buildLegacyExampleBadgeHtml,
    syncLegacyExampleMarker:    syncLegacyExampleMarker,
    showNotFound:               showNotFound,
    setBreadcrumb:              setBreadcrumb,
    setBadges:                  setBadges,
    setGallery:                 setGallery,
    setPrice:                   setPrice,
    buildTagEntries:            buildTagEntries,
    buildTagsSpecHtml:          buildTagsSpecHtml,
    setOpenGraphTags:           setOpenGraphTags,
    setLegacyBanner:            setLegacyBanner,
    setDescription:             setDescription,
    addSpec:                    addSpec,
    addSpecHtml:                addSpecHtml,
    setSpecs:                   setSpecs,
  });

})();
