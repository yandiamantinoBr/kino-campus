# RELATÓRIO TÉCNICO — KINOCAMPUS v9.0

**Plataforma de Comunidade Universitária da UFG**

| | |
|---|---|
| **Data** | 02 de abril de 2026 |
| **Versão** | 9.0.0 (Fundações) |
| **Autor técnico** | Claude Code (Anthropic) sob direção de Yan Diamantino |
| **Plataforma** | https://www.kinocampus.com.br |

---

## PARTE 1 — DIAGNÓSTICO E ESTADO ATUAL

### 1.1. Sobre a Plataforma

O KinoCampus é uma plataforma digital de comunidade universitária exclusiva para a Universidade Federal de Goiás (UFG). Conecta alunos, professores e egressos em 6 módulos temáticos:

| Módulo | Propósito | Exemplo de uso |
|--------|-----------|----------------|
| Compra e Venda | Marketplace de produtos | Vender livros usados, eletrônicos |
| Caronas | Ofertas e pedidos de carona | Carona para o campus |
| Moradia | Anúncios de moradia | Quartos perto da UFG, repúblicas |
| Eventos | Agenda de eventos | Workshops, festas, palestras |
| Oportunidades | Vagas e oportunidades | Estágios, monitorias, voluntariado |
| Achados e Perdidos | Itens perdidos/encontrados | Documentos, eletrônicos perdidos no campus |

**Restrição de acesso:** Apenas e-mails institucionais (@ufg.br, @discente.ufg.br, @egresso.ufg.br).

### 1.2. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS (55+ módulos IIFE, sem framework/bundler) |
| Backend | Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions + Realtime) |
| Hosting | Vercel (static site + serverless OG images) |
| Domínio | kinocampus.com.br (Hostinger, DNS para Vercel) |
| Build | `node scripts/inject-env.js` (substitui placeholders) |
| Testes | Jest: 7 arquivos, 31 testes, <5% cobertura |
| CSS | 5 arquivos (~12.500 linhas), dark mode com custom properties |
| Ícones | Font Awesome 6 (CDN) |

### 1.3. Arquitetura JS

O frontend usa o padrão **IIFE + window.\***: cada módulo é uma função auto-executável que expõe métodos públicos globalmente via `window.KCModuleName`.

| Categoria | Arquivos | Tamanho aprox. |
|-----------|----------|----------------|
| Core/Utils | kc-utils.js, kc-core.js, kc-constants.js, kc-api.client.js | ~221 KB |
| Auth/Profile | kc-auth.ui.js, kc-supabase.client.js, account-profile.shared.js | ~114 KB |
| Features | kc-create-post.js, kc-comments.js, kc-search.js, kc-ranking.js, kc-banners.js | ~196 KB |
| Controllers | 22 arquivos (product 114KB, admin-dashboard 85KB, etc.) | ~772 KB |
| Adapters | supabase.adapter.js, local.adapter.js | ~100 KB |
| **TOTAL** | **39 arquivos principais** | **~1.4 MB** |

**Padrão IIFE:**
```javascript
(function () {
  'use strict';
  function _privateHelper() {}
  window.KCModuleName = { publicMethod };
  document.addEventListener('DOMContentLoaded', init);
}());
```

**Padrão Driver:** `KC_ENV.driver` seleciona entre `SupabaseAdapter` (produção) e `LocalAdapter` (desenvolvimento). `KCAPI` é a facade que unifica a interface.

### 1.4. Banco de Dados (16 tabelas)

| Tabela | Propósito |
|--------|-----------|
| profiles | Perfis de usuário (nome, avatar, bio, social links, verificação) |
| posts | Publicações (título, descrição, preço, módulo, categoria, metadata, status) |
| post_media | Imagens dos posts (URL, capa, ordem) |
| comments | Comentários com suporte a markdown inline |
| comment_likes | Curtidas em comentários (1 por usuário) |
| post_votes | Votos up/down (1 por usuário por post) |
| saved_posts | Posts salvos (favorito, lembrar, destaque) |
| reports | Denúncias com status (open, closed, archived) |
| hero_banners | Banners do carousel da homepage |
| post_limits | Limites de posts por módulo por usuário |
| search_queries | Analytics de busca |
| audit_log | Log de auditoria de ações de admin |
| help_requests | Tickets de suporte |

**Segurança:** RLS em todas as tabelas (53+ políticas), HMAC-SHA256 em Edge Function, `search_path=public` em todas SECURITY DEFINER functions, rate limiting, audit log.

**RPCs:** 65+ funções (`kc_bump_post`, `kc_renew_post`, `kc_expire_old_posts`, `kc_get_top_contributors`, `kc_check_post_limit`, etc.).

**pg_cron:** Job diário às 03:00 para expirar posts automaticamente.

