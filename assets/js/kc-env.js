/*
  KinoCampus - Environment Bootstrap (V8.1.3.2.1)

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
  // V8.1.12.0: versão-alvo unificada dos módulos de front (evita drift entre clientes)
  const VERSION = '8.1.12.0';

  const DEFAULT_ENV = {
    // versões (compat)
    version: VERSION,
    APP_VERSION: VERSION,

    // driver (compat)
    driver: 'local', // Opções: "local" | "supabase"
    DATA_DRIVER: 'local',

    debug: true,

    // Supabase (aliases + bloco)
    SUPABASE_URL: 'https://placeholder-project.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbG...placeholder',
    supabase: {
      url: 'https://placeholder-project.supabase.co',
      anonKey: 'eyJhbG...placeholder',
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

    // clamp temporal (protótipo)
    clamp: { month: 'February', year: 2026 },
  };

  const current = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : null;

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

  // Resolve driver (compat)
  const rawDriver = String((merged.DATA_DRIVER || merged.driver || 'local')).toLowerCase();
  merged.driver = (rawDriver === 'supabase') ? 'supabase' : 'local';
  merged.DATA_DRIVER = merged.driver;

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
      if (!document.querySelector('script[data-kc-migrate="myposts"]')) {
        const s = document.createElement('script');
        s.src = 'assets/js/kc-migrate.myposts.js';
        s.defer = true;
        s.dataset.kcMigrate = 'myposts';
        (document.head || document.documentElement).appendChild(s);
      }
    }
  } catch (_) {}
})();
