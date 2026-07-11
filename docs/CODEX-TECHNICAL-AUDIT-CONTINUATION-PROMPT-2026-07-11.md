# Prompt de continuidade tecnica do KinoCampus

**Data de consolidacao:** 2026-07-11, America/Sao_Paulo

**Repositorio principal:** `C:\Users\yan1n\Documents\GitHub\kino-campus`

**Branch-base:** `kinocampus-V75.0-foundations`

**HEAD observado antes deste documento:** `3859dae29f453b708869b40cb05cd47ad4785e2d`

**Estado dos PRs no momento da observacao:** nenhum PR aberto

**Finalidade:** este arquivo e um prompt autocontido para copiar e colar em uma nova tarefa do Codex.

> Os dados remotos abaixo sao uma fotografia. A primeira acao da proxima tarefa deve ser confirmar
> o estado atual, pois GitHub, Vercel, Supabase e VPS podem ter mudado depois de 2026-07-11.

---

## INICIO DO PROMPT PARA A PROXIMA TAREFA

Voce atuara como engenheiro senior, auditor tecnico, arquiteto de software e revisor de seguranca
do KinoCampus. Continue o trabalho de forma analitica, incremental e verificavel. Nao comece por
uma reescrita ampla. Leia as fontes primarias, confirme o estado atual e so entao implemente lotes
pequenos, reversiveis e cobertos por testes.

### 1. Objetivo desta continuacao

Continue a auditoria e o desenvolvimento do KinoCampus com foco imediato em quatro frentes:

1. corrigir a precisao da curadoria de **eventos futuros** e **oportunidades ainda ativas**;
2. consolidar uma fonte canonica para o inventario UFG usado pelo publisher Node, curador
   OpenClaw, `cadu-api` e painel `/admin/cadu.html`;
3. melhorar a semantica e a observabilidade dos estagios da pipeline sem publicar conteudo de
   teste nem confundir candidato, item novo, item formatado e item publicado;
4. continuar o rollout seguro dos achados de Supabase, dependencias e governanca de deploy sem
   executar migrations destrutivas nem alterar secrets.

O objetivo nao e maximizar a quantidade de itens. O objetivo e obter alta precisao:

- evento precisa ter evidencia de que ainda vai acontecer;
- oportunidade precisa ter acao concreta e janela ainda valida;
- noticia, resultado antigo, materia opinativa ou relato de evento passado nao pode ser promovido
  apenas porque contem palavras como `evento`, `pesquisa`, `selecao`, `prazo`, `PET` ou `RU`;
- cada decisao precisa ser explicavel por dados consultaveis no painel e nos artefatos do run.

### 2. Regras operacionais obrigatorias

1. Trabalhe no repositorio `C:\Users\yan1n\Documents\GitHub\kino-campus`.
2. Antes de editar:
   - execute `git status --short --branch`;
   - execute `git fetch origin --prune`;
   - confirme a branch-base remota;
   - estando a base limpa, use `git pull --ff-only origin kinocampus-V75.0-foundations`;
   - liste PRs abertos com `gh pr list`;
   - inspecione commits concorrentes recentes antes de assumir que este prompt ainda e atual.
3. Crie branch com prefixo `codex/` para cada lote coerente.
4. Nao reverta mudancas que nao foram feitas por voce.
5. Nao misture refatoracao ampla, migration, UI e pipeline operacional no mesmo PR.
6. Use commits pequenos, mensagens objetivas e PRs com causa raiz, risco e validacao.
7. Aguarde todos os checks remotos antes de mesclar.
8. Depois de cada merge:
   - volte para a branch-base;
   - use `git pull --ff-only`;
   - confirme o CI do commit de merge;
   - confirme que nao restou PR aberto ou branch local em estado ambiguo.
9. Nao execute `supabase db push` contra producao.
10. Nao aplique migration remota sem branch/ambiente descartavel, plano de rollback e autorizacao
    operacional especifica.
11. Nao altere ou imprima secrets. Pode listar apenas nomes de variaveis e presenca/ausencia.
12. Nao publique posts reais para testar a pipeline. Use dry-run, artefatos isolados e fixtures.
13. Nao faca deploy manual de producao apenas para validar uma hipotese.
14. Preserve o arquivo modificado no repositorio OpenClaw
    `data/.openclaw/workspace/TOOLS.md`; ele ja estava sujo e nao pertence a este trabalho.
15. Diferencie em todo relatorio:
    - **fato observado**;
    - **inferencia sustentada por evidencias**;
    - **hipotese que ainda exige teste**.

### 3. Estado-base confirmado em 2026-07-11

#### 3.1 Git e GitHub

- Branch-base: `kinocampus-V75.0-foundations`.
- HEAD observado: `3859dae2`, merge do Dependabot `@vercel/og`.
- Nao havia PR aberto depois do merge dos PRs `#661` e `#663`.
- O workflow `Essential Validation` do commit `3859dae2` concluiu com sucesso no run
  `29136467725`.
- O workflow subsequente `Deploy Edge Functions` concluiu com sucesso no run `29136544467`.
- Houve commits diretos na branch-base durante a rodada. Alguns deixaram a base temporariamente
  vermelha. Isso e evidencia concreta de que branch protection e deployment gates precisam ser
  avaliados.

#### 3.2 Versoes e testes

- `VERSION.json`: `appVersion=75.1.0` e `frontendRuntimeVersion=8.6.1`.
- Node exigido pelo `package.json`: `24.x`.
- `npm ci` limpo instalou 968 pacotes e terminou com zero vulnerabilidades no audit integrado.
- O `npm audit --omit=dev --json` isolado falhou duas vezes por `ECONNRESET` no registry; trate isso
  como falha transitoria de rede e repita, nao como prova de vulnerabilidade nem de ausencia dela.
