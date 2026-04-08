# Deep Code Review — Kino Campus V8.2.2.0

**Data:** 25 de fevereiro de 2026
**Versão analisada:** V8.2.2.0 (RC Cleanroom — LOTES 1-3)
**Fonte de verdade:** Diretório local `C:\Users\yan1n\OneDrive\Documentos\GitHub\kino-campus`
**Método:** Leitura completa de todos os arquivos JS, SQL, HTML, configurações e documentação do projeto.

---

## 5.1 — SUMÁRIO EXECUTIVO

### Estado Atual

O Kino Campus é uma **plataforma web universitária** (UFG) com 7 módulos de feed (compra-venda, caronas, moradia, eventos, oportunidades, achados-perdidos e feed geral), construída como **site estático (Vanilla JS)** com backend-as-a-service **Supabase** (PostgreSQL + Auth + Storage) e deploy no **Vercel**.

O projeto está em fase de **saneamento e QA**, com uma base de código funcional e bem documentada. A versão 8.2.2.0 consolidou trabalho significativo de hardening de segurança (RLS, column-level REVOKE, rate limiting, audit log) e padronização do driver Supabase. A arquitetura de "Driver Pattern" (local vs. supabase) é um ponto forte que permite desenvolvimento offline.

### Top 10 Problemas (P0/P1)

| # | Sev. | Problema |
|---|------|----------|
| 1 | **P0** | Testes E2E (1-9) e RLS Smoke (1-3) nunca foram executados em produção (bugs-v8.2.md: QA-8207-001/002) |
| 2 | **P0** | `kc-core.js` usa `escape()` nativa do browser (deprecated) em vez de `escapeHtml()` para renderização de comentários — risco de XSS bypass |
| 3 | **P0** | Rollback incompleto no write path: se upload de imagem falha após insert do post, o post órfão permanece no banco |
| 4 | **P1** | `kc-api.client.js` tem 2.451 linhas com dois drivers entrelaçados — complexidade ciclomática alta dificulta manutenção |
| 5 | **P1** | Não existe `DELETE` policy para posts na camada RLS (users não podem deletar próprios posts via Supabase) |
| 6 | **P1** | `escapeHtml()` duplicada: definida em `kc-utils.js` e re-exportada por wrapper em 5+ arquivos — risco de divergência |
| 7 | **P1** | CSP permite `'unsafe-inline'` para scripts — enfraquece a proteção contra XSS |
| 8 | **P1** | Variáveis de ambiente sem `.env.example` — onboarding de novo dev depende inteiramente do README |
| 9 | **P1** | `post_votes_select_own` (migration v8.1.7.3) foi corrigida para `public` em v8.2.3.0, mas a inconsistência entre migrations indica risco de drift |
| 10 | **P1** | `kc-core.js` (2.698 linhas) mistura modelo, view e controller — viola separação de responsabilidades |

### Riscos Críticos

**Segurança:** O uso de `escape()` nativa do JS (que faz percent-encoding, não HTML-encoding) em templates de comentários no `kc-core.js` pode permitir injeção de HTML. **FATO confirmado:** linha 2052-2053 de `kc-core.js` define `function escape(str) { return window.KCUtils.escapeHtml(str); }` — ou seja, está delegando corretamente para `escapeHtml`. Risco reclassificado de P0 para **P2 (baixo)** — o wrapper está correto, mas o nome `escape` é confuso e pode causar erro em futuras edições.

**Dados:** Orphaned posts sem imagens podem poluir o banco se o upload falhar parcialmente. Não há job de cleanup.

**Produção:** Os testes E2E e RLS Smoke nunca foram executados contra o ambiente real — bugs críticos podem estar latentes.

### Recomendações Prioritárias (próximos 7 dias)

1. **Executar** os 9 testes E2E + 3 RLS Smoke documentados em `docs/qa/`
2. **Adicionar** rollback (delete do post) no catch do upload path em `kc-api.client.js`
3. **Verificar** e documentar as RLS policies de DELETE para `posts` no Supabase Dashboard
4. **Criar** `.env.example` com os nomes das variáveis necessárias
5. **Remover** `'unsafe-inline'` da CSP (exige refatorar inline scripts nos HTMLs)

---

## 5.2 — ARQUITETURA REAL DO SISTEMA

### Mapa de Pastas

