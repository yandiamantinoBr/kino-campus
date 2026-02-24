# Kino Campus — Protótipo WEB (V8.2.2.0) — RC Cleanroom (LOTES 1-3)

Este repositório é o **protótipo web offline-first** do **Kino Campus** (plataforma universitária por módulos), agora com **integração Supabase-first** (Postgres + Auth + Storage) na linha **V8.2.x**.

A **V8.2.2.0** consolida os **LOTEs 1, 2 e 3** do cleanroom RC, sem feature creep:
- **LOTE 1**: saneamento de interação (CSP/handlers) e hardening de votos contra `409 (Conflict)`.
- **LOTE 2**: diagnóstico por etapa no create-post (`[KC][CREATE_POST]`) e fluxo admin sem falso positivo de persistência.
- **LOTE 3**: fechamento mobile/FOUC e kit QA final (`docs/qa/rls-smoke.sql` + relatórios de release).

O runtime oficial permanece **front estático + Supabase** (sem backend Node ativo no deploy). Em **produção**, `KC_ENV.driver = "supabase"` é obrigatório e não existe fallback silencioso para `local`; o modo `local` é permitido somente em desenvolvimento.

- **Leitura real**: `KCAPI.getPosts(filters)` e `KCAPI.getPostById(id)` com JOINs (`profiles` + `post_media`) e fallback para `legacy_id`.
- **Escrita real**: `KCAPI.createPost(data)` com **upload no Storage** + **insert em `posts`/`post_media`**.
- **Auth**: `KCAPI.login(email, password)`, `KCAPI.logout()` e `KCAPI.getCurrentUser()`.

---


## 🧭 Mapa de versão do front (arquivo → versão)

Versão-alvo única atual: **`8.2.2.0`**

- `assets/js/kc-env.js` → `8.2.2.0`
- `assets/js/kc-api.client.js` → `8.2.2.0`
- `assets/js/kc-supabase.client.js` → `8.2.2.0`
- `assets/js/kc-auth.ui.js` → `8.2.2.0`

> Referência visual: o rodapé do modal de autenticação exibe `Auth UI v8.2.2.0` (derivado de `assets/js/kc-auth.ui.js`).

## 📦 Regra de release (anti-drift)

Sempre que houver release do front:

1. Definir uma versão-alvo única (`major.minor.patch.build`) para todos os módulos de front.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados acima.
3. Validar referências visuais de versão na UI (ex.: rodapé do modal de auth).
4. Registrar o mapa “arquivo → versão” no `README.md` e no `CHANGELOG.md`.

## 🗃️ Fonte Única de Verdade (Banco)

Para governança de banco no projeto, a **fonte única de verdade** é a esteira SQL oficial do Supabase.
Não existe caminho operacional por `sql/` na raiz.

Para visão consolidada dos artefatos legados e critérios de remoção, consulte o **Legacy Map** em `docs/legacy/README.md`.

### Regra explícita (mudanças críticas)

Qualquer mudança crítica de banco (incluindo, mas não limitado a: **auth, `verified`, policies, triggers, RLS, storage policies, grants/revokes**) deve existir **somente** em:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

### Procedimento obrigatório para SQL fora do fluxo oficial

Se surgir SQL fora da esteira oficial (script ad hoc, patch local, validação antiga, experimento):

1. **Mover** o arquivo para `docs/legacy/sql/`.
2. **Documentar** no `docs/legacy/README.md` o motivo de legado (com referência ao arquivo oficial quando existir).
3. **Não usar operacionalmente** esse SQL em deploy/setup/update.
4. **Não recriar** diretório `sql/` na raiz do projeto.

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

- **Offline-first em desenvolvimento**
  - Seed local: `data/database.json`
  - Posts do usuário: `localStorage["kc_user_posts"]` (somente ambiente `development`)

- **Migração assistida (Roadmap 8.1.5.4)**
  - Em `driver = supabase` + usuário logado, se houver posts locais não migrados, aparece um CTA “Você tem X posts locais. Migrar?”
  - Ao iniciar a migração:
    - cria backup automático: `kc_user_posts_backup_<timestamp>`
    - migra de forma idempotente (marca `metadata.migratedToSupabase` e `metadata.supabaseId`)
    - mostra progresso e relatório final (sucessos/falhas)

