/*
  KinoCampus - kc-search.shared.js
  Pure search helpers shared by browser code and Node tests (UMD).
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCSearchShared = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SYNONYMS = {
    notebook: ['laptop', 'computador portatil', 'note', 'computador', 'pc'],
    celular: ['smartphone', 'telefone', 'iphone', 'android', 'mobile', 'fone'],
    livro: ['livros', 'apostila', 'material didatico', 'book'],
    roupa: ['roupas', 'vestuario', 'vestimenta', 'blusa', 'camisa', 'calca'],
    cama: ['colchao', 'box', 'movel quarto', 'cama box'],
    fone: ['headphone', 'fone de ouvido', 'earphone', 'airpod', 'fones', 'audio'],
    bicicleta: ['bike', 'bici', 'mountain bike'],
    carona: ['transporte', 'viagem', 'ida', 'volta', 'caronas'],
    estagio: ['trainee', 'jovem aprendiz'],
    emprego: ['vaga', 'trabalho', 'job', 'oportunidade'],
    calculo: ['matematica', 'exatas'],
    iphone: ['apple', 'ios', 'celular apple'],
    dell: ['notebook dell', 'laptop dell'],
    jbl: ['fone jbl', 'headphone jbl', 'audio jbl'],
    // Eventos / acadêmico (UFG/Goiânia)
    conpeex: ['congresso', 'pesquisa', 'extensao', 'ensino', 'evento'],
    sbpc: ['ciencia', 'congresso', 'pesquisa', 'evento'],
    congresso: ['conpeex', 'simposio', 'seminario', 'jornada', 'evento'],
    evento: ['palestra', 'workshop', 'feira', 'semana', 'festival', 'minicurso'],
    palestra: ['evento', 'seminario', 'workshop'],
    hackathon: ['hacka', 'maratona', 'programacao', 'evento'],
    // Oportunidades
    vaga: ['emprego', 'oportunidade', 'estagio', 'trabalho'],
    bolsa: ['bolsista', 'monitoria', 'auxilio', 'iniciacao cientifica'],
    monitoria: ['tutoria', 'bolsa', 'estagio'],
    // Moradia
    quarto: ['republica', 'moradia', 'kitnet', 'aluguel'],
    moradia: ['republica', 'quarto', 'aluguel', 'kitnet', 'apartamento'],
    aluguel: ['moradia', 'kitnet', 'republica', 'quarto'],
    republica: ['moradia', 'quarto', 'kitnet'],
    // Compra e venda / livros
    tablet: ['ipad', 'celular', 'galaxy tab'],
    apostila: ['livro', 'material didatico', 'resumo']
  };

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function normalizeArray(values) {
    if (!Array.isArray(values)) return [];
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var normalized = normalizeText(values[i]);
      if (normalized) out.push(normalized);
    }
    return out;
  }

  function uniqueTerms(values) {
    var input = Array.isArray(values) ? values : [];
    var out = [];
    for (var i = 0; i < input.length; i += 1) {
      var normalized = normalizeText(input[i]);
      if (!normalized) continue;
      if (out.indexOf(normalized) === -1) out.push(normalized);
    }
    return out;
  }

  function tokenizeQuery(query) {
    return normalizeText(query)
      .split(/\s+/)
      .filter(function (term) { return term.length > 1; });
  }

  function getMetadata(post) {
    if (!post || typeof post !== 'object') return {};
    if (post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) return post.metadata;
    if (post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta)) return post.meta;
    if (post._meta && typeof post._meta === 'object' && !Array.isArray(post._meta)) return post._meta;
    return {};
  }

  function getFirstText(post, keys) {
    var source = (post && typeof post === 'object') ? post : {};
    var list = Array.isArray(keys) ? keys : [keys];
    for (var i = 0; i < list.length; i += 1) {
      var key = list[i];
      if (!key) continue;
      var value = source[key];
      if (value != null && String(value).trim()) return String(value);
    }
    return '';
  }

  function getSubcategory(post) {
    var metadata = getMetadata(post);
    return getFirstText({
      postSubcategory: getFirstText(post, ['subcategoria', 'subcategory', 'subcategoriaLabel', 'subcategoryLabel', 'subcategoriaKey', 'subcategoryKey']),
      metadataSubcategory: getFirstText(metadata, ['subcategoria', 'subcategory', 'subcategoriaLabel', 'subcategoryLabel', 'subcategoriaKey', 'subcategoryKey'])
    }, ['postSubcategory', 'metadataSubcategory']);
  }

  function getTags(post) {
    var metadata = getMetadata(post);
    var raw = []
      .concat(Array.isArray(post && post.tags) ? post.tags : [])
      .concat(Array.isArray(post && post.tagKeys) ? post.tagKeys : [])
      .concat(Array.isArray(metadata.tags) ? metadata.tags : [])
      .concat(Array.isArray(metadata.tagKeys) ? metadata.tagKeys : []);
    return uniqueTerms(raw);
  }

  function expandSynonyms(term) {
    var normalized = normalizeText(term);
    if (!normalized) return [];

    var expanded = [normalized];
    var keys = Object.keys(SYNONYMS);

    for (var i = 0; i < keys.length; i += 1) {
      var key = normalizeText(keys[i]);
      var synonyms = normalizeArray(SYNONYMS[keys[i]]);
      if (normalized === key || normalized.indexOf(key) !== -1) {
        expanded = expanded.concat([key]).concat(synonyms);
        continue;
      }
      for (var j = 0; j < synonyms.length; j += 1) {
        if (normalized === synonyms[j] || normalized.indexOf(synonyms[j]) !== -1) {
          expanded = expanded.concat([key]).concat(synonyms);
          break;
        }
      }
    }

    return uniqueTerms(expanded);
  }

  function expandQueryTerms(query) {
    var tokens = tokenizeQuery(query);
    if (!tokens.length) return [];

    var expanded = [];
    for (var i = 0; i < tokens.length; i += 1) {
      expanded = expanded.concat(expandSynonyms(tokens[i]));
    }
    return uniqueTerms(expanded);
  }

  function matchesExpandedTerms(text, expandedTerms) {
    var normalizedText = normalizeText(text);
    if (!normalizedText || !expandedTerms || !expandedTerms.length) return false;

    for (var i = 0; i < expandedTerms.length; i += 1) {
      if (normalizedText.indexOf(expandedTerms[i]) !== -1) return true;
    }
    return false;
  }

  function scoreTextMatches(text, terms, weight) {
    var normalized = normalizeText(text);
    if (!normalized) return 0;

    var score = 0;
    for (var i = 0; i < terms.length; i += 1) {
      if (normalized.indexOf(terms[i]) !== -1) score += weight;
    }
    return score;
  }

  function scoreTags(tags, terms, weight) {
    var normalizedTags = normalizeArray(tags);
    if (!normalizedTags.length) return 0;

    var score = 0;
    for (var i = 0; i < terms.length; i += 1) {
      for (var j = 0; j < normalizedTags.length; j += 1) {
        if (normalizedTags[j].indexOf(terms[i]) !== -1 || terms[i].indexOf(normalizedTags[j]) !== -1) {
          score += weight;
          break;
        }
      }
    }
    return score;
  }

  // ── Similaridade fuzzy (tolerância a erros de digitação / palavras parciais) ──
  // Limiar calibrado: typos reais ficam ~0.70–0.90; palavras distintas ~0.43–0.55.
  var FUZZY_THRESHOLD = 0.6;

  function levenshtein(a, b) {
    a = String(a == null ? '' : a);
    b = String(b == null ? '' : b);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [];
    var j;
    for (j = 0; j <= b.length; j += 1) prev[j] = j;
    for (var i = 1; i <= a.length; i += 1) {
      var cur = [i];
      for (var k = 1; k <= b.length; k += 1) {
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function trigrams(value) {
    var s = normalizeText(value);
    if (!s) return [];
    var padded = '  ' + s + ' ';
    var out = [];
    for (var i = 0; i < padded.length - 2; i += 1) out.push(padded.substr(i, 3));
    return out;
  }

  // Coeficiente de Dice sobre conjuntos de 3-gramas (estilo pg_trgm). 0..1.
  function trigramSimilarity(a, b) {
    var ta = trigrams(a);
    var tb = trigrams(b);
    if (!ta.length || !tb.length) return 0;
    var setA = {};
    var setB = {};
    var i;
    for (i = 0; i < ta.length; i += 1) setA[ta[i]] = true;
    for (i = 0; i < tb.length; i += 1) setB[tb[i]] = true;
    var keysA = Object.keys(setA);
    var keysB = Object.keys(setB);
    var common = 0;
    for (i = 0; i < keysA.length; i += 1) if (setB[keysA[i]]) common += 1;
    return (2 * common) / (keysA.length + keysB.length);
  }

  // Melhor similaridade do token contra cada palavra do texto (combina trigrama + edição).
  function fuzzyBestSimilarity(token, text) {
    var t = normalizeText(token);
    if (t.length < 3) return 0;
    var words = normalizeText(text).split(/\s+/);
    var best = 0;
    for (var i = 0; i < words.length; i += 1) {
      var w = words[i];
      if (w.length < 3) continue;
      // Trigrama (Dice) é mais discriminante que distância de edição para evitar
      // falsos positivos (ex.: quarto≈quadro, matematica≈informatica).
      var sim = trigramSimilarity(t, w);
      if (sim > best) best = sim;
      if (best >= 0.999) break;
    }
    return best;
  }

  // Pontua matches fuzzy (apenas para termos que NÃO casaram exatamente — evita dupla contagem).
  function scoreFuzzyField(text, terms, weight) {
    var normalized = normalizeText(text);
    if (!normalized) return 0;
    var score = 0;
    for (var i = 0; i < terms.length; i += 1) {
      var term = terms[i];
      if (term.length < 3 || normalized.indexOf(term) !== -1) continue;
      var sim = fuzzyBestSimilarity(term, normalized);
      if (sim >= FUZZY_THRESHOLD) score += sim * weight;
    }
    return score;
  }

  function scoreFuzzyTags(tags, terms, weight) {
    var normalizedTags = normalizeArray(tags);
    if (!normalizedTags.length) return 0;
    var score = 0;
    for (var i = 0; i < terms.length; i += 1) {
      var term = terms[i];
      if (term.length < 3) continue;
      var best = 0;
      var exact = false;
      for (var j = 0; j < normalizedTags.length; j += 1) {
        if (normalizedTags[j].indexOf(term) !== -1 || term.indexOf(normalizedTags[j]) !== -1) { exact = true; break; }
        var sim = trigramSimilarity(term, normalizedTags[j]);
        if (sim > best) best = sim;
      }
      if (!exact && best >= FUZZY_THRESHOLD) score += best * weight;
    }
    return score;
  }

  function matchesQueryText(text, query, options) {
    var normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return true;

    var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    var expandedTerms = Array.isArray(opts.expandedTerms) && opts.expandedTerms.length
      ? uniqueTerms(opts.expandedTerms)
      : expandQueryTerms(normalizedQuery);
    if (!expandedTerms.length) return false;

    if (matchesExpandedTerms(text, expandedTerms)) return true;

    var threshold = Number.isFinite(Number(opts.threshold)) ? Number(opts.threshold) : FUZZY_THRESHOLD;
    var normalized = normalizeText(text);
    if (!normalized) return false;

    for (var i = 0; i < expandedTerms.length; i += 1) {
      var term = expandedTerms[i];
      if (term.length < 3 || normalized.indexOf(term) !== -1) continue;
      if (fuzzyBestSimilarity(term, normalized) >= threshold) return true;
    }
    return false;
  }

  function scorePost(post, params) {
    var p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var q = String(p.q || p.query || '').trim();
    if (!q) return 0;

    var normalizedQuery = normalizeText(q);
    var expandedTerms = Array.isArray(p.expandedTerms) && p.expandedTerms.length
      ? uniqueTerms(p.expandedTerms)
      : expandQueryTerms(q);
    if (!expandedTerms.length) return 0;

    var title = getFirstText(post, ['titulo', 'title']);
    var description = getFirstText(post, ['descricao', 'description']);
    var category = getFirstText(post, ['categoria', 'category', 'categoriaLabel', 'categoryLabel', 'categoriaKey', 'categoryKey']);
    var subcategory = getSubcategory(post);
    var tags = getTags(post);

    var normalizedTitle = normalizeText(title);
    var normalizedDescription = normalizeText(description);
    var normalizedCategory = normalizeText(category);
    var normalizedSubcategory = normalizeText(subcategory);

    var score = 0;

    if (normalizedTitle === normalizedQuery) score += 4.5;
    if (normalizedTitle && normalizedTitle.indexOf(normalizedQuery) !== -1) score += 2.5;
    if (normalizedDescription && normalizedDescription.indexOf(normalizedQuery) !== -1) score += 1.2;
    if (normalizedCategory && normalizedCategory.indexOf(normalizedQuery) !== -1) score += 1.5;
    if (normalizedSubcategory && normalizedSubcategory.indexOf(normalizedQuery) !== -1) score += 1.5;
    if (scoreTags(tags, [normalizedQuery], 2.2) > 0) score += 2.2;

    score += scoreTextMatches(title, expandedTerms, 3.4);
    score += scoreTags(tags, expandedTerms, 2.6);
    score += scoreTextMatches(description, expandedTerms, 1.3);
    score += scoreTextMatches(category, expandedTerms, 1.1);
    score += scoreTextMatches(subcategory, expandedTerms, 1.1);

    // Passe fuzzy nos campos-chave (typos / palavras incompletas) — peso < exato.
    score += scoreFuzzyField(title, expandedTerms, 2.2);
    score += scoreFuzzyField(category, expandedTerms, 1.0);
    score += scoreFuzzyField(subcategory, expandedTerms, 1.0);
    score += scoreFuzzyTags(tags, expandedTerms, 1.6);

    return score;
  }

  function normalizeFilterValue(value) {
    return normalizeText(value);
  }

  function compareDateDesc(left, right) {
    var leftTime = Date.parse(String(left || ''));
    var rightTime = Date.parse(String(right || ''));
    var safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    var safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRight - safeLeft;
  }

  function compareIdDesc(left, right) {
    var a = String(left || '');
    var b = String(right || '');
    if (a === b) return 0;
    return a < b ? 1 : -1;
  }

  function getMetadata(post) {
    return (post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata))
      ? post.metadata
      : {};
  }

  function getPostStatus(post) {
    var meta = getMetadata(post);
    return normalizeText(getFirstText(post, ['status', 'situacao']) || meta.status || '');
  }

  function isPostHiddenFromPublic(post) {
    var status = getPostStatus(post);
    return ['hidden', 'deleted', 'archived', 'pending', 'rejected'].indexOf(status) !== -1;
  }

  function parsePostDate(value, endOfDay) {
    if (value == null || value === '') return 0;
    var text = String(value).trim();
    if (!text) return 0;
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
      text += 'T23:59:59';
    }
    var time = Date.parse(text);
    return Number.isFinite(time) ? time : 0;
  }

  function getPostTimestamp(post) {
    if (!post) return 0;
    var meta = getMetadata(post);
    return parsePostDate(
      post.bumped_at || post.bumpedAt || post.updated_at || post.updatedAt ||
      post.created_at || post.createdAt || post.timestamp || post.criadoEm ||
      meta.bumped_at || meta.updated_at || meta.created_at,
      false
    );
  }

  function getPostEndTime(post) {
    if (!post) return 0;
    var meta = getMetadata(post);
    return parsePostDate(
      post.expires_at || post.expiresAt || post.date_end_at || post.dateEndAt ||
      post.deadline_date || post.deadlineDate || post.event_date || post.eventDate ||
      meta.expires_at || meta.expiresAt || meta.date_end_at || meta.dateEndAt ||
      meta.deadline_date || meta.deadlineDate || meta.event_date_detected ||
      meta.event_date || meta.data_evento || meta.data_fim || meta.end_at,
      true
    );
  }

  function isPostClosedOrEnded(post, nowValue) {
    var status = getPostStatus(post);
    if (['closed', 'expired', 'deleted', 'hidden', 'archived'].indexOf(status) !== -1) return true;
    var endTime = getPostEndTime(post);
    if (!endTime) return false;
    var nowTime = nowValue != null ? parsePostDate(nowValue, false) : Date.now();
    return endTime < nowTime;
  }

  function getCommentsCount(post) {
    if (!post) return 0;
    if (Number.isFinite(Number(post.comentarios))) return Number(post.comentarios);
    if (Number.isFinite(Number(post.comment_count))) return Number(post.comment_count);
    if (Number.isFinite(Number(post.commentCount))) return Number(post.commentCount);
    if (Array.isArray(post.comments) && post.comments[0] && Number.isFinite(Number(post.comments[0].count))) {
      return Number(post.comments[0].count);
    }
    return 0;
  }

  function getPostEngagement(post) {
    if (!post) return 0;
    var meta = getMetadata(post);
    var votes = Number(post.votos || post.votes || post.vote_count || post.voteCount || 0);
    var views = Number(post.view_count || post.viewCount || meta.view_count || 0);
    var shares = Number(post.share_count || post.shareCount || meta.share_count || 0);
    var clicks = Number(post.coupon_clicks || post.couponClicks || meta.coupon_clicks || 0);
    var saves = Number(post.saved_count || post.savedCount || meta.saved_count || 0);
    var highlight = Number(post.highlight_score || post.highlightScore || 0);
    var comments = getCommentsCount(post);
    return (
      (Number.isFinite(votes) ? votes * 3 : 0) +
      (Number.isFinite(comments) ? comments * 2 : 0) +
      (Number.isFinite(shares) ? shares * 2 : 0) +
      (Number.isFinite(saves) ? saves * 2 : 0) +
      (Number.isFinite(clicks) ? clicks * 1.5 : 0) +
      (Number.isFinite(highlight) ? highlight * 2 : 0) +
      (Number.isFinite(views) ? views * 0.08 : 0)
    );
  }

  function normalizeSortBy(value) {
    var raw = normalizeText(value || 'relevance');
    if (['recent', 'recentes', 'mais-recentes', 'mais recentes', 'data'].indexOf(raw) !== -1) return 'recent';
    if (['engagement', 'engajamento', 'popular', 'populares', 'mais acessadas'].indexOf(raw) !== -1) return 'engagement';
    return 'relevance';
  }

  function sortSearchResults(results, params) {
    var p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var mode = normalizeSortBy(p.sortBy || p.sort_by || p.sort);
    var nowValue = p.now || p.nowValue || null;
    var list = Array.isArray(results) ? results.slice() : [];

    list.sort(function (left, right) {
      var leftEnded = isPostClosedOrEnded(left, nowValue) ? 1 : 0;
      var rightEnded = isPostClosedOrEnded(right, nowValue) ? 1 : 0;
      var leftScore = Number(left && left.relevanceScore || 0);
      var rightScore = Number(right && right.relevanceScore || 0);
      var leftEngagement = getPostEngagement(left);
      var rightEngagement = getPostEngagement(right);
      var dateDiff = getPostTimestamp(right) - getPostTimestamp(left);

      if (mode === 'recent') {
        if (dateDiff !== 0) return dateDiff;
        if (rightScore !== leftScore) return rightScore - leftScore;
      } else if (mode === 'engagement') {
        if (rightEngagement !== leftEngagement) return rightEngagement - leftEngagement;
        if (rightScore !== leftScore) return rightScore - leftScore;
        if (dateDiff !== 0) return dateDiff;
      } else {
        if (rightScore !== leftScore) return rightScore - leftScore;
        if (leftEnded !== rightEnded) return leftEnded - rightEnded;
        if (dateDiff !== 0) return dateDiff;
      }

      return compareIdDesc(left && (left.id || left.uuid), right && (right.id || right.uuid));
    });

    return list;
  }

  function matchesSearchFilters(post, params) {
    var p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var rawModule = p.module != null ? p.module : (p.modulo != null ? p.modulo : null);
    var moduleFilters = Array.isArray(rawModule)
      ? rawModule.map(normalizeFilterValue).filter(Boolean)
      : [normalizeFilterValue(rawModule)].filter(Boolean);
    var categoryFilter = normalizeFilterValue(p.category != null ? p.category : p.categoria);
    var subcategoryFilter = normalizeFilterValue(p.subcategory != null ? p.subcategory : p.subcategoria);

    var postModule = normalizeFilterValue(getFirstText(post, ['modulo', 'module']));
    var postCategory = normalizeFilterValue(getFirstText(post, ['categoria', 'category', 'categoriaLabel', 'categoryLabel', 'categoriaKey', 'categoryKey']));
    var postSubcategory = normalizeFilterValue(getSubcategory(post));

    if (moduleFilters.length && moduleFilters.indexOf(postModule) === -1) return false;
    if (categoryFilter && postCategory !== categoryFilter) return false;
    if (subcategoryFilter && postSubcategory !== subcategoryFilter) return false;
    if (p.publicOnly === true && isPostHiddenFromPublic(post)) return false;
    if ((p.hideClosed === true || p.hideEnded === true) && isPostClosedOrEnded(post, p.now || p.nowValue)) return false;
    return true;
  }

  function searchCollection(posts, params) {
    var p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var q = String(p.q || p.query || '').trim();
    if (!q) return [];

    var limitRaw = p.limit != null ? parseInt(String(p.limit), 10) : 50;
    var limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
    var minScore = Number.isFinite(Number(p.minScore)) ? Number(p.minScore) : 0.2;
    var expandedTerms = expandQueryTerms(q);
    var list = Array.isArray(posts) ? posts : [];
    var out = [];

    for (var i = 0; i < list.length; i += 1) {
      var post = list[i];
      if (!post || !matchesSearchFilters(post, p)) continue;

      var score = scorePost(post, { q: q, expandedTerms: expandedTerms });
      if (score >= minScore) {
        out.push(Object.assign({}, post, { relevanceScore: score }));
      }
    }

    return sortSearchResults(out, p).slice(0, limit);
  }

  return {
    SYNONYMS: SYNONYMS,
    normalizeText: normalizeText,
    tokenizeQuery: tokenizeQuery,
    expandSynonyms: expandSynonyms,
    expandQueryTerms: expandQueryTerms,
    matchesExpandedTerms: matchesExpandedTerms,
    levenshtein: levenshtein,
    trigramSimilarity: trigramSimilarity,
    fuzzyBestSimilarity: fuzzyBestSimilarity,
    matchesQueryText: matchesQueryText,
    scorePost: scorePost,
    getPostStatus: getPostStatus,
    getPostTimestamp: getPostTimestamp,
    getPostEndTime: getPostEndTime,
    getPostEngagement: getPostEngagement,
    isPostClosedOrEnded: isPostClosedOrEnded,
    isPostHiddenFromPublic: isPostHiddenFromPublic,
    sortSearchResults: sortSearchResults,
    searchCollection: searchCollection
  };
}));