- Validacao local mais recente:
  - `npm run check:all`;
  - 211 suites Jest;
  - 3.940 testes;
  - 3 snapshots;
  - todos aprovados.
- O reset Supabase/pgTAP, type-check das oito Edge Functions, Playwright e Lighthouse passaram nos
  PRs finais.

#### 3.3 Dependencias efetivas do lockfile

Depois de `npm ci`, `npm ls --depth=0` confirmou:

| Pacote | Versao efetiva |
|---|---:|
| `@vercel/og` | `0.11.1` |
| `@babel/core` | `8.0.1` |
| `@babel/preset-env` | `8.0.2` |
| `@playwright/test` | `1.61.1` |
| `jest` | `30.4.2` |
| `jest-environment-jsdom` | `30.4.1` |
| `babel-jest` | `30.4.1` |

Risco residual confirmado: `npm ci` termina com sucesso, mas emite varios `ERESOLVE overriding
peer dependency` porque `babel-preset-current-node-syntax@1.2.0` ainda depende de plugins de
sintaxe Babel 7 com peer `@babel/core ^7`. Os testes passam, mas a arvore esta ruidosa e nao deve
ser considerada uma migracao Babel 8 totalmente limpa. Avalie em PR proprio se e melhor:

1. voltar `@babel/core`/`preset-env` para 7 enquanto Jest ainda depende desse preset;
2. aguardar compatibilidade upstream; ou
3. remover a necessidade direta dos presets, se o uso real provar que sao dispensaveis.

Nao use `--force` ou override global para esconder o conflito.

### 4. Documentos que devem ser lidos antes de editar

Leia nesta ordem e confronte tudo com o codigo atual:

1. `docs/audits/README.md`
2. `docs/audits/technical-audit-phase1-3-2026-07-09.md`
3. `docs/audits/technical-audit-phase4-6-2026-07-09.md`
4. `docs/audits/technical-audit-phase7-9-2026-07-09.md`
5. `docs/audits/technical-audit-phase10-controlled-hardening-2026-07-09.md`
6. `docs/audits/technical-audit-phase10-schema-ci-reconciliation-2026-07-10.md`
7. `docs/audits/technical-audit-edge-auth-regression-2026-07-10.md`
8. `docs/audits/technical-audit-production-parity-followup-2026-07-10.md`
9. `docs/audits/technical-audit-notification-dispatch-transport-2026-07-10.md`
10. `docs/audits/technical-audit-dev-dependencies-2026-07-10.md`
11. `docs/CODEX-CADU-HANDOFF.md`
12. `docs/CADU-ADMIN-STATE.md`
13. `docs/PIPELINE.md`
14. `docs/env-vars.md`
15. `docs/db-schema.md`
16. `docs/rpc-catalog.md`
17. `docs/ops/vercel-supabase-invariants.md`
18. `docs/ops/cadu-openclaw-operational-handoff-2026-06-27.md`
19. `services/cadu-ufg-publisher/docs/cadu-operator-guide.md`

Ha tambem dois relatorios externos historicos em:

- `C:\Users\yan1n\.minimax-agent\projects\kino-campus-audit\RELATORIO-AUDITORIA-KINOCAMPUS.md`
  com 2.311 linhas;
- `C:\Users\yan1n\.minimax-agent\projects\kino-campus-audit\ADENDO-AUDITORIA-APROFUNDADA-V2.md`
  com 15.585 linhas.

O caminho literal antigo `C:\Users\yan1n.minimax-agent\projects\kino-campus-audit` nao existe.
Esses relatorios externos foram atualizados pela ultima vez em 2026-07-04, nao formam um repositorio
Git e possuem muitas afirmacoes historicas ja superadas. Use-os como indice de investigacao, nunca
como fonte final. Os relatorios versionados de 2026-07-09/10 e o codigo atual tem precedencia.

### 5. Mapa tecnico resumido

#### 5.1 Aplicacao principal

- Frontend multipagina estatico em HTML, CSS e JavaScript, sem framework SPA.
- Vercel serve os arquivos estaticos, executa funcoes Node em `api/` e aplica rewrites/headers de
  `vercel.json`.
- Supabase fornece Auth, Postgres, RLS, RPCs, Storage, Realtime, cron/pg_net e Edge Functions.
- O boot publico e validado em 32 HTMLs.
- O validador de rotas cobre 24 rotas publicas e oito rotas administrativas.
- O frontend usa facade `window.KCAPI`, adapters locais e adapters Supabase.
- A criacao, leitura, ranking, mensagens, notificacoes e paginas de produto possuem contratos
  historicos; nao renomeie API publica sem atualizar snapshots e consumidores.

#### 5.2 Pastas importantes

| Pasta/arquivo | Responsabilidade |
|---|---|
| `assets/js/boot/` | constantes, ambiente, flags, service worker e telemetria |
| `assets/js/api/` | facade e clientes KCAPI |
| `assets/js/adapters/` | drivers local e Supabase |
| `assets/js/controllers/` | controladores das paginas publicas e admin |
| `assets/js/features/` | ranking, filtros e funcionalidades compartilhadas |
| `assets/js/shared/` | componentes e logica transversal |
| `api/` | funcoes Node/Vercel, incluindo SSR/OG e proxies Cadu |
| `admin/cadu.html` | painel Cadu/OpenClaw |
| `services/cadu-ufg-publisher/` | publisher Node independente e seu registro de fontes |
| `supabase/migrations/` | baseline sintetica + incrementais ativas |
| `supabase/functions/` | oito Edge Functions |
| `supabase/tests/` | contratos pgTAP |
| `.github/workflows/` | CI, Lighthouse, e-mail e deploy Edge |
| `tests/` | Jest, contratos, integracao, E2E e manuais |
| `docs/audits/` | auditoria tecnica versionada |

