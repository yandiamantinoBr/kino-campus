(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.KCHomeCategoryUtils = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    affinity: 'kc_home_category_affinity_v1',
    queue: 'kc_home_category_queue_v1',
    session: 'kc_home_category_session_v1',
    merged: 'kc_home_category_merged_v1'
  });

  const EVENT_WEIGHTS = Object.freeze({
    tab_click: 3,
    category_click: 4,
    post_open: 6,
    search: 5,
    vote: 8,
    comment: 9,
    favorite: 10,
    later: 7,
    highlight: 11
  });

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeSlug(value) {
    return normalizeText(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function singularize(value) {
    const normalized = normalizeSlug(value);
    if (!normalized) return '';

    const special = {
      academicos: 'academico',
      palestras: 'palestra',
      congressos: 'congresso',
      cursos: 'curso',
      culturais: 'cultural',
      esportivos: 'esportivo',
      editais: 'edital',
      concursos: 'concurso',
      estagios: 'estagio',
      empregos: 'emprego',
      bolsas: 'bolsa',
      'cursos-capacitacoes': 'curso-capacitacao',
      republicas: 'republica',
      quartos: 'quarto',
      apartamentos: 'apartamento',
      casas: 'casa',
      eletronicos: 'eletronicos',
      moveis: 'moveis',
      livros: 'livros',
      eventos: 'eventos'
    };
    if (special[normalized]) return special[normalized];
    if (normalized.length > 4 && normalized.endsWith('s')) return normalized.slice(0, -1);
    return normalized;
  }

  function categoryId(moduleKey, categoryKey) {
    return `${normalizeSlug(moduleKey)}:${normalizeSlug(categoryKey)}`;
  }

  function createEntry(moduleKey, categoryKey, label, icon, href, aliases) {
    const normalizedModule = normalizeSlug(moduleKey);
    const normalizedCategory = singularize(categoryKey);
    const id = categoryId(normalizedModule, normalizedCategory);
    const allAliases = Array.from(new Set(
      [label, categoryKey]
        .concat(Array.isArray(aliases) ? aliases : [])
        .map((item) => singularize(item))
        .filter(Boolean)
    ));

    return Object.freeze({
      id,
      moduleKey: normalizedModule,
      categoryKey: normalizedCategory,
      label: String(label || '').trim(),
      icon: String(icon || 'fas fa-layer-group').trim(),
      href: String(href || 'index.html').trim(),
      aliases: Object.freeze(allAliases)
    });
  }

  const CATEGORY_CATALOG = Object.freeze([
    createEntry('compra-venda', 'livros', 'Livros e Materiais', 'fas fa-book', 'compra-venda-feed.html?filter=livros', ['livro', 'apostila', 'apostilas', 'materiais', 'material']),
    createEntry('compra-venda', 'eletronicos', 'Eletrônicos', 'fas fa-laptop', 'compra-venda-feed.html?filter=eletronicos', ['eletronico', 'celular', 'notebook', 'tablet', 'fone']),
    createEntry('compra-venda', 'moveis', 'Móveis', 'fas fa-couch', 'compra-venda-feed.html?filter=moveis', ['movel', 'cadeira', 'mesa', 'armario', 'guarda-roupa']),
    createEntry('compra-venda', 'vestuario', 'Vestuário', 'fas fa-shirt', 'compra-venda-feed.html?filter=vestuario', ['roupa', 'roupas', 'camisa', 'casaco', 'calca', 'calça']),
    createEntry('compra-venda', 'outros', 'Outros itens', 'fas fa-box-open', 'compra-venda-feed.html?filter=outros', ['outro', 'diversos']),
    createEntry('eventos', 'sustentabilidade', 'Sustentabilidade', 'fas fa-leaf', 'eventos.html#sustentabilidade', ['sustentavel', 'sustentável', 'ambiental', 'eco']),
    createEntry('eventos', 'academico', 'Acadêmicos', 'fas fa-graduation-cap', 'eventos.html#academicos', ['academicos', 'acadêmicos', 'semana academica', 'semana acadêmica']),
    createEntry('eventos', 'palestra', 'Palestras', 'fas fa-microphone-lines', 'eventos.html#palestras', ['palestras', 'mesa redonda', 'debate']),
    createEntry('eventos', 'congresso', 'Congressos', 'fas fa-users-rectangle', 'eventos.html#congressos', ['congressos', 'seminario', 'seminário', 'simposio', 'simpósio', 'jornada']),
    createEntry('eventos', 'curso', 'Cursos', 'fas fa-book-open-reader', 'eventos.html#cursos', ['cursos', 'minicurso', 'capacitacao', 'capacitação', 'formacao', 'formação']),
    createEntry('eventos', 'cultural', 'Culturais', 'fas fa-theater-masks', 'eventos.html#culturais', ['culturais', 'cultura', 'show', 'arte']),
    createEntry('eventos', 'esportivo', 'Esportivos', 'fas fa-running', 'eventos.html#esportivos', ['esportivos', 'esporte', 'corrida', 'torneio']),
    createEntry('eventos', 'workshop', 'Workshops', 'fas fa-chalkboard-teacher', 'eventos.html#workshops', ['workshops', 'oficina']),
    createEntry('eventos', 'tecnologia', 'Tecnologia', 'fas fa-laptop-code', 'eventos.html#tecnologia', ['hackathon', 'informatica', 'informática', 'computacao', 'computação']),
    createEntry('moradia', 'republica', 'Repúblicas', 'fas fa-users', 'moradia.html#republicas', ['republicas', 'república', 'repúblicas']),
    createEntry('moradia', 'quarto', 'Quartos', 'fas fa-bed', 'moradia.html#quartos', ['quartos', 'dividir-quarto']),
    createEntry('moradia', 'apartamento', 'Apartamentos', 'fas fa-building', 'moradia.html#apartamentos', ['apartamentos', 'apto']),
    createEntry('moradia', 'casa', 'Casas', 'fas fa-house', 'moradia.html#casas', ['casas']),
    createEntry('moradia', 'procurando', 'Procurando moradia', 'fas fa-magnifying-glass-location', 'moradia.html#procurando', ['procuro', 'procurar']),
    createEntry('oportunidades', 'edital', 'Editais e chamadas', 'fas fa-file-signature', 'oportunidades.html#editais', ['editais', 'edital', 'chamada publica', 'chamada pública']),
    createEntry('oportunidades', 'concurso', 'Concursos e seleções', 'fas fa-clipboard-check', 'oportunidades.html#concursos', ['concursos', 'concurso', 'selecao', 'seleção', 'processo seletivo']),
    createEntry('oportunidades', 'estagio', 'Estágios', 'fas fa-user-graduate', 'oportunidades.html#estagios', ['estagios', 'bolsa-estagio']),
    createEntry('oportunidades', 'emprego', 'Empregos', 'fas fa-briefcase', 'oportunidades.html#empregos', ['empregos', 'vaga', 'vagas', 'clt']),
    createEntry('oportunidades', 'bolsa', 'Bolsas', 'fas fa-award', 'oportunidades.html#bolsas', ['bolsas', 'auxilio', 'auxílio', 'fomento']),
    createEntry('oportunidades', 'pesquisa', 'Pesquisa', 'fas fa-flask', 'oportunidades.html#pesquisa', ['pibic', 'pivic', 'iniciacao-cientifica', 'iniciação científica']),
    createEntry('oportunidades', 'curso-capacitacao', 'Cursos e capacitações', 'fas fa-book-open-reader', 'oportunidades.html#cursos-capacitacoes', ['cursos', 'capacitacao', 'capacitação', 'qualificacao', 'qualificação']),
    createEntry('oportunidades', 'freelancer', 'Freelancer', 'fas fa-laptop-code', 'oportunidades.html#freelancer', ['freela', 'freelas']),
    createEntry('oportunidades', 'monitoria', 'Monitoria e aulas', 'fas fa-chalkboard-teacher', 'oportunidades.html#monitoria', ['monitorias', 'aulas', 'aula', 'reforco', 'reforço']),
    createEntry('oportunidades', 'mobilidade', 'Mobilidade', 'fas fa-plane-departure', 'oportunidades.html#mobilidade', ['intercambio', 'intercâmbio', 'internacional']),
    createEntry('oportunidades', 'voluntariado', 'Voluntariado', 'fas fa-hands-helping', 'oportunidades.html#voluntariado', ['voluntariados', 'ong', 'extensao', 'extensão']),
    createEntry('caronas', 'ofereco', 'Ofereço carona', 'fas fa-car-side', 'caronas-feed.html#ofereco', ['ofereço', 'ofereco carona']),
    createEntry('caronas', 'procuro', 'Procuro carona', 'fas fa-hand-paper', 'caronas-feed.html#procuro', ['procuro carona']),
    createEntry('caronas', 'campus', 'Rotas para campus', 'fas fa-university', 'caronas-feed.html#campus', ['samambaia', 'campus ii', 'colemar']),
    createEntry('caronas', 'centro', 'Rotas para o centro', 'fas fa-city', 'caronas-feed.html#centro', ['setor central', 'centro']),
    createEntry('achados-perdidos', 'perdido', 'Itens perdidos', 'fas fa-search', 'achados-perdidos.html#perdidos', ['perdidos', 'sumiu']),
    createEntry('achados-perdidos', 'encontrado', 'Itens encontrados', 'fas fa-hand-holding', 'achados-perdidos.html#encontrados', ['achado', 'encontrados']),
    createEntry('achados-perdidos', 'documentos', 'Documentos', 'fas fa-id-card', 'achados-perdidos.html#documentos', ['rg', 'cpf', 'cartao', 'cartão']),
    createEntry('achados-perdidos', 'eletronicos', 'Eletrônicos', 'fas fa-mobile-alt', 'achados-perdidos.html#eletronicos', ['celular', 'fone', 'notebook']),
    createEntry('achados-perdidos', 'outros', 'Outros objetos', 'fas fa-box', 'achados-perdidos.html#outros', ['chave', 'garrafa', 'mochila'])
  ]);

  const CATALOG_BY_ID = new Map(CATEGORY_CATALOG.map((item) => [item.id, item]));

  function getCatalog() {
    return CATEGORY_CATALOG.slice();
  }

  function getCategoryById(id) {
    return CATALOG_BY_ID.get(String(id || '').trim()) || null;
  }

  function findCategory(moduleKey, categoryKey) {
    const id = categoryId(moduleKey, singularize(categoryKey));
    return getCategoryById(id);
  }

  function scoreEntryMatch(entry, normalizedTerm) {
    if (!entry || !normalizedTerm) return 0;
    const aliases = entry.aliases || [];
    let score = 0;
    aliases.forEach((alias) => {
      if (!alias) return;
      if (alias === normalizedTerm) score = Math.max(score, 12);
      else if (alias.indexOf(normalizedTerm) !== -1) score = Math.max(score, 9);
      else if (normalizedTerm.indexOf(alias) !== -1) score = Math.max(score, 8);
    });
    return score;
  }

  function findCategoriesBySearchTerm(term, limit) {
    const normalizedTerm = singularize(term);
    if (!normalizedTerm) return [];

    return CATEGORY_CATALOG
      .map((entry) => ({ entry, score: scoreEntryMatch(entry, normalizedTerm) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.entry.label.localeCompare(right.entry.label, 'pt-BR');
      })
      .slice(0, Math.max(1, Number(limit) || 3))
      .map((item) => item.entry);
  }

  function resolveTextCandidates(post) {
    const source = (post && typeof post === 'object') ? post : {};
    const metadata = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata))
      ? source.metadata
      : {};
    const tags = []
      .concat(Array.isArray(source.tagKeys) ? source.tagKeys : [])
      .concat(Array.isArray(source.tags) ? source.tags : [])
      .concat(Array.isArray(metadata.tags) ? metadata.tags : []);

    return [
      source._kcTabCategoryKey,
      source.categoriaKey,
      source.categoryKey,
      source.categoria,
      source.category,
      source.subcategoriaKey,
      source.subcategoryKey,
      source.subcategoria,
      source.subcategory,
      source.areaKey,
      source.area,
      metadata.areaKey,
      metadata.area,
      metadata.subcategoryKey,
      metadata.subcategory,
      source.titulo,
      source.title,
      source.descricao,
      source.description
    ].concat(tags).filter(Boolean);
  }

  function resolveCategoriesFromPost(post) {
    const source = (post && typeof post === 'object') ? post : {};
    const moduleKey = normalizeSlug(source.modulo || source.module || '');
    const candidates = resolveTextCandidates(source);

    if (moduleKey) {
      for (let index = 0; index < candidates.length; index += 1) {
        const category = findCategory(moduleKey, candidates[index]);
        if (category) return [category];
      }
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const matches = findCategoriesBySearchTerm(candidates[index], 1);
      if (matches.length) return matches;
    }

    return [];
  }

  function inferModuleFromHref(href) {
    const clean = String(href || '').split('#')[0].split('?')[0].toLowerCase();
    if (clean.indexOf('compra-venda-feed') !== -1) return 'compra-venda';
    if (clean.indexOf('eventos') !== -1) return 'eventos';
    if (clean.indexOf('moradia') !== -1) return 'moradia';
    if (clean.indexOf('oportunidades') !== -1) return 'oportunidades';
    if (clean.indexOf('caronas-feed') !== -1) return 'caronas';
    if (clean.indexOf('achados-perdidos') !== -1) return 'achados-perdidos';
    return '';
  }

  function parseHrefValue(href, key) {
    const source = String(href || '').trim();
    if (!source) return '';

    try {
      const url = new URL(source, 'https://kino-campus.local/');
      const value = url.searchParams.get(key);
      if (value) return value;
      const hash = String(url.hash || '').replace(/^#/, '');
      return key === 'filter' ? hash : '';
    } catch (_) {
      const queryIndex = source.indexOf('?');
      if (queryIndex >= 0) {
        const query = source.slice(queryIndex + 1);
        const parts = query.split('&');
        for (let index = 0; index < parts.length; index += 1) {
          const tuple = parts[index].split('=');
          if (tuple[0] === key) return decodeURIComponent(tuple[1] || '');
        }
      }
      const hashIndex = source.indexOf('#');
      if (hashIndex >= 0 && key === 'filter') return source.slice(hashIndex + 1);
    }
    return '';
  }

  function resolveCategoriesFromLink(href, text) {
    const moduleKey = inferModuleFromHref(href);
    const filterValue = parseHrefValue(href, 'filter');
    const candidates = [filterValue, text, String(href || '').split('#')[1] || ''].filter(Boolean);

    if (moduleKey) {
      for (let index = 0; index < candidates.length; index += 1) {
        const category = findCategory(moduleKey, candidates[index]);
        if (category) return [category];
      }
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const matches = findCategoriesBySearchTerm(candidates[index], 1);
      if (matches.length) return matches;
    }

    return [];
  }

  function getEventWeight(eventType) {
    const normalized = normalizeSlug(eventType).replace(/-/g, '_');
    return EVENT_WEIGHTS[normalized] || 3;
  }

  function toAffinityId(moduleKey, categoryKey) {
    return categoryId(moduleKey, categoryKey);
  }

  function safeParseJSON(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function readStorageBag(storage, key, fallback) {
    if (!storage || typeof storage.getItem !== 'function') return fallback;
    return safeParseJSON(storage.getItem(key), fallback);
  }

  function writeStorageBag(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(key, JSON.stringify(value));
  }

  function ensureSessionId(storage, generator, nowFn) {
    const bag = storage || null;
    const makeId = typeof generator === 'function' ? generator : function () { return Math.random().toString(36).slice(2); };
    const getNow = typeof nowFn === 'function' ? nowFn : Date.now;
    let current = '';
    try {
      current = bag && bag.getItem ? String(bag.getItem(STORAGE_KEYS.session) || '') : '';
    } catch (_) {
      current = '';
    }
    if (current) return current;
    const next = `${makeId()}${Number(getNow() || Date.now()).toString(36)}`;
    try {
      if (bag && bag.setItem) bag.setItem(STORAGE_KEYS.session, next);
    } catch (_) { }
    return next;
  }

  function readLocalAffinity(storage) {
    const bag = readStorageBag(storage, STORAGE_KEYS.affinity, {});
    return (bag && typeof bag === 'object' && !Array.isArray(bag)) ? bag : {};
  }

  function writeLocalAffinity(storage, affinityMap) {
    writeStorageBag(storage, STORAGE_KEYS.affinity, affinityMap || {});
  }

  function localAffinityMapToRows(affinityMap) {
    const source = (affinityMap && typeof affinityMap === 'object' && !Array.isArray(affinityMap)) ? affinityMap : {};
    return Object.keys(source).map((id) => {
      const row = source[id] || {};
      return {
        id,
        module_key: row.module_key || row.moduleKey || '',
        category_key: row.category_key || row.categoryKey || '',
        score: Number(row.score) || 0,
        interactions_count: Number(row.interactions_count || row.interactionsCount) || 0,
        updated_at: row.updated_at || row.updatedAt || null
      };
    }).filter((row) => row.id && row.module_key && row.category_key);
  }

  function recordLocalAffinity(storage, entries, now) {
    const affinityMap = readLocalAffinity(storage);
    const rows = Array.isArray(entries) ? entries : [];
    const timestamp = Number(now || Date.now());

    rows.forEach((entry) => {
      const moduleKey = normalizeSlug(entry.moduleKey || entry.module_key || '');
      const categoryKey = singularize(entry.categoryKey || entry.category_key || '');
      if (!moduleKey || !categoryKey) return;
      const id = toAffinityId(moduleKey, categoryKey);
      const previous = affinityMap[id] || {
        module_key: moduleKey,
        category_key: categoryKey,
        score: 0,
        interactions_count: 0,
        updated_at: null
      };
      affinityMap[id] = {
        module_key: moduleKey,
        category_key: categoryKey,
        score: Number(previous.score || 0) + (Number(entry.delta) || 0),
        interactions_count: Number(previous.interactions_count || 0) + 1,
        updated_at: new Date(timestamp).toISOString()
      };
    });

    writeLocalAffinity(storage, affinityMap);
    return affinityMap;
  }

  function readQueuedAffinityEvents(storage) {
    const queue = readStorageBag(storage, STORAGE_KEYS.queue, []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeQueuedAffinityEvents(storage, queue) {
    writeStorageBag(storage, STORAGE_KEYS.queue, Array.isArray(queue) ? queue : []);
  }

  function enqueueAffinityEvents(storage, entries, now, sessionId) {
    const timestamp = Number(now || Date.now());
    const queue = readQueuedAffinityEvents(storage);
    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const moduleKey = normalizeSlug(entry.moduleKey || entry.module_key || '');
      const categoryKey = singularize(entry.categoryKey || entry.category_key || '');
      if (!moduleKey || !categoryKey) return;
      queue.push({
        id: `${timestamp}-${index}-${moduleKey}-${categoryKey}`,
        module_key: moduleKey,
        category_key: categoryKey,
        delta: Number(entry.delta) || 0,
        event_type: normalizeSlug(entry.eventType || entry.event_type || ''),
        tracked_at: new Date(timestamp).toISOString(),
        session_id: String(sessionId || '')
      });
    });
    writeQueuedAffinityEvents(storage, queue);
    return queue;
  }

  function consumeQueuedAffinityEvents(storage, limit) {
    const queue = readQueuedAffinityEvents(storage);
    const size = Math.max(1, Number(limit) || queue.length || 1);
    const batch = queue.slice(0, size);
    writeQueuedAffinityEvents(storage, queue.slice(batch.length));
    return batch;
  }

  function restoreQueuedAffinityEvents(storage, entries) {
    const queue = readQueuedAffinityEvents(storage);
    writeQueuedAffinityEvents(storage, (Array.isArray(entries) ? entries : []).concat(queue));
  }

  function mergeAffinityRows(baseRows, overrideRows) {
    const map = new Map();

    function applyRows(rows) {
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const moduleKey = normalizeSlug(row.module_key || row.moduleKey || '');
        const categoryKey = singularize(row.category_key || row.categoryKey || '');
        if (!moduleKey || !categoryKey) return;
        const id = toAffinityId(moduleKey, categoryKey);
        const previous = map.get(id) || {
          id,
          module_key: moduleKey,
          category_key: categoryKey,
          score: 0,
          interactions_count: 0,
          updated_at: null
        };
        map.set(id, {
          id,
          module_key: moduleKey,
          category_key: categoryKey,
          score: Number(previous.score || 0) + (Number(row.score) || 0),
          interactions_count: Number(previous.interactions_count || 0) + (Number(row.interactions_count || row.interactionsCount) || 0),
          updated_at: row.updated_at || row.updatedAt || previous.updated_at || null
        });
      });
    }

    applyRows(baseRows);
    applyRows(overrideRows);

    return Array.from(map.values());
  }

  function queuedEventsToAffinityRows(entries) {
    const map = new Map();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const moduleKey = normalizeSlug(entry.module_key || entry.moduleKey || '');
      const categoryKey = singularize(entry.category_key || entry.categoryKey || '');
      if (!moduleKey || !categoryKey) return;

      const id = toAffinityId(moduleKey, categoryKey);
      const previous = map.get(id) || {
        id,
        module_key: moduleKey,
        category_key: categoryKey,
        score: 0,
        interactions_count: 0,
        updated_at: null
      };

      map.set(id, {
        id,
        module_key: moduleKey,
        category_key: categoryKey,
        score: Number(previous.score || 0) + (Number(entry.delta) || 0),
        interactions_count: Number(previous.interactions_count || 0) + 1,
        updated_at: entry.tracked_at || entry.updated_at || entry.updatedAt || previous.updated_at || null
      });
    });

    return Array.from(map.values());
  }

  function buildCountMap(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const moduleKey = normalizeSlug(row.module_key || row.moduleKey || row.module || '');
      const categoryKey = singularize(row.category_key || row.categoryKey || row.category || '');
      if (!moduleKey || !categoryKey) return;
      map.set(toAffinityId(moduleKey, categoryKey), Number(row.count) || 0);
    });
    return map;
  }

  function buildAffinityMap(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const moduleKey = normalizeSlug(row.module_key || row.moduleKey || '');
      const categoryKey = singularize(row.category_key || row.categoryKey || '');
      if (!moduleKey || !categoryKey) return;
      map.set(toAffinityId(moduleKey, categoryKey), {
        score: Number(row.score) || 0,
        interactionsCount: Number(row.interactions_count || row.interactionsCount) || 0,
        updatedAt: row.updated_at || row.updatedAt || null
      });
    });
    return map;
  }

  function getRecencyMultiplier(updatedAt) {
    if (!updatedAt) return 0.72;
    const timestamp = Date.parse(updatedAt);
    if (!Number.isFinite(timestamp)) return 0.72;
    const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
    if (ageDays <= 3) return 1;
    if (ageDays <= 10) return 0.92;
    if (ageDays <= 30) return 0.82;
    if (ageDays <= 60) return 0.72;
    return 0.62;
  }

  function getRelevanceTone(score) {
    const normalized = Number(score) || 0;
    if (normalized >= 24) return { label: 'Alta para você', detail: 'Suas interações recentes e o volume ativo mantêm este tema no topo.' };
    if (normalized >= 14) return { label: 'Bem alinhada', detail: 'Você volta bastante a essa categoria e ela segue com publicações ativas.' };
    if (normalized >= 7) return { label: 'Subindo', detail: 'Há sinais consistentes de interesse e espaço para ganhar prioridade.' };
    return { label: 'Em observação', detail: 'Pode subir com novas interações e com mais anúncios ativos.' };
  }

  function buildCategoryRows(options) {
    const ctx = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const countsMap = buildCountMap(ctx.counts);
    const affinityMap = buildAffinityMap(ctx.affinity);
    const offset = Math.max(0, Number(ctx.offset) || 0);
    const limit = Math.max(1, Number(ctx.limit) || 10);

    const rows = CATEGORY_CATALOG.map((entry) => {
      const affinity = affinityMap.get(entry.id) || {};
      const baseRow = {
        id: entry.id,
        moduleKey: entry.moduleKey,
        categoryKey: entry.categoryKey,
        label: entry.label,
        icon: entry.icon,
        href: entry.href,
        count: countsMap.get(entry.id) || 0,
        score: Number(affinity.score) || 0,
        interactionsCount: Number(affinity.interactionsCount) || 0,
        updatedAt: affinity.updatedAt || null
      };
      const recencyMultiplier = getRecencyMultiplier(baseRow.updatedAt);
      const recentPersonalScore = baseRow.score * recencyMultiplier;
      const consistencyBoost = Math.min(baseRow.interactionsCount, 14) * 0.75;
      const availabilityBoost = Math.min(baseRow.count, 18) * 0.45;
      const rankingScore = recentPersonalScore + consistencyBoost + availabilityBoost;
      const tone = getRelevanceTone(rankingScore);
      return {
        ...baseRow,
        recentPersonalScore,
        rankingScore,
        relevanceLabel: tone.label,
        relevanceDetail: tone.detail
      };
    }).sort((left, right) => {
      if (right.rankingScore !== left.rankingScore) return right.rankingScore - left.rankingScore;
      if (right.score !== left.score) return right.score - left.score;
      if (right.interactionsCount !== left.interactionsCount) return right.interactionsCount - left.interactionsCount;
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label, 'pt-BR');
    });

    return {
      total: rows.length,
      offset,
      limit,
      hasMore: offset + limit < rows.length,
      rows: rows.slice(offset, offset + limit)
    };
  }

  return {
    STORAGE_KEYS,
    EVENT_WEIGHTS,
    getCatalog,
    getCategoryById,
    findCategory,
    findCategoriesBySearchTerm,
    resolveCategoriesFromPost,
    resolveCategoriesFromLink,
    inferModuleFromHref,
    getEventWeight,
    ensureSessionId,
    readLocalAffinity,
    writeLocalAffinity,
    localAffinityMapToRows,
    recordLocalAffinity,
    readQueuedAffinityEvents,
    enqueueAffinityEvents,
    consumeQueuedAffinityEvents,
    restoreQueuedAffinityEvents,
    queuedEventsToAffinityRows,
    mergeAffinityRows,
    buildCategoryRows,
    normalizeText,
    normalizeSlug,
    singularize,
    categoryId
  };
}));