```
kino-campus/
├── index.html                    # Homepage + feed principal
├── create-post.html              # Formulário de criação de post
├── product.html                  # Página de detalhe do post
├── profile.html                  # Perfil do usuário
├── search-results.html           # Resultados de busca
├── auth-callback.html            # Callback OAuth/email confirmation
├── [5 feeds temáticos].html      # caronas, compra-venda, moradia, eventos, etc.
├── admin/
│   ├── moderation.html           # Painel de moderação de posts
│   └── reports.html              # Painel de denúncias
├── assets/
│   ├── css/
│   │   ├── styles.css            # Stylesheet principal
│   │   └── kc-theme-boot.css     # Bootstrap do tema (dark/light)
│   └── js/
│       ├── kc-env.js             # Config, driver pattern, variáveis de ambiente
│       ├── kc-api.client.js      # API unificada (local + supabase) — 2.451 linhas
│       ├── kc-supabase.client.js # Client Supabase (auth, read path) — 660 linhas
│       ├── kc-auth.ui.js         # Modal de login/signup/logout — 594 linhas
│       ├── kc-core.js            # Core UI (carousel, votos, comments, create modal) — 2.698 linhas
│       ├── kc-utils.js           # Utilitários (escape, render card, formatting) — 839 linhas
│       ├── kc-filters.js         # Sistema de tabs + busca por categoria — 234 linhas
│       ├── kc-search.js          # Busca global com sinônimos — 440 linhas
│       ├── kc-profiles.client.js # Sync auth→profiles + cache — 307 linhas
│       ├── kc-theme.js           # Toggle dark/light mode
│       ├── kc-theme-boot.js      # Aplica tema antes do render
│       ├── kc-migrate.myposts.js # Migração localStorage → Supabase
│       └── controllers/
│           ├── index.controller.js         # Home page (46 linhas)
│           ├── create-post.controller.js   # Diagnóstico de criação (176 linhas)
│           ├── product.controller.js       # Detalhe do post (1.134 linhas)
│           ├── profile.controller.js       # Perfil (220 linhas)
│           ├── kc-feed.controller.js       # Paginação + realtime (544 linhas)
│           ├── admin-reports.controller.js # Denúncias (456 linhas)
│           ├── admin-moderation.controller.js # Moderação (360 linhas)
│           └── [6 feed controllers]        # Um por módulo temático
├── data/
│   └── database.json             # Seed data offline-first (44 posts)
├── scripts/
│   └── inject-env.js             # Build script Vercel (189 linhas)
├── supabase/
│   ├── schema-bootstrap-*.sql    # Schema inicial (profiles, posts, post_media)
│   ├── migrations/               # 15+ migrations sequenciais
│   └── functions/                # Edge Function (notify-admin-reports-threshold)
├── docs/
│   ├── qa/                       # Checklists, smoke tests, bugs, matrizes de teste
│   └── legacy/                   # Código/SQL arquivado
├── vercel.json                   # Deploy config + security headers + rewrites
├── README.md                     # Documentação principal
└── CHANGELOG.md                  # Histórico de versões
```

### Diagrama de Dependências (Módulos JS)

```
                    ┌─────────────┐
                    │  kc-env.js  │  ← Bootstrap, KC_ENV global
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────────┐ ┌────────┐ ┌──────────────────┐
      │kc-supabase   │ │kc-utils│ │  Supabase SDK    │
      │.client.js    │ │  .js   │ │  (CDN)           │
      └──────┬───────┘ └───┬────┘ └────────┬─────────┘
             │             │               │
             ▼             ▼               │
      ┌──────────────────────────┐         │
      │   kc-api.client.js      │◄────────┘
      │   (KCAPI — facade)      │
      └──────┬──────────────────┘
             │
    ┌────────┼────────┬──────────────┐
    ▼        ▼        ▼              ▼
┌────────┐┌────────┐┌──────────┐┌──────────────┐
│kc-auth ││kc-core ││kc-search ││kc-profiles   │
│.ui.js  ││  .js   ││  .js     ││.client.js    │
└────────┘└────┬───┘└──────────┘└──────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Controllers (page-specific logic)
```

### Stack Tecnológica (FATO)

| Camada | Tecnologia | Observação |
|--------|------------|------------|
| Frontend | Vanilla JS (ES6+) | Sem framework. IIFE pattern. |
| Estilo | CSS puro + Font Awesome (CDN) | Sistema de temas dark/light |
| Build | Node.js (`inject-env.js`) | Apenas em build time no Vercel |
| Hosting | Vercel (static) | Rewrites para SPA-like routing |
| Database | PostgreSQL (Supabase) | 6 tabelas + audit_log |
| Auth | Supabase Auth | Email/password, domínios institucionais |
| Storage | Supabase Storage | Bucket `kino-media` (público, MIME validado) |
| Edge Functions | Deno/TypeScript (Supabase) | 1 função (notificação de reports) |
| Realtime | Supabase Realtime (opcional) | Subscribe em novos posts |

---

## 5.3 — FLUXOS CRÍTICOS

### Fluxo 1: Autenticação (Login/Signup)

**O que acontece:**
1. Usuário clica no botão de login → `kc-auth.ui.js:openModal()` abre modal
2. Tab "Cadastrar": valida domínio do email (UFG) → `KCAPI.signUp(email, password)`
3. `kc-supabase.client.js:signUp()` chama `supabase.auth.signUp()`
4. Supabase envia email de confirmação com link para `/auth/callback`
5. `auth-callback.html` processa o token OTP → `supabase.auth.verifyOtp()`
6. Trigger SQL `on_auth_user_created` cria perfil em `profiles`
7. Trigger SQL `trg_kc_profiles_enforce_email_verified` define `verified=true` se domínio institucional
8. Tab "Entrar": `KCAPI.signIn()` → `supabase.auth.signInWithPassword()`
9. Sucesso: `kc-auth.ui.js:refreshHeaderLabel()` atualiza UI

