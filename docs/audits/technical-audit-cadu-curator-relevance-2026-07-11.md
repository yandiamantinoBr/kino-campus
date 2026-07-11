# Auditoria técnica: gate de relevância do curador Cadu

**Data da evidência:** 2026-07-11, America/Sao_Paulo
**Branch:** `codex/cadu-curator-relevance-gate-2026-07-11`
**Base:** `3d42904b` (`kinocampus-V75.0-foundations`)
**Escopo:** classificador espelhado em `data/.openclaw/workspace/scripts/cadu-curador-v4.4.js`
**Modo remoto:** somente leitura; nenhum run, post, deploy, migration, secret ou arquivo do VPS foi alterado

## Resultado executivo

O classificador promovia notícias sem ação, prazos sem data e itens antigos porque misturava
palavras-chave, datas de contexto e datas acionáveis. O lote adiciona um gate fail-closed com
papéis temporais explícitos, mantém os campos legados para compatibilidade e permite reclassificar
o conteúdo completo depois do detail fetch.

No corpus imutavelmente identificado pelo SHA-256
`b3a83d904d90827d4faed0e0541e59fbd26f454c22ecefba4533441dd62faf85`, o dry-run local mudou:

| Métrica | Antes | Depois |
|---|---:|---:|
| Candidatos avaliados | 15 | 15 |
| `publish` | 15 | 4 |
| `discard` | 0 | 11 |
| Bloqueados como notícia sem ação | 0 | 7 |
| Bloqueados como item antigo sem janela atual | 0 | 4 |

O dry-run não chama endpoints, não grava artefatos da pipeline e não publica. Ele lê um JSON por
arquivo ou stdin e devolve decisão, módulo, motivos e evidências temporais por item.

## Evidência-base atualizada

### GitHub e CI

- a base recebida estava em `fb417fab`, com `Essential Validation` vermelho;
- a PR #667 restaurou os dois gates concorrentes e foi mesclada como `3d42904b`;
- o CI pós-merge `29144210994` passou em validators/Jest/Playwright, Supabase e nove Edge Functions;
- o deploy Edge pós-CI `29144294126` publicou somente `cadu-auth-proxy` e verificou o resultado;
- a PR A #668 foi mesclada como `b91d21d6`; o Essential Validation pós-merge `29157172931`
  passou, e o workflow Edge `29157255987` detectou zero funções alteradas e pulou o deploy;
- o merge gerou deployment automático Vercel `dpl_4c8d8ESJtFV1Vo6PYJDNbZkJz6Cp`, estado `READY`,
  e `vercel curl` confirmou HTML com o título Kino; nenhuma promoção manual foi executada;
- nenhuma migration foi aplicada remotamente.

### VPS e artefato

- o último run isolado do curador continua `4797f230-6b98-44a8-ab02-063008a24dd9`, com 14
  publicáveis;
- um run externo posterior `all`, `17ef149c-b433-4119-9a38-3bcf4ba6de06`, sobrescreveu o arquivo
  diário e produziu 15 publicáveis;
- arquivo diário observado:
  `/data/.openclaw/workspace/data/ufg-scrape/curadoria-v4.4-daily-2026-07-11.json`;
- tamanho: 6.311.854 bytes;
- SHA-256: `b3a83d904d90827d4faed0e0541e59fbd26f454c22ecefba4533441dd62faf85`;
- o arquivo `_truly_new_2026-07-11.json` era byte a byte igual ao daily completo e não representava
  apenas itens realmente novos.
- no probe final pós-merge, o artefato continuava no mesmo SHA, mas o curador do VPS havia sido
  alterado externamente às 11:07:20 -03 para o SHA-256
  `fb28cb33cd9f3c36d5ffc9b92b4ca2b61a5fecdd362d2cb87af0c973b74622ef`;
- esse arquivo remoto não corresponde nem ao OpenClaw local
  (`575662f2311f9eac31780fa686b0090546d364326d5da0453ad6892ceecdfebc`) nem ao espelho
  mesclado (`df59d4ddc47df10661c15becc7843aafa22958e8781fef3402e7999629decb8e`); a comparação mostra
  40 linhas de hotfix adicionadas ao arquivo antigo. A origem da escrita não foi inferida.

## Causas raiz confirmadas

1. `has()` usava substring para todos os termos. `pet` casava com `petiscos` e `ru` com `frutas`.
2. A palavra `prazo` isolada bastava para `hasDeadline=true`.
3. Qualquer data futura podia virar deadline por heurística, mesmo sendo o fim de um campeonato.
4. PDF de edital era tratado como evidência de vigência, embora prove apenas a existência do
   documento.
