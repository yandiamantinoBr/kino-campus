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

## Validação — run4 (2026-03-19)

**Preview:** `kino-campus-1a3h26jub-yannakamurabrs-projects.vercel.app`
**Nota:** Preview protegido por Vercel Authentication (401 via WebFetch — esperado). Browser automation (Playwright MCP) indisponível nesta sessão. Validação realizada via unit simulation Node.js + PENDENTE MANUAL para cenários browser.

### Validação lógica (Node.js unit simulation) — TODOS PASSARAM

| # | Cenário | Resultado | Evidência |
|---|---------|-----------|-----------|
| C1 | `getProfileById('USER_18')` retorna mock com `display_name='Pedro Henrique'` | ✅ PASSOU | `evidence/v8.2.6.2-preview-run4/validation-logic-unit-test.txt` |
| C2 | `getProfileById('<uuid-real>')` retorna perfil Supabase | ✅ PASSOU | idem |
| C4 | `getProfileById('LIXO_INVALIDO')` retorna null | ✅ PASSOU | idem |
| C1b | Mock retorna `verified:false, is_admin:false` | ✅ PASSOU | idem |
| C1c | Objeto retornado não expõe campo `email` | ✅ PASSOU | idem |

### Cenários browser (PENDENTE MANUAL)

| # | Cenário | URL | Critério |
|---|---------|-----|---------|
| 1 | Perfil público legado | `profile.html?id=USER_18` | Mostra "Pedro Henrique" + avatar |
| 2 | Perfil público moderno | `profile.html?id=<uuid-real>` | Perfil Supabase carrega |
| 3 | Perfil próprio autenticado | `profile.html` (logado) | Avatar, handle, "Editar perfil" |
| 4 | ID inválido | `profile.html?id=LIXO_INVALIDO_XYZ` | "Perfil nao encontrado" |
| 5 | Fluxo produto→perfil | `product.html?id=18` → "Ver perfil" | Renderiza mock profile USER_18 |

**Passos para validação manual:**
1. Acessar o preview com bypass de autenticação Vercel (share link ou token de sessão válido)
2. Para C3: fazer login com conta `@ufg.br` válida antes de navegar para `profile.html`
3. Capturar screenshot de cada cenário em `output/playwright/evidence/v8.2.6.2-preview-run4/`
4. Nomes sugeridos: `c1-legacy-user18.png`, `c2-modern-uuid.png`, `c3-own-authenticated.png`, `c4-invalid-id.png`, `c5-product-to-profile.png`

## O que NÃO foi tocado

- Schema, migrations, RLS, RPCs, Edge Functions, Storage
- Auth flows, syncProfile, login
- Admin banners, admin reports
- Comments/activities já saneados
- CSP / policies
- Nenhum deploy para produção
