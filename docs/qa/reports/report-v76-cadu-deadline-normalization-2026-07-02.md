# V76 - Normalizacao de prazos do Cadu para oportunidades

**Data:** 2026-07-02  
**Escopo:** pipeline Cadu/OpenClaw para publicacao de oportunidades, mapper local `services/cadu-ufg-publisher` e Edge Function `supabase/functions/cadu-publish`.

## Contexto

O benchmark shadow do feed em 2026-07-02 encontrou 40 oportunidades publicadas sem prazo real normalizado em `deadline_date` ou aliases equivalentes. O ranking v2 consegue penalizar `missing-deadline`, mas isso so diagnostica o problema. A causa principal estava antes do feed: a pipeline nem sempre extraia o prazo principal de inscricao/submissao.

Tambem havia risco de falso positivo temporal: o classificador escolhia a data mais tardia entre datas com qualquer contexto de cronograma. Em editais com `Inscricoes`, `Resultado` e `Matricula`, isso podia manter uma oportunidade vencida ativa ate a data de resultado ou matricula.

## Alteracoes implementadas

### Publisher Node

Arquivo: `services/cadu-ufg-publisher/src/classifier.js`

- `deadlineDate` agora e escolhido por prioridade de contexto, nao apenas pela data mais tardia.
- Prioridade alta: inscricao, submissao, candidatura, prazo final, encerramento, envio, proposta, formulario e solicitacao.
- Prioridade media: recurso, matricula, homologacao, resultado, entrevista, prova, cronograma e periodo.
- Prioridade baixa: `ate` isolado.
- A janela de contexto de cada data agora respeita pontuacao local (`.`, `;`, `!`, `?`, `|`) para uma data de `Resultado` nao herdar contexto de `Inscricoes` da frase anterior.
- `dateEndAt`/`date_end_at` do Weby continua sendo tratado como prazo de alta prioridade quando o item tem contexto acionavel.

### Edge Function `cadu-publish`

Arquivo: `supabase/functions/cadu-publish/mapper.ts`

- O mapper de `oportunidades` agora grava `metadata.deadline_date`.
- Primeiro tenta campos explicitos: `deadlineDate`, `deadline_date`, `deadline`, `deadlineAt`, `deadline_at` e variantes dentro de `dates`.
- Se nao houver campo explicito, infere do texto com a mesma prioridade conceitual do publisher Node.
- O formato gravado para oportunidades e ISO (`yyyy-mm-dd`), alinhado ao mapper local e ao ranking shadow.

## Casos cobertos

Testes adicionados em `tests/unit/cadu-ufg-publisher.test.js`:

- prazo por extenso: `prazo final e 30 de junho de 2026`;
- intervalo de inscricao antes de resultado/matricula: `Inscricoes: de 15/06/2026 ate 19/06/2026. Resultado: 24/06/2026. Matricula: ...`;
- descarte depois do prazo de inscricao mesmo quando ha resultado futuro;
- multiplas linhas oficiais: `Solicitar Carta... ate 31 de agosto` e `Submissao do trabalho... ate 15 de setembro`.

Teste de contrato adicionado em `tests/integration/cadu-trusted-publisher-contract.test.js` para impedir regressao do `deadline_date` no mapper da Edge Function.

## Validacao

Comandos executados:

```powershell
npm test -- tests/unit/cadu-ufg-publisher.test.js tests/integration/cadu-trusted-publisher-contract.test.js --runInBand
deno check supabase/functions/cadu-publish/index.ts
```

Resultado:

- 2 suites Jest passaram;
- 67 testes passaram;
- `deno check` passou para `supabase/functions/cadu-publish/index.ts`.

## Follow-up: diagnostico operacional no admin/Cadu

Na mesma data, o benchmark shadow ganhou um bloco `sample.caduTriage`, com filas operacionais para:

- `missingDeadlines`: oportunidades publicadas sem `metadata.deadline_date`;
- `eventDateReview`: eventos publicados sem `data_evento`/`data_fim_evento`;
- `expired`: itens que nao deveriam competir no feed ativo.

