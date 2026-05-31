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
    if (normalized.length >= 5 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
      return normalized.slice(0, -1);
    }
    return normalized;
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
      .slice(0, 10)
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
      .slice(0, 10)
      .map(function (entry) {
        return { term: entry[0], count: entry[1] };
      });
  }

  function minutesAgo(minutes) {
    var date = new Date();
    date.setMinutes(date.getMinutes() - (Number(minutes) || 15));
    return date.toISOString();
  }

  function distinctSessionCount(rows) {
    var sessions = new Set();
    (rows || []).forEach(function (row, index) {
      var id = row && (row.session_hash || row.session_id || row.session || row.id);
      sessions.add(String(id || ('row-' + index)));
    });
    return sessions.size;
  }

  async function checkAccess() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') {
      return { ok: false, message: 'Sessao administrativa indisponivel.' };
    }

    var user = await window.KCAPI.getCurrentUser();
    if (!user) return { ok: false, message: 'Faca login para acessar o dashboard administrativo.' };

    var client = getClient();
    if (!client) return { ok: false, message: 'Supabase client nao disponivel.' };

    var profileResult = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileResult.error || !profileResult.data || !profileResult.data.is_admin) {
      return { ok: false, message: 'Acesso restrito a moderadores/administradores.' };
    }

    return { ok: true };
  }

  async function loadReportMetrics(client, since) {
    try {
      var rpc = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 2000 });
      if (!rpc.error && Array.isArray(rpc.data)) {
        var rows = rpc.data;
        var sinceMs = since ? new Date(since).getTime() : 0;
        if (sinceMs) {
          rows = rows.filter(function (row) {
            return row.created_at && new Date(row.created_at).getTime() >= sinceMs;
          });
        }

        return {
          open: rows.filter(function (row) { return String(row.status || '').toLowerCase() === 'open'; }).length,
          total: rows.length
        };
      }
    } catch (_) { }

    var open = 0;
    var total = 0;
    try {
      var openQuery = client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
      var totalQuery = client.from('reports').select('id', { count: 'exact', head: true });
      if (since) {
        openQuery = openQuery.gte('created_at', since);
        totalQuery = totalQuery.gte('created_at', since);
      }

      var results = await Promise.all([openQuery, totalQuery]);
      open = results[0].count || 0;
      total = results[1].count || 0;
    } catch (_) { }

    return { open: open, total: total };
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
        var fallbackQuery = client.from('posts').select('status, updated_at').in('status', ['hidden', 'deleted']).limit(2000);
        if (since) fallbackQuery = fallbackQuery.gte('updated_at', since);
        var fallback = await fallbackQuery;
        if (!fallback.error && Array.isArray(fallback.data)) {
          return {
            hidden: fallback.data.filter(function (row) { return row.status === 'hidden'; }).length,
            deleted: fallback.data.filter(function (row) { return row.status === 'deleted'; }).length
          };
        }
      }

      hidden = hiddenResult.count || 0;
      deleted = deletedResult.count || 0;
    } catch (_) { }

    return { hidden: hidden, deleted: deleted };
  }

  async function loadPostsCreated(client, since) {
    try {
      var result = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error) return result.count || 0;

      var fallback = await client.from('posts').select('id').gte('created_at', since).limit(2000);
      if (!fallback.error && Array.isArray(fallback.data)) return fallback.data.length;
    } catch (_) { }

    return 0;
  }

  async function loadPostsEdited(client, since) {
    try {
      var result = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since)
        .lt('created_at', since);
      if (!result.error) return result.count || 0;

      var fallback = await client.from('posts')
        .select('id')
        .gte('updated_at', since)
        .lt('created_at', since)
        .limit(2000);
      if (!fallback.error && Array.isArray(fallback.data)) return fallback.data.length;
    } catch (_) { }

    return 0;
  }

  async function loadCommentsCount(client, since) {
    try {
      var result = await client.from('comments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error) return result.count || 0;

      var fallback = await client.from('comments').select('id').gte('created_at', since).limit(5000);
      if (!fallback.error && Array.isArray(fallback.data)) return fallback.data.length;
    } catch (_) { }

    return 0;
  }

  async function loadSearchCount(client, since) {
    try {
      var result = await client.from('search_queries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error) return result.count || 0;

      var fallback = await client.from('search_queries').select('created_at').gte('created_at', since).limit(5000);
      if (!fallback.error && Array.isArray(fallback.data)) return fallback.data.length;
    } catch (_) { }

    return 0;
  }

  async function loadPostsTotal(client) {
    try {
      var result = await client.from('posts').select('id', { count: 'exact', head: true });
      if (!result.error) return result.count || 0;
    } catch (_) { }

    return 0;
  }

  async function loadVisiblePostsCount(client) {
    try {
      var result = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .in('status', ['published', 'closed']);
      if (!result.error) return result.count || 0;

      var fallback = await client.from('posts')
        .select('id,status')
        .in('status', ['published', 'closed'])
        .limit(5000);
      if (!fallback.error && Array.isArray(fallback.data)) return fallback.data.length;
    } catch (_) { }

    return 0;
  }

  async function loadUsersTotal(client) {
    try {
      var result = await client.from('profiles').select('id', { count: 'exact', head: true });
      if (!result.error) return result.count || 0;
    } catch (_) { }

    return 0;
  }

  async function loadUsersNew(client, since) {
    try {
      var result = await client.from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error) return result.count || 0;
    } catch (_) { }

    return 0;
  }

  async function loadVotesCount(client, since) {
    try {
      var result = await client.from('post_votes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!result.error) return result.count || 0;
    } catch (_) { }

    return 0;
  }

  async function loadSavedPostsCount(client, since) {
    try {
      var query = client.from('saved_posts').select('id', { count: 'exact', head: true });
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error) return result.count || 0;
    } catch (_) { }

    return 0;
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
        return {
          value: Number(rpc.data.totals.sessions) || 0,
          available: true,
          source: 'privacy_rpc',
          label: 'RPC',
          note: 'Sessoes agregadas nos ultimos 15 minutos.',
          since: since
        };
      }
    } catch (_) { }

    try {
      var direct = await client.from('privacy_analytics_events')
        .select('id,session_hash,created_at')
        .gte('created_at', since)
        .limit(5000);
      if (!direct.error && Array.isArray(direct.data)) {
        return {
          value: distinctSessionCount(direct.data),
          available: true,
          source: 'privacy_table',
          label: 'Tabela',
          note: 'Fallback por privacy_analytics_events.',
          since: since
        };
      }
    } catch (_) { }

    try {
      var legacy = await Promise.all([
        client.from('search_queries')
          .select('id,session_id,created_at')
          .gte('created_at', since)
          .limit(2500),
        client.from('post_view_events')
          .select('id,session_id,created_at')
          .gte('created_at', since)
          .limit(2500)
      ]);
      var rows = [];
      if (legacy[0] && !legacy[0].error && Array.isArray(legacy[0].data)) rows = rows.concat(legacy[0].data);
      if (legacy[1] && !legacy[1].error && Array.isArray(legacy[1].data)) rows = rows.concat(legacy[1].data);
      if (rows.length || (legacy[0] && !legacy[0].error) || (legacy[1] && !legacy[1].error)) {
        return {
          value: distinctSessionCount(rows),
          available: true,
          source: 'legacy_events',
          label: 'Fallback',
          note: 'Estimativa por buscas e views recentes.',
          since: since
        };
      }
    } catch (_) { }

    return unavailable;
  }

  async function loadAuditEventRows(client, since) {
    try {
      var query = client.from('audit_log')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1500);
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error && Array.isArray(result.data)) return result.data;
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
      if (!rpc.error && Array.isArray(rpc.data)) {
        return rpc.data.map(function (row) {
          return { created_at: row.created_at };
        });
      }
    } catch (_) { }

    try {
      var legacy = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: 'all',
        p_actor_query: null,
        p_limit: 1500
      });
      if (!legacy.error && Array.isArray(legacy.data)) {
        var sinceMs = since ? new Date(since).getTime() : 0;
        return legacy.data.filter(function (row) {
          return !sinceMs || (row.created_at && new Date(row.created_at).getTime() >= sinceMs);
        }).map(function (row) {
          return { created_at: row.created_at };
        });
      }
    } catch (_) { }

    return [];
  }

  async function loadSearchTrendsData(client, since) {
    var trends = [];

    try {
      var rpcArgs = { p_limit: 20 };
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

      if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
        trends = canonicalizeTrendsList(result.data);
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
          .select('term')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (since) rawQuery = rawQuery.gte('created_at', since);

        var raw = await rawQuery;
        if (!raw.error && Array.isArray(raw.data)) {
          trends = buildTrendsFromRows(raw.data);
        } else if (raw.error) {
          console.warn('[Admin trends] Fallback direto falhou:', raw.error.message || raw.error);
          var rawFallback = await client.from('search_queries').select('term').limit(500);
          if (!rawFallback.error && Array.isArray(rawFallback.data)) {
            trends = buildTrendsFromRows(rawFallback.data);
          } else if (rawFallback.error) {
            console.warn('[Admin trends] Todas as tentativas falharam:', rawFallback.error.message || rawFallback.error);
          }
        }
      }
    } catch (error) {
      console.error('[Admin trends] Erro inesperado:', error);
      trends = [];
    }

    return trends;
  }

  async function queryCreatedAtRows(client, tableName, since, limit) {
    try {
      var query = client.from(tableName)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(limit || 1500);
      if (since) query = query.gte('created_at', since);
      var result = await query;
      if (!result.error && Array.isArray(result.data)) return result.data;
    } catch (_) { }

    return [];
  }

  async function loadDailyMetrics(client, since, signal) {
    var utils = getDashboardUtils();
    var until = new Date().toISOString();

    try {
      var rpc = await client.rpc('kc_admin_dashboard_daily_metrics', {
        p_since: since || null
      });
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length) {
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
      queryCreatedAtRows(client, 'profiles', since, 1500)
    ]);
    throwIfAborted(signal);

    if (typeof utils.buildDailyMetricsFromEventSets === 'function') {
      return utils.buildDailyMetricsFromEventSets({
        posts: eventSets[0],
        comments: eventSets[1],
        searches: eventSets[2],
        votes: eventSets[3],
        admin_actions: eventSets[4],
        saves: eventSets[5],
        reports: eventSets[6],
        signups: eventSets[7]
      }, since, until);
    }

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
    loadAuditEventRows: loadAuditEventRows,
    loadSearchTrendsData: loadSearchTrendsData,
    queryCreatedAtRows: queryCreatedAtRows,
    loadDailyMetrics: loadDailyMetrics
  };
})();