### 1.5. Ranking (Gamificação)

| Ação | Pontos |
|------|--------|
| Criar post | +15 |
| Receber voto positivo | +10 |
| Escrever comentário | +5 |
| Post acessado (CTA clicado) | +4 |
| Post compartilhado | +3 |
| Denúncia confirmada (penalidade) | -50 |

**Anti-spam:** Cada ação contabilizada uma única vez por publicação.

### 1.6. Gaps Identificados (Pré-v9)

| Prioridade | Gap | Impacto |
|-----------|-----|---------|
| Crítica | Cobertura de testes <5% | Regressões não detectadas |
| Crítica | Sem notificações in-app | Usuários sem feedback de interações |
| Alta | Sem threading em comentários | Conversas confusas |
| Alta | Paginação indefinida | Performance com 1000+ posts |
| Média | Sem filtros avançados | Difícil encontrar posts específicos |
| Média | Sem avaliações de usuários | Falta sinal de confiança |
| Baixa | Cashback in-development | Teaser sem backend |

---

## PARTE 2 — O QUE FOI IMPLEMENTADO (v9.0)

### 2.1. PR #194 — Fundações v9.0

- **Branch:** `feat/v9-0-foundations` (baseada em `kinocampus-V8.2-SANEAMENTO-QA`)
- **Status:** Mergeado em 02/04/2026
- **Arquivos alterados:** 10 (2 modificados + 8 novos)

#### 2.1.1. Documentação Técnica (v9.0.1) — CONCLUÍDO

| Arquivo | Conteúdo |
|---------|----------|
| docs/architecture.md | Mapa de dependências JS, fluxos de dados, páginas HTML |
| docs/api-contract.md | Contrato de 18+ métodos KCAPI com params e retornos |
| docs/db-schema.md | Schema de 16 tabelas, RLS, indexes, Storage, pg_cron |
| docs/rpc-catalog.md | Catálogo de RPCs e triggers com assinaturas |
| docs/module-schemas.md | KC_CREATE_SCHEMA dos 6 módulos |
| docs/env-vars.md | Variáveis de ambiente Vercel + Supabase + KC_ENV |
| docs/design-system.md | CSS custom properties, componentes, breakpoints |
| docs/index.md | Índice da documentação com quick reference |

**Total:** ~1.500 linhas de documentação técnica.

#### 2.1.2. Correções de Segurança (v9.0.3) — CONCLUÍDO

**1. Bloqueio de SVG em Uploads:** SVGs podem conter JavaScript malicioso (XSS via SVG). Removido `image/svg+xml` dos tipos permitidos em ambas as funções de upload (post media e avatar). Tipos aceitos: JPEG, PNG, WebP, GIF.

**2. Validação de Magic Bytes:** Nova função `checkImageMagicBytes(blob)` valida os primeiros 12 bytes do arquivo para verificar o tipo real, prevenindo ataques com arquivos maliciosos renomeados como imagens.

```javascript
async function checkImageMagicBytes(blob) {
  const buf = await blob.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(buf);
  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  // WebP: RIFF...WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
```

**3. Invalidação de Cache:** `SESSION_STORE_VERSION` atualizado de `'8.3.4.5'` para `'9.0.0'`. Força revalidação de sessões em upgrade major.

---

## PARTE 3 — ROTEIRO COMPLETO v9

### 3.1. Princípios

1. **Evolutivo, não reescrita** — cada feature branch é pequena, testável, revertível
2. **Test-first nas novas features** — cobertura nova vai junto com o código
3. **Documentar ao construir** — não existe "vou documentar depois"
4. **Mobile-first em tudo** — 60%+ dos usuários são mobile
5. **Segurança não negocia** — qualquer mudança em RLS passa por review manual
6. **Performance como feature** — bundles grandes prejudicam conexões lentas
7. **Preservar padrões existentes** — IIFE + window.* até migração ESM

### 3.2. Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| v9.0.1 | Documentação de arquitetura (8 arquivos em docs/) | CONCLUÍDO |
| v9.0.2 | Cobertura de testes (meta: 40%) | PENDENTE |
| v9.0.3 | Consolidação de segurança (SVG block, magic bytes, session) | CONCLUÍDO |
| v9.0.4 | Dívida técnica DB (retenção analytics, legacy_id) | PENDENTE |
| v9.1.0 | **Notificações in-app (PRIORIDADE MÁXIMA)** | PENDENTE |
| v9.1.1 | Comment threading (1 nível, estilo Instagram) | PENDENTE |
| v9.1.2 | Avaliações de usuários (1-5 estrelas) | PENDENTE |
| v9.2.0 | Busca server-side (PostgreSQL Full-Text Search) | PENDENTE |
| v9.2.1 | Filtros avançados nos feeds (preço, data, tipo) | PENDENTE |
| v9.2.2 | Paginação cursor-based | PENDENTE |
| v9.3.0 | Cashback (requer definição de negócio) | BLOQUEADO |
| v9.3.1 | Analytics de post para autores | PENDENTE |
| v9.3.2 | Moderação automática anti-spam | PENDENTE |
| v9.4.0 | Lazy loading de módulos grandes | PENDENTE |
| v9.4.1 | Otimização de imagens (Supabase Transform) | PENDENTE |
| v9.4.2 | Acessibilidade (A11y) | PENDENTE |

