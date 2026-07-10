# Auditoria técnica KinoCampus - Fases 7 a 9

**Data:** 2026-07-09
**Branch de trabalho:** `codex/audit-phase4-6-2026-07-09`
**Complementa:** `technical-audit-phase1-3-2026-07-09.md` e `technical-audit-phase4-6-2026-07-09.md`

> **Atualização pós-merge (2026-07-10):** a PR #641 foi incorporada como `e84d81d8`.
> Banco efêmero, pgTAP, type-check Deno e gate pós-CI de Edge passaram a existir na base. O
> primeiro deploy automático expôs uma regressão P1 de autenticação do dispatcher; consulte
> [`technical-audit-edge-auth-regression-2026-07-10.md`](./technical-audit-edge-auth-regression-2026-07-10.md).
> As tabelas abaixo preservam o diagnóstico que motivou essa progressão.

## Escopo e método

Esta etapa verifica a confiabilidade efetiva da suíte, a cobertura dos gates de CI, a atualização da documentação operacional e o plano de ação. Foram inspecionados `package.json`, `jest.config.js`, `playwright.config.js`, `.lighthouserc.js`, todos os workflows em `.github/workflows`, o filesystem de testes e a execução remota do PR #641.

Não foram executadas migrations, chamadas de escrita ao Supabase, deploy de produção nem alteração de segredo/configuração externa.

## Fase 7 - Testes, regressão e confiabilidade

### Estado observado

| Área | Evidência | Estado |
|---|---|---|
| Jest | 203 arquivos/suítes no conjunto `unit`, `integration`, `contract`, `structure` e `a11y`; 3.902 testes aprovados localmente | Cobertura funcional/estrutural ampla, sem rede real |
| Playwright | 13 specs e 85 cenários listados; workflow Essential Validation executa Chromium com servidor HTTP local | Regressão de rotas e UI básica coberta em CI |
| CI remota do PR #641 | Essential Validation e Lighthouse CI concluíram com sucesso; preview Vercel pronto | A alteração desta auditoria foi validada fora da máquina local |
| Lighthouse | Home, Compra/Venda e Admin Dashboard; a11y/SEO bloqueiam abaixo de 0,90; performance é aviso abaixo de 0,70 | Boa proteção mínima, não é orçamento de performance |
| Validadores estáticos | Versão, estrutura, cadeias de scripts, rotas, higiene e snapshot de busca | Snapshot de busca passou a integrar Essential Validation nesta rodada |

### Achados de cobertura

| Prioridade | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|
| P1 | CI não executa migrations nem RLS contra banco efêmero | Não há `supabase start`, `supabase db reset`, pgTAP ou equivalente nos scripts/workflows | SQL pode passar por teste textual e divergir na execução, grants ou policy real | Criar job isolado com Supabase local/branch, migrar baseline e testar matriz anon/autenticado/dono/admin |
| P1 | Edge Functions não possuem testes Deno executáveis versionados | Nenhum `*.test.*`/`*.spec.*` em `supabase/functions`; testes atuais leem fonte/contratos | Auth customizada, CORS, secrets e erros HTTP não são exercitados em runtime Deno | Adicionar testes unitários Deno por função crítica e smoke autenticado em ambiente de preview controlado |
| P2 | Cobertura Jest não possui threshold e mede lista parcial de arquivos | `jest.config.js` tem `collectCoverageFrom`, sem `coverageThreshold`; `kc-ads.js` e `kc-home-categories.js` não integram a lista | Queda de cobertura em módulos fora da lista não é visível no gate | Ampliar lista por domínio e introduzir thresholds incrementais, começando por utilitários/RPCs de maior risco |
| P2 | E2E cobre UI estática/local, não a autorização real do Supabase | Playwright sobe `http-server`; não há sessão Supabase de teste | Login, RLS, Storage e RPCs não são prova end-to-end contra backend | Separar uma suíte de smoke com projeto Supabase temporário e usuários de fixture; nunca apontar para produção |
| P2 | Lighthouse bloqueia apenas a11y/SEO | `.lighthouserc.js` marca performance e best-practices como `warn` | Regressão grave de performance pode chegar a merge sem exceção | Definir budgets por rota a partir de baselines de preview; elevar gradualmente apenas métricas estáveis |
| P3 | Estratégia de testes tinha contagens históricas | `docs/architecture/test-strategy.md` referia 191 Jest, 11 Playwright e 83 cenários | Handoff e gate de manutenção ficavam imprecisos | Atualizado nesta rodada para 203/13/85 e 3.902 testes |

