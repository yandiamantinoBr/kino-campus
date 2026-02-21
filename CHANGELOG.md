# Changelog

## [8.1.8.2] - 2026-02-21

### Changed
- Movido `backend/` para `docs/legacy/backend-placeholder/` como referência histórica/placeholder.
- Adicionado `docs/legacy/backend-placeholder/README.md` com status de legado e esclarecimento de que o runtime oficial é front estático + Supabase.
- Atualizadas notas de readiness para apontar o novo local legado e evitar entendimento de backend ativo no fluxo atual.

## [8.1.8.1] - 2026-02-21

### Changed
- Unificação da versão dos módulos de front para uma versão-alvo única `8.1.8.1`.
- Atualizadas as constantes `VERSION` em:
  - `assets/js/kc-env.js` → `8.1.8.1`
  - `assets/js/kc-api.client.js` → `8.1.8.1`
  - `assets/js/kc-supabase.client.js` → `8.1.8.1`
  - `assets/js/kc-auth.ui.js` → `8.1.8.1`
- Revisada a referência visual de versão no modal de autenticação (`Auth UI v8.1.8.1`).

### Release policy
- Para evitar drift entre módulos, todo release de front deve aplicar **bump em lote** das constantes `VERSION` dos arquivos mapeados no README e neste changelog.
