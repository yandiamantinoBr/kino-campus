# Runbook: suplemento privado de exportação LGPD

**Escopo:** pedidos `data_access_copy` e `data_portability` que ficaram em
`partial_failure`. Este fluxo não é usado para exclusão de conta.

## Pré-condições

- Edge Functions `kc-data-subject-request` e `kc-data-export-admin` publicadas
  com `verify_jwt = true`;
- Edge Function `kc-data-export-retention` publicada com `verify_jwt = false`
  somente por usar autenticação máquina-a-máquina própria;
- o mesmo segredo aleatório, exclusivo e com pelo menos 32 caracteres deve
  existir como Edge secret `KC_DATA_EXPORT_RETENTION_SECRET` e no Supabase Vault
  sob o nome `kc_data_export_retention_secret`. Nunca reutilize `service_role`,
  segredo JWT, SMTP ou HMAC de outra integração;
- o Vault deve conter
  `kc_data_export_retention_function_url`, apontando exatamente para
  `https://<project-ref>.supabase.co/functions/v1/kc-data-export-retention`;
- o Vault deve conter também `kc_data_export_retention_project_ref`, com o
  `project-ref` exato de 20 caracteres do mesmo projeto. A URL e esse valor são
  comparados por igualdade; aceitar apenas qualquer domínio `*.supabase.co` não
  é suficiente;
- extensões `pg_cron` e `pg_net` habilitadas;
- schemas `net` e `vault` ausentes de `db_schema` e
  `db_extra_search_path` do PostgREST; `anon`/`authenticated` sem acesso direto
  a `vault.decrypted_secrets`;