5. `isOld=true` reduzia o score em 0,20, mas um falso deadline ainda permitia `publish`.
6. Inscrição e evento compartilhavam uma lista de datas sem papel; inscrição encerrada podia ser
   confundida com evento encerrado e vice-versa.
7. O detail fetch reavaliava apenas `isExpired`; módulo, CTA, score e motivos permaneciam baseados
   no resumo incompleto.
8. O espelho no KinoCampus não possuía `scripts/lib/image-utils.js` e não podia ser importado em
   teste.

## Contrato implementado

### Léxico

Termos de até três caracteres usam fronteira de token. Termos maiores preservam o comportamento
histórico para limitar risco de recall nesta primeira calibração.

### Temporalidade

O resultado agora expõe:

- `publishedAt` e `updatedAt`;
- `eventStartsAt` e `eventEndsAt`;
- `applicationOpensAt` e `applicationDeadline`;
- `resultPublishedAt`;
- `applicationStatus`, `eventStatus` e `canApply`;
- `dateEvidence[]`, com data, papel, trecho e origem.

Os campos legados `dates`, `futureDates`, `pastDates`, `latestDate`, `hasDeadline`, `isExpired`,
`isOld`, `isUpcoming` e `webyDate` permanecem presentes.

### Decisão

- oportunidade publicável exige janela vigente (deadline futuro ou status aberto recente) e CTA
  concreto;
- fonte `news` sem oportunidade acionável nem evento futuro participável falha fechada;
- item antigo falha fechado, salvo evento estruturado futuro ou atualização recente explícita com
  nova janela válida;
- evento futuro com inscrição encerrada permanece em `eventos`, com
  `applicationStatus=closed` e `canApply=false`;
- fonte estruturada de evento com agenda futura continua elegível;
- uma decisão inicial de descarte ainda pode marcar `shouldHydrate=true`, permitindo buscar o
  detalhe antes da decisão final quando o resumo tem sinais relevantes.

## Amostra rotulada de regressão

| Caso | Antes | Depois | Evidência principal |
|---|---|---|---|
| Copa 2026 poluente | `publish` | `discard` | data do torneio; nenhuma ação KinoCampus |
| Futebol/petiscos | `publish` | `discard` | `longo prazo`, `petiscos` e `frutas` não são deadline/PET/RU |
| Fapeg 06/2024 | `publish` | `discard` | item antigo, sem data futura concreta |
| IPTSP inverno | `publish` ambíguo | `publish/eventos` | inscrição 18/05 fechada; evento 20–31/07 futuro |
| PROFMAT | `publish/eventos` | `publish/eventos` | fonte estruturada, inscrição e evento futuros |

Na amostra de cinco candidatos que antes eram todos publicados, apenas dois eram positivos. A
precisão de publicação da amostra era `2/5 = 40%`. Depois do gate, os dois publicados são os dois
positivos (`2/2 = 100%`), os três falsos positivos são bloqueados e o recall dos positivos da
amostra permanece `2/2`. Essa medição é uma amostra dirigida de regressão, não estimativa global.

## Dry-run dos 15 candidatos atuais

Permaneceram publicáveis:

1. Seminário PIP/UFG, com agenda futura e inscrição de ouvinte vigente;
2. IV Workshop Online do PROFMAT, oriundo de fonte estruturada;
3. VIII ABCF Congress, oriundo de fonte estruturada;
4. IPTSP Curso de Inverno, como evento futuro com inscrição encerrada.

Os demais onze foram bloqueados: sete como notícia sem ação/participação concreta e quatro como
item antigo sem janela atual. Em especial, PPGNUT tem janela aparente no texto, mas o artefato
antigo não preservou um link de candidatura acionável; XX SEMIC tem agenda, porém nenhuma
evidência de participação; o curso de Perícia tem inscrição encerrada; e a matéria `Saberes da
terra` descreve uma turma já constituída. O replay é deliberadamente fail-closed quando o
artefato armazenado não contém a evidência necessária.

## Testes e reprodução

Fixtures sanitizadas: `tests/fixtures/cadu-curator-relevance.v1.json`.

```powershell
npm run test:cadu -- --coverage=false
node --check data/.openclaw/workspace/scripts/cadu-curador-v4.4.js
node --check scripts/evaluate-cadu-curator-relevance.js
npm run cadu:curator:relevance-report -- --now=2026-07-11T12:00:00-03:00 --input=.\artefato.json
```

