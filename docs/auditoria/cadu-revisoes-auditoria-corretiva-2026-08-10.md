# Auditoria corretiva da triagem de revisões do Cadu

Data: 2026-08-10.

Este documento não substitui nem reescreve o relatório anterior. Ele registra
os limites encontrados ao confrontar a alegada triagem manual com os artefatos
de decisão e define a sequência segura de correção. O contrato técnico vigente
está em [Central de Revisões do Cadu](../ops/cadu-review-center-contract-2026-07-28.md#contrato-v2-identidade-e-proveniência).

## Fatos observados

- As 597 decisões foram produzidas por um script heurístico. Não houve abertura
  e conferência individual das URLs, portanto o lote não constitui revisão
  manual.
- 439 decisões classificaram ocorrências repetidas dentro da própria fila como
  duplicatas.
- O snapshot usado pelo script separou 53 itens como já publicados, sem
  preservar evidência suficiente para transformar essa contagem em regra
  editorial durável.
- 17 rejeições foram aplicadas em bloco por precaução, sem decisão individual.
- 174 itens rejeitados tinham indicação `publish_ready` no repass. Essa
  indicação é apenas classificatória e não autoriza publicação, mas o conflito
  confirma que a decisão automática não pode ser tratada como revisão humana.
- A aprovação do item UFG `38329`, “Título Emérito”, conflitou com a evidência
  de data: a mídia indicava 2025 e os dados estruturados indicavam 2026.
- As 11 aprovações não estavam prontas para publicação direta; 8 delas não
  tinham URL de ação.

## Inferências sustentadas pelos fatos

- O lote de 597 resultados serve como trilha de auditoria de uma heurística,
  não como gabarito editorial nem como autorização para publicar.
- A repetição de uma mesma evidência em runs diferentes inflou a fila e
  favoreceu decisões sobre ocorrências, em vez de decisões sobre identidades
  editoriais estáveis.
- `publish_ready` deve ser lido como “candidato sem bloqueios automáticos”. A
  relevância, a atualidade, o prazo, a URL de ação e a duplicidade publicada
  continuam exigindo confirmação humana.

## Correções de contrato

O contrato v2 introduz identidade estável, versionamento editorial e
proveniência limitada e auditável. Ocorrências com o mesmo identificador são
agrupadas, enquanto evidências relacionadas entre origens permanecem com
decisões independentes e vinculadas à versão. Resoluções v1 continuam visíveis
somente para auditoria e não são reaproveitadas automaticamente.

O proxy do Kino Campus aceita v1 e v2 durante a transição, mas valida o v2 de
forma fechada: versão da identidade, escopo, política de reaproveitamento,
contagem de ocorrências, intervalo observado, versões, runs, artefatos e links
relacionados precisam ser coerentes. O repass também é validado quando o item
ainda está pendente.

## Sequência segura de rollout

1. Publicar primeiro o proxy/UI do Kino Campus com leitura simultânea de v1 e
   v2.
2. Confirmar que lista, auditoria e decisões v1 continuam operacionais e que
   nenhuma aprovação publica conteúdo.
3. Publicar o backend OpenClaw com `schema_version: 2` e
   `contract_version: cadu-review-center-v2`.
4. Validar lista, paginação, auditoria, repass, agrupamentos e falha fechada em
   respostas adulteradas.
5. Exportar novamente a fila já colapsada e executar a revisão humana dos itens
   únicos, um a um, consultando fonte oficial, prazo, ação e publicações atuais.

O agrupamento v2 reduz ruído; ele não resolve as pendências editoriais. A fila
remanescente precisa de revisão manual antes de qualquer decisão ou eventual
fluxo de publicação separado.
