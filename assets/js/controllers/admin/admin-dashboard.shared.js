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
    empregos: 'vaga',
    onibus: 'onibus'
  });

  var TERM_MODULE_OVERRIDES = Object.freeze({
    vaga: 'oportunidades'
  });

  var MODULE_KEYWORDS = Object.freeze({
    'compra-venda': Object.freeze(['celular', 'smartphone', 'notebook', 'laptop', 'computador', 'roupa', 'movel', 'eletronico', 'venda', 'compro', 'iphone', 'tablet', 'monitor', 'cadeira', 'bicicleta', 'bike', 'fone', 'headphone', 'airpod', 'jbl', 'tv', 'geladeira', 'fogao', 'mesa', 'cama', 'colchao', 'camera', 'drone', 'video', 'game', 'calcado', 'tenis', 'maquina', 'impressora']),
    moradia: Object.freeze(['casa', 'quarto', 'republica', 'kitnet', 'apartamento', 'aluguel', 'moradia', 'dividir', 'alugar', 'imovel', 'vaga', 'hospedagem', 'room', 'flat', 'pensao', 'villaggio', 'morar', 'condominio', 'studio', 'andar']),
    caronas: Object.freeze(['carona', 'ida', 'volta', 'transporte', 'passagem', 'onibus', 'conducao', 'van', 'moto', 'buser', 'uber', '99', 'indriver', 'carpool', 'boleia']),
    eventos: Object.freeze(['evento', 'palestra', 'workshop', 'semana', 'feira', 'festival', 'show', 'apresentacao', 'cerimonia', 'congresso', 'simposio', 'seminario', 'aula', 'minicurso', 'encontro', 'reuniao', 'hackathon', 'exposicao', 'teatro', 'conpeex', 'sbpc', 'sarau', 'jornada', 'premio', 'olimpiada', 'coloquio', 'roda de conversa']),
    oportunidades: Object.freeze(['estagio', 'emprego', 'vaga', 'monitoria', 'bolsa', 'bolsista', 'freelancer', 'trainee', 'trabalho', 'oportunidade', 'job', 'contratando', 'recrutamento', 'residencia', 'pesquisa', 'iniciacao', 'seletivo', 'curriculo', 'clf', 'tutoria', 'concurso', 'edital', 'plantao', 'extensao']),
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
    'admin_actions_count',
    'saves_count',
    'reports_count',
    'signups_count',
    'post_views_count',
    'comment_likes_count',
    'sessions_count',
    'ad_clicks_count',
    'ad_impressions_count'
  ]);

  /* Somente grandezas aditivas entram no "pulso". Sessões são usuários
     distintos sobre eventos já contados e impressões são exposição, não ação. */
  var PULSE_SUMMARY_KEYS = Object.freeze(SERIES_KEYS.filter(function (key) {
    return key !== 'sessions_count' && key !== 'ad_impressions_count';
  }));

  var RANKING_WINDOWS = Object.freeze({
    day: Object.freeze({ period: 'day', windowDays: 1, periodLabel: 'Últimas 24 horas (janela móvel)' }),
    week: Object.freeze({ period: 'week', windowDays: 7, periodLabel: 'Últimos 7 dias corridos (janela móvel)' }),
    month: Object.freeze({ period: 'month', windowDays: 30, periodLabel: 'Últimos 30 dias corridos (janela móvel)' }),
    quarter: Object.freeze({ period: 'quarter', windowDays: 90, periodLabel: 'Últimos 90 dias corridos (janela móvel)' }),
    year: Object.freeze({ period: 'year', windowDays: 365, periodLabel: 'Últimos 365 dias corridos (janela móvel)' })
  });

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
    return normalized;
  }

  function classifyTermToModule(term, constants) {
    var normalized = canonicalizeTerm(term);
    if (!normalized) return null;
    if (TERM_MODULE_OVERRIDES[normalized]) return TERM_MODULE_OVERRIDES[normalized];

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

  // Confiança mínima para confiar na classificação por conteúdo (servidor);
  // abaixo disso, o dicionário curado tende a ser mais correto.
  var MODULE_CONFIDENCE_THRESHOLD = 0.5;

  // Resolve o módulo de um termo de tendência priorizando:
  // 1) o módulo do servidor (conteúdo dos posts) quando a confiança é boa;
  // 2) o dicionário de palavras-chave (reserva curada);
  // 3) o módulo do servidor de baixa confiança como último recurso.
  function resolveTermModule(item, constants) {
    var serverModule = item && item.module ? String(item.module) : null;
    var confidence = item ? Number(item.module_confidence) : 0;
    if (serverModule && confidence >= MODULE_CONFIDENCE_THRESHOLD) return serverModule;
    var keywordModule = classifyTermToModule(item && item.term, constants);
    if (keywordModule) return keywordModule;
    return serverModule || null;
  }

  function aggregateTrendsByModule(trends, constants) {
    var grouped = {};

    (trends || []).forEach(function (item) {
      var moduleKey = resolveTermModule(item, constants);
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
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      var values = {};
      parts.forEach(function (part) {
        if (part.type !== 'literal') values[part.type] = part.value;
      });
      if (values.year && values.month && values.day) {
        return values.year + '-' + values.month + '-' + values.day;
      }
    } catch (_) { }
    return date.toISOString().slice(0, 10);
  }

  function getComparablePreviousSince(since, until) {
    var sinceMs = new Date(since).getTime();
    var untilMs = new Date(until).getTime();
    if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || untilMs <= sinceMs) {
      return null;
    }
    return new Date(sinceMs - (untilMs - sinceMs)).toISOString();
  }

  function getRankingWindowContext(selectedDays) {
    var days = Math.max(1, Number(selectedDays) || 30);
    var period = days <= 1
      ? 'day'
      : days <= 7
        ? 'week'
        : days <= 30
          ? 'month'
          : days <= 90
            ? 'quarter'
            : 'year';
    var windowMeta = RANKING_WINDOWS[period] || RANKING_WINDOWS.month;
    return {
      period: windowMeta.period,
      periodDays: windowMeta.windowDays,
      selectedPeriodDays: days,
      windowDays: windowMeta.windowDays,
      windowType: 'rolling',
      periodLabel: windowMeta.periodLabel
    };
  }

  function toAggregateDayKey(value) {
    if (typeof value === 'string') {
      var match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
      if (match) return match[1];
    }
    return toDayKey(value);
  }

  function formatDayLabel(dayKey) {
    if (!dayKey) return '';
    var date = new Date(dayKey + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return dayKey;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function createDailyBuckets(since, until) {
    var startKey = toAggregateDayKey(since || new Date());
    var endKey = toAggregateDayKey(until || new Date());
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
        saves_count: 0,
        reports_count: 0,
        signups_count: 0,
        post_views_count: 0,
        comment_likes_count: 0,
        sessions_count: 0,
        ad_clicks_count: 0,
        ad_impressions_count: 0,
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
      var dayKey = toAggregateDayKey(row && row.day);
      if (!dayKey) return;
      if (!bucketMap[dayKey]) return;

      var bucket = bucketMap[dayKey];
      SERIES_KEYS.forEach(function (key) {
        bucket[key] = Number(row && row[key]) || 0;
      });
      bucket.total_count = PULSE_SUMMARY_KEYS.reduce(function (sum, key) {
        return sum + (Number(bucket[key]) || 0);
      }, 0);
    });

    return Object.keys(bucketMap).sort().map(function (dayKey) {
      var bucket = bucketMap[dayKey];
      bucket.total_count = PULSE_SUMMARY_KEYS.reduce(function (sum, key) {
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
    incrementRows(eventSets && eventSets.saves, 'saves_count');
    incrementRows(eventSets && eventSets.reports, 'reports_count');
    incrementRows(eventSets && eventSets.signups, 'signups_count');
    incrementRows(eventSets && eventSets.post_views, 'post_views_count');
    incrementRows(eventSets && eventSets.comment_likes, 'comment_likes_count');
    incrementRows(eventSets && eventSets.sessions, 'sessions_count');
    incrementRows(eventSets && eventSets.ad_clicks, 'ad_clicks_count');
    incrementRows(eventSets && eventSets.ad_impressions, 'ad_impressions_count');

    return Object.keys(bucketMap).sort().map(function (dayKey) {
      var bucket = bucketMap[dayKey];
      bucket.total_count = PULSE_SUMMARY_KEYS.reduce(function (sum, key) {
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
        lastDayTotal: 0,
        worstDay: null,
        worstTotal: 0,
        activeDays: 0,
        totalDays: 0,
        momentumPct: null,
        momentumDir: 'flat'
      };
    }

    var totals = {};
    SERIES_KEYS.forEach(function (key) {
      totals[key] = rows.reduce(function (sum, row) {
        return sum + (Number(row[key]) || 0);
      }, 0);
    });

    var peakDay = rows[0];
    var worstDay = rows[0];
    var activeDays = 0;
    rows.forEach(function (row) {
      var total = Number(row.total_count) || 0;
      if (total > (Number(peakDay.total_count) || 0)) peakDay = row;
      if (total < (Number(worstDay.total_count) || 0)) worstDay = row;
      if (total > 0) activeDays += 1;
    });

    var totalAll = rows.reduce(function (sum, row) {
      return sum + (Number(row.total_count) || 0);
    }, 0);

    // Momentum: soma da segunda metade do período vs. a primeira metade
    // (dia central ignorado em séries ímpares para não enviesar a comparação).
    var mid = Math.floor(rows.length / 2);
    var firstHalf = 0;
    var secondHalf = 0;
    rows.forEach(function (row, index) {
      var total = Number(row.total_count) || 0;
      if (index < mid) firstHalf += total;
      else if (rows.length % 2 === 1 && index === mid) { /* dia central: ignora */ }
      else secondHalf += total;
    });
    var momentumPct = null;
    var momentumDir = 'flat';
    if (mid > 0 && firstHalf > 0) {
      momentumPct = Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
      momentumDir = momentumPct > 0 ? 'up' : (momentumPct < 0 ? 'down' : 'flat');
    } else if (mid > 0 && firstHalf === 0 && secondHalf > 0) {
      momentumPct = 100;
      momentumDir = 'up';
    }

    return {
      totals: totals,
      peakDay: peakDay,
      peakTotal: Number(peakDay.total_count) || 0,
      averageTotal: rows.length ? Math.round((totalAll / rows.length) * 10) / 10 : 0,
      lastDayTotal: Number(rows[rows.length - 1].total_count) || 0,
      worstDay: worstDay,
      worstTotal: Number(worstDay.total_count) || 0,
      activeDays: activeDays,
      totalDays: rows.length,
      momentumPct: momentumPct,
      momentumDir: momentumDir
    };
  }

  function buildOperationalAlerts(snapshot) {
    var data = snapshot || {};
    var alerts = [];

    var openReports = Number(data.openReports || 0);
    var hiddenPosts = Number(data.hiddenPosts || 0);
    var deletedPosts = Number(data.deletedPosts || 0);
    var searches = Number(data.searches || 0);
    var periodDays = Math.max(1, Number(data.periodDays || 30));
    var searchesPerDay = searches / periodDays;
    var auditAvailable = data.auditAvailable !== false
      && data.auditEvents !== null
      && typeof data.auditEvents !== 'undefined'
      && Number.isFinite(Number(data.auditEvents));
    var auditEvents = auditAvailable ? Number(data.auditEvents) : null;
    var peakTotal = Number(data.peakTotal || 0);
    var ads = data.ads && typeof data.ads === 'object' ? data.ads : {};
    var adMetrics = ads.metrics || {};
    var adSettings = ads.settings || {};
    var adCampaigns = ads.campaigns || {};
    var adClicksKnown = adMetrics.clicks !== null && typeof adMetrics.clicks !== 'undefined' && Number.isFinite(Number(adMetrics.clicks));
    var adImpressionsKnown = adMetrics.impressions !== null && typeof adMetrics.impressions !== 'undefined' && Number.isFinite(Number(adMetrics.impressions));
    var activeCampaignsKnown = adCampaigns.active !== null && typeof adCampaigns.active !== 'undefined' && Number.isFinite(Number(adCampaigns.active));
    var activeWithoutImpressionsKnown = ads.active_without_impressions !== null && typeof ads.active_without_impressions !== 'undefined' && Number.isFinite(Number(ads.active_without_impressions));
    var expiredActiveKnown = ads.expired_active !== null && typeof ads.expired_active !== 'undefined' && Number.isFinite(Number(ads.expired_active));

    if (!auditAvailable) {
      alerts.push({
        tone: 'warning',
        title: 'Auditoria indisponível',
        body: 'O audit log não respondeu neste carregamento; não interprete a ausência de linhas como zero eventos.'
      });
    }
    var adClicks = adClicksKnown ? Number(adMetrics.clicks) : null;
    var adImpressions = adImpressionsKnown ? Number(adMetrics.impressions) : null;
    var activeCampaigns = activeCampaignsKnown ? Number(adCampaigns.active) : null;
    var activeWithoutImpressions = activeWithoutImpressionsKnown ? Number(ads.active_without_impressions) : null;
    var expiredActive = expiredActiveKnown ? Number(ads.expired_active) : null;

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
        title: 'Volume moderativo no período',
        body: hiddenPosts + ' post(s) ocultos e ' + deletedPosts + ' deletado(s) foram atualizados no recorte.'
      });
    }

    if (searches >= 10 && searchesPerDay >= 1) {
      alerts.push({
        tone: 'info',
        title: 'Demanda de busca ativa',
        body: searches + ' buscas foram registradas, média de ' + (Math.round(searchesPerDay * 10) / 10) + ' por dia.'
      });
    }

    if (peakTotal >= 8) {
      alerts.push({
        tone: 'positive',
        title: 'Pico operacional identificado',
        body: 'O maior pulso diário somou ' + peakTotal + ' eventos consolidados.'
      });
    }

    if (activeCampaignsKnown && adImpressionsKnown && activeWithoutImpressionsKnown &&
        activeCampaigns > 0 && adImpressions === 0 && activeWithoutImpressions === 0) {
      alerts.push({
        tone: 'warning',
        title: 'Campanhas sem entrega',
        body: activeCampaigns + ' campanha(s) ativa(s) ainda não geraram impressões no período.'
      });
    }

    if (activeWithoutImpressionsKnown && activeWithoutImpressions > 0) {
      alerts.push({
        tone: 'warning',
        title: 'Publicidade precisa de revisão',
        body: activeWithoutImpressions + ' campanha(s) ativa(s) estão sem impressão registrada no período.'
      });
    }

    if (expiredActiveKnown && expiredActive > 0) {
      alerts.push({
        tone: 'warning',
        title: 'Campanha expirada ainda ativa',
        body: expiredActive + ' campanha(s) passaram da data final e continuam marcadas como ativas.'
      });
    }

    if (adSettings.status === 'active' && adSettings.auto_ads_enabled) {
      alerts.push({
        tone: 'info',
        title: 'AdSense Auto ads requer exclusões',
        body: 'Se Auto ads estiver ativo no AdSense, mantenha exclusões para produto, admin e páginas privadas.'
      });
    }

    if (adClicksKnown && adClicks > 0) {
      alerts.push({
        tone: 'positive',
        title: 'Publicidade com cliques',
        body: adClicks + ' clique(s) em anúncios foram registrados no período.'
      });
    }

    if (periodDays > 183) {
      alerts.push({
        tone: 'info',
        title: 'Cobertura anual de analytics',
        body: 'Buscas, visualizações e eventos opcionais têm retenção declarada de até 6 meses; as demais métricas usam os 365 dias selecionados.'
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
    PULSE_SUMMARY_KEYS: PULSE_SUMMARY_KEYS,
    TERM_SYNONYMS: TERM_SYNONYMS,
    aggregateTrendsByModule: aggregateTrendsByModule,
    buildActivityPulseSummary: buildActivityPulseSummary,
    buildDailyMetricsFromEventSets: buildDailyMetricsFromEventSets,
    buildDailyMetricsSeries: buildDailyMetricsSeries,
    buildModuleShareRows: buildModuleShareRows,
    buildOperationalAlerts: buildOperationalAlerts,
    canonicalizeTerm: canonicalizeTerm,
    classifyTermToModule: classifyTermToModule,
    resolveTermModule: resolveTermModule,
    createDailyBuckets: createDailyBuckets,
    formatDayLabel: formatDayLabel,
    getComparablePreviousSince: getComparablePreviousSince,
    getRankingWindowContext: getRankingWindowContext,
    normalizeText: normalizeText,
    toDayKey: toDayKey
  };
});