#### 5.3 Vercel

- Projeto: `kino-campus`.
- Project ID: `prj_PTFmR4f3A1aAHV5mgXa24svL8umB`.
- O repositorio esta ligado por `.vercel/project.json`.
- `vercel.json` executa `node scripts/inject-env.js` como build e
  `npm ci --omit=dev --no-audit --no-fund` como instalacao de producao.
- `/product.html` e reescrito para `/api/og-product`.
- `/api/og-image` usa `@vercel/og`.
- Proxies `/api/cadu/*` encaminham operacoes administrativas ao `cadu-api`.
- A integracao Git da Vercel pode publicar antes de o GitHub Actions terminar. Esse risco de
  governanca continua ativo e deve ser resolvido com branch protection/deployment checks, nao com
  sleeps em scripts.

#### 5.4 Supabase

- Project ref: `wacyrkwhkvzwkqpolrbg`.
- Postgres local configurado para major 17.
- A cadeia ativa possui 15 migrations; a primeira e
  `00000000000001_baseline_v76.sql` e a ultima observada e
  `20260710172239_harden_notification_dispatch_transport.sql`.
- Ha oito Edge Functions:
  - `cadu-publish`;
  - `kc-account-erasure`;
  - `kc-dispatch-notification-outbox`;
  - `kc-external-access-decide`;
  - `kc-ga4-reports`;
  - `kc-help-request-notify`;
  - `kc-invite-user`;
  - `notify-admin-reports-threshold`.
- `kc-dispatch-notification-outbox` e `kc-invite-user` usam `verify_jwt=false` no gateway porque
  autenticam internamente. Esse contrato e intencional e possui gates de CI.
- Producao tinha historico de cerca de 72 migrations, diferente da baseline sintetica local.
  Portanto nao e seguro inferir que `supabase db push` produzira apenas os incrementais desejados.

### 6. Auditoria dos PRs recentes

Todos os PRs abertos foram analisados. O resultado consolidado foi:

| PR | Origem | Decisao | Evidencia principal |
|---:|---|---|---|
| `#638` | Codex | mesclado | hardening GA4; gates verdes |
| `#639` | Codex | mesclado | probe/cron Cadu; gates verdes |
| `#640` | Codex | mesclado | cobertura canonica de paginas |
| `#641` | Codex | mesclado | reconciliacao de schema/CI/Edge |
| `#642` | humano | mesclado | corrige `module is not defined` no publish |
| `#643` | humano | mesclado | resiliencia da pipeline e publish zero |
| `#644` | Codex | mesclado | preserva contratos de auth Edge |
| `#645` | Codex | mesclado | hardening de dependencias de desenvolvimento |
| `#646` | Codex | mesclado | import do normalizador de titulo |
| `#647` | Dependabot | mesclado | `actions/setup-node` 4.4.0 -> 6.4.0 |
| `#648` | Dependabot | mesclado | `actions/checkout` 4.3.1 -> 7.0.0 |
| `#649` | Dependabot | mesclado | Jest 30.3.0 -> 30.4.2, depois de alinhar a familia |
| `#650` | Dependabot | mesclado | `upload-artifact` 4.6.2 -> 7.0.1 |
| `#651` | Dependabot | mesclado | `supabase/setup-cli` 1.7.1 -> 3.0.0 |
| `#652` | Dependabot | fechado | `preset-env` 8 isolado quebrava peers |
| `#653` | Dependabot | mesclado | Playwright 1.59.1 -> 1.61.1 |
| `#654` | Dependabot | fechado | `@babel/core` 8 isolado quebrava peers |
| `#655` | Dependabot | mesclado | `jest-environment-jsdom` 30.4.1 |
| `#656` | Codex | mesclado | preserva wrapper admin `SECURITY INVOKER` |
| `#657` | Codex | mesclado | threshold Cadu invalido falha de forma fechada |
| `#658` | Codex | mesclado | timeout/ACL do dispatcher versionados |
| `#659` | Codex | mesclado | agrupa familias Jest e Babel no Dependabot |
| `#660` | Dependabot | mesclado | Babel core/preset 8 juntos; testes verdes, peer warnings residuais |
| `#661` | Dependabot | mesclado | `@vercel/og` 0.6.8 -> 0.11.1 |
| `#662` | Codex | mesclado | remove BOM e valida `sources[]` no publisher |
| `#663` | Codex | mesclado | corrige regressao de UX do Feed Coletado |

#### 6.1 Detalhe do PR `#661`

O primeiro check vermelho do `#661` nao foi causado por `@vercel/og`; foi causado por tooltips sem
`data-i18n-tooltip` introduzidos por um commit direto em `admin/cadu.html`. Depois do `#663` e do
rebase final do Dependabot:

- todos os seis checks passaram;
- o deployment Vercel `dpl_5waBQvPWUXUY2FzJxN7wMpRdBApt` ficou `READY`;
- `vercel curl "/api/og-image?type=eventos"` retornou PNG valido;
- tamanho observado: 134.170 bytes;
- dimensao visual confirmada: 1200 x 630;
- a imagem tinha logo, titulo Eventos, descricao e ilustracao, sem tela vazia ou corte.

#### 6.2 Dependabot configurado

`.github/dependabot.yml` agora agrupa:

- Jest: `jest`, `jest-*`, `@jest/*`, `babel-jest`;
- Babel: `@babel/core`, `@babel/preset-env`.

Existe contrato em `tests/contract/dependency-automation.test.js`. Nao aceite novamente uma
atualizacao parcial dessas familias sem provar `npm ci` e a arvore efetiva.

### 7. Commits diretos auditados

Os seguintes commits entraram diretamente na branch-base durante a rodada:

