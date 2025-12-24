/*
  KinoCampus - Environment Bootstrap (V8.1.2.4.4)

  Objetivo:
  - Fonte Única de Verdade para configuração do app (Driver Pattern).
  - Permitir troca futura de driver (local <-> supabase) alterando apenas 1 linha.

  Exposição:
  - window.KC_ENV
*/

(function () {
  'use strict';

  const DEFAULT_ENV = {
    version: '8.1.2.4.4',
    driver: 'local', // Opções: "local" | "supabase"
    debug: true,
    supabase: {
      url: 'https://placeholder-project.supabase.co',
      anonKey: 'eyJhbG...placeholder',
      storageBucket: 'kino-media',
    },
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
    clamp: {
      ...DEFAULT_ENV.clamp,
      ...(((current || {}).clamp) || {}),
    },
  };

  // Sanitização mínima
  if (merged.driver !== 'local' && merged.driver !== 'supabase') merged.driver = 'local';

  window.KC_ENV = merged;
})();