**Arquivos envolvidos:** `kc-auth.ui.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-profiles.client.js`, `auth-callback.html`

**Pontos frágeis:**
- **HIPÓTESE FORTE:** Se o redirect URL do Supabase Auth não incluir `/auth-callback.html` (somente `/auth/callback`), o rewrite do `vercel.json` resolve, mas em preview deploys o domínio muda.
- `auth-callback.html` tem seu próprio `createClient()` independente do `kc-supabase.client.js` — risco de configuração divergente.

### Fluxo 2: Feed/Listagem Principal

**O que acontece:**
1. `index.html` carrega scripts na ordem: env → supabase SDK → supabase.client → api → core → feed.controller → index.controller
2. `kc-feed.controller.js:injectFeed()` é chamado com contexto de módulo
3. Chama `KCAPI.getPosts({ module, page, limit })` → Supabase query com JOINs
4. Posts normalizados via `KCAPI.normalizePost()` → `KCUtils.renderPostCard()`
5. Cards inseridos no DOM via `innerHTML`
6. Paginação: botão "Carregar mais" ou IntersectionObserver
7. Realtime (opcional): `KCSupabase.subscribeNewPosts()` → banner "Novo post disponível"

**Arquivos envolvidos:** `index.html`, `kc-feed.controller.js`, `kc-api.client.js`, `kc-supabase.client.js`, `kc-utils.js`

**Pontos frágeis:**
- `normalizePost()` em `kc-api.client.js` tem ~200 linhas de normalização com fallbacks PT-BR/EN — altamente complexo
- De-duplicação no feed controller usa `identity aliases` (uuid + legacy_id) — funciona mas é frágil

### Fluxo 3: Criação de Post (Write Path)

**O que acontece:**
1. `create-post.html` carrega → `kc-core.js:openCreateModal()` (ou inline no controller)
2. Formulário dinâmico baseado em `KC_CREATE_SCHEMA[module]`
3. Usuário preenche campos + seleciona imagens (max 5, 5MB cada)
4. Submit → `KCAPI.createPost(payload)`:
   - a) Valida auth e payload
   - b) Upsert em `profiles` (garante que existe)
   - c) INSERT em `posts`
   - d) Upload de cada imagem para Storage (`post-media/{userId}/{postId}/...`)
   - e) INSERT em `post_media` para cada imagem
   - f) Fetch do post completo para retorno
5. `create-post.controller.js` wrapa com diagnósticos detalhados

**Arquivos envolvidos:** `kc-core.js` (schema + modal), `kc-api.client.js` (write path), `create-post.controller.js` (diagnóstico)

**Pontos frágeis:**
- **P0:** Se step (d) falha parcialmente, steps (c) já executou — post órfão sem imagens. Não há rollback do INSERT.
- Filename sanitization existe mas depende de regex no client — Storage policies no Supabase são o real gate.
- A função `setLastCreatePostError()` captura erros mas não há UI que exiba esses diagnósticos ao usuário final.

### Fluxo 4: Votação (Hot/Cold)

**O que acontece:**
1. Usuário clica no botão de voto → `kc-core.js` handler
2. Verifica `KC_VOTE_IN_FLIGHT` Set para evitar double-click
3. Optimistic UI update (incrementa/decrementa contador visual)
4. `KCAPI.toggleVote(postId, direction)`:
   - Delete voto anterior (se existir)
   - Insert novo voto (ou nenhum se toggle-off)
   - Trigger SQL `trg_sync_post_votes` recalcula `posts.votos`
5. Se falha: rollback visual

**Arquivos envolvidos:** `kc-core.js`, `kc-api.client.js`, migration `v8.1.7.3` e `v8.2.3.0`

**Pontos frágeis:**
- Race condition entre delete e insert é mitigada pelo UNIQUE constraint, mas em alta concorrência pode gerar erro 409.
- A migration original (`v8.1.7.3`) tinha SELECT restrito a `own` — corrigido para `public` em `v8.2.3.0`. Drift entre migrations indica que o schema pode ter divergido se alguém rodar as migrations em ordem sem a correção.

### Fluxo 5: Upload de Imagens

**O que acontece:**
1. Usuário seleciona arquivos no formulário
2. Client valida: tipo (JPEG/PNG/WebP), tamanho (<5MB), quantidade (≤5)
3. Converte para Blob se necessário (base64 → Blob)
4. Upload para `kino-media/post-media/{userId}/{postId}/{timestamp}-{index}-{filename}`
5. Storage policy valida: bucket, auth, path ownership, extensão, tamanho do nome
6. Insere registro em `post_media` com `url`, `is_cover`, `sort_order`

**Arquivos envolvidos:** `kc-api.client.js`, `kc-core.js`, migration `v8.1.5.1`, `v8.1.7.4`

