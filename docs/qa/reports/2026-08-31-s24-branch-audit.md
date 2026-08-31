# S24 — auditoria conservadora de branches e worktrees

Data: 2026-08-31. Repositório: `yandiamantinoBr/kino-campus`.

O inventário completo foi coletado entre **19:16:58 e 19:17:27 UTC**. A revisão de patch IDs terminou às **19:18:54 UTC**. As quatro branches remotas e a ausência de checkout nas duas refs desta tarefa foram reconfirmadas às **19:21 UTC**.

Base exata da comparação: `main` remota em `e6c3e82d227aa1fa8bfde60df71868b2d1adb649`, merge da PR #923. Este documento registra um snapshot: a branch que publica os próprios relatórios naturalmente poderá ganhar novos commits depois dele.

## Resultado e decisões

- **GitHub: quatro branches reais**, sendo `main` e três branches Dependabot com PRs abertas. Não há motivo comprovado para apagar as três pendências.
- **Local: 18 branches e 89 worktrees registrados**, dos quais 73 estão em detached HEAD. Os 18 HEADs de branches locais estavam integralmente na ancestralidade da `main` remota; isso não significa que seus diretórios possam ser apagados.
- **15 worktrees tinham alterações rastreadas ou entradas não rastreadas.** Todos eram legíveis; nenhum registro estava marcado como locked ou prunable.
- **19 worktrees detached tinham commits fora da ancestralidade da `main`.** Em 14 deles, todos os patches não-merge possuíam patch ID equivalente já integrado. Os cinco restantes retêm **18 patches sem equivalente textual**, discriminados abaixo.
- As refs locais das PRs **#922 e #923** estavam integradas e sem checkout. São as duas candidatas imediatas à remoção apenas da ref, após uma nova confirmação de ancestralidade e ocupação. **Nenhuma exclusão foi executada nesta auditoria.**
- Preservar a `main` primária, a branch atual `codex/s24-performance-verification-20260831`, os worktrees de outras tarefas e os artefatos de QA. Um checkout limpo no Git pode conter arquivos ignorados que não aparecem em `git status`.

## GitHub: manter main e as três pendências abertas