- **Driver Pattern (KC_ENV) com política de ambiente**
  - Arquivo: `assets/js/kc-env.js`
  - `environment / APP_ENV: "development" | "production"`
  - `driver: "local" | "supabase"`
  - Em `production`, `driver` obrigatório = `"supabase"` (sem *safe boot* silencioso para `local`).
  - Em `development`, `driver = "local"` continua suportado para fluxo offline-first.

- **Realtime opcional no feed (Roadmap 8.1.12.0)**
  - `KCSupabase.subscribeNewPosts({ filter, onPost })` + façade `KCRealtime`.
  - Buffer no feed com banner “Novo post disponível” e inserção no topo sem reload.
  - Defesa adicional de visibilidade no client: apenas `status = 'published'`.

- **Contrato único de Post (MVC-ready)**
  - Normalização: `KCAPI.normalizePost()`
  - Regras de apresentação: `KCUtils.applyPresentationRules()`
  - Model: `KCPostModel.from(raw, { pageModule, view })`

- **Ações críticas (produção x desenvolvimento)**
  - `createPost`, `votePost` e `addComment` exigem Supabase em `production` (retornam erro explícito quando o driver não é `supabase`).
  - Persistência em `localStorage` para criação de post/comentário permanece apenas em `development`.

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
  7) `supabase/migrations/v8.1.7.5_auth_egresso_domain.sql` (inclui `@egresso.ufg.br` na regra institucional + backfill de `profiles.verified`)
  8) `supabase/migrations/v8.1.9.1_admin_posts_select.sql` (SELECT de posts para admins)
  9) `supabase/migrations/v8.1.10.0_profile_mvp_display_name.sql` (display_name em profiles)
  10) `supabase/migrations/v8.1.11.0_audit_log.sql` (audit log de moderação/compliance)
  11) `supabase/migrations/v8.1.11.1_admin_reports_threshold_notify.sql` (trigger -> Edge Function para alerta de denúncias)

> Nota de deploy: o ajuste histórico de `docs/legacy/sql/13_fix_auth_egresso_domain.sql` já está consolidado na esteira oficial (`supabase/migrations/v8.1.7.5_auth_egresso_domain.sql`). Para comportamento crítico de autenticação, use apenas arquivos de `supabase/migrations/`.

### 2) Storage
- Bucket esperado: `kino-media` (configurado em `KC_ENV.supabase.storageBucket`).
- O driver de escrita usa caminhos (path controlado para hardening/policies):
  - `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`

> Para funcionar com `<img src="...">` no protótipo, o ideal é o bucket estar público (ou você adaptará para Signed URLs na próxima fase).

### 3) Config (KC_ENV)
Edite `assets/js/kc-env.js`:
- `environment: "production"` (ou `APP_ENV: "production"`)
- `driver: "supabase"`
- `supabase.url` e `supabase.anonKey`

### 4) Edge Function (alerta admin por denúncias)
1. Deploy da função:
   - `supabase functions deploy notify-admin-reports-threshold`
2. Configurar secrets da função:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `KC_APP_BASE_URL` (ex.: `https://<seu-dominio>`)
   - `ADMIN_REPORTS_WEBHOOK_URL`
   - `KC_NOTIFY_HMAC_SECRET` (segredo forte compartilhado com o banco)
   - `REPORTS_THRESHOLD` (opcional; default `3`)
   - `REPORTS_NOTIFY_COOLDOWN_HOURS` (opcional; default `24`)
3. Configurar settings no banco (fora do git):
   - `app.settings.kc_notify_function_url` = URL completa da função
   - `app.settings.kc_notify_function_auth_token` = JWT de autorização da função (ex.: service role)
   - `app.settings.kc_notify_hmac_secret` = mesmo valor de `KC_NOTIFY_HMAC_SECRET`

---


## 🧪 QA (checklists e smoke tests)

Para validação manual e de segurança (RLS), consulte:

- `docs/qa/e2e-checklist.md`
- `docs/qa/rls-smoke.sql`
- `docs/qa/v8.1.11.1-admin-reports-threshold.md`

## 🔜 Próxima sprint sugerida (V8.1.6.3)

- **Aprimorar moderação (triagem mínima / status) — se houver schema previsto no Roadmap**
- **Signed URLs no Storage** (se o bucket deixar de ser público)
