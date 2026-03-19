/*
  KinoCampus - Environment Bootstrap (V8.2.6.2)

  Objetivo:
  - Fonte Única de Verdade para configuração do app (Driver Pattern).
  - Permitir troca de driver (local <-> supabase) por flags.

  Compat:
  - Aceita 'driver' e/ou 'DATA_DRIVER'
  - Expõe aliases SUPABASE_URL / SUPABASE_ANON_KEY

  Exposição:
  - window.KC_ENV
*/

(function () {
  'use strict';

  // Patch: inclui hardening server-side de verificação de e-mail (V8.1.3.3 retro)
  // + Paginação paritária no Read Path (V8.1.4.2)
  // V8.1.5.4: migração assistida de "Meus Posts" (localStorage kc_user_posts) -> Supabase
  // V8.1.6.1: hardening RLS/colunas sensíveis (verified, author_id) via migration SQL
  // V8.1.6.2: tabela reports + privacidade profiles.email
  // V8.1.7.0: coluna posts.status + policy posts_select_published (moderação de conteúdo)
  // V8.1.7.1: rate-limit trigger em reports (max 5/hora) + fix XSS comentários + CSP headers
  // V8.2.2.0: release candidate cleanroom (LOTE 1)
  // V8.2.5.0: remove 'unsafe-inline' da CSP (BUG-003); externaliza scripts inline em 6 HTMLs
  // V8.2.6.0: fix carregamento de publicações — compat comments em kc-supabase.client.js
  // V8.2.6.2: guardrails de contrato Vercel/Supabase e higiene de release
  const VERSION = '8.2.6.2';

  const DEFAULT_ENV = {
    // versões (compat)
    version: VERSION,
    APP_VERSION: VERSION,

    // Ambiente da aplicação (separação explícita dev/prod)
    // Opções: "development" | "production"
    environment: '__KC_APP_ENV__',
    APP_ENV: '__KC_APP_ENV__',

    // driver (compat)
    driver: '__KC_DRIVER__', // Opções: "local" | "supabase"
    DATA_DRIVER: '__KC_DRIVER__',

    debug: true,

    // Supabase (aliases + bloco)
    SUPABASE_URL: '__KC_SUPABASE_URL__',
    SUPABASE_ANON_KEY: '__KC_SUPABASE_ANON_KEY__',
    supabase: {
      url: '__KC_SUPABASE_URL__',
      anonKey: '__KC_SUPABASE_ANON_KEY__',
      storageBucket: 'kino-media',
    },

    // Auth (registro)
    // - Se vazio, não restringe domínio
    // - Se preenchido, valida e-mail no signUp
    // - IMPORTANTE: `profiles.verified` é forçado no BANCO via trigger (Supabase SQL)
    AUTH_ALLOWED_DOMAINS: ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'],
    auth: {
      allowedEmailDomains: ['ufg.br', 'discente.ufg.br', 'egresso.ufg.br'],
    },

    // clamp temporal (protótipo) — dinâmico: usa mês/ano corrente para evitar timestamps obsoletos
    clamp: (function () {
      var MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
      var d = new Date();
      return { month: MONTHS[d.getMonth()], year: d.getFullYear() };
    }()),
  };

  const current = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : null;

  function detectRuntimeEnvironment() {
    const host = String((window.location && window.location.hostname) || '').toLowerCase();
    if (!host) return 'development';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'development';
    if (host.endsWith('.local')) return 'development';
    return 'production';
  }

  function normalizeEnvironment(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'prod') return 'production';
    if (raw === 'dev') return 'development';
    if (raw === 'production' || raw === 'development') return raw;
    return '';
  }

  // Merge seguro (mantém estrutura obrigatória e permite override manual).
  const merged = {
    ...DEFAULT_ENV,
    ...(current || {}),
    supabase: {
      ...DEFAULT_ENV.supabase,
      ...(((current || {}).supabase) || {}),
    },
    auth: {
      ...DEFAULT_ENV.auth,
      ...(((current || {}).auth) || {}),
    },
    clamp: {
      ...DEFAULT_ENV.clamp,
      ...(((current || {}).clamp) || {}),
    },
  };

  const resolvedEnvironment = normalizeEnvironment(merged.APP_ENV || merged.environment) || detectRuntimeEnvironment();
  merged.environment = resolvedEnvironment;
  merged.APP_ENV = resolvedEnvironment;
  merged.isProduction = resolvedEnvironment === 'production';

  // Resolve driver (compat)
  const rawDriver = String((merged.DATA_DRIVER || merged.driver || 'local')).toLowerCase();
  const normalizedDriver = (rawDriver === 'supabase' || rawDriver === 'local') ? rawDriver : 'local';
  const productionRequiresSupabase = merged.isProduction && normalizedDriver !== 'supabase';

  if (productionRequiresSupabase) {
    merged.driver = '__invalid_production_driver__';
    merged.DATA_DRIVER = merged.driver;
    merged.driverPolicyError = {
      code: 'PRODUCTION_REQUIRES_SUPABASE',
      message: 'Em produção, KC_ENV.driver deve ser "supabase". O fallback silencioso para local foi bloqueado.',
      received: rawDriver || '(empty)',
      environment: merged.environment,
    };
    console.error('[KC_ENV] Política de ambiente violada:', merged.driverPolicyError);
  } else {
    merged.driver = normalizedDriver;
    merged.DATA_DRIVER = merged.driver;
    delete merged.driverPolicyError;
  }

  // Normaliza Supabase (preferindo aliases caso o usuário tenha setado)
  const url = String(merged.SUPABASE_URL || merged.supabase.url || '').trim();
  const anon = String(merged.SUPABASE_ANON_KEY || merged.supabase.anonKey || '').trim();

  merged.supabase.url = url || merged.supabase.url;
  merged.supabase.anonKey = anon || merged.supabase.anonKey;

  merged.SUPABASE_URL = merged.supabase.url;
  merged.SUPABASE_ANON_KEY = merged.supabase.anonKey;

  // Normaliza allowlist de domínios
  const domains = Array.isArray(merged.AUTH_ALLOWED_DOMAINS)
    ? merged.AUTH_ALLOWED_DOMAINS
    : (merged.auth && Array.isArray(merged.auth.allowedEmailDomains) ? merged.auth.allowedEmailDomains : []);

  merged.AUTH_ALLOWED_DOMAINS = Array.isArray(domains) ? domains.filter(Boolean) : [];
  if (!merged.auth || typeof merged.auth !== 'object') merged.auth = {};
  merged.auth.allowedEmailDomains = merged.AUTH_ALLOWED_DOMAINS.slice();

  // Versão (compat)
  merged.version = VERSION;
  merged.APP_VERSION = VERSION;

  window.KC_ENV = merged;

  // -----------------------------
  // V8.1.5.4 — Migração assistida “Meus Posts” (localStorage -> Supabase)
  // - Carrega o módulo de migração apenas quando o driver Supabase estiver ativo
  // - Em driver Supabase, filtra (apenas na leitura) posts já migrados para evitar duplicação
  //   em feeds/listagens que ainda consomem localStorage.
  // -----------------------------
  try {
    if (merged.driver === 'supabase') {
      const KEY = 'kc_user_posts';

      // Patch de leitura: remove (apenas na leitura) itens marcados como migrados.
      // Mantém o dado original no storage (sem apagar).
      try {
        if (!localStorage.__kcMigrateMyPostsPatched) {
          const origGet = localStorage.getItem.bind(localStorage);
          // expõe o original para o módulo de migração calcular stats/backup sem ser afetado pelo filtro
          if (!window.__KC_ORIG_LS_GETITEM) window.__KC_ORIG_LS_GETITEM = origGet;
          localStorage.__kcMigrateMyPostsPatched = '1';
          localStorage.getItem = function (k) {
            const raw = origGet(k);
            if (k !== KEY || !raw) return raw;
            try {
              const data = JSON.parse(raw);
              if (!Array.isArray(data)) return raw;
              const filtered = data.filter((p) => {
                const meta = (p && p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)) ? p.metadata : {};
                return !(meta.migratedToSupabase === true || meta.supabaseId || meta.supabase_id);
              });
              return JSON.stringify(filtered);
            } catch (_) {
              return raw;
            }
          };
        }
      } catch (_) {}

      // Loader do módulo de migração (sem precisar editar HTML)
      // Em páginas /admin não usamos esse módulo e evitamos ruído de caminho/CSP no console.
      const pathname = String((window.location && window.location.pathname) || '').toLowerCase();
      const isAdminPage = pathname.includes('/admin/');
      if (!isAdminPage && !document.querySelector('script[data-kc-migrate="myposts"]')) {
        const s = document.createElement('script');

        // Resolve caminho relativo ao próprio kc-env.js para funcionar em / e /admin/
        // sem depender da URL atual da página.
        const currentScript = document.currentScript;
        const currentSrc = currentScript && currentScript.src ? String(currentScript.src) : '';
        if (currentSrc) {
          try {
            s.src = new URL('kc-migrate.myposts.js', currentSrc).toString();
          } catch (_) {
            s.src = '/assets/js/kc-migrate.myposts.js';
          }
        } else {
          s.src = '/assets/js/kc-migrate.myposts.js';
        }

        s.defer = true;
        s.dataset.kcMigrate = 'myposts';
        (document.head || document.documentElement).appendChild(s);
      }
    }
  } catch (_) {}
})();
