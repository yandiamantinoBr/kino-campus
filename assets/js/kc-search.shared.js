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
    jbl: ['fone jbl', 'headphone jbl', 'audio jbl']
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

    out.sort(function (left, right) {
      var scoreDiff = Number(right.relevanceScore || 0) - Number(left.relevanceScore || 0);
      if (scoreDiff !== 0) return scoreDiff;

      var dateDiff = compareDateDesc(
        left && (left.created_at || left.createdAt || left.timestamp || left.criadoEm),
        right && (right.created_at || right.createdAt || right.timestamp || right.criadoEm)
      );
      if (dateDiff !== 0) return dateDiff;

      return compareIdDesc(left && (left.id || left.uuid), right && (right.id || right.uuid));
    });

    return out.slice(0, limit);
  }

  return {
    SYNONYMS: SYNONYMS,
    normalizeText: normalizeText,
    tokenizeQuery: tokenizeQuery,
    expandSynonyms: expandSynonyms,
    expandQueryTerms: expandQueryTerms,
    matchesExpandedTerms: matchesExpandedTerms,
    scorePost: scorePost,
    searchCollection: searchCollection
  };
}));