Os nove cenários iniciais falhavam antes do gate. Depois da implementação e das regressões
adicionais, `npm run test:cadu -- --coverage=false` passa com 72 testes entre publisher e curador.
O gate completo `npm run check:all` passa com 213 suítes, 3.968 testes e 3 snapshots.
Uma tentativa separada de `npm run cadu:dry-run` (publisher Node) não produziu saída útil em cerca
de 180 segundos e terminou sem artefato; ela é inconclusiva e não foi usada como evidência do
curador espelhado.

## Fatos, inferências e hipóteses

### Fatos observados

- os cinco casos-alvo estavam `publish` no artefato identificado;
- 13 dos 15 candidatos eram `sourceKind=news` e dois eram `event`;
- nenhum dos 15 possuía `eventDate` ou `deadline` top-level;
- o dry-run novo resulta em quatro `publish` e onze `discard`;
- nenhum run ou publish foi disparado por esta auditoria.
- o curador remoto sofreu uma escrita concorrente depois do replay e antes do probe final; nenhum
  comando desta auditoria escreveu no VPS.

### Inferências sustentadas

- separar papel temporal elimina o uso do fim da Copa como deadline;
- o artefato nomeado apenas por data não é evidência imutável de um run, pois foi sobrescrito;
- `_truly_new` não pode orientar health/publicação enquanto continuar copiando o artefato inteiro.

### Hipóteses pendentes

- a precisão sobre todos os 1.719 itens precisa de amostra aleatória estratificada, não apenas dos
  candidatos anteriores;
- a divergência entre 15 formatados, 14 itens no artefato de quality skip e zero publicados no run
  `all` exige o lote de semântica/observabilidade;
- o impacto de recall do token boundary além de `PET`/`RU` deve ser acompanhado no próximo daily.

## Limites e rollout

- este PR altera o espelho versionado no KinoCampus; o OpenClaw local permanece no SHA antigo,
  enquanto o VPS contém um hotfix concorrente não versionado e diferente dos dois repositórios;
- nenhuma sincronização com o VPS faz parte deste lote;
- antes do rollout operacional, preservar e atribuir o hotfix remoto, corrigir seus defeitos em
  branch, portar o gate mesclado ao OpenClaw, executar testes, comparar o diff, criar
  backup/rollback e somente então sincronizar;
- não usar `npm run cadu:dry-run` como prova deste curador: esse comando exercita o publisher Node,
  que possui outro classificador.

## Riscos remanescentes priorizados

- **P0:** o hotfix concorrente no VPS usa `decision`, `reasons` e `module` antes das respectivas
  declarações (`let`/`const`), o que pode lançar `ReferenceError` quando os novos ramos executam;
  dois regex de cobertura passada contêm U+0008 em vez de `\b`. `node --check` passa porque o
  defeito é semântico, não sintático. Novos runs devem aguardar reconciliação versionada e rollback.
- **P1:** o gate mesclado ainda não está no OpenClaw/VPS; os quatro inventários de fontes continuam
  divergentes (publisher com 106 fontes, curador com 156 linhas/147 IDs e mapa remoto com 106
  declaradas/104 parseadas); `_truly_new` continua copiando o daily inteiro; métricas de candidato,
  formatado e publicado continuam semanticamente misturadas; a base ainda não exige os checks por
  regra de proteção.
- **P2:** o artefato antigo não possui todos os novos campos estruturados nem todos os links de
  ação; a medição de precisão é uma amostra dirigida; datas ruidosas continuam visíveis em
  `dateEvidence`, embora datas estruturadas agora tenham precedência na decisão.
- **P3:** acompanhar recall dos limites de token e calibrar os padrões de participação após um
  daily controlado e revisão humana estratificada.

## Decisões e próximos lotes

1. A PR A termina no espelho versionado, testes e replay offline; sem sync ou publish OpenClaw,
   migration ou deploy manual.
2. PR B deve criar o contrato canônico de fontes e geradores deterministas, eliminando requests
   duplicados antes da rede.
3. PR C deve tornar `cadu-api` estruturado, restaurar as três fontes FACE e expor
   `declaredTier`, `overrideTier` e `effectiveTier` por `source_id` estável.
4. PR D deve corrigir summary, `_truly_new`, métricas/health e export JSON/PDF/admin.
5. Antes dos PRs B-D em operação, abrir um lote curto para preservar o hotfix remoto, reproduzir os
   `ReferenceError`, reconciliar as intenções com a PR A e preparar rollback; só então portar ao
   OpenClaw e executar dry-run controlado antes de qualquer publicação.
