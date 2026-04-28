# V18 - Inventario de Pendencias para V19

**Versao:** v18.2.0-v18.5.0  
**Atualizado em:** 2026-04-28  
**Escopo:** mapeamento documental/analitico, sem alteracao funcional

---

## 1. Criterios de Priorizacao

| Prioridade | Criterio |
|---|---|
| P0 | Pode bloquear deploy, seguranca, auth, dados reais, QA critico ou confiabilidade operacional |
| P1 | Aumenta risco de regressao, drift ou manutencao, mas nao bloqueia uso imediato |
| P2 | Higiene, clareza documental, organizacao ou melhoria de qualidade sem risco imediato |

## 2. Drift Documental Ativo

| ID | Prioridade | Item | Evidencia | Acao / status |
|---|---|---|---|---|
| DOC-001 | P1 | `docs/env-vars.md` ainda descreve release funcional v10 e fase v11 | Baseline textual na secao `KC_ENV em runtime` | Atualizar baseline para V18/V19 e manter nota clara sobre `frontendRuntimeVersion=8.6.0` |
| DOC-002 | P1 | `docs/db-schema.md` ainda declara estado v11.25.x | Header do documento | Reancorar estado documental para a baseline atual sem apagar marcadores historicos de introducao |
| DOC-003 | P1 | READMEs de `assets/js/` ainda dizem que movimentacoes V14/V15 estao planejadas | `assets/js/api/README.md`, `boot/`, `core/`, `utils/`, `adapters/*`, `legacy-shims/` | Reescrever status dos READMEs como pos-V15, refletindo arquivos reais e regras atuais |
| DOC-004 | P1 | `docs/qa/` misturava material operacional ativo com historico V8/V11 | `docs/qa/README.md`, `docs/qa/reports/*` | Resolvido em V20: historico movido para `docs/archive/qa-legacy/` e checklist ativo recriado |
| DOC-005 | P2 | `RELATORIO-KINOCAMPUS-V15.md` permanece na raiz com linguagem historica de execucao | Relatorio raiz preservado por V17 | Decidir se fica como raiz historica imutavel ou se recebe nota de status encerrado |
| DOC-006 | P2 | `.lighthouserc.js` tinha referencia antiga a auditoria de accessibility | Comentario de justificativa dos thresholds | Manter referencia pos-V17 para `docs/archive/audits-accessibility/` |
| DOC-007 | P2 | `package.json` descrevia linha funcional v11 | Campo `description` | Manter descricao curta alinhada a V18 e ao runtime canonico 8.6.0 |

## 3. Produto e Funcionalidades

| ID | Prioridade | Item | Evidencia | Acao / status |
|---|---|---|---|---|
| PROD-001 | P0 | Confirmacao real de e-mail/signup callback ainda precisa de QA fim a fim | `docs/qa/e2e-checklist.md` registra callback bloqueado/nao exercitado em runs antigas | Criar run controlada com conta nova, caixa real e evidencias de `auth-callback.html` |
| PROD-002 | P0 | Fluxos autenticados/admin dependem de credenciais reais para validacao completa | Checklist QA historico registra bloqueios por ausencia de credenciais | Definir ambiente de teste, usuarios, massa de dados e permissao admin temporaria |
| PROD-003 | P1 | Avatar/profile dependem de confirmacao operacional de Storage policies e caminhos | `supabase/manual/*profile_avatar_storage_policies.sql`; docs citam paths distintos historicos | Validar bucket, policies, upload/update/delete e normalizar docs para `profile-avatars/{userId}/...` |
| PROD-004 | P1 | Canais externos de notificacao estao implementados, mas gated por provider/secrets | Edge Function retorna `provider_not_configured` quando secrets ausentes | Planejar go-live por canal, com sandbox/provider, rate limit, templates e rollback |
| PROD-005 | P1 | Busca/feed dependem de `unaccent` e FTS, logo hardening de extensao precisa ser cauteloso | Migrations v9.2.x usam `public.unaccent`/`kc_unaccent` | Projetar mudanca de extensao sem quebrar FTS, RPCs e ordenacao de resultados |
| PROD-006 | P2 | UX de fluxos de erro externos pode precisar refinamento apos QA real | Notificacoes, auth callback e settings possuem estados bloqueados/fail-closed | Mapear mensagens e estados apos validar provider real |