- secrets somente no runtime: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` e, quando aplicável, configurações dos operadores;
- bucket `kino-data-exports` privado, limite de 16 MiB e somente JSON;
- operador com sessão ativa e `profiles.is_admin = true`;
- titular e protocolo já vinculados pelo RPC, com o mesmo UUID em Help, DSR,
  artefato e Auth; nunca informar `user_id` pelo navegador.

O repositório descreve essas pré-condições, mas não comprova publicação, secrets,
Vault, bucket, jobs ou grants no projeto remoto. Confirme cada item no
`project-ref` do rollout.

## Ticket sem sessão e verificação de identidade

O formulário anônimo não cria DSR e não vincula uma conta apenas por coincidência
de e-mail. Antes do diagnóstico do suplemento:

1. confira que o ticket estruturado é de `data_access_copy` ou
   `data_portability`;
2. verifique a identidade por um dos canais administrativos permitidos e obtenha
   uma referência verificável fora do campo de notas;
3. use `link_verified_ticket` em `kc-data-export-admin`, informando ticket,
   e-mail da conta, finalidade, canal, horário e atestação explícita;
4. a Edge Function valida novamente a sessão e o privilégio do operador, exige
   correspondência exata entre Help e Auth e calcula um SHA-256 contextual. A
   referência bruta nunca é persistida;
5. a RPC service-only cria ou reutiliza DSR, artefato e auditoria privada sob o
   lock do titular. Uma resposta genérica de falha evita transformar o fluxo em
   oráculo de existência de conta.

Se o ticket foi criado com sessão válida, Help e DSR já são vinculados
atomicamente; não repita a verificação manual.

O e-mail é usado somente no vínculo inicial para localizar exatamente uma conta
Auth. Depois do commit, o UUID comum a Help/DSR/artefato/Auth é a autoridade.
Diagnóstico, build, retry e purge não podem escolher outro titular por
`contact_email`, metadado ou texto livre. Se o e-mail atual da mesma conta
mudar, a operação continua presa ao mesmo UUID e usa o estado atual do Auth;
divergência de UUID falha fechado.

## Procedimento

1. **Diagnose:** no ticket da Central de Ajuda, use “Diagnosticar”. Confirme
   referência opaca, versão, estado e `blocking_processor_count`.
2. **Evidências:** para cada `manual_follow_up`, registre
   `supplied_out_of_band` ou `no_account_data` e uma referência verificável.
   `supplied_out_of_band` exige atestação explícita, canal enumerado e horário
   da entrega externa. Isso significa “entregue separadamente”, nunca “incluído
   no JSON”. A referência bruta e qualquer conteúdo do operador são recusados
   pelo endpoint; persistem apenas SHA-256 contextualizado por artefato e
   operador, horário e metadados sanitizados da entrega.
3. **Claim:** “Gerar complemento” chama o claim CAS com versão esperada e lease
   de 15 minutos. Conflito/replay não inicia outra geração.
4. **Build:** a Edge busca novamente os dados do titular com limites ampliados.
   Qualquer categoria truncada/indisponível ou operador pendente falha fechado e
   mantém o ticket aberto. O orçamento de fontes é 12 MiB e o artefato JSON
   final é limitado a 16 MiB para preservar margem segura dentro dos 256 MiB do
   runtime; exceder qualquer teto mantém a entrega no atendimento assistido. Um
   claim novo registra o `session_id` exato do administrador; continuações
   revalidam essa sessão, e não apenas o mesmo `user_id`. O suplemento aceita no
   máximo 100 referências de mídia: exceder o teto falha antes de upload/finalize
   e exige reconstrução, sem truncamento declarado como completo.
5. **Reautorização:** imediatamente antes do upload, a Edge revalida protocolo,
   titular, token, versão, lock e elegibilidade e renova a lease por 30 minutos.
   Uma exclusão já reivindicada impede o upload; uma geração com lease ativa
   adia a exclusão e informa `retry_after`.
6. **Finalize:** após upload privado, a Edge compara tamanho e SHA-256, grava
   manifesto sem PII e mantém o artefato pronto por até 7 dias. O objeto usa
   `objects/<64-hex>.json`, nunca UUID, e-mail ou protocolo.
7. **Download:** somente o titular autenticado vê a ação nas Configurações. Uma
   reserva de dois minutos é vinculada a `user_id`, `session_id`, versão e token
   armazenado por hash. A Edge baixa o objeto, recalcula hash/tamanho e a RPC
   confirma novamente que a sessão existe e não passou de `not_after`, mantendo
   `FOR SHARE` até o commit. As mídias são assinadas em um lote por bucket, em
   paralelo, com URL de até 10 minutos; nunca há milhares de chamadas
   sequenciais. O artefato permanece disponível para novo download até
   `expires_at`, inclusive depois da primeira entrega.
8. **Conclusão:** somente o consume transacional inicial muda o protocolo para
   `completed` e arquiva o ticket. Um novo download mantém o estado terminal,
   incrementa `delivery_count` e registra exatamente um novo evento
   `downloaded`. Reserva abandonada volta a `delivered` quando era um novo
   download; nunca volta incorretamente a `ready`. Emitir URL, gerar arquivo ou
   registrar claim não prova entrega e não fecha o atendimento.
9. **Barreira de exclusão:** um pedido ativo de exclusão bloqueia a entrega
   inicial, o novo download e a abertura de outra exportação. Enquanto o pedido
   ainda for reversível, o titular precisa cancelá-lo, atualizar a lista de
   protocolos e então reutilizar ou reabrir a solicitação de cópia. Se a etapa
   irreversível já começou ou a conta foi encerrada, não existe novo download
   autenticado; o caso segue pelo atendimento e pelo comprovante mínimo.
10. **Purge:** cancelamento, falha antiga ou expiração tornam o artefato elegível
   para claim de purge por CAS (`purging`). Uma entrega normal permanece
   disponível e não entra em retenção automática antes de `expires_at`, mesmo
   que `delivered_at` tenha mais de uma hora. A exclusão confirmada é a exceção:
   ela reivindica e remove imediatamente todos os artefatos do titular antes da
   limpeza de banco/Auth. Depois do claim, remova o objeto pelo Storage e
   finalize a RPC de purge com a nova versão. O metadado fica como `purged`, sem
   caminho ou token. Se o Storage falhar, `purging` preserva o caminho para
   retry e impede uma baixa concorrente.

### Resposta perdida e pós-condição

Erro HTTP ou interrupção da resposta não autorizam repetir uma mutação. Depois
de `link_verified_ticket`, `record_processor`, `build`, `retry` ou `purge`, o
painel relê o Help exato por ID e, para ações no artefato, executa
`diagnose`. A reconciliação valida uma pós-condição específica:

- vínculo canônico de Help, DSR, artefato e titular;
- versão avançada, processador esperado, status sanitizado, hash e horário para
  evidência externa;
- artefato `ready` com SHA-256, tamanho, horário e expiração futura para
  build/retry;
- artefato `purged` para expurgo.

Se a pós-condição estiver confirmada, a interface informa o commit e não repete
a ação. Se não estiver confirmada ou a leitura falhar, o resultado fica
indeterminado e todas as mutações do suplemento são bloqueadas. O operador deve
recarregar o ticket e usar “Diagnosticar” antes de qualquer nova tentativa. O
lookup por ID ignora filtros e paginação da fila.

### Modo cleanup-only depois da exclusão

Depois que o Auth/perfil é removido, os FKs podem limpar `user_id`, mas um
artefato ainda pode exigir expurgo físico. Esse estado não reabre diagnóstico,
coleta, evidência de operador, build nem download. O painel reconhece somente o
vínculo histórico mínimo entre Help, DSR e referência opaca do artefato e
oferece exclusivamente `purge` quando o status/expiração o tornam elegível.

A Edge e as RPCs ainda precisam localizar o artefato pela relação canônica,
validar sessão administrativa, versão e claim de purge e confirmar o Storage.
Metadado isolado do Help não autoriza remoção. Falha de leitura ou pós-condição
mantém o modo incerto e bloqueia repetição até recarga/diagnóstico seguro.

## Retenção física automática

A migration `20260729003000_data_export_retention_automation.sql` versiona dois
jobs:

- `kc-data-export-retention-purge`, a cada 15 minutos, chama a Edge Function via
  `pg_net`;
- `kc-data-export-retention-monitor`, de hora em hora, detecta execução travada,
  ausência de sucesso recente e backlog vencido.

O cron não conhece `service_role`. A função `SECURITY DEFINER` lê do Vault a URL
e o segredo dedicado, mas nunca coloca esse segredo reutilizável no `pg_net`.
Para cada requisição ela gera nonce UUID e timestamp, calcula SHA-256 do corpo e
assina com HMAC-SHA-256 a forma canônica
`método + path fixo + timestamp + nonce + hash do corpo`. A fila contém somente
assinatura, nonce e timestamp. O handler exige path/versão fixos, janela máxima
de 120 segundos, corpo pequeno com apenas `action`, `limit` e `source`, e compara
a assinatura em tempo constante antes de criar o client service-role.

O `pg_net` grava temporariamente URL, corpo e cabeçalhos em
`net.http_request_queue` e apaga a linha depois do envio. Uma assinatura capturada
pode ser repetida apenas dentro da janela curta; `request_nonce` é único no log
de execuções e faz o replay retornar sem executar outro purge. Não consulte nem
registre a fila para diagnóstico. O preflight exige que `net` e `vault` não
estejam em `db_schema` nem `db_extra_search_path` do PostgREST e que `anon` e
`authenticated` não tenham acesso ao Vault. ACLs padrão gerenciadas de `pg_net`
e o acesso necessário de `service_role` ao Vault não são alterados pela
migration.

Cada lote segue esta ordem:

1. registra uma execução privada em `kc_private.data_export_retention_runs`;
2. reivindica no máximo 100 artefatos por `FOR UPDATE SKIP LOCKED` e CAS de
   `row_version`;
3. tenta remover cada objeto pelo Storage API até três vezes;
4. confirma a ausência do objeto dentro da RPC e só então minimiza os metadados;
5. mantém falhas em `purging`, com caminho opaco, para novo retry depois de 15
   minutos;
6. fecha a execução e abre ou resolve alerta durável, sem e-mail, UUID,
   protocolo, caminho ou conteúdo.

Um claim de build vencido entra no lote mesmo se o DSR não foi cancelado. Para
pedido ainda ativo, o objeto é removido e o artefato volta para `failed` com
`EXPORT_STALE_CLAIM_REBUILD_REQUIRED`, preservando a matriz de processadores e
permitindo rebuild. Para pedido encerrado ou em exclusão irreversível, o
resultado é `purged`.

## Configuração inicial sem expor segredos

1. Gere um segredo exclusivo fora do repositório e grave-o na Edge Function
   usando arquivo temporário com permissões restritas e
   `supabase secrets set --env-file <arquivo-temporario>`. O arquivo deve conter
   somente:

   ```text
   KC_DATA_EXPORT_RETENTION_SECRET=<valor-aleatorio-de-alta-entropia>
   ```

   Remova o arquivo temporário imediatamente após conferir apenas o nome do
   secret. Não imprima nem compare o valor em logs.

2. No Vault do projeto, crie os três nomes únicos pela interface do Supabase.
   Alternativamente, em sessão administrativa protegida:

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/kc-data-export-retention',
     'kc_data_export_retention_function_url',
     'Endpoint do worker de retenção LGPD'
   );
   select vault.create_secret(
     '<project-ref>',
     'kc_data_export_retention_project_ref',
     'Project-ref exato do endpoint do worker de retenção LGPD'
   );
   select vault.create_secret(
     '<mesmo-valor-do-edge-secret>',
     'kc_data_export_retention_secret',
     'Autenticação exclusiva do cron de retenção LGPD'
   );
   ```

   Para rotação, use `vault.update_secret(id, novo_valor, nome, descricao)`;
   nunca crie dois registros com o mesmo nome.

