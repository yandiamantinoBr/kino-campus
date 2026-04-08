# Kino Campus — v9.4.4

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. Acesso restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)
**Branch principal:** `kinocampus-V9.0-foundations`

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS (59 módulos IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions + Realtime) |
| Hosting | Vercel (static site + serverless OG images) |
| Domínio | kinocampus.com.br (Hostinger, DNS para Vercel) |
| Build | `node scripts/inject-env.js` (substitui placeholders) |
| Testes | Jest: 26 suites, 447 testes, ~52% cobertura de linhas |

---

## Funcionalidades (v9)

| Fase | Feature | PR |
|------|---------|-----|
| v9.0 | Documentação técnica + hardening de segurança (SVG block, magic bytes, session) | #194 |
| v9.0 | Cobertura de testes expandida (45%+, 18 suites) | #196 |
| v9.0 | Dívida técnica DB: retenção de analytics, deprecação de legacy_id | #197 |
| v9.1 | Notificações in-app com Realtime | #198–#200 |
| v9.1 | Avaliações de usuários (1–5 estrelas + reputação) | #202 |
| v9.1 | Sistema de convites externos (Edge Function + whitelist + UI admin) | #203–#206 |
| v9.2 | Filtros avançados nos feeds (preço, data, tipo) | #201 |
| v9.3 | Analytics de post para autores (view tracking + mini-stats) | #207 |
| v9.3 | Moderação automática anti-spam (flood control + link spam + new user trust) | #208 |
| v9.4 | Lazy loading de módulos grandes via `KCLazyLoader` | #209 |
| v9.4 | Otimização de imagens (compressão client-side Canvas API + LCP hints) | #210 |
| v9.4 | Acessibilidade A11y (skip-link, aria-labels, focus-visible — 17 HTMLs) | #211 |
| fix | Hotfix comentários + empty state perfil | #212 |
| fix | Root cause comentários lazy load: `KCLazyLoader.load()` em 3 pontos | #213 |

---

## Regra de release (anti-drift)

Sempre que houver release do front:

1. Definir uma versão-alvo única para todos os módulos de front.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados.
3. Validar referências visuais de versão na UI (ex.: rodapé do modal de auth).
4. Registrar no `README.md` e no `CHANGELOG.md`.

---

## Fonte Única de Verdade (Banco)

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

---

## Como rodar (desenvolvimento)

### Opção A — VS Code Live Server
1. Abra a pasta `kino-campus/` no VS Code
2. Clique em **"Go Live"**
3. Acesse `index.html`

### Opção B — Python
```bash
python -m http.server 5500
```
Acesse `http://localhost:5500/index.html`

---

## Ativação Supabase (produção)

### 1) Migrations

Aplique todas as migrations em `supabase/migrations/` em **ordem alfabética** (atualmente 71 arquivos, de `v8.1.3.3_*` a `v9.3.2.0_*`).

> Para cada arquivo: copie o conteúdo e execute no **SQL Editor** do Supabase, ou use a CLI: `supabase db push`.

### 2) Schema bootstrap (apenas novo projeto)

Se estiver iniciando um projeto do zero, aplique antes:
1. `supabase/schema-bootstrap-v8.1.2.3.sql`
2. `supabase/schema-update-v8.1.3.2.sql`
3. Depois todas as migrations em ordem

### 3) Storage

Bucket esperado: `kino-media` (configurado em `KC_ENV.supabase.storageBucket`).
- Caminhos: `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}` e `avatars/{uid}.{ext}`

### 4) Configuração (KC_ENV)

Edite `assets/js/kc-env.js`:
```javascript
environment: "production",
driver: "supabase",
supabase: {
  url: "https://SEU_PROJECT_ID.supabase.co",
  anonKey: "SUA_ANON_KEY",
  storageBucket: "kino-media"
}
```

> Em `production`, `driver = "supabase"` é obrigatório. Modo `local` é apenas para desenvolvimento.

### 5) Edge Functions

**notify-admin-reports-threshold** (alerta admin por denúncias):
```bash
supabase functions deploy notify-admin-reports-threshold
```
Secrets necessários: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KC_APP_BASE_URL`, `ADMIN_REPORTS_WEBHOOK_URL`, `KC_NOTIFY_HMAC_SECRET`, `REPORTS_THRESHOLD` (default: 3), `REPORTS_NOTIFY_COOLDOWN_HOURS` (default: 24).

**kc-invite-user** (convites externos):
```bash
supabase functions deploy kc-invite-user
```

### 6) Settings de banco (fora do git)
- `app.settings.kc_notify_function_url` = URL completa da Edge Function
- `app.settings.kc_notify_function_auth_token` = JWT de autorização
- `app.settings.kc_notify_hmac_secret` = mesmo valor de `KC_NOTIFY_HMAC_SECRET`

---

## Testes

```bash
npm test              # roda todos os 447 testes (26 suites)
npm test -- --runInBand  # sequencial (mais estável em CI)
node scripts/hygiene-check.js  # checagem de drift de versão e invariantes
```

Cobertura atual: ~52% de linhas. Meta evolutiva: 60%+.

---

## QA

- `docs/qa/e2e-checklist.md` — checklist de validação manual completo
- `docs/qa/rls-smoke.sql` — smoke tests de RLS no Supabase
- `docs/qa/xss-payloads.md` — payloads para testes de segurança XSS
- `docs/qa/v8.1.11.1-admin-reports-threshold.md` — guia operacional da Edge Function de alertas
- `docs/ops/vercel-supabase-invariants.md` — invariantes de deploy Vercel + Supabase

---

## Documentação técnica

| Arquivo | Conteúdo |
|---------|----------|
| `docs/architecture.md` | Mapa de dependências JS, padrão IIFE, driver pattern |
| `docs/api-contract.md` | Contrato KCAPI: métodos, parâmetros, retornos |
| `docs/db-schema.md` | 19 tabelas, RLS, triggers, Storage, pg_cron |
| `docs/rpc-catalog.md` | 80+ RPCs com assinaturas e exemplos |
| `docs/module-schemas.md` | KC_CREATE_SCHEMA dos 6 módulos |
| `docs/env-vars.md` | Variáveis de ambiente Vercel + Supabase + KC_ENV |
| `docs/design-system.md` | CSS custom properties, componentes, breakpoints |
| `RELATORIO-KINOCAMPUS-V9.md` | Relatório técnico completo — diagnóstico, arquitetura, histórico de todas as fases v9 |