| Commit | Conteudo | Diagnostico |
|---|---|---|
| `9d204e25` | inventario Cadu v4.6, 156 linhas no curador | ampliou cobertura, mas introduziu duplicatas e divergencia |
| `16004adc` | inventario publisher com 106 fontes | JSON tinha BOM e quebrava `JSON.parse` real |
| `37be6a08` | fallback de env no feed diagnostics | mudanca pequena; CI posterior passou |
| `80de73ff` | UX round 2 do admin Cadu | introduziu regressao de paginacao, PDF, filtros e tooltips |
| `d50a5d3b` | resolve import de `classifier.js` | o push ficou vermelho por regressao anterior do admin, nao pelo import |

Correcoes subsequentes:

- `#662` removeu o BOM, tornou o loader defensivo e adicionou teste de integridade das 106 fontes;
- `#663` alinhou pagina para 25 itens, fez `Carregar mais` concatenar, limpou filtros antigos dos
  KPIs, corrigiu `innerHtml`/`innerHTML` e localizou tooltips;
- o commit de merge `7400d510` e o commit final `3859dae2` passaram no CI da base.

Essa sequencia demonstra um problema de processo: commits diretos conseguem deixar a base
vermelha e disparar Vercel antes da correcao. Priorize branch protection com PR obrigatorio e checks
requeridos.

### 8. Conexoes e ambientes disponiveis

#### 8.1 GitHub

- `gh` estava autenticado como `yandiamantinoBr`.
- Nao imprima `GH_TOKEN` nem execute `gh auth token`.
- Comandos read-only uteis:
  - `gh pr list --state open --limit 50`;
  - `gh pr view <n> --json ...`;
  - `gh pr checks <n> --watch`;
  - `gh run list --branch kinocampus-V75.0-foundations`.

#### 8.2 Vercel

- CLI autenticada para o projeto ligado localmente.
- Use `vercel api "/v6/deployments?projectId=<id>&limit=30" --raw` para localizar deployment por
  `meta.githubCommitSha`.
- Use `vercel curl` para previews protegidos. Um status Vercel verde nao substitui a verificacao do
  endpoint e do conteudo retornado.
- Nao altere env vars nem promova deployment durante diagnostico.

#### 8.3 VPS Hostinger/OpenClaw

- Host: `187.77.37.25`.
- Chave local: `$HOME\.ssh\openclaw_vps`.
- Usuario usado: `root`.
- Hostname observado: `srv1597083`.
- Containers ativos:
  - `openclaw-hahq-cadu-api`;
  - `openclaw-hahq-openclaw-1`.
- Repositorio local OpenClaw:
  `C:\Users\yan1n\.minimax-agent\projects\openclaw-cadu`.
- Branch OpenClaw observada: `main`, HEAD `c4482be`.
- Mudanca preexistente a preservar:
  `M data/.openclaw/workspace/TOOLS.md`.
- O hash de `server.py` local e nos dois caminhos do container era identico:
  `d955992118dbd40b71f267cdcd65ae0e001f10bce0c8de2884af42c4f436f73e`.
- O curador local/VPS tinha SHA-256:
  `575662f2311f9eac31780fa686b0090546d364326d5da0453ad6892ceecdfebc`.
- `lib/image-utils.js` local/VPS tinha SHA-256:
  `458d2b638f217976f3453664b78f634e7692deb0ea21c707fca0bee27211280b`.

Faca primeiro probes read-only. Nao reinicie container, nao rode pipeline mutante e nao edite o VPS
antes de ter patch versionado, teste e plano de rollback.

### 9. Pipeline Cadu/OpenClaw: contrato real

O catalogo do `cadu-api` possui nove estagios:

| ID | Nome | Entrypoint | Estimativa | Risco/effect |
|---|---|---|---:|---|
| `curator` | Curador UFG v4.4 | `cadu-curador-v4.4.js --daily` | 180s | leitura Supabase + artefatos |
| `ig` | Scanner Instagram | `scan-ig-browser.js` | 420s | CDP, cache IG, artefatos |
| `duplicates` | Enriquecimento Duplicatas | `enrich-duplicates.js` | 60s | pode atualizar Supabase |
| `format` | Formatador IA | `pipeline-kino.js --stage=format` | 300s | API IA + artefatos |
| `publish` | Publicacao | `pipeline-kino.js --stage=publish` | 60s | Edge publish + inserts/updates |
| `enrich` | Enriquecimento Imagens | `enrich-images.js --from-recent 20` | 90s | atualiza midia/metadata |
| `dedup` | Dedup Visual + Textual | `dedup-kino.js` | 120s | default dry-run, relatorio |
| `sigaa` | SIGAA Calendar Sync | `scripts/sigaa/sync_calendar.js` | 100s | login + Google Calendar write |
| `all` | Pipeline Completa | IG -> curator -> duplicates -> format -> publish -> enrich | 1200s | mutacao de producao |

O preflight observado retornou oito estagios executaveis e um bloqueado:

- `publish` isolado estava bloqueado porque faltava `_formatted_2026-07-11.json`;
- isso era esperado, pois somente o curador isolado havia rodado naquele dia;
- `sigaa` tinha warning nao bloqueante para Google Calendar nao confirmado sem expor secrets;
- `all` aparecia executavel, mas e mutante e nao deve ser disparado como teste.

#### 9.1 Run completo mais recente inspecionado

Run: `482e8c1d-33c1-4515-b2ba-b18b07647f91`

Horario local: 2026-07-10 15:52:53 a 16:05:16

Duracao: 740,5s

Status: `finished`, exit code 0.

Metricas resumidas:

- 723 itens;
- 704 descartados;
- 17 em revisao;
- 2 candidatos marcados como publicaveis;
- 535 posts IG ja vistos;
- 8 posts IG novos;
- 3 relevantes no IG;
- 51 perfis IG OK e zero falhas;
- 209 duplicatas processadas;
- 66 atualizacoes;
- 0 posts novos publicados.