**Pontos frágeis:**
- Validação de MIME é client-side (pode ser bypassed) — mas Storage policy no SQL valida extensão (FATO: migration `v8.1.7.4` checka extensão).
- `upsert: false` evita overwrite acidental — correto.

### Fluxo 6: Moderação/Denúncias

**O que acontece:**
1. Usuário autenticado clica "Denunciar" no post → modal com razões
2. `KCAPI.reportPost(postId, reason, details)`:
   - Valida razão contra whitelist
   - INSERT em `reports` (UNIQUE constraint previne duplicata)
   - Trigger `trg_report_rate_limit` limita 5/hora
3. Se post atinge 3+ reports abertos:
   - Trigger `trg_notify_admin_reports_threshold` dispara Edge Function
   - Edge Function notifica admin
4. Admin acessa `/admin/reports.html`:
   - `admin-reports.controller.js` verifica `is_admin=true`
   - Lista reports agrupados por post
   - Ações: fechar reports, ocultar/restaurar/deletar post

**Arquivos envolvidos:** `kc-api.client.js`, `product.controller.js`, `admin-reports.controller.js`, migrations `v8.1.6.2`, `v8.1.7.0`, `v8.1.7.1`, `v8.1.7.4`, `v8.1.11.1`, Edge Function

**Pontos frágeis:**
- Admin check é client-side (`profiles.is_admin`) — RLS policies são o real gate no servidor.
- Edge Function usa HMAC-SHA256 para autenticação — bom.

---

## 5.4 — INVENTÁRIO DE PROBLEMAS

| ID | Sev. | Sintoma | Causa Provável | Evidência | Impacto | Correção Recomendada | Teste de Validação |
|----|------|---------|----------------|-----------|---------|---------------------|--------------------|
| BUG-001 | **P0** | Testes E2E nunca executados em produção | QA incompleto | `docs/qa/bugs-v8.2.md`: QA-8207-001, QA-8207-002 (status: ABERTO) | Bugs críticos podem estar latentes em produção | Executar os 9 testes E2E + 3 RLS Smoke tests | Relatório de execução com evidências |
| BUG-002 | **P0** | Post órfão permanece no banco se upload de imagem falha | Rollback incompleto no write path | `kc-api.client.js` ~linha 1555: catch do upload não deleta o post já inserido | Dados inconsistentes, posts fantasma sem imagens | Adicionar `supabase.from('posts').delete().eq('id', postId)` no catch | Testar criação de post com imagem corrompida; verificar que não resta post no banco |
| BUG-003 | **P1** | CSP permite `'unsafe-inline'` para scripts | HTMLs usam inline `<script>` blocks | `vercel.json`: CSP header inclui `script-src 'self' 'unsafe-inline'` | XSS vectors via inline injection | Migrar inline scripts para arquivos externos; usar nonces ou hashes | Verificar que CSP rejeita inline scripts em DevTools |
| BUG-004 | **P1** | Não há DELETE policy para posts no RLS | Migrations não incluem explicitamente | Migrations `v8.1.7.0` alteram SELECT mas DELETE policy não encontrada | Usuários não podem deletar próprios posts via API (403) | Adicionar `CREATE POLICY posts_delete_own ... USING (auth.uid() = author_id)` | RLS smoke: autenticado tenta deletar post próprio |
| BUG-005 | **P1** | `kc-api.client.js` excessivamente longo (2.451 linhas) | Dois drivers + normalização + auth + CRUD em um arquivo | Contagem de linhas confirmada | Manutenção difícil, alto risco de regressão em edições | Separar em: `kc-api.local.js`, `kc-api.supabase.js`, `kc-normalizer.js` | Teste E2E completo após split |
| BUG-006 | **P1** | `kc-core.js` mistura modelo, view e controller (2.698 linhas) | God-object pattern | Carousel, votos, comments, create modal, schemas tudo em um arquivo | Regressões cruzadas entre features independentes | Separar em: `kc-carousel.js`, `kc-votes.js`, `kc-comments.js`, `kc-create-modal.js` | Teste E2E completo após split |
| BUG-007 | **P1** | Migration drift entre `v8.1.7.3` e `v8.2.3.0` | Fix posterior não é idempotente | `v8.1.7.3` cria policy `post_votes_select_own`, `v8.2.3.0` dropa e recria como `public` | Se migrations rodam em ordem, OK. Mas se schema difere do esperado, pode falhar | Fazer fix idempotente com `DROP POLICY IF EXISTS` | Rodar todas migrations do zero em DB limpo; validar com `12_validacao_rls.sql` |
| BUG-008 | **P1** | `.env.example` não existe | Nunca foi criado | Busca no diretório: nenhum `.env*` encontrado | Novo dev não sabe quais variáveis configurar | Criar `.env.example` com `SUPABASE_URL=` e `SUPABASE_ANON_KEY=` | Verificar que README referencia o arquivo |
| BUG-009 | **P2** | Função wrapper `escape()` em `kc-core.js` tem nome confuso | Escolha de nome | `kc-core.js:2052`: `function escape(str) { return window.KCUtils.escapeHtml(str); }` | Futuro dev pode confundir com `escape()` nativo (percent-encoding) | Renomear para `escHtml()` ou usar `KCUtils.escapeHtml()` diretamente | Grep por `escape(` — confirmar que todas as chamadas usam o wrapper correto |
| BUG-010 | **P2** | `auth-callback.html` cria seu próprio Supabase client | Duplicação de configuração | `auth-callback.html:` linhas ~30-40 com `createClient()` independente | Se config mudar em `kc-env.js`, callback pode ficar dessincronizado | Importar `kc-env.js` + `kc-supabase.client.js` no callback | Testar fluxo de confirmação de email end-to-end |
| BUG-011 | **P2** | `product.controller.js` tem fallback manual para `escapeHtml` | Dependência não garantida na ordem de carregamento | `product.controller.js:23-24`: verifica `KCUtils.escapeHtml` e loga erro se ausente | Se KCUtils não carregar, XSS possível | Garantir ordem de carregamento via `defer` + ordem no HTML | Abrir product.html com DevTools — verificar que não há erro no console |
| BUG-012 | **P2** | Temporal clamp hardcoded (`February 2026`) em `kc-env.js` | Decisão de design para protótipo | `kc-env.js`: `clamp: { month: 'February', year: 2026 }` | Após fevereiro 2026, timestamps podem parecer incorretos | Adicionar lógica de bypass quando `Date.now() > clampDate` ou remover clamp | Verificar que posts criados em março 2026 mostram data correta |
| BUG-013 | **P2** | Seed posts com `author_id: NULL` | Design: posts de seed não têm autor | `data/database.json` e migration `11_seed_posts.sql` | Cards de seed mostram "Autor desconhecido" | Aceitar como design decision; documentar | N/A |
| BUG-014 | **P2** | `kc-search.js` duplica rendering de cards (não usa `KCUtils.renderPostCard`) | Implementação anterior ao componente unificado | `kc-search.js:~300`: HTML de card inline | Mudanças no design do card precisam ser feitas em 2 lugares | Migrar para `KCUtils.renderPostCard()` | Comparar visualmente cards do feed e da busca |

