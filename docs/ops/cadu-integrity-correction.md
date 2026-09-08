# Correção canônica de integridade do Cadu

`cadu-edit-integrity-v1` corrige um post do próprio Cadu no mesmo módulo,
preservando ID, fonte primária, status e visibilidade. A operação exige revisão
concreta de título, datas, local, fonte e de cada vínculo a remover. Não é uma
rota de publicação ou reativação de conteúdo moderado.

## Implantação

Aplicar a migração `20260908030526_cadu_post_integrity_cas.sql` pelo mecanismo
oficial de migrações antes de implantar a Edge Function `cadu-publish`.
O workflow de Edge verifica versões requeridas e não aplica migrações.
Verificar o grant exclusivo `service_role`, a assinatura de cinco argumentos
de `kc_cadu_correct_post_integrity` e a capacidade `canonicalIntegrityCorrection`.
A Edge mantém autenticação da conta Cadu, sessão ativa, allowlist e ownership;
o RPC repete allowlist/ownership e não aceita chamada de `authenticated`.

## Pedido e prova de persistência

Enviar `action: "edit"`, `postId` e `integrityCorrection`. Campos obrigatórios:

- `operation: "correct"`, UUID único em `operationId`, `reason` e `evidence`.
  Cada evidência contém `url`, `title`, `dates`, `venue`; incluir a URL primária exata.
- `expected`: os 15 campos exportados por `INTEGRITY_FIELDS`, incluindo todo
  `metadata`, após uma leitura fresca do post. Somente os três timestamps são
  normalizados; seis casas de microssegundos são preservadas.
- `item`: item canônico completo, com a mesma `sourceId`, `sourceUrl` e módulo.
  O mapper e a barreira de qualidade usuais continuam obrigatórios.
- `detachSources`: lista de `{field,index,entry}`. A entrada inteira deve
  corresponder ao índice do snapshot. Campos permitidos: `merged_sources`,
  `dedup_merged_sources`, `source_urls`. A identidade primária não é removível.

Opcionalmente, `mediaSelection` contém `expectedRows` (todas as linhas atuais
de `post_media`, com seus seis campos), `keepIds` na ordem final e `coverId`,
igual ao primeiro ID. Somente mídias existentes podem ser selecionadas.
O RPC remove exclusivamente associações excluídas dessa seleção, preserva IDs,
URLs e `created_at` das restantes, e ajusta capa/ordem/metadados juntos. Não
chama Storage nem sobrescreve arquivos. Sem essa opção, a mídia é preservada.

O snapshot e o patch viajam no corpo do RPC, evitando URLs extensas com filtros
JSON. A transação trava o post antes da galeria, compara todos os campos e
associações, executa a mudança e grava a auditoria. A resposta só é sucesso
quando o estado completo e todo o histórico retornado correspondem ao esperado.
Uma corrida retorna `EDIT_CONFLICT` sem mudança. Timeout, erro de transporte ou
recibo ausente após despacho retornam `INTEGRITY_MUTATION_UNCERTAIN`: reler o
post e o histórico antes de repetir. A repetição do snapshot antigo não realiza
uma segunda mudança.

## Reversão

Enviar outro UUID de operação, `operation: "rollback"`, `rollbackOf` igual à
última operação, um snapshot fresco completo, justificativa e evidências.
Não enviar `item`, `detachSources` ou `mediaSelection`. O servidor recupera o
estado anterior exclusivamente do histórico auditado e só o restaura se o
conteúdo atual ainda corresponder ao hash final daquela operação. Se houve
seleção de mídia, também compara a galeria atual e restaura as associações
anteriores com os mesmos IDs, URLs, datas e ordem. Colisão de IDs ou qualquer
mudança intermediária bloqueia a reversão. O histórico é cumulativo e limitado
sem descarte automático de entradas antigas.

## Validação local

`deno test --no-lock --node-modules-dir=none --allow-env --allow-read
supabase/functions/cadu-publish/integrity_test.ts
supabase/functions/cadu-publish/reclassification_test.ts
supabase/functions/cadu-publish/mapper_test.ts`

Os testes cobrem identidade, snapshot completo, microssegundos, corrida,
perda de recibo após commit, histórico integral, rollback, seleção exata e
preservação da mídia. O ensaio de 08/09/2026 também executou a migração e os
pedidos em PostgreSQL descartável com os triggers reais do schema local,
incluindo dois workers, timeout, falha na auditoria e inserção concorrente de
mídia. Nenhum teste escreve em produção.
