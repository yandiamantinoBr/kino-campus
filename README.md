# Kino Campus — Protótipo WEB (V8.1.5.1-PATCH) — Write Path (Create Post) + Storage Hardening

Este repositório é o **protótipo web offline-first** do **Kino Campus** (plataforma universitária por módulos), agora com **integração Supabase-first** (Postgres + Auth + Storage) na linha **V8.1.x**.

A **V8.1.5.1-PATCH** mantém o app **100% funcional em modo local** por padrão (`KC_ENV.driver = "local"`), evitando qualquer quebra. Ao mesmo tempo, quando você ativa manualmente `KC_ENV.driver = "supabase"` e configura `KC_ENV.supabase.url/anonKey`, o app passa a usar:

- **Leitura real**: `KCAPI.getPosts(filters)` e `KCAPI.getPostById(id)` com JOINs (`profiles` + `post_media`) e fallback para `legacy_id`.
- **Escrita real**: `KCAPI.createPost(data)` com **upload no Storage** + **insert em `posts`/`post_media`**.
- **Auth**: `KCAPI.login(email, password)`, `KCAPI.logout()` e `KCAPI.getCurrentUser()`.

---

## ✅ O que esta versão garante

- **Offline-first mantido (default)**
  - Seed local: `data/database.json`
  - Posts do usuário: `localStorage["kc_user_posts"]`

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
- SQL para copiar/colar no Supabase SQL Editor:
  - `supabase/schema-bootstrap-v8.1.2.3.sql`

### 2) Storage
- Bucket esperado: `kino-media` (configurado em `KC_ENV.supabase.storageBucket`).
- O driver de escrita usa caminhos:
  - `posts/{timestamp}-image-{n}.{ext}`

> Para funcionar com `<img src="...">` no protótipo, o ideal é o bucket estar público (ou você adaptará para Signed URLs na próxima fase).

### 3) Config (KC_ENV)
Edite `assets/js/kc-env.js`:
- `driver: "supabase"`
- `supabase.url` e `supabase.anonKey`

---

## 🔜 Próxima sprint sugerida (V8.1.2.5)

- **UI de autenticação** (sem quebrar o modo local):
  - Tela/modal de login (email/senha) consumindo `KCAPI.login/logout/getCurrentUser`.
  - Indicador de sessão ("Olá, Nome") no header.

- **Pós-publicação no modo Supabase**
  - Redirecionar para `product.html?id=<uuid>` após `createPost`.
  - Garantir que os feeds em `driver=supabase` reflitam imediatamente o novo post (com paginação).

