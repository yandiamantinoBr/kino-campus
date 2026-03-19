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

## Cenários de aceite (pendentes browser/preview)

| # | Cenário | Esperado |
|---|---------|----------|
| 1 | `profile.html?id=USER_18` | Mostra "Pedro Henrique" com avatar |
| 2 | `profile.html?id=<uuid-real>` | Perfil Supabase carrega normalmente |
| 3 | `profile.html` logado | Perfil próprio autenticado OK |
| 4 | `profile.html?id=LIXO_INVALIDO` | "Perfil nao encontrado" |
| 5 | Produto legado → "Ver perfil" | Navega e renderiza mock profile |

## O que NÃO foi tocado

- Schema, migrations, RLS, RPCs, Edge Functions, Storage
- Auth flows, syncProfile, login
- Admin banners, admin reports
- Comments/activities já saneados
- CSP / policies
- Nenhum deploy para produção
