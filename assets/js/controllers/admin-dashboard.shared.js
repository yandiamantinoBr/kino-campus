(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KCAdminDashboardUtils = Object.freeze(api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TERM_SYNONYMS = Object.freeze({
    celulares: 'celular',
    smartphones: 'smartphone',
    laptops: 'laptop',
    notebooks: 'notebook',
    quartos: 'quarto',
    vagas: 'vaga',
    livros: 'livro',
    caronas: 'carona',
    eventos: 'evento',
    perdidos: 'perdido',
    achados: 'achado',
    chaves: 'chave',
    iphones: 'iphone',
    bolsas: 'bolsa',
    casas: 'casa',
    moveis: 'movel',
    bicicletas: 'bicicleta',
    fones: 'fone',
    tablets: 'tablet',
    monitores: 'monitor',
    cadeiras: 'cadeira',
    apostilas: 'apostila',
    calculos: 'calculo',
    documentos: 'documento',
    oculos: 'oculos',
    mochilas: 'mochila',
    estagios: 'estagio',
    republicanas: 'republica',
    republicas: 'republica',
    kitnets: 'kitnet',
    apartamentos: 'apartamento',
    emprego: 'vaga',
    empregos: 'vaga'
  });

  var MODULE_KEYWORDS = Object.freeze({
    'compra-venda': Object.freeze(['celular', 'smartphone', 'notebook', 'laptop', 'computador', 'roupa', 'movel', 'eletronico', 'venda', 'compro', 'iphone', 'tablet', 'monitor', 'cadeira', 'bicicleta', 'bike', 'fone', 'headphone', 'airpod', 'jbl', 'tv', 'geladeira', 'fogao', 'mesa', 'cama', 'colchao', 'camera', 'drone', 'video', 'game', 'calcado', 'tenis', 'maquina', 'impressora']),
    moradia: Object.freeze(['casa', 'quarto', 'republica', 'kitnet', 'apartamento', 'aluguel', 'moradia', 'dividir', 'alugar', 'imovel', 'vaga', 'hospedagem', 'room', 'flat', 'pensao', 'villaggio', 'morar', 'condominio', 'studio', 'andar']),
    caronas: Object.freeze(['carona', 'ida', 'volta', 'transporte', 'passagem', 'onibus', 'conducao', 'van', 'moto', 'buser', 'uber', '99', 'indriver', 'carpool', 'boleia']),
    eventos: Object.freeze(['evento', 'palestra', 'workshop', 'semana', 'feira', 'festival', 'show', 'apresentacao', 'cerimonia', 'congresso', 'simposio', 'seminario', 'aula', 'minicurso', 'encontro', 'reuniao', 'hackathon', 'exposicao', 'teatro']),
    oportunidades: Object.freeze(['estagio', 'emprego', 'vaga', 'monitoria', 'bolsa', 'freelancer', 'trainee', 'trabalho', 'oportunidade', 'job', 'contratando', 'recrutamento', 'residencia', 'pesquisa', 'iniciacao', 'seletivo', 'curriculo', 'clf']),
    'achados-perdidos': Object.freeze(['perdido', 'achado', 'encontrei', 'perdi', 'carteira', 'chave', 'oculos', 'mochila', 'documento', 'identidade', 'rg', 'cpf', 'passaporte', 'cartao', 'anel', 'relogio', 'airpod', 'fone', 'chaves', 'perda', 'achou', 'celular perdido']),
    livros: Object.freeze(['livro', 'apostila', 'calculo', 'exatas', 'didatico', 'material', 'caderno', 'atlas', 'manual', 'engenharia', 'quimica', 'fisica', 'biologia', 'historia', 'matematica', 'literatura', 'pdf', 'estudo', 'prova', 'gabarito'])
  });

  var MODULE_LABELS = Object.freeze({
    'compra-venda': 'Compra e Venda',
    moradia: 'Moradia',
    caronas: 'Caronas',
    eventos: 'Eventos',
    oportunidades: 'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos',
    livros: 'Livros'
  });

  var MODULE_ICONS = Object.freeze({
    'compra-venda': 'fas fa-layer-group',
    moradia: 'fas fa-home',
    caronas: 'fas fa-car',
    eventos: 'fas fa-calendar-alt',
    oportunidades: 'fas fa-briefcase',
    'achados-perdidos': 'fas fa-search',
    livros: 'fas fa-book'
  });

  var SERIES_KEYS = Object.freeze([
    'posts_count',
    'comments_count',
    'searches_count',
    'votes_count',
    'admin_actions_count'
  ]);

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function collapseWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function canonicalizeTerm(term) {
    var normalized = normalizeText(collapseWhitespace(term));
    if (!normalized) return '';
    if (TERM_SYNONYMS[normalized]) return TERM_SYNONYMS[normalized];
    if (normalized.length >= 5 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
      var singular = normalized.slice(0, -1);
      return TERM_SYNONYMS[singular] || singular;
    }
    return normalized;
  }

  function classifyTermToModule(term, constants) {
    var normalized = canonicalizeTerm(term);
    if (!normalized) return null;

    var categoryLabels = constants && constants.CATEGORY_LABELS ? constants.CATEGORY_LABELS : null;
    var bestModule = null;
    var bestScore = 0;
    var modules = Object.keys(MODULE_KEYWORDS);

    for (var i = 0; i < modules.length; i += 1) {
      var moduleKey = modules[i];
      var keywords = MODULE_KEYWORDS[moduleKey];
      var score = 0;

      for (var j = 0; j < keywords.length; j += 1) {
        var keyword = normalizeText(keywords[j]);
        if (normalized === keyword) {
          score += 10;
          break;
        }
        if (normalized.indexOf(keyword) !== -1) score += 3;
        else if (keyword.indexOf(normalized) !== -1) score += 2;
      }

      if (score === 0 && categoryLabels && categoryLabels[moduleKey]) {
        var labels = Object.keys(categoryLabels[moduleKey]);
        for (var k = 0; k < labels.length; k += 1) {
          var labelKey = normalizeText(labels[k]);
          if (normalized === labelKey || normalized.indexOf(labelKey) !== -1 || labelKey.indexOf(normalized) !== -1) {
            score += 5;
            break;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestModule = moduleKey;
      }
    }

    return bestScore > 0 ? bestModule : null;
  }

  function aggregateTrendsByModule(trends, constants) {
    var grouped = {};

    (trends || []).forEach(function (item) {
      var moduleKey = classifyTermToModule(item && item.term, constants);
      if (!moduleKey) return;
      if (!grouped[moduleKey]) {
        grouped[moduleKey] = {
          module: moduleKey,
          label: MODULE_LABELS[moduleKey] || moduleKey,
          icon: MODULE_ICONS[moduleKey] || 'fas fa-tag',
          count: 0,
          terms: []
        };
      }

      grouped[moduleKey].count += Number(item && item.count) || 0;
      if (item && item.term) grouped[moduleKey].terms.push(String(item.term));
    });

    return Object.values(grouped).sort(function (a, b) {
      return b.count - a.count;
    });
  }

  function buildModuleShareRows(trends, constants) {
    var rows = aggregateTrendsByModule(trends, constants);
    var total = rows.reduce(function (sum, row) {
      return sum + (Number(row.count) || 0);
    }, 0);

    return rows.map(function (row) {
      return {
        module: row.module,
        label: row.label,
        icon: row.icon,
        count: row.count,
        share: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
        topTerms: row.terms.slice(0, 3)
      };
    });
  }

  function toDayKey(value) {
    if (!value) return '';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function formatDayLabel(dayKey) {
    if (!dayKey) return '';
    var date = new Date(dayKey + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return dayKey;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function createDailyBuckets(since, until) {
    var startKey = toDayKey(since || new Date());
    var endKey = toDayKey(until || new Date());
    var start = new Date(startKey + 'T00:00:00Z');
    var end = new Date(endKey + 'T00:00:00Z');
    if (Number.isNaN(start.getTime())) start = new Date(toDayKey(new Date()) + 'T00:00:00Z');
    if (Number.isNaN(end.getTime())) end = new Date(toDayKey(new Date()) + 'T00:00:00Z');

    if (start.getTime() > end.getTime()) {
      var tmp = start;
      start = end;
      end = tmp;
    }

    var buckets = [];
    var cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      var dayKey = cursor.toISOString().slice(0, 10);
      var bucket = {
        day: dayKey,
        label: formatDayLabel(dayKey),
        posts_count: 0,
        comments_count: 0,
        searches_count: 0,
        votes_count: 0,
        admin_actions_count: 0,
        total_count: 0
      };
      buckets.push(bucket);
      cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
  }

  function buildDailyMetricsSeries(rows, since, until) {
    var buckets = createDailyBuckets(since, until);
    var bucketMap = {};

    buckets.forEach(function (bucket) {
      bucketMap[bucket.day] = bucket;
    });

    (rows || []).forEach(function (row) {
      var dayKey = toDayKey(row && row.day);
      if (!dayKey) return;
      if (!bucketMap[dayKey]) {
        bucketMap[dayKey] = {
          day: dayKey,
          label: formatDayLabel(dayKey),
          posts_count: 0,
          comments_count: 0,
          searches_count: 0,
          votes_count: 0,
          admin_actions_count: 0,
          total_count: 0
        };
      }

      var bucket = bucketMap[dayKey];
      SERIES_KEYS.forEach(function (key) {
        bucket[key] = Number(row && row[key]) || 0;
      });
      bucket.total_count = SERIES_KEYS.reduce(function (sum, key) {
        return sum + (Number(bucket[key]) || 0);
      }, 0);
    });

    return Object.keys(bucketMap).sort().map(function (dayKey) {
      var bucket = bucketMap[dayKey];
      bucket.total_count = SERIES_KEYS.reduce(function (sum, key) {
        return sum + (Number(bucket[key]) || 0);
      }, 0);
      return bucket;
    });
  }

  function buildDailyMetricsFromEventSets(eventSets, since, until) {
    var buckets = createDailyBuckets(since, until);
    var bucketMap = {};

    buckets.forEach(function (bucket) {
      bucketMap[bucket.day] = bucket;
    });

    function incrementRows(rows, key) {
      (rows || []).forEach(function (row) {
        var dayKey = toDayKey(row && row.created_at ? row.created_at : row);
        if (!dayKey || !bucketMap[dayKey]) return;
        bucketMap[dayKey][key] += 1;
      });
    }

    incrementRows(eventSets && eventSets.posts, 'posts_count');
    incrementRows(eventSets && eventSets.comments, 'comments_count');
    incrementRows(eventSets && eventSets.searches, 'searches_count');
    incrementRows(eventSets && eventSets.votes, 'votes_count');
    incrementRows(eventSets && eventSets.admin_actions, 'admin_actions_count');

    return Object.keys(bucketMap).sort().map(function (dayKey) {
      var bucket = bucketMap[dayKey];
      bucket.total_count = SERIES_KEYS.reduce(function (sum, key) {
        return sum + (Number(bucket[key]) || 0);
      }, 0);
      return bucket;
    });
  }

  function buildActivityPulseSummary(series) {
    var rows = Array.isArray(series) ? series : [];
    if (!rows.length) {
      return {
        totals: {},
        peakDay: null,
        peakTotal: 0,
        averageTotal: 0,
        lastDayTotal: 0
      };
    }

    var totals = {};
    SERIES_KEYS.forEach(function (key) {
      totals[key] = rows.reduce(function (sum, row) {
        return sum + (Number(row[key]) || 0);
      }, 0);
    });

    var peakDay = rows[0];
    rows.forEach(function (row) {
      if ((Number(row.total_count) || 0) > (Number(peakDay.total_count) || 0)) {
        peakDay = row;
      }
    });

    var totalAll = rows.reduce(function (sum, row) {
      return sum + (Number(row.total_count) || 0);
    }, 0);

    return {
      totals: totals,
      peakDay: peakDay,
      peakTotal: Number(peakDay.total_count) || 0,
      averageTotal: rows.length ? Math.round((totalAll / rows.length) * 10) / 10 : 0,
      lastDayTotal: Number(rows[rows.length - 1].total_count) || 0
    };
  }

  function buildOperationalAlerts(snapshot) {
    var data = snapshot || {};
    var alerts = [];

    var openReports = Number(data.openReports || 0);
    var hiddenPosts = Number(data.hiddenPosts || 0);
    var deletedPosts = Number(data.deletedPosts || 0);
    var searches = Number(data.searches || 0);
    var auditEvents = Number(data.auditEvents || 0);
    var peakTotal = Number(data.peakTotal || 0);

    if (openReports > 0) {
      alerts.push({
        tone: 'critical',
        title: 'Denúncias pendentes',
        body: openReports + ' denúncia(s) aberta(s) exigem revisão da moderação.'
      });
    }

    if (hiddenPosts + deletedPosts > 0) {
      alerts.push({
        tone: 'warning',
        title: 'Fila de moderação aquecida',
        body: (hiddenPosts + deletedPosts) + ' post(s) sofreram ação moderativa no período.'
      });
    }

    if (searches >= 10) {
      alerts.push({
        tone: 'info',
        title: 'Demanda de busca em alta',
        body: searches + ' buscas foram registradas no período atual.'
      });
    }

    if (peakTotal >= 8) {
      alerts.push({
        tone: 'positive',
        title: 'Pico operacional identificado',
        body: 'O maior pulso diário somou ' + peakTotal + ' eventos consolidados.'
      });
    }

    if (!alerts.length) {
      alerts.push({
        tone: auditEvents > 0 ? 'neutral' : 'positive',
        title: auditEvents > 0 ? 'Operação estável' : 'Sem incidentes recentes',
        body: auditEvents > 0
          ? 'O Dashboard não detectou alertas críticos no período selecionado.'
          : 'Nenhuma ação administrativa relevante foi registrada recentemente.'
      });
    }

    return alerts;
  }

  return {
    MODULE_ICONS: MODULE_ICONS,
    MODULE_KEYWORDS: MODULE_KEYWORDS,
    MODULE_LABELS: MODULE_LABELS,
    SERIES_KEYS: SERIES_KEYS,
    TERM_SYNONYMS: TERM_SYNONYMS,
    aggregateTrendsByModule: aggregateTrendsByModule,
    buildActivityPulseSummary: buildActivityPulseSummary,
    buildDailyMetricsFromEventSets: buildDailyMetricsFromEventSets,
    buildDailyMetricsSeries: buildDailyMetricsSeries,
    buildModuleShareRows: buildModuleShareRows,
    buildOperationalAlerts: buildOperationalAlerts,
    canonicalizeTerm: canonicalizeTerm,
    classifyTermToModule: classifyTermToModule,
    createDailyBuckets: createDailyBuckets,
    formatDayLabel: formatDayLabel,
    normalizeText: normalizeText,
    toDayKey: toDayKey
  };
});