`0 publicados` **nao foi falha nesse run**. O log mostra:

- os dois candidatos ja existiam no Supabase;
- foram pulados na formatacao e encaminhados ao fluxo de merge/enriquecimento;
- zero itens eram realmente novos;
- `_formatted_2026-07-10.json` foi salvo vazio de forma intencional.

O problema e de semantica da UI/summary: `Publicaveis: 2` representa candidatos do curador, nao
itens novos prontos para publicar. A proxima implementacao deve separar explicitamente:

- `candidates_publishable`;
- `already_published`;
- `truly_new`;
- `formatted`;
- `quality_blocked`;
- `published`;
- `merged`;
- `errors`.

Nao crie alerta de falha apenas porque `published=0` quando `truly_new=0`.

#### 9.2 Curador isolado mais recente inspecionado

Run: `4797f230-6b98-44a8-ab02-063008a24dd9`

Horario local: 2026-07-10 23:38:37 a 23:41:11

Status: `finished`, exit code 0.

Artefato: `curadoria-v4.4-daily-2026-07-11.json`.

Metricas reais do JSON:

- 126 linhas de fonte varridas;
- 85 hits JSON;
- 85 hits de `events.json`;
- 21 hits locais de eventos;
- 41 fallbacks HTML;
- 1.719 itens;
- 14 candidatos publish;
- 39 em revisao;
- 1.666 descartados;
- 583 expirados descartados;
- 461 duplicados descartados.

O summary do `cadu-api` exibiu `Publicaveis: ""`, embora o log dissesse `PUBLISH: 14`. Isso e bug
confirmado no parser de metricas do run isolado. Corrija com teste sobre log real/sanitizado.

### 10. Problema P1 confirmado: relevancia da curadoria

A amostra dos 14 candidatos de 2026-07-11 prova que a precisao ainda nao esta aceitavel.

Exemplos confirmados:

1. `Professor da UFG estima que Copa de 2026 sera a mais poluente da historia`
   - `sourceKind=news`;
   - classificado como `oportunidades/voluntariado`;
   - score 0,88;
   - uma data futura do torneio foi interpretada como sinal de oportunidade;
   - nao ha CTA de vaga, inscricao ou voluntariado.
2. `Futebol, petiscos e bebidas: como torcer sem descuidar da saude`
   - materia jornalistica;
   - classificada como `oportunidades/voluntariado`;
   - `hasDeadlineByRegex=true` provavelmente por uso generico de "prazo" no texto;
   - motivos incluem `pet` e `ru`, provavelmente matches por substring em `petiscos` e outras
     palavras, hipotese que deve ser confirmada no classificador.
3. `Chamada Publica Fapeg No 06/2024`
   - publicada em 2024;
   - `dates.isOld=true`;
   - sem data concreta extraida;
   - ainda assim recebeu decisao `publish` em 2026.
4. `IPTSP Indica - Curso de Inverno em Imunologia`
   - prazo de inscricao em 18 de maio ja passou;
   - evento termina em 31 de julho;
   - o algoritmo considerou o item ativo porque olhou a data final, nao o prazo de inscricao;
   - precisa diferenciar "evento ainda ocorrera" de "inscricoes ainda abertas".
5. `IV Workshop Online do PROFMAT`
   - exemplo positivo;
   - `sourceKind=event`;
   - datas de evento e inscricao futuras explicitas;
   - URL externa do evento e local virtual identificados.

Dos 14 candidatos, nenhum tinha os campos top-level normalizados `eventDate` ou `deadline`; as
evidencias estavam aninhadas em `dates`. Alguns itens tinham datas validas, outros tinham datas de
contexto jornalistico ou prazos ja vencidos. O downstream nao deve inferir todos esses papeis a
partir de uma lista indiferenciada.

#### 10.1 Implementacao recomendada para precisao

Faca esta frente antes de ampliar ainda mais as fontes:

1. Construa fixtures sanitizadas a partir dos exemplos acima.
2. Adicione testes que provem:
   - noticia sem acao nao vira evento/oportunidade;
   - `isOld=true` falha de forma fechada, salvo retificacao atual com prazo futuro explicito;
   - palavra `prazo` usada em "curto/longo prazo" nao e deadline;
   - lexemas curtos (`pet`, `ru`) usam fronteira de token, nao substring;
   - data de termino de campeonato mencionado em materia nao transforma a materia em evento;
   - oportunidade exige CTA acionavel e prazo/status ativo;
   - evento exige data futura de inicio/fim ou fonte de evento estruturada;
   - inscricao encerrada e evento futuro deve ser exibida como evento sem CTA de inscricao aberta,
     nunca como oportunidade ativa.
3. Modele papeis temporais separados:
   - `publishedAt`;
   - `eventStartsAt`;
   - `eventEndsAt`;
   - `applicationOpensAt`;
   - `applicationDeadline`;
   - `resultPublishedAt`;
   - `dateEvidence[]` com trecho e origem.
4. Use `sourceKind=event` e endpoint `/e/` como sinal forte, nao como unico criterio.
5. Exija acao concreta para oportunidade:
   - formulario;
   - edital ativo;
   - e-mail de inscricao;
   - link de candidatura;
   - instrucoes com prazo valido.
6. Rebaixe noticias institucionais sem acao para `discarded` ou `reviewable`, com motivo explicito.
7. Rode o curador em dry-run sobre o corpus recente e reporte precisao manual, nao apenas contagem.
8. Nao publique nenhum item durante essa calibracao.

### 11. Problema P1 confirmado: quatro inventarios de fontes

Nao trate os numeros abaixo como equivalentes.

#### 11.1 Publisher Node no KinoCampus

Arquivo: `services/cadu-ufg-publisher/config/sources.json`.