### Matriz mínima recomendada

| Prioridade | Fluxo | Testes necessários | Ambiente |
|---|---|---|---|
| P0 se houver migration de segurança | Chat e RLS | anon, sessão expirada, participante, não participante, autor, admin; leitura, resposta, reação, edição e exclusão | Supabase local/branch efêmero |
| P1 | Auth e perfil | cadastro, login, logout, reset, senha vazada, perfil público/privado | Supabase de teste + browser |
| P1 | Postagem e Storage | criar, editar, encerrar, apagar, upload inválido, doze imagens, autorização de mídia | Supabase de teste + Storage isolado |
| P1 | Cadu | sem token, JWT inválido, usuário não-admin, admin, SSE/download sem JWT persistente em query | preview Vercel + mock/VPS de teste |
| P1 | Edge Functions | método, JWT/secret, CORS, erro estruturado, retries/idempotência | Deno + preview Supabase |
| P2 | Feed e ranking | cursor, cache, concorrência, calendário, post expirado/fechado, personalização sem consentimento | Jest + Supabase de teste para RPCs |
| P2 | Mobile | viewport 360/390 px, navegação, chat, criação, modal e ausência de overflow horizontal | Playwright |
| P2 | Operação | build Vercel, env names presentes, preview, rollback documentado | CI + checklist manual sem exibir valores |

## Fase 8 - Plano de ação consolidado

| Prioridade | Item | Justificativa/evidência | Arquivos/camada | Complexidade e risco | Estratégia e testes | Resultado esperado |
|---|---|---|---|---|---|---|
| P0 | Nenhum confirmado | Não houve prova de vazamento, indisponibilidade ou bypass em produção | - | - | Monitorar alertas e tratar P1 antes de mudanças amplas | Evitar priorização artificial |
| P1 | Proteger branch base e impedir promoção sem checks | API de protection retornou 404; Vercel publica por push | GitHub/Vercel | Baixa / média operacional | Configurar required PR/checks e ensaiar rollback em preview | Nenhum push direto promove regressão conhecida |
| P1 | Habilitar proteção de senhas vazadas | Security Advisor remoto confirmou desabilitada | Supabase Auth | Baixa / baixa | Alteração manual, teste de signup/reset, registro no runbook | Credenciais vazadas rejeitadas conforme política Auth |
| P1 | Reconciliar baseline/migrations e grants de chat | Histórico local/remoto diverge; grants anon remotos exigem correção | `supabase/migrations`, banco remoto | Alta / alta | Branch Supabase, upgrade representativo, teste de RLS; migration reversível | Procedimento seguro de schema e autorização mínima |
| P1 | Gatear deploy de Edge Functions | `edge-deploy.yml` ocorre após push e sem depender da validação | GitHub Actions | Média / média | Fazer workflow depender de checks ou environment approval; fixar CLI | Function não chega a produção sem validação |
| P1 | Criar testes reais de banco/Edge | CI atual é estática para SQL/Deno | CI, Supabase Functions | Média / média | Começar por chat e Cadu; fixtures descartáveis | Policies e auth exercitadas em runtime |
| P2 | Instituir orçamento de JS e Web Vitals | 1,3-1,6 MiB de JS local em páginas centrais | HTML/scripts/CI | Média / média | Baseline em preview, lazy loading por rota, métricas p75 | Menor custo inicial sem reescrever arquitetura |
| P2 | Paginar calendário e observar RPCs | Query solicita até 500 eventos; amostra de cursor ~1,48 s | feed/calendário/RPC | Média / média | Janela temporal, benchmark e explicabilidade de dados | Menos transferência e melhor previsibilidade |
| P2 | Corrigir advisor de `kc_unit_meta` | FK sem índice e três initplans RLS | migration futura | Baixa / baixa | Migration em branch, `EXPLAIN`, teste de policy | Menos trabalho de banco em crescimento |
| P2 | Restringir CORS e remover JWT de query | Proxies Cadu aceitam token de URL para SSE/download | `server/cadu-auth.mjs`, `api/cadu/*` | Média / média | Ticket temporário/cookie e teste de eventos | Menor exposição operacional de token |
| P2 | Atualizar dev dependencies e Dependabot | 15 advisories somente dev/CI; alerts desabilitados | `package-lock.json`, GitHub | Média / média | PR isolado, changelog e CI completa | Cadeia de desenvolvimento atualizada |
| P3 | Modularizar controllers grandes | Cadu/chat concentram muita lógica | controllers JS | Média / média | Extrações pequenas protegidas por contratos | Manutenção e revisão mais fáceis |
| P3 | Consolidar runbooks e inventário de env | Docs históricos coexistem com estado vivo | `docs/ops`, `docs/architecture` | Baixa / baixa | Índice por estado/data, lista de nomes sem valores | Handoff preciso e sem segredo |