3. Aplique a migration e execute novamente, como `postgres` ou por conexão
   administrativa:

   ```sql
   select kc_private.kc_configure_data_export_retention_schedule();
   ```

   A resposta só contém booleanos e código operacional. Ausência de Cron,
   pg_net, Vault, project-ref, URL, segredo ou isolamento da fila mantém
   `scheduled=false` e abre
   `EXPORT_RETENTION_SCHEDULE_UNHEALTHY`.

   Confirme também que o valor do Vault corresponde ao projeto de rollout,
   sem retornar o valor armazenado:

   ```sql
   select kc_private.kc_data_export_retention_configuration_status(
     '<project-ref>'
   );
   ```

   `ok`, `vault_acl_safe`, `project_ref_configured`,
   `project_ref_matches_expected` e `endpoint_configured` devem ser `true`.

4. Publique `kc-data-export-retention` respeitando o contrato versionado em
   `supabase/config.toml`. Não altere `verify_jwt=false` sem redesenhar o
   transporte do cron.

5. Faça uma invocação controlada pelo próprio banco:

   ```sql
   select kc_private.kc_trigger_data_export_retention(10, 'manual');
   ```

   Aguarde a resposta assíncrona e execute os dois preflights:

   - `scripts/verify-privacy-schema.sql`: configuração, ACLs de navegador no
     Vault, jobs, project-ref exato, bucket e policy restritiva. O gate de deploy
     consulta também `/v1/projects/<ref>/postgrest` e rejeita `net` ou `vault`
     nos schemas expostos/search path. Os
     validadores de deploy substituem o placeholder somente depois de validar o
     `project-ref` no formato exato;
   - `scripts/verify-data-export-retention-runtime.sql`: sucesso recente, nenhum
     alerta ativo, execução travada ou backlog vencido.