Estado observado:

- 106 fontes;
- 106 habilitadas;
- 102 em `quick`;
- Tier 1: 92;
- Tier 2: 10;
- Tier 3: 4;
- 62 com Instagram registrado;
- 102 com feed RSS marcado;
- 81 com feed de eventos marcado;
- zero IDs duplicados;
- zero `baseUrl` duplicadas.

O loader `src/sources.js` le apenas o subconjunto operacional:

- `id`, `name`, `baseUrl`, `tier`, `quick`, `enabled`, `type`;
- `defaultModule`, `defaultCategory`;
- `allowPatterns`, `blockPatterns`.

Ele ignora metadados de auditoria como `feedItemsCount`, `feedRssUrl`, `hasEventsRss`,
`hasFeedRss`, `instagram`, `lastAudit`, `lastPostDate` e `qualityScore`. Decida se isso e
intencional. Se esses dados devem orientar coleta, tipagem e frequencia, adicione-os ao schema e
ao runtime com testes; nao os leia ad hoc em varios lugares.

#### 11.2 Curador OpenClaw

Arquivo:
`C:\Users\yan1n\.minimax-agent\projects\openclaw-cadu\data\.openclaw\workspace\scripts\cadu-curador-v4.4.js`.

Estado real da constante `TIERS`:

- 156 linhas;
- 147 IDs unicos;
- 147 URLs unicas;
- Tier 1: 86 linhas;
- Tier 2: 40 linhas;
- Tier 3: 30 linhas.

Duplicatas exatas entre tiers:

- `secplan`;
- `propessoas`;
- `sdh`;
- `ciar`;
- `jornal-ufg`;
- `tvufg`;
- `hospitalveterinario`;
- `museu`;
- `planetario`.

O modo daily varre Tier 1 + Tier 2. O run recente registrou exatamente 126 linhas, soma de 86 + 40,
o que indica que as duplicatas tambem geram requisicoes repetidas. Elimine duplicatas antes da
rede e registre `source_id` canonico no artefato.

Sobreposicao com o publisher:

- 91 IDs em comum;
- 98 URLs em comum;
- 15 IDs existem apenas no publisher;
- 56 IDs existem apenas no curador.

Nao resolva isso fazendo uniao cega. Primeiro defina criterios e uma fonte canonica.

#### 11.3 `cadu-api` e painel admin

O mapa remoto no VPS declara:

- 106 fontes;
- Tier 1: 92;
- Tier 2: 10;
- Tier 3: 4;
- gerado em 2026-07-11 por `convert-sources-to-map.py`.

Porem o script gerador citado nao foi encontrado no repositorio OpenClaw nem no VPS auditado.
Tambem nao foram encontrados os scripts/artefatos citados como metodologia:

- `audit-ufg-sites.js`;
- `audit-ppgs.js`;
- `probe-one.js`;
- `ufg-audit-2026-07-10-v2.json`;
- `ppg-audit-2026-07-10.json`.

Logo, a alegacao de teste site a site nao e hoje reproduzivel.

O endpoint autenticado `/api/sites` retornou apenas 104 objetos. Causa confirmada:

- as linhas `FACE - CC (GRAD)`, `FACE - ECONOMIA (GRAD)` e
  `FACE - ADMINISTRACAO (GRAD)` quebram a regex do parser, que interpreta o primeiro parenteses
  como se fosse o da URL;
- `contabeis.face.ufg.br`, `eco.face.ufg.br` e `adm.face.ufg.br` somem;
- uma linha cai no fallback Instagram-only e gera objeto `FACE` com URL nula;
- resultado liquido: 104 objetos.

O parser cru retornou tiers 91/9/4. Depois, `list_sites()` aplica overrides de `kc_unit_meta` por
`u.name` e a API final retorna tiers 62/27/15.

Estado dos overrides:

- 59 linhas em `kc_unit_meta`;
- 35 mudam o tier declarado no mapa;
- a chave e o acronimo parseado (`EA`, `FACE`, `FF` etc.), nao o `source.id` canonico;
- nomes repetidos como `FACE` tornam a precedencia ambigua.

Isso pode ser historico administrativo legitimo. Nao apague overrides. A solucao deve:

1. usar `source_id` estavel;
2. expor `declaredTier` e `overrideTier` separadamente;
3. mostrar no admin qual valor esta efetivo e por que;
4. migrar/conciliar overrides antigos com relatorio e rollback;
5. impedir chaves ambiguas por nome.

Hashes observados:

- mapa local versionado OpenClaw v3.0: `8915de43109eca6c869a6f2b6d965ca7b26f95deeb39f9b1fa8274c7f65852e4`;
- mapa gerado no VPS: `aac75454ff3d86151ab9ccef4c582da37c6ff519659f02bdc747289ce072679c`.

O mapa remoto nao e o mesmo arquivo versionado localmente. Trate isso como drift operacional.

#### 11.4 Arquivo espelhado no KinoCampus

O curador espelhado depende de `./lib/image-utils.js`. Esse helper existe no OpenClaw/VPS, mas nao
estava presente no espelho equivalente do KinoCampus. Portanto o script copiado nao e standalone.
Nao prometa que o curador roda localmente no repo principal antes de corrigir/testar essa dependencia.

#### 11.5 Arquitetura recomendada para fontes

Implemente em PRs separados:

1. Defina um schema canonico versionado, preferencialmente JSON validado, com:
   - `id` estavel;
   - nome e sigla;
   - URL canonica;
   - tipo de fonte (`event`, `news`, `opportunity`, `mixed`);
   - tier-base;
   - modos de execucao;
   - Instagram e status da confirmacao;
   - endpoints detectados;
   - allow/block patterns;
   - evidencia e data da ultima auditoria.