Arquivos:

- `scripts/analyze-feed-ranking-shadow.js`;
- `api/cadu/feed-diagnostics.js`;
- `admin/cadu.html`;
- `assets/js/controllers/admin/admin-cadu.controller.js`;
- `tests/unit/analyze-feed-ranking-shadow.test.js`;
- `tests/integration/cadu-feed-diagnostics-contract.test.js`.

O endpoint `/api/cadu/feed-diagnostics` e read-only, protegido por `requireCaduAdmin`, usa Supabase anon/REST/RPC e reaproveita o mesmo analisador do CLI. Ele nao aceita metodos de escrita, nao usa `service_role` e retorna `{ ok, report }`.

A aba **Feed coletado** passou a exibir um painel "Diagnostico do feed publico" com:

- contagem de problemas totais;
- quantos posts estao marcados como Cadu;
- oportunidades sem prazo;
- eventos sem data;
- lista priorizada com fonte e botao "Perguntar Cadu".

Consulta real executada:

```powershell
npm run benchmark:feed-ranking-shadow -- --limit 80 --rpc-limit 10 --triage-limit 12 --now 2026-07-02T12:00:00.000Z --pretty --output output/feed-ranking-shadow-cadu-triage-2026-07-02.json
```

Resultado da triagem:

| Metrica | Valor |
|---|---:|
| problemas relevantes | 42 |
| marcados como Cadu | 41 |
| oportunidades sem prazo | 40 |
| eventos sem data | 2 |
| acao `extract_deadline_date` | 40 |
| acao `fill_data_evento_or_reclassify` | 2 |

Fontes com maior concentracao na amostra:

- `ufg.br`: 6;
- `inf.ufg.br`: 4;
- `institutoverbena.ufg.br`: 4;
- `sri.ufg.br`: 4;
- `prpi.ufg.br`: 3;
- `prpg.ufg.br`: 3.

Itens prioritarios observados:

- `b2171655-7bf7-483a-b251-9908d2377c45` - Mobilidade internacional CEIA/AKCIT, `inf.ufg.br`, extrair prazo;
- `7b8f44bd-2a47-422b-9fc0-7baf579cb5a3` - Premio Peter Muranyi 2027, `inf.ufg.br`, extrair prazo;
- `19a3f0d1-d78a-45cf-8de3-b59efbff95e9` - CICSIC 2026, `ufg.br`, extrair prazo;
- `8d5950f3-e3a6-4123-bd99-0ca2a50c4a6e` - lista de subsidio alimentacao PRPG, reclassificar/retirar de eventos;
- `b5e3aac9-dead-4130-903b-2d4b3737e21a` - FANUT Conecta, reclassificar/retirar de eventos.

Validacao adicional:

```powershell
node --check api/cadu/feed-diagnostics.js
node --check assets/js/controllers/admin/admin-cadu.controller.js
npm test -- tests/unit/analyze-feed-ranking-shadow.test.js tests/unit/kc-feed-ranking-policy.test.js tests/integration/cadu-feed-diagnostics-contract.test.js --runInBand
```

Resultado:

- `node --check` passou nos dois arquivos;
- 3 suites Jest passaram;
- 17 testes passaram.

## Follow-up: sugestoes dry-run de reparo retroativo

Ainda em 2026-07-02, o diagnostico ganhou `sample.repairSuggestions`, uma fila
read-only de patches sugeridos por item. Ela nao escreve no Supabase e retorna
`dryRun: true` / `wouldWrite: false` em cada sugestao.

Arquivos alterados:

- `scripts/analyze-feed-ranking-shadow.js`;
- `api/cadu/feed-diagnostics.js`;
- `assets/js/controllers/admin/admin-cadu.controller.js`;
- `tests/unit/analyze-feed-ranking-shadow.test.js`;
- `tests/integration/cadu-feed-diagnostics-contract.test.js`.

Contrato novo:

- `triageLimit`: limita quantos itens aparecem em cada fila visual;
- `repairLimit`: limita quantas sugestoes dry-run sao retornadas para mapear por
  `id`;
