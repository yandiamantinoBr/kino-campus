# Kino Campus - v75.1.0

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. O acesso é restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)  
**Branch principal:** `kinocampus-V75.0-foundations`

**Status atual:** v75.1 performance phase 1 em producao, com runtime frontend 8.6.1.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel |
| Domínio | `kinocampus.com.br` |
| Build | `node scripts/inject-env.js` |
| Testes | Jest: 183 suites · 3691 testes; Playwright: 10 specs E2E (68 testes listados) |

## Documentação Técnica

> **Para IAs e desenvolvedores novos:** leia o [Guia de Desenvolvimento para IA](docs/architecture/ai-development-guide.md) antes de qualquer modificação. Ele é auto-contido e cobre workflow, padrões de código, validators, testes e convenções do projeto.

| Documento | Conteúdo |
|-----------|----------|
| [docs/index.md](docs/index.md) | Índice completo de todos os documentos técnicos |
| [docs/architecture/ai-development-guide.md](docs/architecture/ai-development-guide.md) | **Guia de comportamento para IA** — workflow, padrões JS, validators, testes, o que nunca fazer |
| [docs/architecture/module-catalog.md](docs/architecture/module-catalog.md) | Catalogo de modulos JS com namespace, paginas, dependencias e testes |
| [docs/architecture/controllers-catalog.md](docs/architecture/controllers-catalog.md) | 48 controllers com responsabilidade e chamadas KCAPI |
| [docs/architecture/data-flow-guide.md](docs/architecture/data-flow-guide.md) | Fluxo de dados ponta a ponta: controller → KCAPI → adapter → Supabase |
| [docs/architecture/css-architecture.md](docs/architecture/css-architecture.md) | CSS de producao, ownership de `styles.css` e status de `future-split/` |
| [docs/api-contract.md](docs/api-contract.md) | Contrato público da KCAPI |
| [docs/db-schema.md](docs/db-schema.md) | Tabelas, políticas RLS, índices e Storage do Supabase |

---

## Histórico de Versões

O histórico detalhado de todas as releases está no [CHANGELOG.md](CHANGELOG.md).

| Versão | Relatório | Tema |
|--------|-----------|------|
| V75.1 | [CHANGELOG.md](CHANGELOG.md) | Performance phase 1, runtime 8.6.1 e Speed Insights |
| V75 | [RELATORIO-KINOCAMPUS-V75.md](RELATORIO-KINOCAMPUS-V75.md) | PUBLIC-A11Y kc-ranking decorative icons |
| V74 | [RELATORIO-KINOCAMPUS-V74.md](RELATORIO-KINOCAMPUS-V74.md) | PUBLIC-A11Y admin-reports decorative icons |
| V73 | [RELATORIO-KINOCAMPUS-V73.md](RELATORIO-KINOCAMPUS-V73.md) | PUBLIC-A11Y kc-comments decorative icons |
| V72 | [RELATORIO-KINOCAMPUS-V72.md](RELATORIO-KINOCAMPUS-V72.md) | PUBLIC-A11Y admin dashboard controller decorative icons |
| V71 | [RELATORIO-KINOCAMPUS-V71.md](RELATORIO-KINOCAMPUS-V71.md) | PUBLIC-A11Y admin dashboard charts decorative icons |
| V15-V70 | [docs/archive/relatorios/_INDEX.md](docs/archive/relatorios/_INDEX.md) | Historico arquivado recente |
| V9–V14 | [docs/archive/relatorios/_INDEX.md](docs/archive/relatorios/_INDEX.md) | Histórico arquivado |

---

## Como rodar localmente

### Opção A - VS Code Live Server

1. Abra a pasta `kino-campus/` no VS Code.
2. Clique em `Go Live`.
3. Acesse `index.html`.