## 4. Seguranca e Operacoes

| ID | Prioridade | Item | Evidencia | Acao / status |
|---|---|---|---|---|
| SEC-001 | P0 | `auth_leaked_password_protection` depende de configuracao no Supabase Dashboard | Documentado em migrations/ops como acao fora do git | Confirmar status no dashboard e registrar evidencia operacional |
| SEC-002 | P0 | `unaccent` em `public` exige plano especifico antes de mover extensao | `docs/db-schema.md` marca `extension_in_public` como pendente | Fazer spike SQL em ambiente isolado antes de qualquer migration |
| SEC-003 | P1 | Avatar Storage policies ainda possuem script manual | `supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql` | Transformar em checklist bloqueante ou migration segura validada pelo owner |
| SEC-004 | P1 | Scheduler de notificacao depende de runtime config fora do git | `notification_dispatch_runtime` e `app.settings` | Criar runbook de configuracao, smoke e rollback do dispatcher |
| SEC-005 | P1 | CSP pode bloquear feedback script de preview Vercel sem afetar app | `docs/ops/vercel-supabase-invariants.md` | Separar ruido de preview de regressao real em QA e Lighthouse |

## 5. QA, UX, CSS e Acessibilidade

| ID | Prioridade | Item | Evidencia | Acao / status |
|---|---|---|---|---|
| QA-001 | P0 | `check:all` cobre Jest, mas nao Playwright E2E | `package.json` tem `test:e2e` separado | Definir quando Playwright vira gate obrigatorio ou gate manual documentado |
| QA-002 | P0 | Nao ha visual regression automatizado antes de mexer em CSS | `docs/architecture/css-architecture.md` bloqueia split CSS sem visual test das 22 paginas | Escolher ferramenta/processo de snapshot visual antes de qualquer split |
| QA-003 | P1 | Lighthouse precisa baseline pos-V17/V18 em CI | `.lighthouserc.js` thresholds producao; historico local antigo | Rodar/registrar LHCI em Linux CI e separar falhas Windows EPERM de score real |
| QA-004 | P1 | Plano i18n/a11y/UX writing v11 precisa reconciliacao com estado atual | `docs/i18n-a11y-uxwriting-plan.md` contem checklist antigo | Auditar o que foi entregue pelos gates atuais e o que ainda e desejavel |
| QA-005 | P1 | `repository-reorg-smoke-v15.md` preserva checkboxes historicos nao fechados | `docs/archive/qa-legacy/repository-reorg-smoke-v15.md` | Resolvido em V20: arquivado como evidencia historica, nao gate ativo |
| CSS-001 | P1 | Split CSS segue bloqueado corretamente | `assets/css/future-split/` e guia CSS indicam stubs nao carregados | Manter bloqueado ate selector audit + visual regression + plano de link dos 22 HTMLs |

## 6. Higiene de Repositorio

| ID | Prioridade | Item | Evidencia | Acao / status |
|---|---|---|---|---|
| REP-001 | P1 | `.claude/worktrees/serene-germain` continha artefatos V9 rastreados | `git ls-files .claude` listava docx/pdf/scripts V9 | Resolvido em V21: artefatos movidos para `docs/archive/claude-worktree-v9/` e worktrees locais voltaram a ser ignoradas |
| REP-002 | P2 | Relatorios raiz tendem a crescer a cada versao | V15, V16, V17, V18 na raiz | Definir politica: manter ultimas N versoes na raiz e arquivar anteriores |
| REP-003 | P2 | Busca textual e grep eram poluidos por docs historicos ativos | `docs/qa/` e `.claude/worktrees` | Resolvido em V20 para `docs/qa/` e em V21 para `.claude/worktrees` rastreado |

## 7. Itens Fora de Escopo da V18

- Corrigir fluxo de auth/signup.
- Aplicar SQL no Supabase.
- Mover `unaccent`.
- Ativar provider real de e-mail/WhatsApp.
- Executar split CSS.
- Mover ou remover artefatos historicos.
- Alterar HTML, CSS de producao ou JS funcional.