2. Gere a partir dele:
   - configuracao do publisher Node;
   - configuracao do curador;
   - mapa legivel pelo admin;
   - snapshot/relatorio de auditoria.
3. Substitua parsing de Markdown no runtime por JSON estruturado, ou torne o Markdown apenas uma
   view gerada. Nao use regex de texto humano como contrato de API se o JSON ja existe.
4. Adicione contratos que falhem quando:
   - contagens divergem;
   - ha ID/URL duplicada;
   - fonte habilitada nao possui HTTPS;
   - tier efetivo nao explica override;
   - helper de runtime esta ausente;
   - o artefato gerado difere do snapshot versionado.
5. Preserve a possibilidade de override administrativo, mas fora da definicao-base.
6. Antes de sincronizar o VPS, execute parser/testes localmente e gere diff legivel das fontes.

### 12. Melhorias de observabilidade da pipeline

Implemente depois dos testes de precisao e do contrato de fontes:

1. Corrigir o parser de summary do curador isolado (`PUBLISH: 14` nao pode virar string vazia).
2. Adicionar ao run e ao PDF/JSON exportado:
   - contagem de fontes declaradas, unicas e efetivamente consultadas;
   - endpoints por fonte e falhas por tipo;
   - candidatos por modulo;
   - candidatos rejeitados por temporalidade;
   - itens antigos bloqueados;
   - itens ja publicados;
   - itens novos;
   - itens formatados;
   - itens bloqueados por qualidade;
   - publicados, mesclados e erros.
3. O health deve alertar:
   - falha tecnica;
   - ausencia de run dentro do SLA;
   - `truly_new > 0` sem artefato formatado;
   - tentativa de publish com erro;
   - queda abrupta de fontes consultadas;
   - taxa anomala de noticia irrelevante.
4. O health nao deve alertar apenas por `published=0` quando `truly_new=0`.
5. No admin, rotule claramente artefatos `stale_for_run`; hoje o endpoint lista arquivos antigos da
   mesma data junto com o run, embora marque esse campo.
6. Mantenha SSE, polling fallback, stop e export sem bloquear a UI.
7. Teste desktop e mobile em preview real antes do merge.

### 13. Estado do admin Cadu depois do PR `#663`

Mudancas confirmadas:

- limite default do Feed Coletado alinhado em 25;
- `Carregar mais` concatena a proxima pagina;
- paginacao anterior/proxima continua substituindo a pagina;
- atalhos KPI limpam busca/tier/Instagram antigos antes de aplicar o proprio filtro;
- botao de PDF restaura `innerHTML` corretamente;
- oito tooltips novos possuem chaves i18n;
- contrato em `tests/integration/admin-cadu-ux-contract.test.js`.

Nao reabra esses itens sem reproduzir uma regressao. A proxima melhoria do admin deve se concentrar
em semantica de metricas, fonte canonica, overrides explicitos e qualidade dos candidatos.

### 14. Supabase: pendencias reais e limites

Os relatorios de 2026-07-10 confirmaram:

- nao ha P0 demonstrado;
- as migrations de reconciliacao e hardening foram versionadas e testadas localmente, mas nao
  aplicadas remotamente;
- producao nao possui, ou diverge em:
  - `privacy_consent_events`;
  - `kc_record_privacy_consent`;
  - `kc_admin_privacy_analytics`;
  - ACLs finais do chat;
  - policies/indice de `kc_unit_meta`;
  - helpers RPC reconciliados;
  - ACLs de RPCs `kc_admin_*`;
- leaked-password protection continuava desabilitada;
- advisors de performance apontavam uma FK sem indice reconhecido, tres policies com initplan por
  linha e 59 indices sem uso recente;
- os 59 indices nao devem ser removidos em lote.

O dispatcher de notificacoes:

- voltou a responder depois do contrato `verify_jwt=false` + auth interna;
- tinha falsos timeouts porque `pg_net` esperava so 5s;
- a migration local eleva para 30s e restringe execute a `service_role`;
- essa migration ainda requer rollout controlado;
- providers externos de e-mail/WhatsApp continuavam desabilitados por configuracao;
- health do job nao prova entrega externa.

Proxima acao segura:

1. criar branch Supabase/ambiente descartavel se custo e permissao forem confirmados;
2. aplicar somente a cadeia reconciliada nesse ambiente;
3. executar reset, lint, pgTAP e probes de ACL;
4. comparar catalogo remoto e local por objeto, nao por nome de migration;
5. produzir plano de rollout incremental e rollback;
6. so depois considerar producao.

### 15. Governanca GitHub/Vercel recomendada

Problema confirmado: commits diretos `80de73ff` e `d50a5d3b` deixaram `Essential Validation`
vermelho na base, enquanto Vercel podia implantar independentemente.

Avalie configuracao administrativa para:

- exigir PR para `kinocampus-V75.0-foundations`;
- exigir `Validators, Jest and Playwright`;
- exigir `Supabase reset, lint and pgTAP`;
- exigir `Edge Functions type-check`;
- exigir Lighthouse quando aplicavel;
- impedir merge com branch desatualizada;
- impedir deployment de producao antes dos checks requeridos;
- manter Dependabot agrupado por toolchain.

Nao modifique regras de branch sem primeiro registrar o fluxo atual e garantir que automacoes de
Edge/Dependabot continuam autorizadas.

### 16. Sequencia recomendada de PRs

#### PR A - fixtures e gate de relevancia do curador

Escopo:

- testes com os falsos positivos reais sanitizados;
- token boundaries;
- bloqueio de noticia sem acao;
- papel temporal;
- old-item fail-closed;
- nenhuma mudanca remota.

Definition of done:

- exemplos de Copa/saude/Fapeg 2024 nao ficam publish;
- Workshop PROFMAT permanece elegivel;
- IPTSP diferencia evento futuro de inscricao encerrada;
- dry-run produz explicacao por item;
- testes unitarios e de integracao verdes.

