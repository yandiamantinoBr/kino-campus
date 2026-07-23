const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

const mockBootstrap = String.raw`(function(){
  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const user = { id: ADMIN_ID, email: 'admin.qa@ufg.br', user_metadata: { display_name: 'Admin QA' } };
  const profile = { id: ADMIN_ID, is_admin: true, display_name: 'Admin QA', full_name: 'Administrador QA', email: 'admin.qa@ufg.br' };
  const now = new Date();
  const isoDaysAgo = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d.toISOString(); };
  const dayKey = (n) => isoDaysAgo(n).slice(0, 10);
  const daily = Array.from({length: 30}, (_, i) => ({
    day: dayKey(29 - i),
    posts_count: 2 + (i % 4),
    comments_count: 3 + (i % 5),
    searches_count: 4 + (i % 6),
    votes_count: 5 + (i % 3),
    admin_actions_count: i % 3,
    saves_count: 2 + (i % 2),
    reports_count: i % 4 === 0 ? 1 : 0,
    signups_count: i % 5 === 0 ? 2 : 1,
    post_views_count: 20 + i,
    comment_likes_count: 2 + (i % 4),
    sessions_count: 8 + (i % 5),
    ad_clicks_count: 1 + (i % 2),
    ad_impressions_count: 15 + (i % 6)
  }));
  const auditRows = [
    { id:'a1', actor_id:ADMIN_ID, action:'post_hidden', entity_type:'post', entity_id:'post-qa-1', created_at:isoDaysAgo(0), metadata:{reason:'QA'} },
    { id:'a2', actor_id:ADMIN_ID, action:'report_resolved', entity_type:'report', entity_id:'report-qa-1', created_at:isoDaysAgo(1), metadata:{} },
    { id:'a3', actor_id:ADMIN_ID, action:'post_published', entity_type:'post', entity_id:'post-qa-2', created_at:isoDaysAgo(2), metadata:{} }
  ];
  const posts = [
    {
      id:'22222222-2222-4222-8222-222222222222',
      legacy_id:'qa-1',
      title:'Evento acadêmico de QA',
      content:'Descrição de teste suficientemente longa para validar truncamento e ações.',
      module:'eventos',
      category:'academicos',
      status:'pending',
      created_at:isoDaysAgo(0),
      updated_at:isoDaysAgo(0),
      author_id:ADMIN_ID,
      author_name:'Admin QA',
      total_count:3
    },
    {
      id:'33333333-3333-4333-8333-333333333333',
      legacy_id:'qa-2',
      title:'Moradia compartilhada',
      content:'Conteúdo publicado para conferir estados e navegação.',
      module:'moradia',
      category:'apartamentos',
      status:'published',
      created_at:isoDaysAgo(1),
      updated_at:isoDaysAgo(1),
      author_id:ADMIN_ID,
      author_name:'Admin QA',
      total_count:3
    },
    {
      id:'44444444-4444-4444-8444-444444444444',
      legacy_id:'qa-3',
      title:'Item oculto de teste',
      content:'Conteúdo oculto para validar badge e ação reversa.',
      module:'compra-venda',
      category:'livros',
      status:'hidden',
      created_at:isoDaysAgo(2),
      updated_at:isoDaysAgo(2),
      author_id:ADMIN_ID,
      author_name:'Admin QA',
      total_count:3
    }
  ];

  function rpc(name) {
    if (name === 'kc_admin_dashboard_overview') {
      return Promise.resolve({
        data: {
          ok:true,
          reports:{open:2,total:7},
          posts:{hidden:1,deleted:0,created:18,edited:6,total:124,visible:119,prev_created:13},
          engagement:{comments:42,votes:57,saves:19,prev_comments:31,prev_votes:40,prev_saves:12},
          users:{total:88,new:9,prev_new:6},
          searches:73,
          active_15m:12,
          privacy:{searches:73}
        },
        error:null
      });
    }
    if (name === 'kc_admin_dashboard_daily_metrics') return Promise.resolve({data:daily,error:null});
    if (name === 'kc_admin_search_trends_classified') {
      return Promise.resolve({
        data:[
          {term:'bolsa de estudos',count:28,module:'oportunidades',module_confidence:.94},
          {term:'apartamento perto ufg',count:21,module:'moradia',module_confidence:.91},
          {term:'evento cultura',count:14,module:'eventos',module_confidence:.76},
          {term:'termo sem classe',count:7,module:null,module_confidence:0}
        ],
        error:null
      });
    }
    if (name === 'kc_admin_search_trends') return Promise.resolve({data:[],error:null});
    if (name === 'kc_admin_list_audit_logs') return Promise.resolve({data:auditRows,error:null});
    if (name === 'kc_admin_ads_overview') {
      return Promise.resolve({
        data:{
          ok:true,
          settings:{enabled:true,provider:'house'},
          campaigns:{total:4,active:2,paused:1,draft:1,archived:0},
          metrics:{impressions:320,clicks:19,ctr:5.94},
          active_without_impressions:0,
          expired_active:0
        },
        error:null
      });
    }
    if (name === 'kc_admin_get_chart_prefs') return Promise.resolve({data:{ok:true,prefs:null},error:null});
    if (name === 'kc_admin_privacy_analytics') {
      return Promise.resolve({
        data:{ok:true,events:210,sessions:91,searches:73,post_views:134,consent:{analytics:82,ads:35}},
        error:null
      });
    }
    if (name === 'kc_admin_search_posts_full') return Promise.resolve({data:posts,error:null});
    if (name === 'kc_admin_get_post_limits') return Promise.resolve({data:{limits:[]},error:null});
    if (name === 'kc_admin_get_post_flood_limits') return Promise.resolve({data:{limits:[]},error:null});
    if (name === 'kc_admin_search_profiles_for_limits') return Promise.resolve({data:[profile],error:null});
    if (name === 'kc_admin_set_post_status') return Promise.resolve({data:{ok:true},error:null});
    return Promise.resolve({data:[],error:null,count:0});
  }

  function query(table) {
    const state = { head:false, count:false };
    const q = {
      select(_fields, options){ state.head = !!(options && options.head); state.count = !!(options && options.count); return q; },
      eq(){ return q; },
      neq(){ return q; },
      in(){ return q; },
      is(){ return q; },
      gte(){ return q; },
      lte(){ return q; },
      lt(){ return q; },
      gt(){ return q; },
      or(){ return q; },
      ilike(){ return q; },
      order(){ return q; },
      limit(){ return q; },
      range(){ return q; },
      contains(){ return q; },
      update(){ return q; },
      insert(){ return q; },
      upsert(){ return q; },
      delete(){ return q; },
      maybeSingle(){ return Promise.resolve({data:profile,error:null}); },
      single(){ return Promise.resolve({data:profile,error:null}); },
      then(resolve,reject){
        let data = [];
        if (table === 'profiles') data = [profile];
        const result = {
          data:state.head ? null : data,
          error:null,
          count:state.count ? data.length : (state.head ? 0 : data.length)
        };
        return Promise.resolve(result).then(resolve,reject);
      },
      catch(reject){ return Promise.resolve({data:[],error:null,count:0}).catch(reject); }
    };
    return q;
  }

  const fakeClient = {
    from:query,
    rpc,
    auth:{
      getUser:async()=>({data:{user},error:null}),
      getSession:async()=>({data:{session:{user,access_token:'qa-token'}},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signOut:async()=>({error:null})
    },
    functions:{invoke:async()=>({data:{ok:true},error:null})},
    channel:()=>({on(){return this;},subscribe(){return this;}}),
    removeChannel:async()=>{}
  };

  window.KCSupabase = Object.assign({}, window.KCSupabase || {}, {
    getClient:()=>fakeClient,
    getCurrentUser:async()=>user,
    getSession:async()=>({user})
  });
  window.KCAPI = Object.assign({}, window.KCAPI || {}, {
    ENV:Object.assign({}, (window.KCAPI&&window.KCAPI.ENV)||{}, {driver:'supabase',DATA_DRIVER:'supabase'}),
    getCurrentUser:async()=>user,
    getTopContributors:async()=>[
      {rank:1,display_name:'Admin QA',score:152,posts_count:12,votes_received:48,comments_count:17,coupon_clicks:3,share_count:9,penalties:0},
      {rank:2,display_name:'Usuária Teste',score:118,posts_count:9,votes_received:34,comments_count:12,coupon_clicks:2,share_count:7,penalties:1}
    ],
    getInvites:async()=>({data:[],error:null}),
    inviteExternalUser:async()=>({ok:true,data:{invite_link:'https://example.test/invite'}}),
    revokeInvite:async()=>({ok:true}),
    listExternalAccessRequests:async()=>({ok:true,items:[],total:0}),
    decideExternalAccessRequest:async()=>({ok:true,data:{decision_persisted:true}})
  });
})();`;

export async function installAdminMocks(page) {
  for (const pattern of [
    '**/assets/js/controllers/admin/admin-dashboard.controller.js*',
    '**/assets/js/controllers/admin/admin-moderation.controller.js*'
  ]) {
    await page.route(pattern, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({ response, body: `${mockBootstrap}\n${body}` });
    });
  }
}

export async function openAdminDashboard(page, baseUrl = 'http://127.0.0.1:4174') {
  await installAdminMocks(page);
  await page.goto(`${baseUrl}/admin/index.html`);
  await page.waitForTimeout(1800);
}

export async function openModeration(page, baseUrl = 'http://127.0.0.1:4174') {
  await installAdminMocks(page);
  await page.goto(`${baseUrl}/admin/moderation.html`);
  await page.waitForTimeout(1800);
}

export { ADMIN_ID };