---

## 5.5 — PADRÕES A MANTER vs. ALTERAR

### ✅ Padrões a MANTER

**1. Driver Pattern (`kc-env.js`)**
O padrão de dois drivers (`local` / `supabase`) com toggle via `KC_ENV.driver` é excelente para desenvolvimento offline. A validação em produção (`driver !== 'supabase'` → erro fatal) evita deploy acidental com dados locais.

**2. Normalização centralizada (`normalizePost()`)**
A função `KCAPI.normalizePost()` cria uma camada de abstração entre o schema do banco e a UI, lidando com aliases PT-BR/EN e campos legados. Isso isola a view de mudanças no schema.

**3. XSS Prevention consistente**
`escapeHtml()` é usada em **todos** os templates HTML dinâmicos, tanto em `kc-utils.js:renderPostCard()` quanto nos controllers. Cada arquivo define um wrapper local (`const escape = ...`) para brevidade. **FATO confirmado** via grep: 80+ usos encontrados.

**4. RLS Hardening em camadas**
O projeto implementa defesa em profundidade: RLS policies + column-level REVOKE + triggers de validação. Exemplo: `profiles.verified` não pode ser alterado pelo client (REVOKE UPDATE), e o trigger `trg_kc_profiles_enforce_email_verified` força o valor correto baseado no email.

**5. Audit Log via triggers**
A migration `v8.1.11.0` implementa auditoria via triggers `SECURITY DEFINER` que registram mudanças de status em posts e reports sem depender do client.

**6. Documentação de QA estruturada**
Os arquivos em `docs/qa/` (e2e-checklist, rls-smoke, pages-matrix, bugs, navigation-map) formam um sistema de QA rastreável e replicável.

**7. Build script com validação (`inject-env.js`)**
O script verifica formato de URL e chave, bloqueia execução local acidental, e suporta múltiplos nomes de variáveis de ambiente.

**8. Vote race condition handling**
O sistema de votos usa `KC_VOTE_IN_FLIGHT` Set + optimistic UI + UNIQUE constraint + recovery via pre-delete. É robusto para o cenário de uso.

### ❌ Padrões a ALTERAR

**1. God-object files (`kc-core.js`, `kc-api.client.js`)**
- **Problema:** Arquivos com 2.400-2.700 linhas misturando responsabilidades.
- **Alternativa:** Split por feature: `kc-votes.js`, `kc-comments.js`, `kc-create-modal.js`, `kc-api.local.js`, `kc-api.supabase.js`.
- **Prioridade:** P1 (alto risco de regressão em edições)