### 3.3. Ordem de Execução Recomendada

```
OBRIGATÓRIO (paralelo):
  v9.0.1 Documentação ............ CONCLUÍDO
  v9.0.2 Testes (40%) ........... PENDENTE
  v9.0.3 Segurança .............. CONCLUÍDO
  v9.0.4 Dívida técnica DB ..... PENDENTE

FASE 1 — Engajamento:
  v9.1.0 Notificações in-app ← prioridade máxima
  v9.2.2 Paginação cursor-based

FASE 2 — Features:
  v9.1.1 Comment threading
  v9.2.0 Busca server-side (FTS)
  v9.2.1 Filtros avançados

FASE 3 — Expansão:
  v9.1.2 Avaliações de usuários
  v9.3.1 Analytics de post
  v9.3.2 Moderação automática

FASE 4 — Qualidade:
  v9.4.0 Lazy loading
  v9.4.1 Otimização de imagens
  v9.4.2 Acessibilidade

BLOQUEADO:
  v9.3.0 Cashback — requer definição de negócio
```

### 3.4. Detalhes das Próximas Fases

#### v9.1.0 — Notificações In-App

**Backend:** Nova tabela `notifications` com RLS (usuário vê apenas suas próprias). Triggers para comentários em posts próprios, votos positivos (throttle 1/hora), e expiração de posts.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'comment', 'vote_up', 'report_resolved', 'post_expired'
  actor_id UUID REFERENCES profiles(id),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, read) WHERE read = false;
```

**Frontend:** Novo módulo `kc-notifications.js`. Ícone de sino no header com badge. Dropdown com avatar + texto + timestamp. Supabase Realtime subscription. Deep links para o post/comentário.

#### v9.1.1 — Comment Threading

Coluna `parent_id` na tabela `comments`. Limite de 1 nível de profundidade (estilo Instagram). Renderização indentada com borda lateral usando `var(--kc-primary-brand)`.

#### v9.1.2 — Avaliações

Nova tabela `user_ratings` (1-5 estrelas + texto curto, max 280 chars). Rating médio exibido no perfil e seller card. Apenas quem interagiu pode avaliar. Sem auto-avaliação.

#### v9.2.0 — Busca Server-Side

Índice GIN para full-text search em português. RPC `kc_search_posts` com `ts_rank`. Sinônimos continuam expandidos client-side antes de enviar ao RPC.

#### v9.2.1 — Filtros Avançados

Por módulo: range de preço, data, tipo, região. Persistência em URL params. Accordion desktop, drawer mobile. Novo módulo `kc-feed-filters.js`.

#### v9.2.2 — Paginação Cursor-Based

Melhor que offset para feeds com inserções frequentes. Retorna `{ posts, nextCursor, hasMore }`. Botão "Carregar mais" (não infinite scroll — melhor acessibilidade).

#### v9.3.1 — Analytics de Post

`view_count` em posts + tabela `post_view_events`. Anti-spam: 1 view/usuário/hora. Mini-analytics em "Meus Posts": visualizações, votos, comentários, shares.

#### v9.3.2 — Moderação Automática

Flood control (max 3 posts/hora), link spam (>3 URLs externas = status `pending`), score de confiança para usuários novos (<7 dias, 0 posts aprovados).

---

## PARTE 4 — PADRÕES DE CÓDIGO E PROCESSOS

### 4.1. Padrão IIFE

Todos os novos módulos JS devem usar IIFE: função auto-executável com `'use strict'`, funções privadas internas, interface pública em `window.*`, inicialização no `DOMContentLoaded`.

### 4.2. Padrão Driver

`KC_ENV.driver` seleciona entre `SupabaseAdapter` (produção) e `LocalAdapter` (desenvolvimento). `KCAPI` é a facade que abstrai o storage.

### 4.3. Padrão Popover

Trio `openXPopover` / `closeXPopover` / `wireXPopover`. CSS reutiliza classes `.kc-save-popover`. Desktop: dropdown ancorado. Mobile: bottom sheet. Exclusão mútua entre popovers (save, share, calendar).

### 4.4. Sanitização

**OBRIGATÓRIO:** Sempre usar `window.KCUtils.escapeHtml()` antes de inserir dados de usuário em `innerHTML`. Nunca inserir conteúdo cru (risco XSS).

```javascript
// CORRETO:
el.innerHTML = window.KCUtils.escapeHtml(userContent);
// NUNCA:
el.innerHTML = userContent;  // XSS!
```

### 4.5. Processo de Feature Branch

1. `git checkout kinocampus-V8.2-SANEAMENTO-QA && git pull`
2. `git checkout -b feat/nome-da-feature`
3. Implementar + testes + docs
4. `npm test` (todos os testes passam)
5. `node scripts/hygiene-check.js`
6. `gh pr create --base kinocampus-V8.2-SANEAMENTO-QA`
7. Após merge: excluir feature branch local e remota

### 4.6. Checklist por PR

| Categoria | Itens |
|-----------|-------|
| Funcionalidade | npm test passa, testes novos, testado mobile 375px + desktop 1440px, dark mode, estados (vazio/loading/erro) |
| Segurança | Mutations requerem auth, MIME type validado em uploads, RLS em novas tabelas, search_path=public |
| Banco | Migration testada em staging, rollback documentado, índices para queries frequentes |

---

## PARTE 5 — DESIGN SYSTEM

### 5.1. Cores

| Variável | Valor | Uso |
|----------|-------|-----|
| `--kc-primary-brand` | `#ff6b00` | Laranja principal |
| `--kc-primary-brand-light` | `#ff8c00` | Hover |
| `--kc-bg-dark` | `#0f0f13` | Fundo da página |
| `--kc-surface-dark` | `#1a1a22` | Cards, modais |
| `--kc-success` | `#22c55e` | Status positivo |
| `--kc-warning` | `#f59e0b` | Alerta |
| `--kc-error` | `#ef4444` | Erro |
| `--kc-info` | `#3b82f6` | Informação |

