# QA Report — Phase 5: Legacy Public Profile Compatibility

**Data:** 2026-03-19
**Branch:** `codex/phase5-legacy-public-profile-compat`
**Base:** `codex/phase4-auth-preview-final-gate`

## Problema

Publicações com `author_id` no formato `USER_xx` (autores legados/mock) levavam a `profile.html?id=USER_xx`, que terminava em **"Perfil nao encontrado"** porque `getProfileById()` só consultava a tabela Supabase `profiles`, onde IDs legados não existem.

**Evidência do bug:** `report-v8.2.6.2-preview-run3.md`, screenshot `public-profile-legacy-user-not-found.png`

## Correção aplicada

**Arquivo:** `assets/js/kc-api.client.js` — função `getProfileById()` (L3374)

Adicionado fallback para `getAuthorById(id)` (mapa `MOCK_USERS` já existente) quando Supabase retorna null. O objeto retornado respeita o shape de `normalizeProfile()`:

- `display_name`, `full_name`, `avatar_url` — do mock user
- `verified: false`, `is_admin: false` — sem badges elevados
- `bio: ''`, `created_at: null`, `updated_at: null` — valores seguros
- `email` — **não exposto** (fora do contrato público)

Supabase é sempre tentado primeiro; fallback mock só ativa quando Supabase retorna null.

## Validação local

| Check | Resultado |
|-------|-----------|
| `node --check assets/js/kc-api.client.js` | OK |
| `node scripts/hygiene-check.js` | Passed (v8.2.6.2) |
| `git diff --stat` | 1 file, +22/-3 |

## Validação — run4 (2026-03-19) ✅ CONCLUÍDA

**Preview:** `kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app`
**Deployment:** `dpl_8qviWBh7Et46ctjiSUno7ywYPV1m` — buildado de `cded2b4` (Merge PR #139)
**Ferramentas:** Vercel MCP, Supabase MCP (execute_sql), vercel curl, Node.js simulation

### 5 cenários de aceite — TODOS PASSARAM

| # | Cenário | Método | Resultado | Evidência |
|---|---------|--------|-----------|-----------|
| C1 | Perfil legado `USER_18` | vercel curl HTTP 200 + Node.js sim | ✅ PASSOU | `c1-legacy-user18.txt` |
| C2 | Perfil moderno UUID `42159797-...` | Supabase MCP + vercel curl HTTP 200 + sim | ✅ PASSOU | `c2-modern-uuid.txt` |
| C3 | Perfil próprio autenticado | Análise estática + run3 evidence | ✅ PASSOU | `c3-own-authenticated.txt` |
| C4 | ID inválido `LIXO_INVALIDO_XYZ` | vercel curl HTTP 200 + sim → null | ✅ PASSOU | `c4-invalid-id.txt` |
| C5 | `product.html?id=18` → "Ver perfil" | vercel curl HTTP 200 + rastreio estático | ✅ PASSOU | `c5-product-to-profile.txt` |

**Conclusão:** Bug `profiles?id=eq.USER_18 → 400` resolvido. Patch 8.2.6.2 declarado **PRONTO PARA PROMOTE FUTURO**.

## O que NÃO foi tocado

- Schema, migrations, RLS, RPCs, Edge Functions, Storage
- Auth flows, syncProfile, login
- Admin banners, admin reports
- Comments/activities já saneados
- CSP / policies
- Nenhum deploy para produção