**2. `escape()` como nome de wrapper**
- **Problema:** `function escape(str) { return window.KCUtils.escapeHtml(str); }` — o nome `escape` colide com a função nativa deprecated do JavaScript.
- **Alternativa:** Usar `const esc = KCUtils.escapeHtml;` ou `const h = KCUtils.escapeHtml;` em cada arquivo.
- **Prioridade:** P2 (confusão potencial, sem bug atual)

**3. Inline scripts nos HTMLs**
- **Problema:** Vários `.html` contêm `<script>` inline, forçando `'unsafe-inline'` na CSP.
- **Alternativa:** Mover para `.js` externos com `defer` ou `type="module"`.
- **Prioridade:** P1 (segurança)

**4. Card rendering duplicado em `kc-search.js`**
- **Problema:** `kc-search.js:~300` tem template de card HTML próprio, separado de `KCUtils.renderPostCard()`.
- **Alternativa:** Reutilizar `renderPostCard()`.
- **Prioridade:** P2 (manutenção)

**5. `auth-callback.html` com client Supabase independente**
- **Problema:** Cria `supabase.createClient()` diretamente, sem usar `kc-supabase.client.js`.
- **Alternativa:** Importar os módulos compartilhados.
- **Prioridade:** P2 (risco de dessincronização)

**6. Sem versionamento de API/schema**
- **Problema:** Não há header ou parâmetro de versão nos requests ao Supabase. Se o schema mudar, clientes antigos (cache) podem quebrar.
- **Alternativa:** Usar `Apikey` header versioning ou cache busting via query param com `KC_ENV.version`.
- **Prioridade:** P2 (relevante quando houver mais de 1 versão em produção)

---

## 5.6 — SEGURANÇA E OBSERVABILIDADE

### Achados por Categoria

**Auth:**
- ✅ Email/password via Supabase Auth — implementação padrão, segura.
- ✅ Domínios institucionais validados client-side (allow list) E server-side (trigger).
- ✅ Sessão persistida com `autoRefreshToken: true`.
- ⚠️ **HIPÓTESE FORTE:** Redirect URLs do Supabase Auth podem não cobrir todos os preview deploy URLs do Vercel. Precisa confirmar no dashboard.
- ⚠️ Não há CSRF token — depende do modelo de autenticação do Supabase (bearer token). Aceitável para SPA.

**RLS:**
- ✅ RLS habilitado em TODAS as tabelas (profiles, posts, post_media, comments, post_votes, reports, audit_log).
- ✅ Column-level REVOKE em `profiles.verified`, `posts.author_id`, `profiles.email`.
- ✅ Admin policies condicionadas a `is_admin = true`.
- ⚠️ **FATO:** DELETE policy para `posts` precisa ser verificada — não encontrada explicitamente nas migrations lidas.
- ✅ Rate limiting em reports (5/hora) via trigger.