## Fase 9 - Atualizações documentais desta rodada

1. `docs/architecture/test-strategy.md`: corrige a contagem canônica para o filesystem e execução atuais.
2. `docs/audits/README.md`: passa a indexar a auditoria técnica em fases 1-9.
3. `docs/audits/technical-audit-phase4-6-2026-07-09.md`: referencia esta continuação.
4. Este documento preserva limites e evidências para a próxima IA antes de qualquer migration, alteração de secret ou mudança de deploy.

## Critério para Fase 10

As mudanças já implementadas nesta sequência foram pequenas, reversíveis e verificadas: contratos de upload atualizados, deduplicação de requisições iniciais e inclusão do snapshot de busca na CI. Não é apropriado implementar agora mudanças de RLS, CORS, migrations ou workflows de deploy sem ambiente isolado, revisão de política e plano de rollback.

**Atualização:** a evidência de grants anônimos de chat foi suficiente para uma única migration de hardening, validada no Docker local e documentada em `docs/audits/technical-audit-phase10-controlled-hardening-2026-07-09.md`. O rollout remoto continua bloqueado pela reconciliação de migrations.

## Próximos passos seguros

1. Manter o PR #641 em revisão até a decisão explícita sobre merge/deploy.
2. Criar issue/PR próprio para proteção de branch, Dependabot e gate de Edge deploy.
3. Criar branch Supabase de teste para a reconciliação de migrations e grants de chat.
4. Implementar primeiro testes de runtime para chat/Cadu; depois aplicar migrations de hardening com rollback documentado.

## Atualização de execução - 2026-07-10

| Item anteriormente pendente | Progressão comprovada | Residual |
|---|---|---|
| Banco efêmero na CI | `Essential Validation` agora executa reset, lint e 106 pgTAP | A branch ainda precisa passar no GitHub após o force-push |
| Gate de Edge deploy | Deploy depende de `workflow_run` verde da validação essencial | Vercel continua independente do GitHub Actions |
| Validação Deno | 8 Edge Functions passam em Deno 2.8.0; 13 erros de tipagem foram corrigidos | Faltam testes HTTP/runtime por função |
| Drift caronas/Cadu/privacidade | Quatro migrations idempotentes reconstruídas e testadas localmente | Produção não foi alterada; exige branch Supabase |
| Advisor `kc_unit_meta` | Índice e policies otimizadas estão na migration local | Revalidar advisors após rollout controlado |
| Contagem de regressão | 207 suítes/3.922 Jest e 85 Playwright aprovados | Atualizar sempre com execução, não apenas filesystem |

O relatório detalhado desta progressão é
`technical-audit-phase10-schema-ci-reconciliation-2026-07-10.md`.

## Atualização de dependências - 2026-07-10

Nova execução verificável, sem alteração de pacote:

| Comando | Resultado |
|---|---|
| `npm audit --omit=dev --json` | 0 vulnerabilidades em 27 dependências de produção |
| `npm audit --json` | 15 achados exclusivos da toolchain: 5 altos, 7 moderados e 3 baixos |
| `npm outdated --json` | Babel/Jest/Playwright têm updates patch/minor; `@vercel/og` possui major disponível |
| `npm audit fix --dry-run` | inconclusivo por `ECONNRESET` no endpoint de advisories |

Os achados de desenvolvimento passam por Babel, Lighthouse/ChromeLauncher e suas dependências
transitivas (`ws`, `tmp`, `picomatch`, `js-yaml`, entre outras). Não há justificativa para misturar
uma atualização ampla da toolchain com a correção do dispatcher. O próximo passo é um PR isolado,
com atualização patch/minor dos pacotes diretos, inspeção do lockfile, CI completa e nova auditoria;
`@vercel/og` deve permanecer fora dessa rodada por exigir avaliação de major version.
