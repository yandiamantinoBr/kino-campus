# Integridade da descrição na publicação Cadu

A auditoria do run `d7b8f99b-3576-46b8-aa37-8072874d0ba3` encontrou corpos completos no formatter, mas descrições cortadas no banco e na página pública. A base `0970eedc` reproduziu exatamente os três registros canônicos usando os textos do formatter e os links extraídos persistidos:

| Fonte | Formatter (UTF-16) | Persistido antes | Corpo normalizado integral |
|---|---:|---:|---:|
| BC `/n/203988` | 727 | 721 | 721 |
| PPGLL `/n/203943` | 1896 | 1862 | 1890 |
| INF `/n/203734` | 2008 | 1983 | 1999 |

O caso BC é controle sem truncagem. A limpeza preexistente de linhas em branco explica sua diferença. Nos outros casos, o mapper cortava o formatter em 1700 caracteres, acrescentava documentos e cortava novamente em 2000. O corte podia ocorrer dentro de um link Markdown, removendo fatos, contato e referências já aprovados.

## Contrato

- `description.ts` seleciona e limpa o corpo com a política anterior e valida o mesmo resultado usado pelo mapper e pelo schema.
- O teto é 5000 caracteres, igual ao editor administrativo do produto. Texto excessivo retorna `422 VALIDATION_FAILED` com pedido explícito de reformatação. Não é resumido nem truncado silenciosamente depois da aprovação.
- Validação antecede consulta de capa, DNS, fetch, upload ou escrita. Um item inválido recebe resposta individual; não há exceção ambígua no lote.
- Corpo aprovado tem prioridade. Documentos auxiliares já vinculados não são repetidos; os demais entram apenas como linhas Markdown completas quando cabem. Fonte e documentos continuam na metadata mesmo quando o orçamento visual omite um complemento (`description_supplement_omitted_budget`).
- A lista auxiliar não transforma o índice `news?tags=EDITAL` nem o fragmento de formulário extraído de uma quebra de linha do PDF em documento navegável. Páginas individuais endereçadas por query continuam aceitas. Observações brutas são preservadas para auditoria; o filtro não prova disponibilidade nem autoriza inscrição.
- CTA, semântica de datas, assinatura, qualidade, deduplicação de posts e política de imagens permanecem independentes e inalteradas. O patch não modifica publicações existentes.

## Regressões

Fixtures públicas mínimas de d7: `supabase/functions/cadu-publish/fixtures/d7-description-cases.json`. Os testes verificam corpo integral, PDFs não duplicados, limite exato 5000/5001, fallback excessivo, evidência bruta longa com formatter válido, zero I/O para erro precoce, orçamento de complementos, escape de rótulos, URL como rótulo e queries de documentos distintas.

Executar:

```powershell
deno test --no-lock --node-modules-dir=none supabase/functions/cadu-publish/mapper_description_test.ts
deno check --no-lock --node-modules-dir=none supabase/functions/cadu-publish/index.ts
npm test -- --runInBand --coverage=false tests/integration/cadu-trusted-publisher-contract.test.js tests/integration/kc-create-post-fields.test.js tests/integration/product.render.test.js tests/integration/cadu-publisher-safety-contract.test.js
```
