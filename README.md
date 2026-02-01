# Kino Campus — Protótipo WEB (V8.1.6.2) — Denunciar Post (Reports) + Privacidade de Email (Supabase-first)

Este repositório é o **protótipo web offline-first** do **Kino Campus** (plataforma universitária por módulos), agora com **integração Supabase-first** (Postgres + Auth + Storage) na linha **V8.1.x**.

A **V8.1.6.2** mantém o app **100% funcional em modo local** por padrão (`KC_ENV.driver = "local"`), evitando qualquer quebra. Ao mesmo tempo, quando você ativa manualmente `KC_ENV.driver = "supabase"` e configura `KC_ENV.supabase.url/anonKey`, o app passa a usar:

- **Leitura real**: `KCAPI.getPosts(filters)` e `KCAPI.getPostById(id)` com JOINs (`profiles` + `post_media`) e fallback para `legacy_id`.
- **Escrita real**: `KCAPI.createPost(data)` com **upload no Storage** + **insert em `posts`/`post_media`**.
- **Auth**: `KCAPI.login(email, password)`, `KCAPI.logout()` e `KCAPI.getCurrentUser()`.

---

## ✅ O que esta versão garante

- **Hardening RLS / Colunas Sensíveis (Roadmap 8.1.6.1)**
  - Bloqueia escrita direta no client em:
    - `public.profiles.verified`
    - `public.posts.author_id`
  - Arquivo: `supabase/migrations/v8.1.6.1_rls_column_hardening.sql`

- **Denunciar Post (Roadmap 8.1.6.2)**
  - Em `driver = supabase` + usuário logado, é possível denunciar um post em `product.html`.
  - Insere 1 linha em `public.reports` via `KCAPI.reportPost(postId, { reason, details })`.
  - Anti-spam mínimo: impede duplicação por `unique (post_id, reporter_id)`.
  - RLS: insert restrito ao dono (`reporter_id = auth.uid()`); SELECT negado por padrão.
  - Arquivo: `supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql`

- **Privacidade: `profiles.email` (solidez)**
  - Hardening preferido aplicado: `REVOKE SELECT(email)` para `anon` e `authenticated`.
  - O front não seleciona mais `profiles.email` em JOINs (`posts → profiles`).
  - Arquivo: `supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql`

- **Offline-first mantido (default)**
  - Seed local: `data/database.json`
  - Posts do usuário: `localStorage["kc_user_posts"]`

- **Migração assistida (Roadmap 8.1.5.4)**
  - Em `driver = supabase` + usuário logado, se houver posts locais não migrados, aparece um CTA “Você tem X posts locais. Migrar?”
  - Ao iniciar a migração:
    - cria backup automático: `kc_user_posts_backup_<timestamp>`
    - migra de forma idempotente (marca `metadata.migratedToSupabase` e `metadata.supabaseId`)
    - mostra progresso e relatório final (sucessos/falhas)

- **Driver Pattern (KC_ENV)**
  - Arquivo: `assets/js/kc-env.js`
  - `driver: "local" | "supabase"` (default: `local`)
  - *Safe boot:* se o Supabase não estiver configurado, o driver continua `local`.

- **Contrato único de Post (MVC-ready)**
  - Normalização: `KCAPI.normalizePost()`
  - Regras de apresentação: `KCUtils.applyPresentationRules()`
  - Model: `KCPostModel.from(raw, { pageModule, view })`

- **Create Post com duas rotas (sem regressão)**
  - `driver = local`: salva no `localStorage` como antes.
  - `driver = supabase`: exige sessão (RLS) e publica no Supabase (Storage + Postgres).

---

## ✅ Checklist (Roadmap 8.1.2)

Validação rápida do que o Roadmap exige na seção **8.1.2 (Supabase-first)**:

- **Schema SQL** (`supabase/schema-bootstrap-v8.1.2.3.sql`)
  - Tabelas **`profiles`**, **`posts`** e **`post_media`** criadas.
  - **RLS habilitado** e políticas (leitura pública / escrita do dono) declaradas.
- **Storage**
  - Bucket **`kino-media`** referenciado no SQL (criação/garantia do bucket) e usado pelo upload no driver.
- **Compat `legacy_id`**
  - `getPostById(id)` tenta UUID e faz fallback para `legacy_id` (mantém compatibilidade com o seed `database.json`).

---

## 🚀 Como rodar (recomendado)

### Opção A — VS Code Live Server
1. Abra a pasta `kino-campus/` no VS Code
2. Clique em **“Go Live”**
3. Acesse `index.html`

### Opção B — Python
Na pasta `kino-campus/`:

```bash
python -m http.server 5500
```

Abra:
- `http://localhost:5500/index.html`

---

## 🧩 Supabase (ativação manual)

### 1) Schema
- SQL para copiar/colar no Supabase SQL Editor (na ordem):
  1) `supabase/schema-bootstrap-v8.1.2.3.sql`
  2) `supabase/schema-update-v8.1.3.2.sql` (coluna `profiles.verified`)
  3) `supabase/migrations/v8.1.3.3_auto_verify.sql` (trigger server-side do `verified`)
  4) `supabase/migrations/v8.1.5.1_write_path_hardening.sql` (Storage hardening + `post_media.sort_order`)
  5) `supabase/migrations/v8.1.6.1_rls_column_hardening.sql` (REVOKE de colunas sensíveis)
  6) `supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql` (reports + privacidade do email)

### 2) Storage
- Bucket esperado: `kino-media` (configurado em `KC_ENV.supabase.storageBucket`).
- O driver de escrita usa caminhos (path controlado para hardening/policies):
  - `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`

> Para funcionar com `<img src="...">` no protótipo, o ideal é o bucket estar público (ou você adaptará para Signed URLs na próxima fase).

### 3) Config (KC_ENV)
Edite `assets/js/kc-env.js`:
- `driver: "supabase"`
- `supabase.url` e `supabase.anonKey`

---

## 🔜 Próxima sprint sugerida (V8.1.6.3)

- **Aprimorar moderação (triagem mínima / status) — se houver schema previsto no Roadmap**
- **Signed URLs no Storage** (se o bucket deixar de ser público)

