/**
 * @file admin-dashboard.metrics.js
 * @description Sub-modulo de metrics/loaders do dashboard admin (v12.3.1)
 * Extraido de admin-dashboard.controller.js. Registra window._KCAD.metrics.
 *
 * Dependencias em runtime:
 *   - window._KCAD                - namespace base do split
 *   - window.KCAdminDashboardUtils - helpers compartilhados de tendencias/series
 *   - window.KCAPI                - getCurrentUser()
 *   - window.KCSupabase           - getClient()
 *   - window.KC_CONSTANTS         - CATEGORY_LABELS para classificacao
 */

(function () {
  'use strict';

  window._KCAD = window._KCAD || {};
  var SEARCH_TRENDS_MAX_ROWS = 100;

  function markMetricAvailability(key, available, source) {
    window._KCAD.__adminMetricsDiagnostics = window._KCAD.__adminMetricsDiagnostics || {};
    window._KCAD.__adminMetricsDiagnostics[key] = {
      available: available === true,
      source: source || (available ? 'query' : 'unavailable')
    };
  }

  function tagRowsAvailability(rows, available, source) {
    var list = Array.isArray(rows) ? rows : [];
    try {
      Object.defineProperties(list, {
        __kcAvailable: { value: available === true, enumerable: false, configurable: true },
        __kcSource: { value: source || '', enumerable: false, configurable: true }
      });
    } catch (_) { }
    return list;
  }

  function getDashboardUtils() {
    return window.KCAdminDashboardUtils || {};
  }

  function getConstants() {
    return window.KC_CONSTANTS || {};
  }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      return window.KCSupabase.getClient();
    }
    return null;
  }

  function isPermissionError(error) {
    if (!error) return false;
    var message = String(error.message || error.details || error.hint || '').toLowerCase();
    return message.includes('permission') || message.includes('row-level security') || message.includes('rls');
  }

  function isFunctionMissing(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var message = String(error.message || error.details || error.hint || '').toLowerCase();
    return code === '42883' || (message.includes('function') && message.includes('does not exist'));
  }

  function isFunctionAmbiguityError(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var message = String(error.message || error.hint || '').toLowerCase();
    return code === '42725' || message.includes('is not unique') || message.includes('ambiguous');
  }

  function createAbortError() {
    var error = new Error('Dashboard refresh aborted.');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
  }

  function canonicalizeTerm(term) {
    var utils = getDashboardUtils();
    if (typeof utils.canonicalizeTerm === 'function') {
      return utils.canonicalizeTerm(term);
    }

    var normalized = String(term || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!normalized) return '';
    var synonyms = getDashboardUtils().TERM_SYNONYMS || {};
    return synonyms[normalized] || normalized;
  }

  function classifyTermToModule(term) {
    var utils = getDashboardUtils();
    if (typeof utils.classifyTermToModule === 'function') {
      return utils.classifyTermToModule(term, getConstants());
    }
    return null;
  }

  function buildTrendsFromRows(rows) {
    var frequency = {};
    (rows || []).forEach(function (row) {
      var canonical = canonicalizeTerm(row && row.term);
      if (canonical) frequency[canonical] = (frequency[canonical] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, SEARCH_TRENDS_MAX_ROWS)
      .map(function (entry) {
        return { term: entry[0], count: entry[1] };
      });
  }

  function canonicalizeTrendsList(list) {
    var frequency = {};
    (list || []).forEach(function (item) {
      var canonical = canonicalizeTerm(item && item.term);
      if (canonical) {
        frequency[canonical] = (frequency[canonical] || 0) + (Number(item && item.count) || 1);
      }
    });

    return Object.entries(frequency)
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, SEARCH_TRENDS_MAX_ROWS)
      .map(function (entry) {
        return { term: entry[0], count: entry[1] };
      });
  }

  // Como canonicalizeTrendsList, mas preserva o módulo classificado pelo servidor
  // (mantendo o módulo da variante de maior contagem ao fundir sinônimos/plural).
  function canonicalizeClassifiedTrends(list) {
    var byTerm = {};
    (list || []).forEach(function (item) {
      var canonical = canonicalizeTerm(item && item.term);
      if (!canonical) return;
      var count = Number(item && item.count) || 1;
      if (!byTerm[canonical]) {
        byTerm[canonical] = { term: canonical, count: 0, module: null, module_confidence: 0, _topCount: -1 };
      }
      var agg = byTerm[canonical];
      agg.count += count;
      if (item && item.module && count > agg._topCount) {
        agg._topCount = count;
        agg.module = String(item.module);
        agg.module_confidence = Number(item.module_confidence) || 0;
      }
    });
    return Object.keys(byTerm)
      .map(function (k) { return byTerm[k]; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, SEARCH_TRENDS_MAX_ROWS)
      .map(function (e) {
        return { term: e.term, count: e.count, module: e.module, module_confidence: e.module_confidence };
      });
  }

  function minutesAgo(minutes) {
    var date = new Date();
    date.setMinutes(date.getMinutes() - (Number(minutes) || 15));
    return date.toISOString();
  }

  function distinctSessionCount(rows) {
    var sessions = new Set();
    (rows || []).forEach(function (row) {
      var sessionId = row && (row.session_hash || row.session_id || row.session);
      if (sessionId) {
        sessions.add('session:' + String(sessionId));
        return;
      }
      var userId = row && (row.user_id || row.userId);
      if (userId) sessions.add('user:' + String(userId));
    });
    return sessions.size;
  }

  async function checkAccess() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') {
      return { ok: false, message: 'Sessao administrativa indisponivel.' };
    }

    try {
      var user = await window.KCAPI.getCurrentUser();
      if (!user) return { ok: false, message: 'Faca login para acessar o dashboard administrativo.' };

      var client = getClient();
      if (!client) return { ok: false, message: 'Supabase client nao disponivel.' };

      var profileResult = await client
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (profileResult && profileResult.error) {
        return { ok: false, message: 'Nao foi possivel validar o acesso administrativo.' };
      }
      if (!profileResult || !profileResult.data || !profileResult.data.is_admin) {
        return { ok: false, message: 'Acesso restrito a administradores.' };
      }

      return { ok: true };
    } catch (_) {
      return { ok: false, message: 'Nao foi possivel validar o acesso administrativo.' };
    }
  }

  async function loadReportMetrics(client, since) {
    try {
      var rpc = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 2000 });
      if (!rpc.error && Array.isArray(rpc.data)) {
        var allRows = rpc.data;
        var rows = allRows;
        var sinceMs = since ? new Date(since).getTime() : 0;
        if (sinceMs) {
          rows = rows.filter(function (row) {
            return row.created_at && new Date(row.created_at).getTime() >= sinceMs;
          });
        }

        markMetricAvailability('reports', true, 'rpc');
        return {
          open: allRows.filter(function (row) { return String(row.status || '').toLowerCase() === 'open'; }).length,
          total: rows.length
        };
      }
    } catch (_) { }

    try {
      var openQuery = client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
      var totalQuery = client.from('reports').select('id', { count: 'exact', head: true });
      if (since) {
        totalQuery = totalQuery.gte('created_at', since);
      }

      var results = await Promise.all([openQuery, totalQuery]);
      if (!results[0].error && !results[1].error &&
          typeof results[0].count === 'number' && typeof results[1].count === 'number') {
        markMetricAvailability('reports', true, 'direct');
        return { open: results[0].count, total: results[1].count };
      }
    } catch (_) { }

    markMetricAvailability('reports', false);
    return { open: null, total: null };
  }

  async function loadPostStatusMetrics(client, since) {
    var hidden = 0;
    var deleted = 0;

    try {
      var hiddenQuery = client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden');
      var deletedQuery = client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted');
      if (since) {
        hiddenQuery = hiddenQuery.gte('updated_at', since);
        deletedQuery = deletedQuery.gte('updated_at', since);
      }

      var results = await Promise.all([hiddenQuery, deletedQuery]);
      var hiddenResult = results[0];
      var deletedResult = results[1];

      if ((hiddenResult.error || deletedResult.error) &&
          (isPermissionError(hiddenResult.error) || isPermissionError(deletedResult.error))) {
        var fallbackQuery = client.from('posts').select('status, updated_at', { count: 'exact' }).in('status', ['hidden', 'deleted']).limit(2000);
        if (since) fallbackQuery = fallbackQuery.gte('updated_at', since);
        var fallback = await fallbackQuery;
        if (!fallback.error && Array.isArray(fallback.data) &&
            typeof fallback.count === 'number' && fallback.count === fallback.data.length) {
          markMetricAvailability('postStatus', true, 'fallback_rows');
          return {
            hidden: fallback.data.filter(function (row) { return row.status === 'hidden'; }).length,
            deleted: fallback.data.filter(function (row) { return row.status === 'deleted'; }).length
          };
        }
      }

      if (!hiddenResult.error && !deletedResult.error &&
          typeof hiddenResult.count === 'number' && typeof deletedResult.count === 'number') {
        hidden = hiddenResult.count;
        deleted = deletedResult.count;
        markMetricAvailability('postStatus', true, 'direct');
        return { hidden: hidden, deleted: deleted };
      }
    } catch (_) { }

    markMetricAvailability('postStatus', false);
    return { hidden: null, deleted: null };
  }

  async function loadPostsCreated(client, since) {
    try {
      var result = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('postsCreated', true, 'count');
        return result.count;
      }

      var fallback = await client.from('posts').select('id', { count: 'exact' }).gte('created_at', since).limit(2000);
      if (!fallback.error && typeof fallback.count === 'number') {
        markMetricAvailability('postsCreated', true, 'fallback_exact_count');
        return fallback.count;
      }
    } catch (_) { }

    markMetricAvailability('postsCreated', false);
    return null;
  }

  async function loadPostsEdited(client, since) {
    try {
      var result = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since)
        .lt('created_at', since);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('postsUpdated', true, 'count');
        return result.count;
      }

      var fallback = await client.from('posts')
        .select('id', { count: 'exact' })
        .gte('updated_at', since)
        .lt('created_at', since)
        .limit(2000);
      if (!fallback.error && typeof fallback.count === 'number') {
        markMetricAvailability('postsUpdated', true, 'fallback_exact_count');
        return fallback.count;
      }
    } catch (_) { }

    markMetricAvailability('postsUpdated', false);
    return null;
  }

  async function loadCommentsCount(client, since) {
    try {
      var result = await client.from('comments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('comments', true, 'count');
        return result.count;
      }

      var fallback = await client.from('comments').select('id', { count: 'exact' }).gte('created_at', since).limit(5000);
      if (!fallback.error && typeof fallback.count === 'number') {
        markMetricAvailability('comments', true, 'fallback_exact_count');
        return fallback.count;
      }
    } catch (_) { }

    markMetricAvailability('comments', false);
    return null;
  }

  async function loadSearchCount(client, since) {
    try {
      var result = await client.from('search_queries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('searches', true, 'count');
        return result.count;
      }

      var fallback = await client.from('search_queries').select('created_at', { count: 'exact' }).gte('created_at', since).limit(5000);
      if (!fallback.error && typeof fallback.count === 'number') {
        markMetricAvailability('searches', true, 'fallback_exact_count');
        return fallback.count;
      }
    } catch (_) { }

    markMetricAvailability('searches', false);
    return null;
  }

  async function loadPostsTotal(client) {
    try {
      var result = await client.from('posts').select('id', { count: 'exact', head: true });
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('postsTotal', true, 'count');
        return result.count;
      }
    } catch (_) { }

    markMetricAvailability('postsTotal', false);
    return null;
  }

  async function loadVisiblePostsCount(client) {
    try {
      var result = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .in('status', ['published', 'closed']);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('visiblePosts', true, 'count');
        return result.count;
      }

      var fallback = await client.from('posts')
        .select('id,status', { count: 'exact' })
        .in('status', ['published', 'closed'])
        .limit(5000);
      if (!fallback.error && typeof fallback.count === 'number') {
        markMetricAvailability('visiblePosts', true, 'fallback_exact_count');
        return fallback.count;
      }
    } catch (_) { }

    markMetricAvailability('visiblePosts', false);
    return null;
  }

  async function loadUsersTotal(client) {
    try {
      var result = await client.from('profiles').select('id', { count: 'exact', head: true });
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('usersTotal', true, 'count');
        return result.count;
      }
    } catch (_) { }

    markMetricAvailability('usersTotal', false);
    return null;
  }

  async function loadUsersNew(client, since) {
    try {
      var result = await client.from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('usersNew', true, 'count');
        return result.count;
      }
    } catch (_) { }

    markMetricAvailability('usersNew', false);
    return null;
  }

  async function loadVotesCount(client, since) {
    try {
      var result = await client.from('post_votes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('votes', true, 'count');
        return result.count;
      }
    } catch (_) { }

    markMetricAvailability('votes', false);
    return null;
  }

  async function loadSavedPostsCount(client, since) {
    try {
      var query = client.from('saved_posts').select('id', { count: 'exact', head: true });
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error && typeof result.count === 'number') {
        markMetricAvailability('saves', true, 'count');
        return result.count;
      }
    } catch (_) { }

    markMetricAvailability('saves', false);
    return null;
  }

  async function loadActiveSessions15m(client) {
    var since = minutesAgo(15);
    var unavailable = {
      value: null,
      available: false,
      source: 'unavailable',
      label: 'Indisponivel',
      note: 'Sem telemetria agregada disponivel nos ultimos 15 minutos.',
      since: since
    };

    try {
      var rpc = await client.rpc('kc_admin_privacy_analytics', {
        p_since: since,
        p_event_name: 'all',
        p_page_path: 'all',
        p_module_key: 'all',
        p_limit: 1,
        p_offset: 0
      });
      if (!rpc.error && rpc.data && rpc.data.ok !== false && rpc.data.totals) {
        var rpcSessionCount = numberOrNull(rpc.data.totals.sessions);
        if (rpcSessionCount === null || rpcSessionCount < 0) throw new Error('invalid_session_total');
        return {
          value: rpcSessionCount,
          available: true,
          source: 'privacy_rpc',
          label: 'RPC',
          note: 'Identificadores de atividade agregados nos últimos 15 minutos.',
          since: since
        };
      }
    } catch (_) { }

    try {
      var direct = await client.from('privacy_analytics_events')
        .select('id,session_hash,user_id,created_at', { count: 'exact' })
        .gte('created_at', since)
        .limit(5000);
      if (!direct.error && Array.isArray(direct.data) &&
          typeof direct.count === 'number' && direct.count === direct.data.length) {
        return {
          value: distinctSessionCount(direct.data),
          available: true,
          source: 'privacy_table',
          label: 'Tabela',
          note: 'Fallback completo por privacy_analytics_events.',
          since: since
        };
      }
    } catch (_) { }

    try {
      var legacy = await Promise.all([
        client.from('search_queries')
          .select('id,session_id,user_id,created_at', { count: 'exact' })
          .gte('created_at', since)
          .limit(2500),
        client.from('post_view_events')
          .select('id,session_id,user_id,created_at', { count: 'exact' })
          .gte('created_at', since)
          .limit(2500)
      ]);
      var rows = [];
      var searchesAvailable = !!(legacy[0] && !legacy[0].error && Array.isArray(legacy[0].data) &&
        typeof legacy[0].count === 'number' && legacy[0].count === legacy[0].data.length);
      var viewsAvailable = !!(legacy[1] && !legacy[1].error && Array.isArray(legacy[1].data) &&
        typeof legacy[1].count === 'number' && legacy[1].count === legacy[1].data.length);
      if (searchesAvailable) rows = rows.concat(legacy[0].data);
      if (viewsAvailable) rows = rows.concat(legacy[1].data);
      if (searchesAvailable && viewsAvailable) {
        return {
          value: distinctSessionCount(rows),
          available: true,
          source: 'legacy_events',
          label: 'Fallback',
          note: 'Identificadores agregados por buscas e views recentes.',
          since: since
        };
      }
    } catch (_) { }

    return unavailable;
  }

  async function loadAuditEventRows(client, since) {
    try {
      var query = client.from('audit_log')
        .select('created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(1500);
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error && Array.isArray(result.data) &&
          typeof result.count === 'number' && result.count === result.data.length) {
        return tagRowsAvailability(result.data, true, 'audit_table');
      }
    } catch (_) { }

    try {
      var rpc = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: 'all',
        p_actor_query: null,
        p_limit: 1500,
        p_offset: 0,
        p_since: since || null
      });
      // A RPC limita cada resposta a 500 linhas. Só uma página menor que o
      // limite prova que o período foi carregado por inteiro.
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length < 500) {
        return tagRowsAvailability(rpc.data.map(function (row) {
          return { created_at: row.created_at };
        }), true, 'audit_rpc');
      }
    } catch (_) { }

    try {
      var legacy = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: 'all',
        p_actor_query: null,
        p_limit: 1500
      });
      if (!legacy.error && Array.isArray(legacy.data) && legacy.data.length < 500) {
        var sinceMs = since ? new Date(since).getTime() : 0;
        return tagRowsAvailability(legacy.data.filter(function (row) {
          return !sinceMs || (row.created_at && new Date(row.created_at).getTime() >= sinceMs);
        }).map(function (row) {
          return { created_at: row.created_at };
        }), true, 'audit_legacy_rpc');
      }
    } catch (_) { }

    return tagRowsAvailability([], false, 'unavailable');
  }

  async function loadSearchTrendsData(client, since) {
    var trends = [];
    var hadSuccessfulSource = false;

    // Caminho preferido: RPC classificado (termo → módulo pelo conteúdo dos posts).
    try {
      var clsArgs = { p_limit: 100 };
      if (since) clsArgs.p_since = since;
      var clsResult = await Promise.race([
        client.rpc('kc_admin_search_trends_classified', clsArgs),
        new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 8000); })
      ]);
      if (clsResult && !clsResult.error && Array.isArray(clsResult.data)) {
        hadSuccessfulSource = true;
        if (clsResult.data.length > 0) {
          markMetricAvailability('trends', true, 'classified_rpc');
          return canonicalizeClassifiedTrends(clsResult.data);
        }
      }
    } catch (clsError) {
      console.warn('[Admin trends] RPC classificado indisponível, usando legado:', clsError && clsError.message);
    }

    try {
      var rpcArgs = { p_limit: 100 };
      if (since) rpcArgs.p_since = since;

      var rpcPromise = client.rpc('kc_admin_search_trends', rpcArgs);
      var timeoutPromise = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, 8000);
      });

      var result;
      try {
        result = await Promise.race([rpcPromise, timeoutPromise]);
      } catch (rpcError) {
        console.warn('[Admin trends] RPC falhou ou timeout:', rpcError && rpcError.message);
        result = { error: rpcError };
      }

      if (!result.error && Array.isArray(result.data)) {
        hadSuccessfulSource = true;
        if (result.data.length > 0) trends = canonicalizeTrendsList(result.data);
      } else {
        if (result.error) {
          var errorMessage = result.error.message || String(result.error);
          if (isFunctionAmbiguityError(result.error)) {
            console.warn('[Admin trends] Ambiguidade de funcao (42725) - aplique a migration v8.3.0.3 no Supabase. Usando fallback direto.');
          } else {
            console.warn('[Admin trends] RPC error:', errorMessage);
          }
        }

        var rawQuery = client.from('search_queries')
          .select('term', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(5000);
        if (since) rawQuery = rawQuery.gte('created_at', since);

        var raw = await rawQuery;
        if (!raw.error && Array.isArray(raw.data) &&
            typeof raw.count === 'number' && raw.count === raw.data.length) {
          hadSuccessfulSource = true;
          trends = buildTrendsFromRows(raw.data);
        } else if (!raw.error && Array.isArray(raw.data)) {
          console.warn('[Admin trends] Fallback direto retornou uma amostra parcial; tendências não serão estimadas.');
        } else if (raw.error) {
          console.warn('[Admin trends] Fallback direto falhou:', raw.error.message || raw.error);
          console.warn('[Admin trends] Todas as tentativas com recorte temporal falharam; dados sem período não serão exibidos.');
        }
      }
    } catch (error) {
      console.error('[Admin trends] Erro inesperado:', error);
      trends = [];
    }

    markMetricAvailability('trends', hadSuccessfulSource, hadSuccessfulSource ? 'period_scoped' : 'unavailable');
    return trends;
  }

  async function queryCreatedAtRows(client, tableName, since, limit) {
    try {
      var query = client.from(tableName)
        .select('created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit || 1500);
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error && Array.isArray(result.data) &&
          typeof result.count === 'number' && result.count === result.data.length) {
        return tagRowsAvailability(result.data, true, tableName);
      }
    } catch (_) { }

    return tagRowsAvailability([], false, tableName);
  }

  async function queryAdEventRows(client, since, eventName, limit) {
    try {
      var query = client.from('privacy_analytics_events')
        .select('created_at,event_name,entity_id', { count: 'exact' })
        .eq('entity_type', 'ad_campaign')
        .eq('event_name', eventName)
        .order('created_at', { ascending: false })
        .limit(limit || 2000);
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error && Array.isArray(result.data) &&
          typeof result.count === 'number' && result.count === result.data.length) {
        return tagRowsAvailability(result.data, true, 'ad_events');
      }
    } catch (_) { }

    return tagRowsAvailability([], false, 'ad_events');
  }

  function numberOrNull(value) {
    if (value === null || typeof value === 'undefined' || value === '') return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function loadAdOverview(client, since) {
    var unavailable = {
      ok: false,
      available: false,
      source: 'unavailable',
      availability: {
        complete: false,
        settings: false,
        campaigns: false,
        impressions: false,
        clicks: false,
        metrics: false
      },
      settings: { status: null, provider: null, auto_ads_enabled: null },
      campaigns: { total: null, active: null, paused: null, draft: null, archived: null },
      metrics: { impressions: null, clicks: null, ctr: null },
      active_without_impressions: null,
      expired_active: null
    };
    if (!client) {
      markMetricAvailability('ads', false, 'no_client');
      return unavailable;
    }

    try {
      var rpc = await client.rpc('kc_admin_ads_overview', { p_since: since || null });
      if (!rpc.error && rpc.data && rpc.data.ok !== false) {
        var next = Object.assign({}, unavailable, rpc.data, {
          ok: true,
          available: true,
          source: 'rpc',
          availability: {
            complete: true,
            settings: true,
            campaigns: true,
            impressions: true,
            clicks: true,
            metrics: true
          }
        });
        next.settings = Object.assign({}, unavailable.settings, rpc.data.settings || {});
        next.campaigns = Object.assign({}, unavailable.campaigns, rpc.data.campaigns || {});
        next.metrics = Object.assign({}, unavailable.metrics, rpc.data.metrics || {});
        ['total', 'active', 'paused', 'draft', 'archived'].forEach(function (key) {
          next.campaigns[key] = numberOrNull(next.campaigns[key]);
        });
        ['impressions', 'clicks', 'ctr'].forEach(function (key) {
          next.metrics[key] = numberOrNull(next.metrics[key]);
        });
        var activeWithoutImpressions = rpc.data.active_without_impressions;
        if (activeWithoutImpressions === null || typeof activeWithoutImpressions === 'undefined') {
          activeWithoutImpressions = next.campaigns.active_without_impressions;
        }
        var expiredActive = rpc.data.expired_active;
        if (expiredActive === null || typeof expiredActive === 'undefined') {
          expiredActive = next.campaigns.expired_active;
        }
        next.active_without_impressions = numberOrNull(activeWithoutImpressions);
        next.expired_active = numberOrNull(expiredActive);
        markMetricAvailability('ads', true, 'rpc');
        return next;
      }
    } catch (_) { }

    var campaigns = [];
    var campaignsAvailable = false;
    try {
      var campaignResult = await client.from('ad_campaigns')
        .select('id,status,ends_at', { count: 'exact' })
        .limit(2000);
      if (!campaignResult.error && Array.isArray(campaignResult.data) &&
          typeof campaignResult.count === 'number' && campaignResult.count === campaignResult.data.length) {
        campaigns = campaignResult.data;
        campaignsAvailable = true;
      }
    } catch (_) { }

    var settings = Object.assign({}, unavailable.settings);
    var settingsAvailable = false;
    try {
      var settingsRpc = await client.rpc('kc_admin_get_ad_network_settings');
      if (!settingsRpc.error && settingsRpc.data && settingsRpc.data.ok !== false && settingsRpc.data.settings) {
        settings = Object.assign({}, unavailable.settings, settingsRpc.data.settings);
        settingsAvailable = true;
      }
    } catch (_) { }

    var impressions = await queryAdEventRows(client, since, 'ad_impression', 5000);
    var clicks = await queryAdEventRows(client, since, 'ad_click', 5000);
    var impressionsAvailable = impressions.__kcAvailable === true;
    var clicksAvailable = clicks.__kcAvailable === true;
    var impressionIds = new Set(impressions.map(function (row) { return String(row && row.entity_id || ''); }).filter(Boolean));
    var counts = campaignsAvailable
      ? campaigns.reduce(function (acc, row) {
          var status = String(row && row.status || 'draft');
          acc.total += 1;
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, { total: 0, active: 0, paused: 0, draft: 0, archived: 0 })
      : Object.assign({}, unavailable.campaigns);
    var now = Date.now();
    var activeWithoutImpressions = campaignsAvailable && impressionsAvailable
      ? campaigns.filter(function (row) {
          return row && row.status === 'active' && !impressionIds.has(String(row.id || ''));
        }).length
      : null;
    var expiredActive = campaignsAvailable
      ? campaigns.filter(function (row) {
          return row && row.status === 'active' && row.ends_at && new Date(row.ends_at).getTime() < now;
        }).length
      : null;
    var metricsAvailable = impressionsAvailable && clicksAvailable;
    var complete = settingsAvailable && campaignsAvailable && metricsAvailable;
    var anyAvailable = settingsAvailable || campaignsAvailable || impressionsAvailable || clicksAvailable;
    var source = complete ? 'fallback' : (anyAvailable ? 'partial' : 'unavailable');
    var availability = {
      complete: complete,
      settings: settingsAvailable,
      campaigns: campaignsAvailable,
      impressions: impressionsAvailable,
      clicks: clicksAvailable,
      metrics: metricsAvailable
    };
    markMetricAvailability('ads', complete, source);
    return {
      ok: complete,
      available: complete,
      source: source,
      availability: availability,
      settings: settings,
      campaigns: counts,
      metrics: {
        impressions: impressionsAvailable ? impressions.length : null,
        clicks: clicksAvailable ? clicks.length : null,
        ctr: metricsAvailable
          ? (impressions.length ? Math.round((clicks.length / impressions.length) * 10000) / 100 : 0)
          : null,
      },
      active_without_impressions: activeWithoutImpressions,
      expired_active: expiredActive,
    };
  }

  async function loadDailyMetrics(client, since, signal) {
    var utils = getDashboardUtils();
    var until = new Date().toISOString();

    try {
      var rpc = await client.rpc('kc_admin_dashboard_daily_metrics', {
        p_since: since || null
      });
      if (!rpc.error && Array.isArray(rpc.data)) {
        markMetricAvailability('dailyMetrics', true, 'rpc');
        if (typeof utils.buildDailyMetricsSeries === 'function') {
          return utils.buildDailyMetricsSeries(rpc.data, since, until);
        }
        return rpc.data;
      }
      if (rpc.error && !(isFunctionMissing(rpc.error) || isFunctionAmbiguityError(rpc.error))) {
        console.warn('[Admin daily metrics] RPC failed:', rpc.error.message || rpc.error);
      }
    } catch (error) {
      console.warn('[Admin daily metrics] RPC exception:', error && error.message ? error.message : error);
    }

    var eventSets = await Promise.all([
      queryCreatedAtRows(client, 'posts', since, 1500),
      queryCreatedAtRows(client, 'comments', since, 1500),
      queryCreatedAtRows(client, 'search_queries', since, 1500),
      queryCreatedAtRows(client, 'post_votes', since, 1500),
      loadAuditEventRows(client, since),
      queryCreatedAtRows(client, 'saved_posts', since, 1500),
      queryCreatedAtRows(client, 'reports', since, 1500),
      queryCreatedAtRows(client, 'profiles', since, 1500),
      queryCreatedAtRows(client, 'post_view_events', since, 1500),
      queryCreatedAtRows(client, 'comment_likes', since, 1500),
      queryAdEventRows(client, since, 'ad_click', 1500),
      queryAdEventRows(client, since, 'ad_impression', 1500)
    ]);
    throwIfAborted(signal);

    if (eventSets.some(function (rows) { return !rows || rows.__kcAvailable !== true; })) {
      markMetricAvailability('dailyMetrics', false);
      return [];
    }

    if (typeof utils.buildDailyMetricsFromEventSets === 'function') {
      markMetricAvailability('dailyMetrics', true, 'period_scoped_fallback');
      return utils.buildDailyMetricsFromEventSets({
        posts: eventSets[0],
        comments: eventSets[1],
        searches: eventSets[2],
        votes: eventSets[3],
        admin_actions: eventSets[4],
        saves: eventSets[5],
        reports: eventSets[6],
        signups: eventSets[7],
        post_views: eventSets[8],
        comment_likes: eventSets[9],
        ad_clicks: eventSets[10],
        ad_impressions: eventSets[11]
      }, since, until);
    }

    markMetricAvailability('dailyMetrics', false);
    return [];
  }

  window._KCAD.metrics = {
    classifyTermToModule: classifyTermToModule,
    checkAccess: checkAccess,
    loadReportMetrics: loadReportMetrics,
    loadPostStatusMetrics: loadPostStatusMetrics,
    loadPostsCreated: loadPostsCreated,
    loadPostsEdited: loadPostsEdited,
    loadCommentsCount: loadCommentsCount,
    loadSearchCount: loadSearchCount,
    loadPostsTotal: loadPostsTotal,
    loadVisiblePostsCount: loadVisiblePostsCount,
    loadUsersTotal: loadUsersTotal,
    loadUsersNew: loadUsersNew,
    loadVotesCount: loadVotesCount,
    loadSavedPostsCount: loadSavedPostsCount,
    loadActiveSessions15m: loadActiveSessions15m,
    loadAdOverview: loadAdOverview,
    loadAuditEventRows: loadAuditEventRows,
    loadSearchTrendsData: loadSearchTrendsData,
    queryCreatedAtRows: queryCreatedAtRows,
    loadDailyMetrics: loadDailyMetrics
  };
})();