### Opção B - Python

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500/index.html`.

---

## Ativação Supabase

### 1) Migrations

Aplique todas as migrations em `supabase/migrations/` em ordem alfabética. Atualmente o diretório contém **132 arquivos**, incluindo as 2 migrations da v10, a migration operacional `v9.3.3.0_supabase_operational_rls_fk.sql`, a trilha `v11.20.1.0_notification_preferences.sql`, a fundação `v11.20.2.0_notification_delivery_outbox.sql`, a promoção do canal de e-mail `v11.21.0.0_notification_email_channel.sql`, a camada privada do canal WhatsApp `v11.21.1.0_notification_whatsapp_channel.sql` e o scheduler `v11.22.0.0_notification_dispatch_scheduler.sql`.

No banco principal atual, as 2 migrations da v10 já foram aplicadas. Use a lista abaixo para ambientes novos, bancos recriados ou staging separado.

Se estiver atualizando um ambiente que já estava em v9, garanta pelo menos a aplicação destas novas migrations:

1. `v10.0.0.0_admin_search_posts_full.sql`
2. `v10.0.1.0_admin_help_requests_pagination.sql`
3. `v11.20.1.0_notification_preferences.sql`
4. `v11.20.2.0_notification_delivery_outbox.sql`
5. `v11.21.0.0_notification_email_channel.sql`
6. `v11.21.1.0_notification_whatsapp_channel.sql`
7. `v11.22.0.0_notification_dispatch_scheduler.sql`

Você pode aplicar pelo SQL Editor do Supabase ou pela CLI.

### 2) Schema bootstrap

Para um projeto novo, aplique antes:

1. `supabase/schema-bootstrap-v8.1.2.3.sql`
2. `supabase/schema-update-v8.1.3.2.sql`
3. Depois as migrations em ordem

### 3) Storage

Bucket esperado: `kino-media`.

- `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`
- `profile-avatars/{userId}/{timestamp}-avatar.{ext}`

### 4) KC_ENV

Edite/injete `assets/js/boot/kc-env.js`:

```javascript
environment: "production",
driver: "supabase",
supabase: {
  url: "https://SEU_PROJECT_ID.supabase.co",
  anonKey: "SUA_ANON_KEY",
  storageBucket: "kino-media"
}
```

Em produção, `driver = "supabase"` é obrigatório. `local` é apenas para desenvolvimento.

### 5) Edge Functions

Verificacao remota V75 (2026-06-11): no projeto Supabase `Kino Campus`,
`kc-dispatch-notification-outbox` esta ativa e `notify-admin-reports-threshold` nao aparece
na lista remota de Edge Functions. A funcao de reports continua versionada no repo, mas nao
deve ser publicada sem validar secrets, contrato de chamada e impacto operacional.

**notify-admin-reports-threshold**

```bash
supabase functions deploy notify-admin-reports-threshold
```

**kc-invite-user**

```bash
supabase functions deploy kc-invite-user
```

**kc-dispatch-notification-outbox**

```bash
supabase functions deploy kc-dispatch-notification-outbox
```

Segredos obrigatórios desta função:

- `KC_NOTIFICATION_DISPATCH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Segredos adicionais para o canal de e-mail (`v11.21.0`):

- `KC_NOTIFICATION_EMAIL_PROVIDER` (`resend`)
- `KC_NOTIFICATION_EMAIL_API_KEY`
- `KC_NOTIFICATION_EMAIL_FROM`
- opcionalmente `KC_NOTIFICATION_EMAIL_REPLY_TO`
- opcionalmente `KC_APP_BASE_URL`
- opcionalmente `KC_NOTIFICATION_DISPATCH_BATCH_LIMIT`

Segredos adicionais para o canal de WhatsApp (`v11.21.1`):

- `KC_NOTIFICATION_WHATSAPP_PROVIDER`
- `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`
- `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`
- `KC_NOTIFICATION_WHATSAPP_FROM`
- `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_STATUS_CALLBACK`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_TEMPLATE_NAME`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_WINDOW_MINUTES`
- opcionalmente `KC_NOTIFICATION_WHATSAPP_RATE_LIMIT_MAX_PER_WINDOW`

Observações:

- a `v11.21.0` publica essa função com envio real por e-mail via `Resend`, mas o projeto Supabase principal ainda precisa receber os segredos `KC_NOTIFICATION_EMAIL_*` para sair do gating operacional
- a `v11.21.1` implementa o canal privado de WhatsApp sem reutilizar o contato publico do perfil; o envio real depende dos segredos `KC_NOTIFICATION_WHATSAPP_*`
- a invocação exige o header `x-kc-dispatch-secret`
- a `v11.22.0` adiciona um scheduler no banco para consumir a outbox automaticamente

### 6) Settings de banco fora do git

- `public.notification_dispatch_runtime.slot = 'primary'`
- `public.notification_dispatch_runtime.function_url`
- `public.notification_dispatch_runtime.dispatch_secret`
- opcionalmente `public.notification_dispatch_runtime.batch_limit`
- `app.settings.kc_notify_function_url`
- `app.settings.kc_notify_function_auth_token`
- `app.settings.kc_notify_hmac_secret`

---

## Regra de release

Sempre que houver release de frontend:

1. Definir uma versão-alvo única para todos os módulos de frontend.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados.
3. Validar referências visuais de versão na UI.
4. Registrar a mudança em `README.md` e `CHANGELOG.md`.

> Para o fluxo completo de iteração (branch → PR → merge), ver [docs/architecture/ai-development-guide.md](docs/architecture/ai-development-guide.md).

---

## Fonte única de verdade do banco

A fonte oficial de verdade para banco é a esteira SQL do Supabase:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Não existe caminho operacional por `sql/` na raiz.

### Regra explícita para mudanças críticas

Qualquer mudança crítica de banco, incluindo auth, `verified`, policies, triggers, RLS, storage policies e grants/revokes, deve existir somente em:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Se surgir SQL fora do fluxo oficial:

1. Mover para `docs/archive/`.
2. Não usar operacionalmente em deploy ou setup.
3. Não recriar diretório `sql/` na raiz.

---

## Testes e QA

```bash
npm run check:all          # 5 validators: version, structure, scripts, routes, hygiene
npm test                   # Jest: 183 suites · 3691 testes
npm test -- --runInBand    # sequencial (mais lento, mais estável em CI)
```

Artefatos de QA: `docs/qa/` — checklist E2E, smoke RLS, payloads XSS e invariantes Vercel/Supabase.