Não prossiga com rollout se qualquer coluna retornar `false`.

Referências oficiais usadas pelo desenho:
[Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Vault](https://supabase.com/docs/guides/database/vault) e
[Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control),
[Management API — PostgREST config](https://supabase.com/docs/reference/api/v1-get-postgrest-service-config).

## Rollout sem janela quebrada

A ordem obrigatória é **banco expand → Edge nova → canários/frontend →
cópia/verificação → contract diferido**.

1. **Banco expand:** aplique as migrations em ordem, incluindo
   `20260729006000_bind_data_export_admin_work_to_session.sql`,
   `20260729007000_atomic_erasure_dsr_and_auth_delete_recovery.sql` e
   `20260729008000_harden_data_export_delivery.sql`, seguidas pelas migrations de
   vínculo/projeção de identidade, estado Auth esperado e ponte anônima de
   exclusão até
   `20260729012000_bridge_anonymous_help_to_erasure_dsr.sql`, com a UI
   administrativa fechada para novas gerações. Inventarie antes todos os artefatos
   `claimed`/`purging` e suas leases.
2. **Compatibilidade:** confirme que as novas assinaturas recebem
   `p_actor_session_id`, que claims novos gravam `claimed_session_id` e que os
   oito wrappers públicos actor-only exigidos pelas Edges anteriores permanecem
   temporariamente executáveis apenas com exatamente uma sessão administrativa
   ativa. Zero ou múltiplas sessões devem falhar fechado. Os workers privados não
   ganham exposição direta.
3. **Claims preexistentes:** a migration vincula um claim ainda vivo somente
   quando encontra uma sessão ativa inequívoca. Os demais claims sem sessão são
   liberados para `failed`, têm a lease limpa, incrementam versão e registram
   `EXPORT_SESSION_BINDING_MIGRATION_RETRY`. Uma continuação concorrente só pode
   vincular a sessão única sob CAS do mesmo artefato, versão, token, status e
   lease. Não preencha `claimed_session_id` manualmente.
4. **Edge:** publique `kc-data-export-admin`, `kc-data-subject-request`,
   `kc-account-erasure` e `kc-data-export-retention` compatíveis com o schema
   expand. Confirme versões e `verify_jwt` no projeto remoto.
5. **Canários:** com conta descartável, cubra sessão ativa, logout/revogação após
   claim, outra sessão do mesmo administrador, lease expirada, recovery,
   cancelamento, conflito de versão, upload/finalize e purge. A sessão revogada
   deve impedir continuação; outra sessão não herda o claim.
6. **Frontend e cópia:** publique o cliente atual, valide protocolo/referência,
   migre anexos privados e confira hash, tamanho, MIME, bucket, Vault, jobs e
   backlog.
7. **Observação:** acompanhe falhas por assinatura sem registrar e-mail,
   protocolo, UUID bruto, caminho, token ou conteúdo. Preserve a compatibilidade
   antiga enquanto houver consumo ou claims preexistentes.
8. **Contract:** revogue as assinaturas públicas antigas somente em migration
   posterior, quando a Edge nova estiver estável, os claims antigos tiverem
   concluído ou sido reconciliados para vínculo inequívoco/falha retryable e a
   telemetria mostrar ausência de consumidores.
   O contract não pode reabrir workers privados nem remover os guardas de sessão.

## Retry, rollback e incidentes

- `failed`: corrija a causa, atualize o diagnóstico e use “Tentar novamente”; o
  claim expirado também pode ser retomado por CAS.
- resposta perdida ou erro depois de uma mutação: não clique novamente. Aguarde
  a leitura autoritativa; se o painel marcar o resultado como indeterminado,
  recarregue o ticket e execute `Diagnosticar`. Só repita quando a pós-condição
  anterior estiver comprovadamente ausente e o servidor devolver estado
  elegível;
- falha após upload e antes do finalize: a Edge remove o objeto e marca o claim
  vencido como `purging`; o worker automático remove o objeto e o devolve como
  `failed/rebuildable`. Se a remoção falhar, o caminho permanece para retry e o
  alerta `EXPORT_RETENTION_PURGE_FAILURE` fica ativo;
- falha após reserva de download: não force `completed`. Aguarde a reserva
  expirar e leia novamente o protocolo. A recuperação restaura `ready` para a
  primeira entrega ainda válida e `delivered` para novo download; verifique
  sessão/versão antes de reservar novamente;
- `EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED`: não aumente timeout nem faça assinatura
  sequencial. O artefato deve permanecer não concluído e ser reconstruído com no
  máximo 100 referências;
- `EXPORT_PROCESSOR_OUT_OF_BAND_ATTESTATION_REQUIRED`: não reutilize o antigo
  resultado `supplied`. Confirme a entrega separada pelo canal permitido e
  registre a atestação, ou use `no_account_data`;
- hash/tamanho divergente: não entregar, não concluir, expurgar o objeto e
  investigar Storage/build.
- `EXPORT_TOO_LARGE` ou `EXPORT_ARTIFACT_SIZE_INVALID`: não elevar o limite do
  bucket nem tentar carregar o objeto inteiro novamente. Dividir a entrega em
  lotes/arquivos assistidos fora deste endpoint, registrar a referência no
  ticket e manter o protocolo aberto até comprovar a entrega integral.
- revogação de sessão durante build ou download: retornar `401`, não entregar e
  não concluir. O build session-bound e o consume verificam `auth.sessions`; uma
  segunda sessão do mesmo administrador não substitui a sessão do claim;
- depois da revogação, `kc_fail_data_export_artifact` pode abandonar o claim
  usando token + versão CAS. Essa exceção só move para falha: não lê conteúdo,
  autoriza upload, finaliza nem executa purge;
- claim criado antes do vínculo de sessão da `06000`: aceitar apenas o backfill
  de uma sessão ativa inequívoca ou a transição para
  `failed/EXPORT_SESSION_BINDING_MIGRATION_RETRY`. Em corrida, o bind exige o
  mesmo artefato, versão, token, status e lease. Não preencher
  `claimed_session_id` manualmente nem chamar worker privado;
- cancelamento do titular em `partial_failure`: bloquear novas reservas, colocar
  o artefato em `purging` e executar o purge em lote; falha do Storage mantém o
  caminho apenas para retry e não restaura o download;
- exclusão concorrente: não force nem expire a lease. Aguarde `retry_after`; o
  mesmo lock por titular decide qual fluxo pode avançar;
- não há rollback de um download já comprovado. Em incidente de conteúdo
  incorreto, preserve o protocolo, marque atendimento de segurança e gere um
  novo pedido/artefato após análise.

## Alertas operacionais

Alertar quando houver:

- `manual_follow_up` sem resolução;
- artefato `claimed` além do lease;
- `ready` ou `download_reserved` além de `expires_at`;
- `failed` repetido ou `EXPORT_BUILD_PARTIAL`;
- objeto sem metadado ou metadado sem objeto;
- divergência de SHA-256/tamanho;
- ticket arquivado enquanto artefato não está `delivered`;
- `kc_active_session_guard_coverage().ok` diferente de `true`.
- `EXPORT_RETENTION_SCHEDULE_UNHEALTHY`,
  `EXPORT_RETENTION_RUN_STALE`, `EXPORT_RETENTION_BACKLOG_STALE` ou
  `EXPORT_RETENTION_PURGE_FAILURE` ativo em
  `kc_private.data_export_retention_alerts`;
- `last_success_at` com mais de duas horas ou `consecutive_failures > 0` em
  `kc_private.data_export_retention_schedule_state`.

Consultas operacionais seguras:

```sql
select
  code, active, occurrence_count, first_seen_at, last_seen_at, resolved_at,
  details
from kc_private.data_export_retention_alerts
where active
order by last_seen_at desc;

select
  scheduled, purge_schedule, monitor_schedule, checked_at,
  last_dispatch_at, last_success_at, last_failure_at,
  consecutive_failures, operational_alert
from kc_private.data_export_retention_schedule_state
where singleton;

select
  id, source, status, claimed_count, purged_count, failed_count,
  failure_codes, error_code, started_at, finished_at
from kc_private.data_export_retention_runs
order by started_at desc
limit 20;
```

Para rollback operacional, use `cron.unschedule(text)` nos dois nomes de job e
mantenha a Edge Function e os metadados disponíveis para investigação. Não
delete objetos nem linhas manualmente. Depois da correção, execute
`kc_configure_data_export_retention_schedule()` para recriar os jobs e valide os
dois preflights. A migration não atualiza `cron.job` diretamente.

Durante a fase expand, o rollback da Edge pode usar a compatibilidade pública
transitória já protegida. Não reverta a coluna de sessão, não remova evidência de
claim e não conceda `EXECUTE` aos workers privados. Depois do contract, rollback
exige uma migration explícita e revisada; não recrie assinaturas antigas por
comando ad hoc.

Logs devem conter apenas ação e código operacional. Não registrar e-mail, UUID do
titular, protocolo, caminho do objeto, token, conteúdo ou referência bruta de
evidência.
