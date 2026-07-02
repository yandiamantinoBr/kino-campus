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

## Impacto no ranking/feed

Esta alteracao nao muda a ordenacao publica do feed. Ela melhora os metadados que a politica shadow e uma futura RPC v2 precisam consumir.

Efeito esperado nas proximas publicacoes:

- oportunidades com prazo real deixam de cair em `missing-deadline`;
- oportunidades vencidas por inscricao/submissao ficam elegiveis para descarte/revisao antes de chegar ao feed;
- datas de resultado, matricula e recurso continuam registraveis no texto, mas nao substituem o prazo principal quando ha inscricao/submissao explicita.

## Pendencias

- Rodar novo benchmark shadow depois de novas publicacoes do Cadu entrarem no banco.
- Criar diagnostico no painel admin/Cadu para listar oportunidades publicadas sem `deadline_date`.
- Em uma fase posterior, normalizar tambem um campo de cronograma detalhado (`schedule_dates`) para preservar resultado/matricula sem confundir com prazo principal.
