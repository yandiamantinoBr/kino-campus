/*
  KinoCampus - Shared Utils (V8.1.2.4.6)

  Principal função:
  - Centralizar utilitários repetidos (normalize/escape/currency/debounce)
  - Evitar divergência entre scripts (search, filters, etc.)

  Exposição:
  - window.KCUtils
*/

(function () {
  'use strict';

  // Labels para exibição (mantém consistência visual com os feeds)
  const MODULE_LABEL_MAP = Object.freeze({
    'moradia': 'Moradia',
    'eventos': 'Eventos',
    'oportunidades': 'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos',
    'caronas': 'Caronas',
    'compra-venda': 'Compra e Venda',
    'livros': 'Livros',
  });

  // Ícones (Font Awesome) por módulo — usado em badges (cards + product)
  const MODULE_ICON_MAP = Object.freeze({
    'moradia': 'fas fa-home',
    'eventos': 'fas fa-calendar-alt',
    'oportunidades': 'fas fa-briefcase',
    'achados-perdidos': 'fas fa-search',
    'caronas': 'fas fa-car',
    'compra-venda': 'fas fa-layer-group',
    'livros': 'fas fa-book',
  });

  // Labels “humanizados” por categoria/subcategoria (casos conhecidos do protótipo)
  const CATEGORY_LABELS = Object.freeze({
    'compra-venda': Object.freeze({
      'eletronicos': 'Eletrônicos',
      'moveis': 'Móveis',
      'vestuario': 'Vestuário',
      'livros': 'Livros',
      'outros': 'Outros',
    }),
    'achados-perdidos': Object.freeze({
      'perdidos': 'Perdido',
      'perdido': 'Perdido',
      'encontrados': 'Encontrado',
      'encontrado': 'Encontrado',
      'achado': 'Encontrado',
      'documentos': 'Documentos',
      'eletronicos': 'Eletrônicos',
      'outros': 'Outros',
    }),
    'caronas': Object.freeze({
      'ofereco': 'Ofereço Carona',
      'procuro': 'Procuro Carona',
      'ida': 'Ida',
      'volta': 'Volta',
      'urgente': 'Urgente',
      'campus': 'Campus',
      'centro': 'Centro',
    }),
    'oportunidades': Object.freeze({
      'estagio': 'Estágio',
      'estagios': 'Estágio',
      'emprego': 'Emprego',
      'empregos': 'Emprego',
      'freelancer': 'Freelancer',
      'monitoria': 'Monitoria',
      'monitorias': 'Monitoria',
      'voluntariado': 'Voluntariado',
      'voluntariados': 'Voluntariado',
      'bolsa': 'Bolsa',
      'vagas': 'Vagas',
      'bolsas': 'Bolsas',
    }),
    'eventos': Object.freeze({
      'eventos': 'Eventos',
      'sustentabilidade': 'Sustentabilidade',
      'cultural': 'Cultural',
      'academico': 'Acadêmico',
      'esportivo': 'Esportivo',
      'esportes': 'Esportivo',
      'workshop': 'Workshop',
      'palestra': 'Acadêmico',
      'feira': 'Sustentabilidade',
    }),
    'moradia': Object.freeze({
      'quarto': 'Quarto',
      'dividir-quarto': 'Dividir Quarto',
      'apartamento': 'Apartamento',
      'kitnet': 'Kitnet',
      'republica': 'República',
    }),
    'livros': Object.freeze({
      'exatas': 'Exatas',
      'engenharia': 'Engenharia',
      'calculo': 'Cálculo',
    }),
  });

  const SUBCATEGORY_LABELS = Object.freeze({
    'caronas': Object.freeze({
      'goiania-campus': 'Goiânia → Campus',
      'campus-centro': 'Campus → Centro',
      'samambaia-centro': 'Samambaia → Centro',
      'saida-agora': 'Saída Agora',
    }),
  });

  const OPPORTUNITY_AREA_DEFINITIONS = Object.freeze([
    Object.freeze({
      key: 'tecnologia',
      label: 'Tecnologia',
      icon: 'fas fa-laptop-code',
      aliases: Object.freeze([
        'tecnologia', 'tech', 'ti', 'software', 'sistemas', 'desenvolvimento',
        'desenvolvedor', 'desenvolvedora', 'dev', 'programacao', 'programação',
        'engenharia de software', 'dados', 'data', 'analytics', 'analise de dados',
        'análise de dados', 'frontend', 'front-end', 'backend', 'back-end',
        'full stack', 'fullstack', 'ux engineering', 'qa', 'react', 'node',
        'javascript', 'typescript', 'python'
      ]),
    }),
    Object.freeze({
      key: 'marketing',
      label: 'Marketing',
      icon: 'fas fa-bullhorn',
      aliases: Object.freeze([
        'marketing', 'growth', 'branding', 'midia', 'mídia', 'social media',
        'redes sociais', 'trafego', 'tráfego', 'seo', 'ads', 'copy', 'copywriting',
        'conteudo', 'conteúdo', 'publicidade', 'comunicacao', 'comunicação'
      ]),
    }),
    Object.freeze({
      key: 'design',
      label: 'Design',
      icon: 'fas fa-palette',
      aliases: Object.freeze([
        'design', 'designer', 'ux', 'ui', 'produto visual', 'grafico', 'gráfico',
        'identidade visual', 'criacao visual', 'criação visual', 'ilustracao',
        'ilustração', 'direcao de arte', 'direção de arte'
      ]),
    }),
    Object.freeze({
      key: 'educacao',
      label: 'Educação',
      icon: 'fas fa-graduation-cap',
      aliases: Object.freeze([
        'educacao', 'educação', 'ensino', 'pedagogia', 'monitoria', 'monitor',
        'tutoria', 'tutor', 'professor', 'professora', 'aulas', 'reforco',
        'reforço', 'escolar', 'licenciatura', 'didatica', 'didática', 'calculo',
        'cálculo'
      ]),
    }),
    Object.freeze({
      key: 'administrativo',
      label: 'Administrativo',
      icon: 'fas fa-clipboard-list',
      aliases: Object.freeze([
        'administrativo', 'administracao', 'administração', 'operacoes', 'operações',
        'secretaria', 'rh', 'recursos humanos', 'financeiro', 'financas', 'finanças',
        'backoffice', 'office', 'assistente administrativo'
      ]),
    }),
    Object.freeze({
      key: 'engenharia',
      label: 'Engenharia',
      icon: 'fas fa-drafting-compass',
      aliases: Object.freeze([
        'engenharia', 'engenheiro', 'engenheira', 'civil', 'mecanica', 'mecânica',
        'eletrica', 'elétrica', 'projetos', 'projeto tecnico', 'projeto técnico',
        'autocad', 'cad'
      ]),
    }),
    Object.freeze({
      key: 'saude',
      label: 'Saúde',
      icon: 'fas fa-heartbeat',
      aliases: Object.freeze([
        'saude', 'saúde', 'medicina', 'enfermagem', 'psicologia', 'farmacia',
        'farmácia', 'nutricao', 'nutrição', 'clinica', 'clínica'
      ]),
    }),
    Object.freeze({
      key: 'pesquisa',
      label: 'Pesquisa',
      icon: 'fas fa-microscope',
      aliases: Object.freeze([
        'pesquisa', 'cientifica', 'científica', 'iniciacao cientifica',
        'iniciação científica', 'laboratorio', 'laboratório', 'academica',
        'acadêmica', 'bolsa pesquisa'
      ]),
    }),
  ]);

  function titleCase(str) {
    return String(str || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Se for no futuro (possível descompasso de relógio) ou acabou de ser publicado.
    // Aceita até 5 minutos de desvio de relógio (positivo ou negativo).
    if (diffMs <= 0 || diffMs < 300000) return 'Agora mesmo';

    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `Há ${diffMin} min`;

    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return diffHoras === 1 ? 'Há 1 hora' : `Há ${diffHoras} horas`;

    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 30) return diffDias === 1 ? 'Há 1 dia' : `Há ${diffDias} dias`;

    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses < 12) return diffMeses === 1 ? 'Há 1 mês' : `Há ${diffMeses} meses`;

    const diffAnos = Math.floor(diffDias / 365);
    return diffAnos === 1 ? 'Há 1 ano' : `Há ${diffAnos} anos`;
  }

  function beautifyKey(key) {
    const s = String(key || '').trim();
    if (!s) return '';
    return titleCase(s.replace(/[_-]+/g, ' '));
  }

  function getModuleLabel(moduleKey) {
    const key = normalizeText(moduleKey);
    return MODULE_LABEL_MAP[key] || beautifyKey(key) || String(moduleKey || '');
  }

  function getModuleIconClass(moduleKey) {
    const key = normalizeText(moduleKey);
    return MODULE_ICON_MAP[key] || 'fas fa-layer-group';
  }

  function getCategoryLabel(moduleKey, catKey) {
    const m = normalizeText(moduleKey);
    const c = normalizeText(catKey);
    const map = CATEGORY_LABELS[m];
    if (map && map[c]) return map[c];
    return beautifyKey(c) || String(catKey || '');
  }

  function getSubcategoryLabel(moduleKey, subKey) {
    const m = normalizeText(moduleKey);
    const s = normalizeText(subKey);
    const map = SUBCATEGORY_LABELS[m];
    if (map && map[s]) return map[s];
    return beautifyKey(s) || String(subKey || '');
  }

  function normalizeText(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getEmailDomain(email) {
    const em = normalizeEmail(email);
    const at = em.lastIndexOf('@');
    if (at < 0) return '';
    return em.slice(at + 1);
  }

  function normalizeAllowedDomains(allowedDomains) {
    if (!Array.isArray(allowedDomains)) return [];
    return Array.from(new Set(
      allowedDomains
        .map((d) => String(d || '').trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  function isInstitutionalEmailAllowed(email, allowedDomains) {
    const list = normalizeAllowedDomains(allowedDomains);
    if (!list.length) return true; // sem restrição
    const domain = getEmailDomain(email);
    if (!domain) return false;
    // Regra única: aceita apenas domínio explícito na allowlist.
    return list.includes(domain);
  }

  function canonicalCategory(str) {
    let s = normalizeText(str);
    s = s.replace(/^#/, '');
    // plural básico (pt-BR)
    if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
    return s;
  }

  function slugifyText(str) {
    return normalizeText(str).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function levenshteinDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left) return right.length;
    if (!right) return left.length;

    const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[left.length][right.length];
  }

  function getOpportunityAreaDefinitions() {
    return OPPORTUNITY_AREA_DEFINITIONS.slice();
  }

  function buildOpportunityTextParts(source, fallbackTags) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      const meta = (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) ? source.metadata : {};
      const tagValues = [];
      if (Array.isArray(source.tags)) tagValues.push(...source.tags);
      if (Array.isArray(source.tagKeys)) tagValues.push(...source.tagKeys);
      if (Array.isArray(meta.tags)) tagValues.push(...meta.tags);
      if (Array.isArray(meta.tagKeys)) tagValues.push(...meta.tagKeys);

      return {
        explicit: [
          source.areaLabel, source.area, source.areaKey,
          meta.areaLabel, meta.area, meta.areaKey,
          source.subcategoriaLabel, source.subcategoria, source.subcategoriaKey,
          source.subcategoryLabel, source.subcategory, source.subcategoryKey,
          meta.subcategoria, meta.subcategoriaKey,
          meta.subcategoryLabel, meta.subcategory, meta.subcategoryKey
        ].filter(Boolean),
        text: [
          source.titulo, source.title,
          source.descricao, source.description,
          source.localizacao, source.location,
          meta.localizacao, meta.location
        ].filter(Boolean),
        tags: tagValues.filter(Boolean),
      };
    }

    return {
      explicit: source ? [source] : [],
      text: [],
      tags: Array.isArray(fallbackTags) ? fallbackTags.filter(Boolean) : [],
    };
  }

  function getOpportunityAreaInfoByKey(key) {
    const wanted = slugifyText(key);
    if (!wanted) return null;
    return OPPORTUNITY_AREA_DEFINITIONS.find((entry) => entry.key === wanted) || null;
  }

  function resolveOpportunityArea(source, options = {}) {
    const built = buildOpportunityTextParts(source, options.tags);
    const textParts = Array.isArray(options.textParts) ? options.textParts.filter(Boolean) : [];
    const explicitCandidates = built.explicit.map((value) => String(value || '').trim()).filter(Boolean);
    const combinedText = [
      ...explicitCandidates,
      ...built.tags,
      ...built.text,
      ...textParts
    ].map((value) => normalizeText(value)).filter(Boolean).join(' ');

    const aliases = [];
    OPPORTUNITY_AREA_DEFINITIONS.forEach((entry) => {
      aliases.push(entry.label);
      aliases.push(entry.key);
      entry.aliases.forEach((alias) => aliases.push(alias));
    });

    const aliasMap = new Map();
    OPPORTUNITY_AREA_DEFINITIONS.forEach((entry) => {
      const values = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])];
      values.forEach((value) => {
        const normalized = normalizeText(value);
        if (normalized && !aliasMap.has(normalized)) aliasMap.set(normalized, entry);
      });
    });

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized) continue;
      if (aliasMap.has(normalized)) {
        const match = aliasMap.get(normalized);
        return { key: match.key, label: match.label, icon: match.icon, isKnown: true, source: 'explicit' };
      }

      for (const [alias, entry] of aliasMap.entries()) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          return { key: entry.key, label: entry.label, icon: entry.icon, isKnown: true, source: 'explicit-partial' };
        }
      }
    }

    if (combinedText) {
      const ranked = OPPORTUNITY_AREA_DEFINITIONS
        .map((entry) => {
          const score = [entry.label, entry.key, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
            .map((value) => normalizeText(value))
            .filter(Boolean)
            .reduce((acc, alias) => {
              if (!combinedText.includes(alias)) return acc;
              const weight = alias.includes(' ') ? 3 : 2;
              return acc + weight;
            }, 0);
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      if (ranked.length) {
        const best = ranked[0].entry;
        return { key: best.key, label: best.label, icon: best.icon, isKnown: true, source: 'context' };
      }
    }

    for (const candidate of explicitCandidates) {
      const normalized = normalizeText(candidate);
      if (!normalized || normalized.length < 4) continue;

      let best = null;
      let bestDistance = Infinity;
      aliasMap.forEach((entry, alias) => {
        const distance = levenshteinDistance(normalized, alias);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = entry;
        }
      });

      const threshold = normalized.length >= 9 ? 2 : 1;
      if (best && bestDistance <= threshold) {
        return { key: best.key, label: best.label, icon: best.icon, isKnown: true, source: 'fuzzy' };
      }
    }

    const fallbackRaw = explicitCandidates[0] || '';
    const fallbackKey = slugifyText(fallbackRaw);
    if (fallbackKey) {
      return {
        key: fallbackKey,
        label: beautifyKey(fallbackKey) || beautifyKey(fallbackRaw) || fallbackRaw,
        icon: 'fas fa-briefcase',
        isKnown: false,
        source: 'custom',
      };
    }

    return { key: '', label: '', icon: 'fas fa-briefcase', isKnown: false, source: 'empty' };
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cssEscape(str) {
    // fallback simples (suficiente para ids/classes gerados localmente)
    return String(str ?? '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function formatCurrencyBRL(value) {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return 'R$ 0,00';
    try {
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_) {
      // fallback
      const fixed = (Math.round(num * 100) / 100).toFixed(2).replace('.', ',');
      return 'R$ ' + fixed;
    }
  }

  function parseBRLNumber(input) {
    const s = String(input ?? '')
      .replace(/\s/g, '')
      .replace(/R\$/i, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait = 120) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function getConditionLabel(raw) {
    const r = normalizeText(raw);
    if (!r) return '';
    if (r.includes('semi')) return 'Semi-novo';
    if (r.includes('novo')) return 'Novo';
    return beautifyKey(r);
  }

  function splitPriceText(text) {
    const t = String(text || '').trim();
    if (!t) return { main: '', small: '' };

    // Quebra explícita por linha
    if (t.includes('\n')) {
      const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
      return { main: lines[0] || '', small: lines.slice(1).join(' ') };
    }

    // Conteúdo em parênteses como complemento
    const paren = t.match(/^(.*)\(([^)]+)\)\s*$/);
    if (paren) return { main: paren[1].trim(), small: paren[2].trim() };

    // Separadores comuns
    for (const sep of [' - ', ' • ', ' | ']) {
      if (t.includes(sep)) {
        const [a, ...rest] = t.split(sep);
        return { main: a.trim(), small: rest.join(sep).trim() };
      }
    }

    // Casos do protótipo: "R$ 5,00/trecho Ida e volta"
    const unitMatchers = ['/trecho', '/mês', '/mes', '/dia', '/hora', '/semana'];
    for (const unit of unitMatchers) {
      const idx = t.toLowerCase().indexOf(unit);
      if (idx >= 0) {
        const cut = idx + unit.length;
        const main = t.slice(0, cut).trim();
        const small = t.slice(cut).trim();
        if (small) return { main, small };
      }
    }

    return { main: t, small: '' };
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
    return { from: beautifyKey(left), to: beautifyKey(right) };
  }

  function inferAchadosLocation(tags = []) {
    const t = (Array.isArray(tags) ? tags : []).map(x => normalizeText(x));
    if (t.includes('samambaia')) return 'Campus Samambaia';
    if (t.includes('universitario') || t.includes('universitário')) return 'Campus Universitário';
    if (t.includes('biblioteca')) return 'Biblioteca';
    if (t.includes('ru')) return 'Restaurante Universitário';
    if (t.includes('estacionamento')) return 'Estacionamento';
    // Heurística simples: juntar "campus" com o próximo termo (se existir)
    const i = t.indexOf('campus');
    if (i >= 0 && t[i + 1]) return 'Campus ' + beautifyKey(t[i + 1]);
    return '';
  }

  function inferOportunidadesSubcategory(source, tags = []) {
    const resolved = resolveOpportunityArea(source, { tags });
    return resolved && resolved.label ? resolved.label : '';
  }

  function inferEventosCategory(rawCat, tags = []) {
    const base = normalizeText(rawCat);
    const t = (Array.isArray(tags) ? tags : []).map(x => normalizeText(x));

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
    const normTags = (Array.isArray(tags) ? tags : []).map(t => normalizeText(t));
    const meta = (p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)) ? p.metadata : {};

    // Derivar chaves (mantém consistência para filtros)
    if (!p.categoriaKey) {
      const rawCat = String(p.categoria || meta.category || meta.categoryKey || '').trim();
      let key = canonicalCategory(rawCat);

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

      p.categoriaKey = key || '';
    }

    if (!p.subcategoriaKey) {
      const rawSub = String(p.subcategoria || meta.subcategory || '').trim();
      p.subcategoriaKey = canonicalCategory(rawSub) || '';
    }

    // UI: comentários compactos (ícone + número)
    if (p._kcCompactComments == null) p._kcCompactComments = true;

    // Tempo Relativo (timeAgo)
    if (p.created_at || p.timestamp) {
      p._kcRelativeTime = timeAgo(p.created_at || p.timestamp);
    }


    // Labels (sem quebrar caso já existam)
    if (!p.categoriaLabel) p.categoriaLabel = getCategoryLabel(moduleKey, p.categoriaKey || p.categoria);
    if (moduleKey === 'oportunidades') {
      const areaInfo = resolveOpportunityArea(p, { tags });
      if (!p.subcategoriaKey && areaInfo.key) p.subcategoriaKey = areaInfo.key;
      if (!p.subcategoriaLabel) p.subcategoriaLabel = areaInfo.label || inferOportunidadesSubcategory(p, tags);
    } else if (!p.subcategoriaLabel) {
      p.subcategoriaLabel = getSubcategoryLabel(moduleKey, p.subcategoriaKey || p.subcategoria);
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
    p._kcCtaText = 'Ver Mais';

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
        p._kcStatusBadgeHtml = `<span class="kc-badge"><i class="fas fa-tag"></i> ${_kcStatusLabel}</span>`;
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
        const hasSust = normTags.some(t => t.includes('sustent')) || normalizeText(p.descricao || '').includes('sustent');
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
      else if (p.preco != null && p.preco !== '') text = (typeof p.preco === 'number') ? formatCurrencyBRL(p.preco) : String(p.preco);
      const split = splitPriceText(text);
      p._kcPriceTextMain = split.main;
      p._kcPriceTextSmall = split.small;
    }

    // Category segments (texto puro; render adiciona marcador de verificação)
    if (!Array.isArray(p._kcCategorySegments)) {
      const segments = [];
      if (p._kcShowModuleLabel) segments.push(getModuleLabel(moduleKey));

      if (moduleKey === 'caronas') {
        const route = inferCaronasRoute(p.titulo);
        segments.push(getCategoryLabel(moduleKey, p.categoriaKey || p.categoria));
        if (route.from) segments.push(route.from);
        if (route.to) segments.push(route.to);
      } else if (moduleKey === 'compra-venda') {
        if (p.categoriaLabel) segments.push(String(p.categoriaLabel));
        if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
        if (p.condicao) segments.push(getConditionLabel(p.condicao));
      } else if (moduleKey === 'achados-perdidos') {
        const lost = String(p.categoriaKey || '').includes('perd');
        segments.push(lost ? 'Perdido' : 'Encontrado');
        if (p.subcategoriaLabel) segments.push(String(p.subcategoriaLabel));
        const loc = inferAchadosLocation(tags);
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
      else p._kcTabCategoryKey = p.categoriaKey || canonicalCategory(p.categoria) || '';
    }

    return p;
  }

  // Renderização padrão de um card (estrutura idêntica aos .kc-card do HTML)
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

    const compactComments = true; // V8.1.2.4.5: padrão obrigatório (ícone + número)

    // Badge (opcional)
    const badgeHtml = (p._kcBadgeText)
      ? `<span class="kc-cashback-badge"${p._kcBadgeStyle ? ` style="${escapeHtml(String(p._kcBadgeStyle))}"` : ''}>
          <i class="${escapeHtml(String(p._kcBadgeIconClass || 'fas fa-tag'))}"></i>
          ${escapeHtml(String(p._kcBadgeText))}
        </span>`
      : '';

    // Badges (pills) — alinhados ao padrão do product (módulo/condição/tempo)
    const badges = [];

    // Módulo
    if (p.modulo) {
      const modLabel = getModuleLabel(p.modulo);
      const modIcon = getModuleIconClass(p.modulo);
      badges.push(`<span class="kc-badge"><i class="${escapeHtml(modIcon)}"></i> ${escapeHtml(modLabel)}</span>`);
    }

    // Status (Achados/Perdidos)
    if (p._kcStatusBadgeHtml) badges.push(p._kcStatusBadgeHtml);

    // Condição (Compra e Venda)
    if (p.condicao) {
      badges.push(`<span class="kc-badge"><i class="fas fa-star"></i> ${escapeHtml(String(p.condicao))}</span>`);
    }

    // Tempo relativo (único lugar no card)
    const relTime = p._kcRelativeTime || p.timestamp;
    if (relTime) {
      badges.push(`<span class="kc-badge"><i class="fas fa-clock"></i> ${escapeHtml(String(relTime))}</span>`);
    }

    const topBadgesHtml = badges.length
      ? `<div class="kc-card__badges">${badges.join(' ')}</div>`
      : '';

    // Category line (com marcador de verificação quando aplicável)
    const segments = Array.isArray(p._kcCategorySegments) ? p._kcCategorySegments : [];
    let categoryLineHtml = segments.map(s => escapeHtml(String(s))).join(' • ');
    if (p._kcVerifiedTag) {
      categoryLineHtml = `${categoryLineHtml}${categoryLineHtml ? ' • ' : ''}<a href="#">${escapeHtml(String(p._kcVerifiedTag))}</a> <i class="fas fa-check-circle"></i>`;
    }

    // Imagem (quando existir), senão emoji (mantém Offline First)
    const images = Array.isArray(p.imagens) ? p.imagens : (Array.isArray(p.images) ? p.images : []);
    const imgSrc = images.length ? String(images[0]) : '';
    const imageWrapperHtml = imgSrc
      ? `<div class="kc-card__image-wrapper">
           <img alt="${escapeHtml(String(p.titulo || 'Imagem'))}" src="${escapeHtml(imgSrc)}" width="400" height="300" loading="lazy" decoding="async"/>
         </div>`
      : `<div class="kc-card__image-wrapper" style="font-size: 3em; display: flex; align-items: center; justify-content: center;">
           ${escapeHtml(String(emoji))}
         </div>`;

    // Preço (com suporte a <small>)
    let priceHtml = '';
    const priceIconClass = (p._kcPriceIconClass != null && String(p._kcPriceIconClass).trim() !== '')
      ? String(p._kcPriceIconClass)
      : 'fas fa-money-bill-wave';

    const priceStyle = (p._kcPriceStyle != null && String(p._kcPriceStyle).trim() !== '')
      ? String(p._kcPriceStyle)
      : '';

    const styleAttr = priceStyle ? ` style="${escapeHtml(priceStyle)}"` : '';
    const mainPriceText = String(p._kcPriceTextMain || '').trim();
    const smallPriceText = String(p._kcPriceTextSmall || '').trim();
    const shouldShowPrice = !p._kcHidePrice && (mainPriceText || smallPriceText);

    if (shouldShowPrice) {
      priceHtml = `
        <div class="kc-card__price"${styleAttr}>
          <i class="${escapeHtml(priceIconClass)}"></i>
          ${escapeHtml(mainPriceText)}
          ${smallPriceText ? `<small>${escapeHtml(smallPriceText)}</small>` : ''}
        </div>
      `.trim();
    }

    // Descrição (preview)
    const rawDesc = String(p.descricao || '').trim();
    const preview = rawDesc.length > 140 ? (rawDesc.slice(0, 140).trim() + '...') : rawDesc;

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
      : (p._legacyAuthorAvatar || p.autorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=kc');

    const rating = (p.rating != null && p.rating !== '') ? Number(p.rating) : null;
    const ratingHtml = Number.isFinite(rating)
      ? `<i class="fas fa-star"></i> ${escapeHtml(rating.toFixed(1))}`
      : '';

    // Interações
    const votos = (p.votos != null && p.votos !== '') ? Number(p.votos) : 0;
    const comentarios = (p.comentarios != null && p.comentarios !== '') ? Number(p.comentarios) : 0;

    const commentsFullLabel = `${Number.isFinite(comentarios) ? comentarios : 0} comentários`;
    const commentsShown = String(Number.isFinite(comentarios) ? comentarios : 0);
    const commentsAria = ` aria-label="${escapeHtml(commentsFullLabel)}"`;

    // Atributos para filtros/compatibilidade
    const attrs = [];
    attrs.push(`class="kc-card${badgeHtml ? " kc-card--has-corner-badge" : ""}"`);
    if (id) attrs.push(`data-post-id="${escapeHtml(id)}"`);
    attrs.push(`data-verified="${escapeHtml(String(!!p.verificado))}"`);

    // Marcação de post do usuário (evita duplicação de injeção pelo kc-core.js)
    if (p._kcUserPost === true) attrs.push('data-kc-user-post="true"');

    if (p.condicao) {
      const raw = String(p.condicao).toLowerCase();
      const norm = raw.includes('semi') ? 'seminovo' : (raw.includes('novo') ? 'novo' : raw.replace(/\s+/g, ''));
      attrs.push(`data-condition="${escapeHtml(norm)}"`);
    }

    // data-category: preferir chave (categoriaKey) para filtros; label fica no texto
    const dataCategory = (p._kcTabCategoryKey || p.categoriaKey || p.categoria || '');
    if (dataCategory) attrs.push(`data-category="${escapeHtml(String(dataCategory))}"`);

    // data-subcategory (novo): usado por filtros de compra-venda e afins
    const dataSub = (p.subcategoriaKey || p.subcategoria || '');
    if (dataSub) attrs.push(`data-subcategory="${escapeHtml(String(dataSub))}"`);

    // data-kc-tags: preferir tagKeys para filtros
    const tagKeysRaw = Array.isArray(p.tagKeys) ? p.tagKeys : (Array.isArray(p.tags) ? p.tags : []);
    const tagKeys = tagKeysRaw.map(String);
    // garantir que a categoria principal participe do filtro por tabs
    if (p.categoriaKey && !tagKeys.includes(String(p.categoriaKey))) tagKeys.push(String(p.categoriaKey));
    if (tagKeys.length) attrs.push(`data-kc-tags="${escapeHtml(tagKeys.join(' '))}"`);

    const votePostId = String(id);
    const votePostUuid = (p && p.uuid) ? String(p.uuid) : '';
    const voteUuidAttr = votePostUuid ? ` data-post-uuid="${encodeURIComponent(votePostUuid)}"` : '';

    return `
      <article ${attrs.join(' ')}>
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
              ${escapeHtml(String(p.titulo || ''))}
            </a>
            ${topBadgesHtml}
            ${priceHtml ? priceHtml : ''}
            <div class="kc-card__description-preview">
              ${escapeHtml(preview)}
            </div>
            <div class="kc-card__author">
              <img alt="${escapeHtml(String(authorName).split(' ')[0] || 'Autor')}" src="${escapeHtml(authorAvatar)}"/>
              <span>${escapeHtml(authorPrefix)} <strong>${escapeHtml(String(authorName))}</strong></span>
              ${ratingHtml}
            </div>
          </div>
        </div>
        <div class="kc-card__footer">
          <div class="kc-card__interactions">
            <div class="kc-vote-box">
              <button class="hot" data-action="vote-hot" data-post-id="${encodeURIComponent(votePostId)}" data-post-legacy-id="${encodeURIComponent(String(id))}"${voteUuidAttr}>
                <i class="fas fa-fire"></i>
              </button>
              <span>${escapeHtml(String(Number.isFinite(votos) ? votos : 0))}</span>
              <button class="cold" data-action="vote-cold" data-post-id="${encodeURIComponent(votePostId)}" data-post-legacy-id="${encodeURIComponent(String(id))}"${voteUuidAttr}>
                <i class="fas fa-snowflake"></i>
              </button>
            </div>
            <a class="kc-comment-link" href="product.html?id=${encodeURIComponent(id)}#comments"${commentsAria}>
              <i class="fas fa-comment"></i>
              <span>${escapeHtml(String(commentsShown))}</span>
            </a>
          </div>
          <div class="kc-card__actions">

            <button type="button" class="kc-share-whatsapp" data-share-url="product.html?id=${encodeURIComponent(id)}" data-share-title="${escapeHtml(String(p.titulo || ""))}" aria-label="Compartilhar no WhatsApp">
            <svg viewBox="0 0 448 512" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
            </svg>
          </button>

            <a class="kc-action-button kc-get-coupon-button" href="product.html?id=${encodeURIComponent(id)}">
            ${escapeHtml(ctaText)}
          </a>

          </div>
        </div>
      </article>
    `.trim();
  }

  window.KCUtils = Object.freeze({
    normalizeText,
    normalizeEmail,
    getEmailDomain,
    normalizeAllowedDomains,
    isInstitutionalEmailAllowed,
    canonicalCategory,
    titleCase,
    beautifyKey,
    getModuleLabel,
    getModuleIconClass,
    getCategoryLabel,
    getSubcategoryLabel,
    getConditionLabel,
    getOpportunityAreaDefinitions,
    getOpportunityAreaInfoByKey,
    resolveOpportunityArea,
    escapeHtml,
    cssEscape,
    formatCurrencyBRL,
    parseBRLNumber,
    clamp,
    debounce,
    splitPriceText,
    applyPresentationRules,
    renderPostCard,
    timeAgo,
  });
})();
