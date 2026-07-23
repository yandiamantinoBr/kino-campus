(function installKinoCampusAdminQaMock() {
  'use strict';

  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const user = {
    id: ADMIN_ID,
    email: 'admin.qa@ufg.br',
    user_metadata: { display_name: 'Admin QA' },
  };
  const profile = {
    id: ADMIN_ID,
    is_admin: true,
    display_name: 'Admin QA',
    full_name: 'Administrador QA',
    email: 'admin.qa@ufg.br',
  };
  const now = new Date();
  const isoDaysAgo = (days) => {
    const value = new Date(now);
    value.setDate(value.getDate() - days);
    return value.toISOString();
  };
  const dayKey = (days) => isoDaysAgo(days).slice(0, 10);
  const daily = Array.from({ length: 30 }, (_, index) => ({
    day: dayKey(29 - index),
    posts_count: 2 + (index % 4),
    comments_count: 3 + (index % 5),
    searches_count: 4 + (index % 6),
    votes_count: 5 + (index % 3),
    admin_actions_count: index % 3,
    saves_count: 2 + (index % 2),
    reports_count: index % 4 === 0 ? 1 : 0,
    signups_count: index % 5 === 0 ? 2 : 1,
    post_views_count: 20 + index,
    comment_likes_count: 2 + (index % 4),
    sessions_count: 8 + (index % 5),
    ad_clicks_count: 1 + (index % 2),
    ad_impressions_count: 15 + (index % 6),
  }));
  const auditRows = [
    {
      id: 'a1',
      actor_id: ADMIN_ID,
      action: 'post_hidden',
      entity_type: 'post',
      entity_id: 'post-qa-1',
      created_at: isoDaysAgo(0),
      metadata: { reason: 'QA' },
    },
    {
      id: 'a2',
      actor_id: ADMIN_ID,
      action: 'report_resolved',
      entity_type: 'report',
      entity_id: 'report-qa-1',
      created_at: isoDaysAgo(1),
      metadata: {},
    },
    {
      id: 'a3',
      actor_id: ADMIN_ID,
      action: 'post_published',
      entity_type: 'post',
      entity_id: 'post-qa-2',
      created_at: isoDaysAgo(2),
      metadata: {},
    },
  ];
  const posts = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      legacy_id: 'qa-1',
      title: 'Evento acadêmico de QA',
      content: 'Descrição de teste suficientemente longa para validar truncamento e ações.',
      module: 'eventos',
      category: 'academicos',
      status: 'pending',
      created_at: isoDaysAgo(0),
      updated_at: isoDaysAgo(0),
      author_id: ADMIN_ID,
      author_name: 'Admin QA',
      total_count: 3,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      legacy_id: 'qa-2',
      title: 'Moradia compartilhada',
      content: 'Conteúdo publicado para conferir estados e navegação.',
      module: 'moradia',
      category: 'apartamentos',
      status: 'published',
      created_at: isoDaysAgo(1),
      updated_at: isoDaysAgo(1),
      author_id: ADMIN_ID,
      author_name: 'Admin QA',
      total_count: 3,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      legacy_id: 'qa-3',
      title: 'Item oculto de teste',
      content: 'Conteúdo oculto para validar badge e ação reversa.',
      module: 'compra-venda',
      category: 'livros',
      status: 'hidden',
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(2),
      author_id: ADMIN_ID,
      author_name: 'Admin QA',
      total_count: 3,
    },
  ];

  function rpc(name, args) {
    if (name === 'kc_admin_dashboard_overview') {
      return Promise.resolve({
        data: {
          ok: true,
          reports: { open: 2, total: 7 },
          posts: {
            hidden: 1,
            deleted: 0,
            created: 18,
            edited: 6,
            total: 124,
            visible: 119,
            prev_created: 13,
          },
          engagement: {
            comments: 42,
            votes: 57,
            saves: 19,
            prev_comments: 31,
            prev_votes: 40,
            prev_saves: 12,
          },
          users: { total: 88, new: 9, prev_new: 6 },
          searches: 73,
          active_15m: 12,
          privacy: {
            events: 210,
            sessions: 91,
            searches: 73,
            post_views: 134,
          },
        },
        error: null,
      });
    }
    if (name === 'kc_admin_dashboard_daily_metrics') {
      return Promise.resolve({ data: daily, error: null });
    }
    if (name === 'kc_admin_search_trends_classified') {
      return Promise.resolve({
        data: [
          { term: 'bolsa de estudos', count: 28, module: 'oportunidades', module_confidence: 0.94 },
          { term: 'apartamento perto ufg', count: 21, module: 'moradia', module_confidence: 0.91 },
          { term: 'evento cultura', count: 14, module: 'eventos', module_confidence: 0.76 },
          { term: 'termo sem classe', count: 7, module: null, module_confidence: 0 },
        ],
        error: null,
      });
    }
    if (name === 'kc_admin_search_trends') return Promise.resolve({ data: [], error: null });
    if (name === 'kc_admin_list_audit_logs') {
      let rows = auditRows.slice();
      if (args && args.p_entity_type && args.p_entity_type !== 'all') {
        rows = rows.filter((row) => row.entity_type === args.p_entity_type);
      }
      if (args && args.p_action && args.p_action !== 'all') {
        rows = rows.filter((row) => row.action === args.p_action);
      }
      if (args && args.p_actor_query) {
        const term = String(args.p_actor_query).toLowerCase();
        rows = rows.filter((row) => String(row.actor_id || '').toLowerCase().includes(term));
      }
      const offset = Math.max(0, Number(args && args.p_offset) || 0);
      const limit = Math.max(1, Number(args && args.p_limit) || rows.length || 1);
      return Promise.resolve({ data: rows.slice(offset, offset + limit), error: null });
    }
    if (name === 'kc_admin_ads_overview') {
      return Promise.resolve({
        data: {
          ok: true,
          settings: { enabled: true, provider: 'house' },
          campaigns: { total: 4, active: 2, paused: 1, draft: 1, archived: 0 },
          metrics: { impressions: 320, clicks: 19, ctr: 5.94 },
          active_without_impressions: 0,
          expired_active: 0,
        },
        error: null,
      });
    }
    if (name === 'kc_admin_get_chart_prefs') {
      return Promise.resolve({ data: { ok: true, prefs: null }, error: null });
    }
    if (name === 'kc_admin_privacy_analytics') {
      return Promise.resolve({
        data: {
          ok: true,
          events: 210,
          sessions: 91,
          searches: 73,
          post_views: 134,
          consent: { analytics: 82, ads: 35 },
        },
        error: null,
      });
    }
    if (name === 'kc_admin_search_posts_full') {
      let rows = posts.slice();
      const term = String(args && args.p_query || '').toLowerCase();
      const status = String(args && args.p_status || '').toLowerCase();
      if (term) {
        rows = rows.filter((row) => [
          row.title,
          row.content,
          row.legacy_id,
          row.id,
          row.author_name,
        ].some((value) => String(value || '').toLowerCase().includes(term)));
      }
      if (status) rows = rows.filter((row) => row.status === status);
      const total = rows.length;
      const offset = Math.max(0, Number(args && args.p_offset) || 0);
      const limit = Math.max(1, Number(args && args.p_limit) || total || 1);
      return Promise.resolve({
        data: rows.slice(offset, offset + limit).map((row) => Object.assign({}, row, {
          total_count: total,
        })),
        error: null,
      });
    }
    if (name === 'kc_admin_get_post_limits') {
      return Promise.resolve({ data: { limits: [] }, error: null });
    }
    if (name === 'kc_admin_get_post_flood_limits') {
      return Promise.resolve({ data: { limits: [] }, error: null });
    }
    if (name === 'kc_admin_search_profiles_for_limits') {
      return Promise.resolve({
        data: [{
          out_id: profile.id,
          out_full_name: profile.full_name,
          out_display_name: profile.display_name,
          out_email: profile.email,
        }],
        error: null,
      });
    }
    if (name === 'kc_admin_set_post_status') {
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    return Promise.resolve({ data: [], error: null, count: 0 });
  }

  function query(table) {
    const state = {
      head: false,
      count: false,
      filters: [],
      rangeStart: 0,
      rangeEnd: null,
    };
    const chain = {
      select(_fields, options) {
        state.head = Boolean(options && options.head);
        state.count = Boolean(options && options.count);
        return chain;
      },
      eq(field, value) {
        state.filters.push({ field, value });
        return chain;
      },
      neq() { return chain; },
      in() { return chain; },
      is() { return chain; },
      gte() { return chain; },
      lte() { return chain; },
      lt() { return chain; },
      gt() { return chain; },
      or() { return chain; },
      ilike() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      range(start, end) {
        state.rangeStart = Math.max(0, Number(start) || 0);
        state.rangeEnd = Number.isFinite(Number(end)) ? Number(end) : null;
        return chain;
      },
      contains() { return chain; },
      update() { return chain; },
      insert() { return chain; },
      upsert() { return chain; },
      delete() { return chain; },
      maybeSingle() { return Promise.resolve({ data: profile, error: null }); },
      single() { return Promise.resolve({ data: profile, error: null }); },
      then(resolve, reject) {
        let data = [];
        if (table === 'profiles') data = [profile];
        if (table === 'audit_log') data = auditRows;
        state.filters.forEach(({ field, value }) => {
          data = data.filter((row) => String(row && row[field] || '') === String(value));
        });
        const count = data.length;
        if (state.rangeEnd !== null) {
          data = data.slice(state.rangeStart, state.rangeEnd + 1);
        }
        const result = {
          data: state.head ? null : data,
          error: null,
          count: state.count ? count : (state.head ? count : data.length),
        };
        return Promise.resolve(result).then(resolve, reject);
      },
      catch(reject) {
        return Promise.resolve({ data: [], error: null, count: 0 }).catch(reject);
      },
    };
    return chain;
  }

  const fakeClient = {
    from: query,
    rpc,
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({
        data: { session: { user, access_token: 'qa-token' } },
        error: null,
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      signOut: async () => ({ error: null }),
    },
    functions: {
      invoke: async () => ({ data: { ok: true }, error: null }),
    },
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
    }),
    removeChannel: async () => {},
  };

  function mergeSupabase(value) {
    return Object.assign({}, value || {}, {
      getClient: () => fakeClient,
      getCurrentUser: async () => user,
      getSession: async () => ({ user }),
    });
  }

  function mergeApi(value) {
    const source = value || {};
    const api = Object.assign({}, source);
    api.ENV = Object.assign({}, source.ENV || {}, {
      driver: 'supabase',
      DATA_DRIVER: 'supabase',
    });
    return Object.assign(api, {
      getCurrentUser: async () => user,
      getTopContributors: async () => [
        {
          rank: 1,
          display_name: 'Admin QA',
          score: 152,
          posts_count: 12,
          votes_received: 48,
          comments_count: 17,
          coupon_clicks: 3,
          share_count: 9,
          penalties: 0,
        },
        {
          rank: 2,
          display_name: 'Usuária Teste',
          score: 118,
          posts_count: 9,
          votes_received: 34,
          comments_count: 12,
          coupon_clicks: 2,
          share_count: 7,
          penalties: 1,
        },
      ],
      getInvites: async () => ({ data: [], error: null }),
      inviteExternalUser: async () => ({
        ok: true,
        data: { invite_link: 'https://example.test/invite' },
      }),
      revokeInvite: async () => ({ ok: true }),
      listExternalAccessRequests: async (options) => {
        const status = String(options && options.status || 'pending');
        if (status !== 'pending') {
          return { ok: true, items: [], total: 0 };
        }
        return {
          ok: true,
          total: 1,
          items: [{
            id: '55555555-5555-4555-8555-555555555555',
            requester_name: 'Solicitante QA',
            contact_email: 'solicitante@example.com',
            affiliation_context: 'Comunidade externa em avaliação',
            message: 'Solicitação sintética para validar o modal e o fluxo de teclado.',
            admin_status: 'pending',
            created_at: isoDaysAgo(1),
            metadata: {},
          }],
        };
      },
      decideExternalAccessRequest: async () => ({
        ok: true,
        data: { decision_persisted: true },
      }),
    });
  }

  let supabaseValue = mergeSupabase({});
  let apiValue = mergeApi({});

  Object.defineProperty(window, 'KCSupabase', {
    configurable: true,
    enumerable: true,
    get() {
      return supabaseValue;
    },
    set(value) {
      supabaseValue = mergeSupabase(value);
    },
  });
  Object.defineProperty(window, 'KCAPI', {
    configurable: true,
    enumerable: true,
    get() {
      return apiValue;
    },
    set(value) {
      apiValue = mergeApi(value);
    },
  });
})();