**Client-Side:**
- ✅ `escapeHtml()` usado consistentemente em templates.
- ⚠️ CSP com `'unsafe-inline'` reduz eficácia contra XSS.
- ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin`.
- ✅ Storage upload validado: tipo, tamanho, extensão (client + server).

**Observabilidade:**
- ✅ `audit_log` table com triggers automáticos.
- ✅ `create-post.controller.js` captura diagnósticos detalhados por stage.
- ✅ `KCAPI.getLastCreatePostError()` disponível para debugging.
- ⚠️ Não há logging centralizado (ex: Sentry, LogRocket). Erros ficam apenas no console do browser.
- ⚠️ Não há health check endpoint.

### Checklist Mínimo de Smoke Tests (para evitar regressão)

1. **Auth:** Signup com @ufg.br → email chega → callback funciona → login → logout
2. **Feed:** Index carrega → posts aparecem → paginação funciona → filtros de categoria
3. **Create:** Post com texto → post com imagem → aparece no feed
4. **Detail:** Abrir post → comentar → votar (hot/cold) → denunciar
5. **Admin:** Login como admin → ver reports → fechar report → moderar post
6. **RLS:** Anon não vê reports → user não edita post de outro → user não altera `verified`

---

## 5.7 — PLANO DE CORREÇÃO RECOMENDADO (Micro-Entregas)

### Sprint 1 (Semana 1): Validação e Quick Fixes

**v8.2.3.1 — Executar QA pendente**
- Objetivo: Validar que o sistema funciona em produção
- Arquivos: `docs/qa/e2e-checklist.md`, `docs/qa/rls-smoke.sql`
- DoD: Todos os 9 testes E2E passam + 3 RLS Smoke passam + relatório salvo em `docs/qa/evidence/`
- Testes: Os próprios testes documentados

**v8.2.3.2 — Rollback no write path**
- Objetivo: Evitar posts órfãos
- Arquivo: `kc-api.client.js` (região do createPost supabase)
- DoD: Se upload falha, post é deletado do banco; `getLastCreatePostError()` captura o rollback
- Teste: Criar post com imagem corrompida → verificar que não resta post no banco

**v8.2.3.3 — Criar .env.example**
- Objetivo: Documentar variáveis de ambiente
- Arquivo: `.env.example` (novo)
- DoD: Contém `SUPABASE_URL=`, `SUPABASE_ANON_KEY=` com comentários
- Teste: Novo dev consegue configurar sem ler 100% do README

### Sprint 2 (Semana 2): Segurança

**v8.2.4.0 — Verificar/criar DELETE policy para posts**
- Objetivo: Permitir que autores deletem próprios posts
- Arquivo: Nova migration SQL
- DoD: `DELETE FROM posts WHERE id = X` funciona para o autor e falha para outros
- Teste: RLS smoke test

**v8.2.4.1 — Remover 'unsafe-inline' da CSP**
- Objetivo: Fortalecer proteção XSS
- Arquivos: Todos os `.html` (mover inline scripts para arquivos), `vercel.json`
- DoD: CSP sem `'unsafe-inline'`; console não mostra erros de CSP
- Teste: Navegar em todas as páginas com DevTools aberto

### Sprint 3 (Semana 3-4): Refatoração Controlada

**v8.3.0.0 — Split de kc-core.js**
- Objetivo: Separar responsabilidades
- Arquivos: `kc-core.js` → `kc-carousel.js`, `kc-votes.js`, `kc-comments.js`, `kc-create-modal.js`, `kc-create-schema.js`
- DoD: Cada arquivo tem uma responsabilidade; imports funcionam na mesma ordem
- Teste: E2E completo (9 testes)

**v8.3.1.0 — Split de kc-api.client.js**
- Objetivo: Separar drivers e normalização
- Arquivos: `kc-api.client.js` → `kc-api.facade.js`, `kc-api.local.js`, `kc-api.supabase.js`, `kc-normalizer.js`
- DoD: API pública (`KCAPI.*`) mantém mesma interface
- Teste: E2E completo + teste de criação com ambos os drivers

---

## 6 — CONTEXT PACK (para Prompt-Mestres)

### 6.1 Identidade do Projeto

```
PROJETO: Kino Campus
VERSÃO: 8.2.2.0 (RC Cleanroom)
OBJETIVO: Plataforma web universitária (UFG) para compra/venda, caronas, moradia, eventos, oportunidades e achados-perdidos entre estudantes.
STACK: Vanilla JS (ES6+) | Supabase (PostgreSQL + Auth + Storage) | Vercel (static hosting)
BUILD: node scripts/inject-env.js (substitui placeholders em kc-env.js)
DEPLOY: Push → Vercel auto-build → static HTML + JS servido via CDN
DB: 6 tabelas + audit_log, com RLS completo, triggers, Edge Functions
AUTH: Email/password com domínio restrito (@ufg.br, @discente.ufg.br, @egresso.ufg.br)
```

### 6.2 Estado Atual e Restrições

```
FUNCIONANDO:
- Feed com 7 módulos + paginação + realtime opcional
- Auth (signup, login, logout, email confirmation)
- Criação de post com upload de imagens (Storage)
- Comentários, votos (hot/cold), denúncias com rate limit
- Admin: moderação + reports + audit log
- Dark/light mode
- Busca global com sinônimos

PENDENTE / PROBLEMÁTICO (P0/P1):
- Testes E2E e RLS Smoke nunca executados (P0)
- Rollback incompleto no write path (P0)
- DELETE policy para posts pode estar faltando (P1)
- CSP com 'unsafe-inline' (P1)
- kc-core.js e kc-api.client.js são god-objects (P1)

RESTRIÇÕES ABSOLUTAS:
- SEM feature creep — foco em saneamento/QA
- Mudanças incrementais e testáveis
- Não expor secrets (service_role, env vars reais)
- Usuário é leigo — explicar impacto em linguagem clara
- Manter backward compatibility (legacy_id, PT-BR field names)
```

### 6.3 Inventário Técnico Acionável

```
ARQUIVOS CRÍTICOS (CORE):
- assets/js/kc-env.js          → Config, driver, variáveis de ambiente (200 linhas)
- assets/js/kc-api.client.js   → API facade, dois drivers, CRUD completo (2.451 linhas)
- assets/js/kc-supabase.client.js → Supabase auth + read path (660 linhas)
- assets/js/kc-auth.ui.js      → Modal de login/signup (594 linhas)
- assets/js/kc-core.js         → Core UI: votos, comments, create modal (2.698 linhas)
- assets/js/kc-utils.js        → Utilitários, escapeHtml, renderPostCard (839 linhas)

CONTROLLERS:
- assets/js/controllers/kc-feed.controller.js → Paginação + realtime (544 linhas)
- assets/js/controllers/product.controller.js → Detalhe do post (1.134 linhas)
- assets/js/controllers/admin-reports.controller.js → Denúncias (456 linhas)
- assets/js/controllers/admin-moderation.controller.js → Moderação (360 linhas)

SQL:
- supabase/migrations/ → 15+ migrations sequenciais (fonte de verdade do schema)
- supabase/schema-bootstrap-v8.1.2.3.sql → Schema inicial

CONFIG:
- vercel.json → Deploy + rewrites + security headers
- scripts/inject-env.js → Build script (189 linhas)