| Branch remota | PR | Decisão |
|---|---|---|
| `main` | — | Preservar como linha de integração. |
| `dependabot/npm_and_yarn/main/jest-toolchain-28efb3b718` | [#904](https://github.com/yandiamantinoBr/kino-campus/pull/904) — `deps: bump the jest-toolchain group across 1 directory with 3 updates` | Preservar; atualização do conjunto de testes exige validação conjunta, não merge apenas pelo título. |
| `dependabot/npm_and_yarn/main/vercel/og-1.0.2` | [#905](https://github.com/yandiamantinoBr/kino-campus/pull/905) — `deps: bump @vercel/og from 1.0.1 to 1.0.2` | Preservar; validar geração de OG e runtime Vercel antes da integração, mesmo sendo atualização aparentemente pequena. |
| `dependabot/npm_and_yarn/main/typescript-7.0.2` | [#906](https://github.com/yandiamantinoBr/kino-campus/pull/906) — `deps: bump typescript from 5.9.3 to 7.0.2` | Preservar; mudança principal do compilador precisa respeitar a estratégia de migração e os contratos de tipos existentes. |

As três refs têm commits exclusivos em relação à `main` e PRs abertas. Esta revisão não reexecutou suas suítes nem declarou compatibilidade. A listagem foi obtida diretamente do servidor com `git ls-remote --heads origin` e confrontada com as PRs do GitHub, não inferida de refs `origin/*` antigas. Ao final do snapshot, não restavam refs de acompanhamento obsoletas ou divergentes; nenhuma operação de fetch/prune foi feita pelo auditor.

## PRs desta tarefa: integração comprovada, remoto já removido

| PR / branch local | HEAD auditado | Merge em main | Situação |
|---|---|---|---|
| [#922](https://github.com/yandiamantinoBr/kino-campus/pull/922), `codex/s24-header-performance-20260831` | `a12522c1e4f86f9fe9aa7bf6e1190ed59118f683` | `727d8bdd1a48d1560395f7b5041c8549d1b4f52c`, 18:54:18 UTC | MERGED; branch remota ausente; ref local sem checkout; 0 commits exclusivos, 3 atrás da base auditada. |
| [#923](https://github.com/yandiamantinoBr/kino-campus/pull/923), `codex/help-draft-pending-edit-20260831` | `afa33e028ba157c6105a4981b688ffcb7a911834` | `e6c3e82d227aa1fa8bfde60df71868b2d1adb649`, 19:12:11 UTC | MERGED; branch remota ausente; ref local sem checkout; 0 commits exclusivos, 1 atrás da base auditada. |

Antes de remover essas duas refs locais, reconfirmar: SHA atual do servidor; HEAD atual da ref; `git merge-base --is-ancestor <head> <main-remota-exata>`; ausência em `git worktree list --porcelain`; e ausência de novo trabalho/PR associado. Remover uma ref integrada não autoriza excluir diretórios de trabalho, arquivos não rastreados, relatórios ou metadados de worktree. Não usar exclusão forçada como substituto dessa prova.

## Branches locais: o que preservar

Todas as linhas abaixo tinham **zero commits exclusivos** contra a base exata auditada. “Ocupada” significa checkout registrado, não uma afirmação de que um processo está executando naquele instante.

| Branch | Commits atrás | Estado / decisão |
|---|---:|---|
| `main` | 17 | Checkout primário; preservar 30 entradas não rastreadas. |
| `codex/academic-board-cover-scope-20260831` | 57 | Integrada, PR #911; ocupada, preservar checkout. |
| `codex/cadu-admin-resilience-20260827` | 85 | Integrada, PR #894; ocupada, 26 entradas não rastreadas. |
| `codex/cadu-body-integrity-20260831` | 14 | Integrada, PR #919; ocupada, preservar checkout. |
| `codex/cadu-covers-dating-20260831` | 62 | HEAD integrado; branch associada à PR #901; ocupada. |
| `codex/cadu-location-markdown-20260831` | 41 | Integrada, PR #913; ocupada. |
| `codex/cadu-media-network-boundary-20260831` | 43 | Integrada, PR #912; ocupada. |
| `codex/cadu-phase-completion-runbook-2026-07-13` | 519 | HEAD integrado; ocupada, uma alteração rastreada. |
| `codex/cadu-user-tags-contract` | 136 | Integrada, PR #866; ocupada, duas entradas não rastreadas. |
| `codex/calendar-all-day-exclusive-end-20260831` | 11 | Integrada, PR #921; ocupada. |
| `codex/event-deadline-semantics-20260831` | 26 | Integrada, PR #917; ocupada. |
| `codex/help-draft-pending-edit-20260831` | 1 | PR #923; ref desocupada, candidata condicionada à reconfirmação acima. |
| `codex/instagram-ocr-shadow-2026-08-13` | 197 | HEAD integrado; ocupada, quatro entradas não rastreadas. |
| `codex/og-short-id-resolution-20260831` | 56 | HEAD local integrado; PR #909 integrada; ocupada. |
| `codex/s24-header-performance-20260831` | 3 | PR #922; ref desocupada, candidata condicionada à reconfirmação acima. |
| `codex/s24-performance-verification-20260831` | 0 | Branch de documentação/QA desta entrega; ocupada e com relatório não rastreado no snapshot. Preservar. |
| `codex/script-reference-contract-20260823` | 130 | HEAD integrado; ocupada, oito alterações rastreadas e três entradas não rastreadas. |
| `codex/self-paced-course-validity` | 30 | Integrada, PR #914; ocupada. |

A `main` primária permanecia em `00a8d31473d8453a1f5b11af15de437a2fe04948`, com zero alterações rastreadas e 30 **entradas** não rastreadas — entradas podem ser diretórios, não necessariamente 30 arquivos. Atualizá-la por fast-forward requer antes conferir colisões com esses arquivos. A auditoria não a atualizou.

## Cinco worktrees detached: 18 patches a preservar e revisar

Os identificadores abaixo são nomes locais de checkouts, sem caminhos pessoais. A comparação foi feita contra `e6c3e82d227aa1fa8bfde60df71868b2d1adb649`. As cinco árvores estavam sem alterações rastreadas/não rastreadas no snapshot; isso não autoriza sua remoção, pois os commits e possíveis artefatos ignorados continuam relevantes.

| Checkout | HEAD | Patches sem equivalente | Encaminhamento seguro |
|---|---|---:|---|
| `Codex/d2f7/kino-campus-v76-22` | `0b0eeb41` | 2 | Preservar histórico de SEO e evidência de junho; comparar requisitos pontuais com o runtime atual. |
| `.codex-kino-dryrun-ui` | `a7167372` | 3 | Preservar evidências/testes de modos explícitos e falha fechada; não substituir o controlador atual pelo antigo. |
| `kino-campus-audit-phase4` | `fc2c2c72` | 7 | Preservar decisões de CI, autenticação Edge e relatórios de incidentes; revisar contra as proteções atuais. |
| `kino-campus-dependency-audit` | `f65cd538` | 5 | Preservar evidências de advisories; não reaplicar lockfile/overrides antigos. |
| `kino-campus-review-v2-compat` | `e8a11d60` | 1 | Preservar a proposta de TTL como decisão pendente; não aumentar a validade do snapshot sem reavaliar os gates. |

### Commits e oportunidade de aproveitamento

| Commit | Título / escopo inspecionado | Classificação |
|---|---|---|
| `30968315d2f855def1dfb96d29f44d2d4f99c1b0` | `feat: harden public content SEO resilience` — 29 arquivos, incluindo OG, feed, HTML, testes e runbooks. | Parte das intenções já existe na main: limites de metadados, origem canônica e sincronização de estado vazio. Aproveitar requisitos/testes eventualmente faltantes após comparação, não o patch inteiro. |
| `0b0eeb41d87b0e3a758588886d526e5134dbdc9f` | `docs: record v76.22 remote checks` | Evidência histórica, não prova de produção atual; preservar sem apresentar resultados de junho como atuais. |
| `9178b1dbbe5eb4ee3dbbdbad3db2b093d5d6cef6` | `feat(admin): make Cadu dry-run mode explicit` | Intenção relevante de separar simulação/execução real; confrontar com capabilities e rotas explícitas atuais. |
| `5547e83675d7e14630a755c84855b1259e610281` | `fix(admin): fail closed on pipeline mode changes` | Preservar cenários de falha fechada e mudança de modo como requisitos; não regressar os contratos posteriores. |
| `a71673725c79befa513f489f07a58762639e0f9f` | `fix(admin): reject missing pipeline modes` | O diff trata modo ausente e solicitação pendente. A main já valida booleanos e capabilities; revisar somente lacunas específicas de testes/concorrência. |
| `81a3bed64fb830be56c4ad5ddf77e331549f1438` | `ci(security): pin workflow actions by commit` | A main já contém actions pinadas por SHA. Os SHAs antigos não devem substituir versões atuais; aproveitar a invariável e testes, se faltantes. |
| `2af09b998ee3871b4c8c2c909d14a19839bd8230` | `fix(edge): preserve internal auth modes on deploy` | Mudança sensível de workflow e `verify_jwt`. A main já lê o contrato por função e verifica o estado remoto após deploy; não transportar configuração antiga automaticamente. |
| `85f86b830734d869d1f519d2ef5fa52ab03b57ab` | `docs(audit): record Edge auth regression` | Evidência histórica de incidente; preservar contexto, não aplicar como configuração de runtime. |
| `95bcf8f039f9ba1a962562ab6607dc4e25ff0957` | `test(edge): codify Cadu gateway auth` | Candidato à comparação de cobertura com os contratos atuais; existência do teste antigo não prova lacuna atual. |
| `e6d9f190ea8cb68ee40f29639ba76d6245dca827` | `docs(edge): reconcile function auth inventory` | Inventário datado; só reaproveitar após conferir funções/configuração atuais. |
| `ad5f43d0888027165f2da6d4542e361f4782d3a5` | `docs(audit): refresh post-merge risk state` | Histórico de riscos pós-merge, não estado presente. |
| `fc2c2c725552134c3ee7ee9529307acbbfdca2d0` | `docs(audit): normalize incident report formatting` | Formatação documental; manter junto do contexto original, sem urgência de runtime. |
| `f49b06af14a410baa0f7bd7052510d47bd434795` | `chore(deps): resolve development advisories` — introduz, entre outros, override de `tmp` 0.2.6. | Reaplicação literal regrediria o override atual 0.2.7. Usar apenas como histórico da decisão; validar a árvore atual de dependências separadamente. |
| `b5cb34952a884fb999a7e9ab49daf2bc7ff43dd7` | `ci(deps): schedule weekly dependency updates` | Agendamento semanal já existe na main com grupos e exceções adicionais; não substituir pela configuração antiga. |
| `c072de853d518f8163696ceef900feaf0deda583` | `docs(audit): record dependency hardening evidence` | Evidência de auditoria de julho; não equivale a um audit atual. |
| `b7b00860a72dd94b4b6326807880ee985a75f233` | `docs(audit): normalize dependency report ending` | Ajuste documental, preservar com seu relatório original. |
| `f65cd5384c8aeb20c520a0163115a8227d51d190` | `chore(deps): address latest tmp advisory` — troca 0.2.6 por 0.2.7. | A versão pretendida já está na main; o patch ID diferente não justifica reaplicar o lockfile antigo. |
| `e8a11d60a7817737ce086bc7c814b81b28b5266e` | `ux(admin-cadu): raise PIPELINE_SNAPSHOT_TTL_MS 15s to 60s` | A main mantém 15 segundos e usa essa constante em validação de frescor/expiração. Aumentar para 60 segundos é mudança de comportamento, não limpeza de branches; exige análise e testes próprios. Não foi aplicada. |

As observações de runtime acima vieram de leitura dos diffs selecionados e do código atual: `api/og-product.js`, `assets/js/controllers/public/kc-feed.controller.js`, `assets/js/controllers/admin/admin-cadu.controller.js`, `.github/workflows/edge-deploy.yml`, `supabase/config.toml`, `package.json` e `.github/dependabot.yml`. Não foram executados código antigo, migrações, deploys ou testes que publiquem conteúdo.

## Limite da equivalência por git cherry

`git cherry -v <main> <head>` compara patch IDs normalizados de commits não-merge. Um sinal `-` é evidência de patch equivalente já presente, **não prova de equivalência do runtime atual**, do contexto de aplicação ou de todos os artefatos do checkout. Um sinal `+` significa que esse patch ID não foi encontrado; sua intenção pode ter sido implementada por mudanças diferentes, por squash ou por evolução posterior.

Por isso, os 14 checkouts com patches equivalentes não foram apagados; os 18 patches sem equivalente não foram automaticamente considerados funcionalidades faltantes nem reaplicados por cherry-pick. Os 15 worktrees com trabalho local e os diretórios com relatórios ignorados continuam protegidos independentemente dessas classificações.

## Procedimento e evidências locais

Foram usados apenas comandos de leitura para Git/GitHub: `git ls-remote`, `git for-each-ref`, `git worktree list --porcelain`, `git status --porcelain`, `git rev-list --left-right --count`, `git merge-base --is-ancestor`, `git cherry -v`, `git show`, `gh pr list` e `gh pr view`. A ancestralidade das refs #922/#923 foi reconfirmada às 19:25 UTC, com sucesso para os dois HEADs contra a base exata. Não houve checkout, pull, fetch, prune, merge, cherry-pick, exclusão, commit ou push por esta auditoria.

Evidências detalhadas, mantidas fora do artefato público:

- `output/playwright/s24-final-branch-audit.json`: refs, SHA base, PRs, contagens por worktree e patch IDs.
- `output/playwright/s24-final-branch-audit.md`: inventário completo dos 89 checkouts, com nomes relativos e sem conteúdo dos arquivos não rastreados.
- `output/playwright/s24-final-branch-audit.cjs` e `s24-branch-patch-review.cjs`: coletores somente leitura.

Foi preservada a decisão das auditorias anteriores: ref remota removida não autoriza descartar um worktree local, e uma PR aberta/CI verde não equivale a merge. Os estados históricos foram substituídos por verificações atuais, sem reutilizar listas antigas como verdade presente. Repetir as verificações imediatamente antes de qualquer limpeza futura, pois outras tarefas podem criar commits, refs ou arquivos após este snapshot.
