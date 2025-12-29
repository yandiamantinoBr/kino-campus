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
  const VERSION = '8.1.4.4';

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
    AUTH_ALLOWED_DOMAINS: ['ufg.br', 'discente.ufg.br'],
    auth: {
      allowedEmailDomains: ['ufg.br', 'discente.ufg.br'],
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
})();