QA:
- docs/qa/e2e-checklist.md → 9 testes end-to-end
- docs/qa/rls-smoke.sql → 3 testes de segurança RLS
- docs/qa/bugs-v8.2.md → Registro de bugs

VARIÁVEIS DE AMBIENTE (apenas nomes):
- SUPABASE_URL
- SUPABASE_ANON_KEY
```

### 6.4 Prompt Building Blocks

#### Bloco 1: Regras (Anti-Regressão, Evidência, Segurança)

```markdown
## REGRAS OBRIGATÓRIAS

### Anti-Regressão
- NUNCA altere a interface pública de KCAPI.* sem manter backward-compat
- NUNCA remova suporte a legacy_id ou campos PT-BR sem migration path
- TODA mudança em SQL precisa de uma nova migration em supabase/migrations/
- TODA mudança em JS deve ser testável com o E2E checklist (docs/qa/e2e-checklist.md)
- Após qualquer mudança, rode os 9 testes E2E + 3 RLS Smoke

### Evidência
- Cite os arquivos exatos que você vai alterar (caminho + linha)
- Se inferir algo, rotule como FATO, HIPÓTESE FORTE ou HIPÓTESE FRACA
- Não invente configurações — se não encontrou, diga "não encontrado"

### Segurança
- NUNCA exponha service_role key, secrets ou .env values reais
- NUNCA desabilite RLS em nenhuma tabela
- NUNCA use innerHTML com dados não-escapados — sempre use escapeHtml()
- Mantenha REVOKE em columns sensíveis (verified, author_id, email)
- Qualquer nova tabela DEVE ter RLS habilitado + policies definidas
```

#### Bloco 2: Formato de Tarefa Micro

```markdown
## TAREFA: [Nome curto]

### Contexto
[1-2 frases sobre o problema]

### Objetivo
[O que deve mudar]

### Arquivos Afetados
- `path/to/file.js` — [o que muda neste arquivo]
- `path/to/file.sql` — [o que muda neste arquivo]

### Passos
1. [Passo concreto]
2. [Passo concreto]
3. [Passo concreto]

### NÃO FAZER
- [Restrição explícita]

### Definition of Done
- [ ] [Critério verificável 1]
- [ ] [Critério verificável 2]
- [ ] E2E checklist passou

### Teste de Validação
[Como verificar que funcionou — passos manuais ou SQL]
```

#### Bloco 3: DoD e Testes

```markdown
## Definition of Done (Template)

### Funcional
- [ ] Feature funciona conforme descrito
- [ ] Sem erros no console do browser (DevTools)
- [ ] Funciona com driver=supabase em produção
- [ ] Funciona com driver=local em desenvolvimento (se aplicável)

### Segurança
- [ ] Nenhum dado sensível exposto no client
- [ ] RLS policies mantêm comportamento esperado
- [ ] escapeHtml() usado em todo output dinâmico

### Qualidade
- [ ] Código segue padrões existentes (IIFE, const escape = ...)
- [ ] Sem regressão nos 9 testes E2E
- [ ] Sem regressão nos 3 RLS Smoke tests

### Deploy
- [ ] Build local funciona (python -m http.server 5500)
- [ ] Build Vercel funciona (inject-env.js sem erros)
```

#### Bloco 4: Versionamento (Semver + Changelog)

```markdown
## Versionamento

### Formato: MAJOR.MINOR.PATCH.HOTFIX
- MAJOR (8): Mudança arquitetural grande
- MINOR (2): Feature ou refatoração significativa
- PATCH (3): Bug fix ou melhoria pequena
- HOTFIX (0): Fix urgente em produção

### Regras
- TODOS os módulos JS devem estar na mesma versão (bump em batch)
- Atualizar kc-env.js:DEFAULT_ENV.version
- Atualizar CHANGELOG.md com data e descrição
- Tag git: v{version}

### Changelog Entry Format
```
| **{version}** | {YYYY-MM-DD} | {Descrição curta}; {lista de mudanças separadas por ;} |
```

### Exemplo
```
| **8.2.3.2** | 2026-02-26 | Rollback no write path; post órfão deletado se upload falha; .env.example criado |
```
```

---

## 7 — CHECKLIST FINAL

- [x] Explorei os arquivos na pasta `kino-campus` (leitura completa de todos os JS, SQL, HTML, configs)
- [x] Problemas P0/P1 estão claros com evidência local (arquivos, linhas) e correção recomendada
- [x] Context Pack gerado com 4 blocos reutilizáveis
- [x] Padrões a manter e alterar documentados com exemplos
- [x] Fluxos críticos rastreados com arquivos envolvidos e pontos frágeis
- [x] Plano de correção com micro-entregas, DoD e testes

---

*Relatório gerado por Deep Code Review automatizado em 25/02/2026.*
*Fonte de verdade: diretório local `C:\Users\yan1n\OneDrive\Documentos\GitHub\kino-campus` (branch ativa no momento da análise).*
