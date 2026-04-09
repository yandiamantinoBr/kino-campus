# Kino Campus - v10.0.0

> Plataforma de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG).

Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. O acesso é restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**Produção:** [kinocampus.com.br](https://www.kinocampus.com.br)  
**Branch principal:** `kinocampus-V11.0-foundations`  
**Status atual:** código da v10 admin mergeado na base atual via PRs `#215` a `#222`, com as 2 migrations SQL da v10 já aplicadas no banco principal, follow-ups de abril de 2026 consolidados e a v11 em execução pelas iterações `v11.1.0`, `v11.2.0`, `v11.2.1`, `v11.3.0`, `v11.4.0`, `v11.5.0` e `v11.6.0`.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel |
| Domínio | `kinocampus.com.br` |
| Build | `node scripts/inject-env.js` |
| Testes | Jest: 26 suites, 447 testes |

---

## Entregas Recentes

| Fase | Entrega | PRs |
|------|---------|-----|
| v11.6.0 | hardening de iOS Safari: `pull-to-refresh` deixa de sequestrar gestos horizontais no topo, superfícies horizontais preservam `pinch-zoom` e o auth/modal deixa de induzir auto-zoom/travamento por `touch-action` e `font-size` inadequados | `#235` |
| v11.5.0 | restauração transversal do `Top Contribuidores` nos 6 módulos, removendo o bootstrap inline bloqueado pela CSP e normalizando o carregamento externo de `kc-ranking.js` | `#233` |
| v11.4.0 | correção transversal da sidebar desktop, restauração do preset canônico `Todas as datas` em `eventos` e inclusão funcional da categoria `Ingressos` em compra e venda | `#232` |
| v11.3.0 | paridade do `Limpar filtros` no empty state dos 6 feeds públicos e clear explícito de data no módulo `eventos` | `#231` |
| v11.2.1 | reativação do Vercel MCP no Codex, homologação de time/projeto/deployments/logs e fechamento da validação pós-merge da `v11.2.0` | `#230` |
| v11.2.0 | consistência de shell público: estados ativos da navegação, menu móvel coerente em páginas secundárias e busca mobile adicionada na `create-post.html` | `#229` |
| v11.1.0 | baseline documental da v11: sincronização de README, changelog e docs técnicas com o estado real da base | `#228` |
| docs | Sincronização do `README.md` com o estado real da v10 e nota operacional das migrations SQL da v10 | `#223` |
| v10.0 | Admin Panel Overhaul: navegação unificada, hardening dos controllers admin, busca e paginação server-side no admin, responsividade consolidada e ajustes de UX | `#215` a `#222` |
| v9.4.4 | Hotfix de comentários com `KCLazyLoader.load()` nos pontos críticos | `#213` |
| v9.4.3 | Hotfix de comentários e empty state do perfil | `#212` |
| v9.4.2 | Acessibilidade A11y em 17 HTMLs | `#211` |
| v9.4.1 | Otimização de imagens e ajustes de LCP | `#210` |
| v9.4.0 | Lazy loading de módulos grandes via `KCLazyLoader` | `#209` |
| v9.3.2 | Moderação automática anti-spam | `#208` |
| v9.3.1 | Analytics de post para autores | `#207` |
| v9.1.x | Notificações in-app, convites externos e avaliações de usuários | `#198` a `#206` |
| v9.0.x | Documentação técnica, segurança e expansão de testes | `#194` a `#197` |

---

## Planejamento v11

O planejamento detalhado da próxima fase está em [RELATORIO-KINOCAMPUS-V11.md](./RELATORIO-KINOCAMPUS-V11.md).

Regras desta fase:

- nenhuma implementação da v11 deve começar sem autorização explícita
- toda iteração da v11 deve atualizar este `README.md` e o `RELATORIO-KINOCAMPUS-V11.md`
- cada iteração aprovada deve seguir a esteira completa: branch própria, commit, push, PR, merge, delete branch, pull, validação no Supabase/Vercel e testes de regressão

### Progresso atual

- iteração ativa consolidada: `v11.6.0`
- objetivo da iteração: endurecer a experiência mobile em iOS Safari, removendo a disputa entre `pull-to-refresh`, swipe horizontal, pinch-zoom e auto-zoom de inputs nos pontos críticos da home, dos módulos equivalentes e do auth/modal compartilhado
- natureza da iteração: frontend compartilhado de shell/gestos, sem mudança de banco
- status operacional do deploy em `08 de abril de 2026`: a branch `codex/v11-6-0-ios-gesture-zoom-hardening` foi publicada na PR `#235` e já recebeu o preview Vercel `dpl_7W9YewxxyNVojvhpnnfB6G3DmvCw` (`kino-campus-git-codex-v11-6-0-io-116512-yannakamurabrs-projects.vercel.app`). O smoke local confirmou `touch-action` compatível com pinch nas superfícies afetadas, `font-size: 16px` no input do auth modal e abertura do `kc-create-modal` com `touch-action: pan-y pinch-zoom`. O Vercel MCP voltou a responder `Auth required` nesta máquina durante esta checagem, então a inspeção remota do preview ficou fechada pela CLI do Vercel e pela homologação local antes do merge.

---

## Mapa de Versão Canônica do Frontend

versão-alvo única atual: **`8.6.0`**

Este mapa existe para manter coerência com o `scripts/hygiene-check.js`, que ainda valida a versão canônica embutida do frontend. Isso não substitui a linha funcional/documental `v10` nem a execução da `v11`; apenas registra o estado real dos arquivos versionados.

| Arquivo | Referência atual |
|---------|------------------|
| `assets/js/kc-env.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-api.client.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-supabase.client.js` | `const VERSION = '8.6.0';` |
| `assets/js/kc-auth.ui.js` | auth UI v8.6.0 |
| `assets/js/kc-profiles.client.js` | `const VERSION = '8.6.0';` |
| `scripts/hygiene-check.js` | `canonicalVersion = '8.6.0'` |

O drift entre a linha funcional `v10` e a linha canônica embutida `8.6.0` foi oficialmente incorporado ao backlog da v11 para tratamento coordenado, nunca parcial.

---

## Admin v10

O painel admin foi reorganizado e endurecido em 8 PRs sequenciais:

| PR | Branch | Resultado |
|----|--------|-----------|
| `#215` | `fix/admin-v10-shell-nav` | navegação admin unificada, `active-link` robusto, `resize debounce`, `aria-label` nos toggles |
| `#216` | `fix/admin-v10-dashboard` | debounce/cancelamento do filtro de período, correções em audit log, export, ranking e modal |
| `#217` | `fix/admin-v10-moderation` | busca server-side no admin, debounce de busca, lock de ações e confirmação destrutiva |
| `#218` | `fix/admin-v10-reports` | paginação progressiva, contador, confirmação de exclusão e escaping consistente |
| `#219` | `fix/admin-v10-banners` | drag and drop sem listeners duplicados, preview com debounce e modal endurecida |
| `#220` | `fix/admin-v10-help-requests` | paginação server-side total-aware, guard de bind único, validação de enums e fallback seguro |
| `#221` | `fix/admin-v10-invite` | clipboard centralizado, cleanup de polling e null checks defensivos |
| `#222` | `fix/admin-v10-mobile-css` | breakpoints unificados, CSS compartilhado, `data-label` real e responsividade consolidada |

### Migrations novas da v10

Estas migrations já estão no repositório e **já foram aplicadas no banco principal atual**. Para ambientes novos, staging paralelo ou bancos recriados, aplique manualmente em ordem:

| Arquivo | Função criada | Status |
|---------|---------------|--------|
| `supabase/migrations/v10.0.0.0_admin_search_posts_full.sql` | `public.kc_admin_search_posts_full(...)` | aplicada no banco principal atual |
| `supabase/migrations/v10.0.1.0_admin_help_requests_pagination.sql` | `public.kc_admin_list_help_requests_paged(...)` | aplicada no banco principal atual |

### Importante

- No banco principal atual, essas migrations já estão ativas.
- A aplicação continua sendo feita **uma vez por banco/ambiente**.
- Se o seu banco de produção e o de staging forem diferentes, aplique em ambos.
- Depois de aplicar o SQL, **não é necessário redeploy do frontend** apenas por isso; um reload da página basta.

---

## Regra de release

Sempre que houver release de frontend:

1. Definir uma versão-alvo única para todos os módulos de frontend.
2. Atualizar em lote as constantes `VERSION` dos arquivos mapeados.
3. Validar referências visuais de versão na UI.
4. Registrar a mudança em `README.md` e `CHANGELOG.md`.

---

## Fonte única de verdade do banco

A fonte oficial de verdade para banco é a esteira SQL do Supabase:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Não existe caminho operacional por `sql/` na raiz.

Para artefatos legados e critérios de remoção, consulte `docs/legacy/README.md`.

### Regra explícita para mudanças críticas

Qualquer mudança crítica de banco, incluindo auth, `verified`, policies, triggers, RLS, storage policies e grants/revokes, deve existir somente em:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Se surgir SQL fora do fluxo oficial:

1. Mover para `docs/legacy/sql/`.
2. Documentar em `docs/legacy/README.md`.
3. Não usar operacionalmente em deploy ou setup.
4. Não recriar diretório `sql/` na raiz.

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

Aplique todas as migrations em `supabase/migrations/` em ordem alfabética. Atualmente o diretório contém **77 arquivos**, incluindo as 2 migrations da v10.

No banco principal atual, as 2 migrations da v10 já foram aplicadas. Use a lista abaixo para ambientes novos, bancos recriados ou staging separado.

Se estiver atualizando um ambiente que já estava em v9, garanta pelo menos a aplicação destas novas migrations:

1. `v10.0.0.0_admin_search_posts_full.sql`
2. `v10.0.1.0_admin_help_requests_pagination.sql`

Você pode aplicar pelo SQL Editor do Supabase ou pela CLI.

### 2) Schema bootstrap

Para um projeto novo, aplique antes:

1. `supabase/schema-bootstrap-v8.1.2.3.sql`
2. `supabase/schema-update-v8.1.3.2.sql`
3. Depois as migrations em ordem

### 3) Storage

Bucket esperado: `kino-media`.

- `post-media/{uid}/{postId}/{timestamp}-image-{n}.{ext}`
- `avatars/{uid}.{ext}`

### 4) KC_ENV

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

Em produção, `driver = "supabase"` é obrigatório. `local` é apenas para desenvolvimento.

### 5) Edge Functions

**notify-admin-reports-threshold**

```bash
supabase functions deploy notify-admin-reports-threshold
```

**kc-invite-user**

```bash
supabase functions deploy kc-invite-user
```

### 6) Settings de banco fora do git

- `app.settings.kc_notify_function_url`
- `app.settings.kc_notify_function_auth_token`
- `app.settings.kc_notify_hmac_secret`

---

## Testes

```bash
npm test
npm test -- --runInBand
node scripts/hygiene-check.js
```

---

## QA

- `docs/qa/e2e-checklist.md`
- `docs/qa/rls-smoke.sql`
- `docs/qa/xss-payloads.md`
- `docs/qa/v8.1.11.1-admin-reports-threshold.md`
- `docs/ops/vercel-supabase-invariants.md`

---

## Documentação técnica

| Arquivo | Conteúdo |
|---------|----------|
| `docs/architecture.md` | mapa de dependências JS e padrão IIFE |
| `docs/api-contract.md` | contrato da `KCAPI` |
| `docs/db-schema.md` | tabelas, RLS, triggers e storage |
| `docs/rpc-catalog.md` | catálogo de RPCs |
| `docs/module-schemas.md` | schemas dos 6 módulos |
| `docs/env-vars.md` | variáveis de ambiente |
| `docs/design-system.md` | design system e breakpoints |
| `RELATORIO-KINOCAMPUS-V9.md` | relatório técnico consolidado da v9 |
| `CHANGELOG.md` | histórico de releases e fixes |