### 5.2. Breakpoints

| Breakpoint | Uso |
|-----------|-----|
| `max-width: 400px` | Mobile pequeno |
| `max-width: 640px` | Mobile/Tablet |
| `max-width: 767px` | Tablet |
| `min-width: 768px` | Desktop |
| `min-width: 1024px` | Desktop grande |

### 5.3. Componentes

- **Cards:** `.kc-card` com sombra e border-radius
- **Botões:** `.kc-btn-primary` (laranja), `.kc-btn-secondary`, `.kc-btn-ghost`
- **Chips/Tags:** `.kc-chip` com variantes de cor por módulo
- **Modais:** `.kc-modal-overlay` + `.kc-modal-content`
- **Popovers:** `.kc-save-popover` (reutilizado para save/share/calendar)

---

## PARTE 6 — VARIÁVEIS DE AMBIENTE

| Variável | Onde | Descrição |
|----------|------|-----------|
| `SUPABASE_URL` | Vercel | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Vercel | Chave pública do Supabase |
| `KC_NOTIFY_HMAC_SECRET` | Supabase | Segredo HMAC-SHA256 para webhooks |
| `ADMIN_REPORTS_WEBHOOK_URL` | Supabase | URL do webhook de alertas |
| `KC_APP_BASE_URL` | Supabase | URL base do app |
| `REPORTS_THRESHOLD` | Supabase | Número de denúncias para alerta (default: 3) |

---

## PARTE 7 — HISTÓRICO DE VERSÕES

| PR | Versão | Descrição |
|----|--------|-----------|
| #188 | v8.6.x | Botão "Marcar na Agenda" com popover multi-calendário |
| #190 | v8.6.x | Fix: chips do kc-create-modal no mobile |
| #191 | v8.6.x | Fix: ranking table overflow desktop e mobile |
| #192 | v8.6.x | Fix: product actions + botão "Criar parecido" |
| #193 | v8.6.x | Fix: ranking modal, product actions harmonizados |
| #194 | v9.0.0 | Documentação técnica + segurança (SVG block, magic bytes) |

---

## PARTE 8 — CONCLUSÃO E PRÓXIMOS PASSOS

O KinoCampus é uma plataforma funcional e segura com base técnica sólida. As fundações do v9 (documentação e segurança) já foram implementadas e mergeadas (PR #194).

**Próximos passos imediatos:**

1. v9.0.2 — Expandir cobertura de testes para 40%
2. v9.0.4 — Criar migrations de retenção de analytics
3. v9.1.0 — Implementar sistema de notificações in-app (prioridade máxima)

**Decisões pendentes do proprietário:**

- Modelo de negócio do Cashback (v9.3.0)
- Priorização: filtros avançados vs busca server-side vs threading
- Avaliação de bundler (Vite/Rollup) para v9.4+

---

*Relatório gerado por Claude Code (Anthropic) em 02/04/2026. Modelo: Claude Opus 4.6.*