- `repairSuggestions.totalCandidates`: total de candidatos de reparo na amostra;
- `repairSuggestions.shown`: quantos foram retornados depois do limite;
- `repairSuggestions.byAction`: contagem de todas as acoes candidatas;
- `repairSuggestions.shownByAction`: contagem so das sugestoes retornadas.

A aba **Feed coletado** usa esse mapa por `id` para exibir um chip "Patch
sugerido" quando houver `metadataPatch`/`rowPatch` e inclui o patch dry-run no
prompt enviado ao Cadu/OpenClaw. A chamada do admin ficou explicita:

```text
/api/cadu/feed-diagnostics?limit=80&rpcLimit=10&triageLimit=12&repairLimit=100
```

Consulta real executada:

```powershell
npm run benchmark:feed-ranking-shadow -- --limit 80 --rpc-limit 10 --triage-limit 12 --repair-limit 100 --now 2026-07-02T12:00:00.000Z --pretty --output output/feed-ranking-shadow-repair-suggestions-2026-07-02.json
```

Resultado read-only:

| Metrica | Valor |
|---|---:|
| posts analisados | 80 |
| posts ativos pela politica shadow | 76 |
| itens `needs-review` | 4 |
| triagem acionavel | 40 |
| marcados como Cadu | 39 |
| relevantes sem marca historica do Cadu | 1 |
| `missing-deadline` | 36 |
| `missing-event-date` | 4 |
| sugestoes dry-run totais | 40 |
| `patch_deadline_date` | 27 |
| `manual_deadline_review` | 9 |
| `manual_event_date_review` | 4 |

Exemplos de `metadataPatch` com confianca alta:

- `7b8f44bd-2a47-422b-9fc0-7baf579cb5a3` - `deadline_date=2026-09-15`;
- `c83e2151-0bb0-4abb-b98f-46197fb88f6e` - `deadline_date=2026-08-03`;
- `d6992be0-e204-407a-a3f8-26aa2d5d4ab5` - `deadline_date=2026-07-03`;
- `d960985c-11f8-432f-b732-29e5c636b691` - `deadline_date=2026-09-23`.

Os 4 eventos sem data nao receberam patch automatico, porque a amostra publicada
nao trazia data extraivel com confianca suficiente. Eles ficaram como
`manual_event_date_review`; a etapa correta e pedir ao Cadu/OpenClaw para checar
a fonte oficial antes de reclassificar, preencher `data_evento` ou retirar do
feed ativo.

Validacao adicional:

```powershell
node --check scripts/analyze-feed-ranking-shadow.js
node --check assets/js/controllers/admin/admin-cadu.controller.js
node --check api/cadu/feed-diagnostics.js
npm test -- tests/unit/analyze-feed-ranking-shadow.test.js tests/unit/kc-feed-ranking-policy.test.js tests/integration/cadu-feed-diagnostics-contract.test.js --runInBand
```

Resultado:

- `node --check` passou nos 3 arquivos;
- 3 suites Jest passaram;
- 20 testes passaram.

## Impacto no ranking/feed

Esta alteracao nao muda a ordenacao publica do feed. Ela melhora os metadados que a politica shadow e uma futura RPC v2 precisam consumir.

Efeito esperado nas proximas publicacoes:

- oportunidades com prazo real deixam de cair em `missing-deadline`;
- oportunidades vencidas por inscricao/submissao ficam elegiveis para descarte/revisao antes de chegar ao feed;
- datas de resultado, matricula e recurso continuam registraveis no texto, mas nao substituem o prazo principal quando ha inscricao/submissao explicita.

## Pendencias

- Rodar novo benchmark shadow depois de novas publicacoes do Cadu entrarem no banco.
- Em uma fase posterior, normalizar tambem um campo de cronograma detalhado (`schedule_dates`) para preservar resultado/matricula sem confundir com prazo principal.
- Criar uma acao admin separada para aplicar patches somente depois de revisao humana/OpenClaw, com log de auditoria e rollback por item.