#### PR B - contrato canonico de fontes

Escopo:

- schema unico;
- deduplicacao dos nove registros;
- geradores deterministas;
- teste de paridade 106/106 ou nova contagem justificada;
- sem sincronizar VPS ainda.

Definition of done:

- todos os consumidores derivam da mesma fonte;
- nenhuma requisicao duplicada no daily;
- diferencas de cobertura sao deliberadas e documentadas;
- script de auditoria e resultados resumidos ficam versionados.

#### PR C - `cadu-api` estruturado e overrides

Escopo:

- API le JSON, ou parser suporta integralmente o artefato gerado;
- tres fontes FACE reaparecem;
- `source_id` estavel;
- `declaredTier`, `overrideTier`, `effectiveTier`;
- testes com o mapa completo;
- migracao de overrides apenas planejada, nao aplicada em producao.

Definition of done:

- API retorna a contagem canonica;
- nenhuma URL nula inesperada;
- tier efetivo e auditavel;
- nomes repetidos nao colidem.

#### PR D - metricas e health da pipeline

Escopo:

- summary isolado;
- candidatos vs novos vs publicados;
- alertas sem falso positivo;
- export JSON/PDF e admin.

Definition of done:

- run `482e8c1d` seria explicado como sucesso sem item novo;
- run do curador `4797f230` exibiria 14 candidatos, nao vazio;
- artefatos antigos aparecem como antigos;
- desktop/mobile validados.

#### PR E - dependencia Babel 8

Escopo:

- reproduzir `npm ci` em Node 24;
- decidir manter/reverter com base na arvore;
- eliminar peer warnings sem `--force`;
- manter Jest/Playwright verdes.

#### PR F - rollout Supabase em ambiente descartavel

Somente depois dos PRs de codigo e com autorizacao operacional. Nao misture com fontes/Cadu.

### 17. Comandos de verificacao recomendados

Repositorio principal:

```powershell
git status --short --branch
git fetch origin --prune
git pull --ff-only origin kinocampus-V75.0-foundations
npm ci
npm run check:all
npm run check:hygiene
npm run test:e2e
git diff --check
```

Cadu publisher, sem publicar:

```powershell
npm run cadu:dry-run
npm run cadu:dry-run:full
npm run test:cadu
```

GitHub:

```powershell
gh pr list --state open --limit 50
gh run list --branch kinocampus-V75.0-foundations --limit 20
gh pr checks <PR> --watch --interval 10
```

VPS, somente leitura:

```powershell
$key = Join-Path $HOME '.ssh\openclaw_vps'
ssh -i $key -o BatchMode=yes root@187.77.37.25 "hostname; docker ps"
```

Nao coloque tokens na linha de comando nem no historico. Para endpoints autenticados, execute a
chamada dentro do container usando a variavel ja existente e imprima apenas dados sanitizados.

### 18. Criterios de aceite globais

Uma iteracao so esta concluida quando:

1. a causa raiz foi reproduzida;
2. ha teste que falha antes e passa depois;
3. nenhum secret foi lido na resposta/log;
4. nenhuma escrita de producao ocorreu sem autorizacao;
5. `git diff --check` passa;
6. validadores focados passam;
7. `npm run check:all` passa;
8. E2E/visual e executado quando a UI muda;
9. PR possui escopo, risco, testes e rollback;
10. todos os checks remotos passam;
11. o PR e mesclado;
12. a base local recebe `git pull --ff-only`;
13. a documentacao registra estado novo, fatos, limites e proximas pendencias.

### 19. O que nao fazer

- Nao ampliar fontes antes de corrigir precisao.
- Nao considerar uma noticia relevante apenas porque menciona evento futuro.
- Nao considerar `hasDeadline=true` confiavel sem papel temporal e trecho de evidencia.
- Nao abaixar threshold global para aumentar volume.
- Nao limpar o cache IG inteiro sem estrategia de reprocessamento e deduplicacao.
- Nao unir 106 e 156 fontes automaticamente.
- Nao apagar `kc_unit_meta` para fazer contagens coincidirem.
- Nao manter Markdown humano como unica API estruturada.
- Nao rodar `all` em producao para testar um parser.
- Nao usar `published=0` isoladamente como sinal de falha.
- Nao remover 59 indices por estarem "unused" em uma janela curta.
- Nao aplicar migrations reconciliadas diretamente em producao.
- Nao esconder conflitos npm com `--force`.
- Nao assumir que relatorios externos de 2026-07-04 descrevem o HEAD atual.

### 20. Entrega esperada da proxima tarefa

Ao final, entregue:

1. fatos confirmados e hipoteses descartadas;
2. PRs/commits criados e mesclados;
3. testes locais e remotos executados;
4. comparacao antes/depois da precisao do curador;
5. contagem canonica e por consumidor das fontes;
6. explicacao das metricas da pipeline;
7. riscos residuais P0/P1/P2/P3;
8. documentacao atualizada;
9. estado final da branch-base e dos PRs;
10. proximas acoes seguras.

Comece confirmando o Git, os PRs abertos, o CI mais recente, o estado do VPS e o artefato de
curadoria mais novo. Depois implemente o PR A. Nao pare apenas no planejamento se os testes locais
permitirem uma correcao pequena e segura.

## FIM DO PROMPT PARA A PROXIMA TAREFA

---

## Notas de manutencao deste handoff

- Atualize a data e o SHA sempre que o prompt for reutilizado.
- Nao preserve numeros remotos sem nova consulta.
- Quando um item for resolvido, marque a evidencia do PR/merge em vez de apagar o historico.
- O conteudo entre "INICIO" e "FIM" foi escrito para ser copiado integralmente.
