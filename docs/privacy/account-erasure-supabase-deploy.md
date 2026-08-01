# Deploy Supabase do fluxo de exclusão LGPD

Este checklist é operacional. Ele não autoriza executar exclusão real durante validação.

## Ordem obrigatória

1. fazer backup e validar a restauração em ambiente isolado;
2. inventariar claims/leases já abertos e aplicar as migrations **expand** em
   ordem, incluindo DSR/barreira, redaction de auditoria, outbox criptografada,
   recuperação de Auth, projeção segura, estado Auth esperado do Help e ponte
   anônima; aplicar, em seguida, `20260729190653_help_submission_idempotency.sql`,
   `20260729203000_help_privacy_guest_gateway_expand.sql`,
   `20260731193000_materialize_dsr_for_authenticated_legacy_help.sql` e
   `20260801183000_guard_erasure_help_closure.sql`;
3. executar pgTAP, contract tests, advisors, capability e os canários de
   recovery/quiescência ainda com o frontend administrativo fechado;
4. configurar a chave externa e os secrets da outbox; criar widgets Turnstile
   separados por ambiente e registrar site key pública, secret, environment e
   hostnames/origens exatos (`KC_PRIVACY_HELP_ALLOWED_ORIGINS`);
5. publicar as versões compatíveis de `kc-data-export-admin`,
   `kc-data-subject-request`, `kc-account-erasure` e
   `kc-data-export-retention`, além de
   `kc-create-privacy-help-guest`;
6. testar somente com usuários descartáveis, incluindo sessão administrativa
   ativa, revogada e substituída, retomada de claim preexistente, replay da
   Central de Ajuda, desafio guest válido/inválido/expirado, resposta
   perdida/reload e expurgo de DSR com seu mapa idempotente;
7. publicar o frontend compatível, confirmar que visitante usa a Edge e que
   conta real usa a RPC autenticada, migrar/verificar cópias privadas e só então
   liberar o painel administrativo;
8. somente depois dos canários Edge/frontend e da janela de cache, promover o
   template pendente com timestamp novo e aplicar a migration **contract** que
   retira `anon` da RPC de criação privacy; comprovar que a chamada REST direta
   falha e que a Edge continua criando/reproduzindo o mesmo Help;
9. adiar toda outra revogação de assinatura pública antiga para uma migration
   **contract** posterior, após telemetria comprovar ausência de consumidores
   antigos.

A ordem é banco expand → Edge compatível → canários/frontend → cópia/verificação
→ contract diferido. Na `06000`, as novas assinaturas session-bound coexistem
temporariamente com cinco wrappers públicos actor-only exigidos pela Edge
anterior. Eles resolvem a sessão somente quando o administrador possui exatamente
uma sessão ativa e não expirada; zero ou múltiplas sessões falham fechado. Os
workers privados continuam fechados. Não publique a Edge nova antes do contrato
de banco e não antecipe o contract no mesmo rollout.

## Contratos mínimos de banco

Confirme:

- `account_erasure_requests.operation_version`;
- colunas `operation_claim_*`, inclusive `operation_claim_session_id`;
- `retention_until` e rotina de redaction/purge;
- status `confirmed` e `partial_failure`;
- vínculo único `data_subject_request_id`;
- `kc_claim_account_erasure_operation(...)`;
- `kc_transition_data_subject_request(...)`;
- `kc_revoke_user_sessions_for_erasure(uuid)` retornando JSON `{ok,sessions_deleted,refresh_tokens_deleted}`;
- remoção de refresh tokens por `user_id` e session IDs, com pós-condição zero;
- `kc_is_current_session_active()`;
- `kc_active_session_guard_coverage()`;
- `kc_account_audit_identifier_inventory(uuid)`;
- `kc_redact_account_audit_identifiers(uuid)`;
- `kc_record_account_erasure_copy_decision(...)`;
- `kc_claim_data_export_artifacts_for_erasure(uuid,uuid,integer)`;
- `kc_complete_data_export_artifact_erasure_purge(text,bigint,uuid)`;
- `kc_release_data_export_artifact_erasure_purge(text,bigint,uuid,text)`;
- tabela privada `kc_private.account_erasure_completion_outbox`, sem grants
  diretos para `service_role`, `authenticated` ou `anon`;
- `kc_account_erasure_completion_outbox_status(uuid)`;
- `kc_stage_account_erasure_completion_outbox(...)`;
- `kc_claim_account_erasure_completion_outbox(uuid,uuid)`;
- `kc_accept_account_erasure_completion_delivery(uuid,uuid,uuid)`;
- `kc_release_account_erasure_completion_delivery(uuid,uuid,uuid)`;
- `kc_purge_expired_account_erasure_completion_outbox(integer)`;
- `kc_account_erasure_capabilities()` versão 5 e todos os flags `true`,
  inclusive outbox criptografada, fechamento durável do titular, lease
  renovável, claims administrativos vinculados à sessão, transições atômicas e
  checkpoint recuperável do delete Auth;
- `trg_guard_account_erasure_help_status` ativo em `help_requests`, com o
  fechamento administrativo bloqueado até cancelamento formal ou comprovante
  final entregue;
- `pgrst.db_pre_request = public.kc_enforce_active_session_pre_request`;
- trigger/guard em toda tabela gravável e policy RESTRICTIVE nas tabelas com RLS;
- policy RESTRICTIVE global em `storage.objects`;
- FKs/triggers de preservação para chat, comentários, denúncias, avaliações, bloqueios, CADU e `kc_unit_meta`;
- token opaco criado com `gen_random_bytes(32)`, não hash de UUID/e-mail;
- buckets privados `kino-chat-media` e `kino-data-exports`;
- `kc_private.data_export_artifacts.claimed_session_id`;
- `kc_create_privacy_help_guest_v1(jsonb)` executável somente por
  `service_role`, sem grant herdado de `PUBLIC`, `anon` ou `authenticated`;
- após o contract guest, `anon` não executa
  `kc_create_privacy_help_request_v1(jsonb)`; `authenticated` permanece e
  recovery conserva seu contrato separado;
- `kc_enforce_active_session_pre_request()` continua global e sem exceção por
  path, método ou claim anônima;
- novas assinaturas administrativas de exportação com
  `p_actor_id` + `p_actor_session_id` para leitura, evidência, vinculação de
  Help, recovery, claim e purge;
- continuações token-bound que revalidam a sessão armazenada no claim;
- reconciliação expand para claims anteriores à `06000`: uma lease ainda viva
  com exatamente uma sessão ativa recebe o vínculo; os demais claims sem sessão
  mudam para `failed`/`EXPORT_SESSION_BINDING_MIGRATION_RETRY`;
- bind de corrida para claim pre-expand sob o mesmo artefato, versão, token,
  status e lease CAS, sem conceder `EXECUTE` direto aos workers privados;
- `kc_fail_data_export_artifact` limitado a abandono: pode levar o claim a falha
  depois da revogação, mas nunca autoriza conteúdo, upload, finalize ou purge.

Se qualquer contrato faltar ou tiver shape divergente, não publique o worker.

## Storage

Variáveis:

- `KC_STORAGE_BUCKET=kino-media`;
- `KC_CHAT_STORAGE_BUCKET=kino-chat-media`.

`kino-media` continua público para avatar/post. `kino-chat-media` e
`kino-data-exports` devem ser privados. O cliente de chat usa URL assinada e
autorização de participante; a exportação é mediada pelas Edge Functions e não
possui policy direta de leitura para o titular.

Antes do rollout:

1. inventarie `chat-media/...` no bucket público legado;
2. migre ou elimine cada objeto;
3. valide leitura autorizada no bucket privado;
4. mantenha a varredura dupla do worker durante o cutover;
5. remova o legado somente após comprovar zero objetos.

RLS não protege download de objeto em bucket público.

## Validação local

```powershell
deno check supabase/functions/kc-account-erasure/index.ts
node --check assets/js/controllers/admin/admin-help-requests.controller.js
npx jest tests/integration/account-erasure-admin.test.js --runInBand
```

Com Supabase local:

```powershell
npx supabase db reset
npx supabase test db supabase/tests/data_subject_requests_test.sql
npx supabase test db supabase/tests/account_erasure_audit_identifier_redaction_test.sql
npx supabase test db supabase/tests/account_erasure_completion_outbox_test.sql
npx supabase test db supabase/tests/account_erasure_identity_link_projection_test.sql
npx supabase test db supabase/tests/account_erasure_anonymous_help_bridge_test.sql
npx supabase test db supabase/tests/help_privacy_submission_idempotency_test.sql
```

O reset destrói o banco local. Nunca aponte esse comando para produção.

## Casos pgTAP obrigatórios

- dois claims concorrentes: somente um vence;
- claim preexistente à `06000` com lease viva e uma única sessão ativa é
  vinculado; os demais viram falha retryable, sem continuação privilegiada
  silenciosa;
- claim novo registra a sessão exata e falha depois que ela é revogada, mesmo
  com outra sessão ativa do mesmo administrador;
- claim sem status/versão corretos falha;
- Help anônimo com zero DSR materializa exatamente um pedido opaco e seu evento,
  e o retry idêntico não duplica DSR, evento, workflow ou ledger;
- Help legado autenticado com zero DSR também materializa exatamente um pedido
  opaco pela migration 31193000, sem trocar o titular já vinculado;
- Help com um DSR reutiliza a linha existente; com mais de um falha sem escolher
  o primeiro;
- referência de DSR apenas em metadata, outro pedido aberto e workflow avançado
  falham sem deixar materialização parcial;
- claim vencido pode ser substituído;
- CAS DSR grava status e evento atomicamente;
- cancelamento concorrente vence antes de `confirmed`;
- DSR terminal não reabre;
- refresh tokens por user ID e session ID ficam zerados;
- resposta da RPC de revogação tem o JSON exato;
- capability é service-role-only;
- capability versão 5 exige outbox criptografada, fechamento durável, lease
  renovável, sessão administrativa exata, workflow atômico e checkpoint Auth;
- Help LGPD cria/reproduz uma única linha para guest ou conta real; a RPC v2
  legada rejeita os três direitos e não contorna a chave;
- Supabase Anonymous Auth permanece desabilitado no runtime. A migration pode
  conservar helpers de compatibilidade futura, mas o pre-request global não
  ganha exceção e os testes não devem anunciar esse caminho como público;
- create, replay e recovery da conta real bloqueiam a linha de usuário e a
  sessão ativa com `FOR SHARE`, impedindo revogação/delete concorrente entre a
  checagem e a resposta;
- recovery retorna `recovered`, `retired` ou `ambiguous` sem revelar existência
  para outro caller; guest ausente permanece ambíguo e caller com UUID instala
  tombstone sob quota sem corrida com `create`;
- conversão anônima→conta recupera somente quando preserva o mesmo UUID;
  outra conta, sessão revogada ou expirada falha;
- replay reprojeta o DSR atual; classificação com caixa/espaços e
  `metadata.request_kind` divergente termina canônica;
- redaction, purge de Help/DSR, delete Auth e cleanup após 90 dias removem mapa,
  tombstone e bucket de rate limit sem bloquear retenção;
- `write_quiescence` só é verdadeiro com cobertura integral;
- access JWT capturado falha após revogação em INSERT/UPDATE/DELETE/RPC;
- conteúdo de terceiros sobrevive ao Auth delete;
- dados comportamentais inventariados desaparecem;
- post tombstone não guarda workflow/DSR/user UUID;
- `audit_log`, `ad_campaign_audit` e `hero_banner_audit` preservam evento,
  ação e timestamp, mas nenhum valor JSON/coluna mantém o UUID alvo;
- falha forçada na terceira tabela de auditoria reverte também as duas
  atualizações anteriores;
- o reparo das auditorias é idempotente e não gira o pseudônimo novamente;
- a outbox não dá leitura direta do ciphertext ao `service_role`;
- não é possível reclamar o destinatário antes de DSR concluído, Help redigido
  e workflow `erased/notification_pending`;
- dois claims de entrega simultâneos não vencem;
- aceite com token incorreto falha sem apagar o ciphertext;
- falha SMTP libera somente o claim correspondente e uma recarga obtém novo
  token CAS sem regravar nem exibir o destinatário;
- falha entre aceite remoto e aceite local mantém o lease e exige verificação
  no provedor antes de qualquer reenvio;
- aceite SMTP nulifica ciphertext/nonce e retry observa `accepted` sem reenvio;
- purge por TTL elimina linhas `staged` ou `accepted`;
- chat privado exige participante;
- policy Storage usa o nome global esperado pelo teste;
- workflow terminal é redigido/purgado no prazo;
- workflow parcial vencido gera alerta em vez de purge silencioso.

## Edge Functions que usam service role

O pre-request hook do PostgREST não protege uma Edge Function que:

1. aceita um access JWT;
2. chama `auth.getUser`;
3. escreve com service role.

Cada função assim deve validar `kc_is_current_session_active` antes do cliente privilegiado. Inclua especialmente publicação/edição CADU e qualquer endpoint de conteúdo, chat, suporte ou perfil.

Como canário, capture um JWT de teste, revogue a sessão e tente todas as escritas. Todas devem falhar antes e depois do Auth delete.

Uma função que devolve access/refresh token de serviço para chamador anônimo é incidente crítico: retire-a de tráfego, rotacione segredos, revise logs e só republique com autenticação/autorização adequada.

### Gateway visitante dos direitos LGPD

`kc-create-privacy-help-guest` é a única exceção que recebe uma chamada sem JWT
porque autentica a operação pelo desafio antiabuso, não uma pessoa. Isso não
autoriza outros usos do cliente privilegiado. Confirme:

- `verify_jwt = false`, `POST`/`OPTIONS` somente e CORS refletido apenas para
  origem HTTPS allowlisted;
- tamanho do corpo e do token limitados antes de fazer parse/chamada externa;
- Siteverify chamado exclusivamente no servidor, com timeout, secret do
  ambiente, `success`, action `help_privacy_guest` e hostname exato;
- ambiente `production` rejeita as chaves oficiais de teste; desenvolvimento e
  CI usam widget/secret de teste separados;
- resposta, log e telemetria nunca contêm token, secret, IP, header, payload
  pessoal, resposta bruta do Siteverify ou erro bruto do banco;
- somente após sucesso o cliente `service_role` chama o wrapper guest; ele não
  chama a RPC pública como `anon`;
- o wrapper aceita apenas os três subtipos canônicos, força estado visitante e
  delega ao worker idempotente; `anon`/`authenticated` não têm `EXECUTE`;
- replay não exige novo insert e continua sob a mesma chave opaca; token
  Turnstile é sempre resetado após a tentativa;
- falha de Siteverify, configuração, hostname/action, timeout ou envelope RPC
  termina fail-closed e não remove a chave idempotente.
- a função aplica backpressure sem fila, limitada a 24 Siteverify simultâneos
  por isolate aquecido; saturação devolve `429` e `Retry-After: 10`, sem reter
  body ou token;
- esse contador é somente best-effort local. Antes do go-live, configure
  rate-limit/WAF distribuído na borda da rota, sem persistir IP na aplicação, e
  alerte por volume agregado de `403`, `429`, `503`, invocações e latência. CORS,
  Origin e o contador por isolate não são autenticação nem quota global.

## Usuário descartável

Não use conta de usuário real.

Crie:

- pelo menos dois administradores;
- titular e terceiro;
- post do titular com comentário/like do terceiro;
- comentário e denúncia do titular;
- avaliação e bloqueio do terceiro contra o titular;
- conversa com mensagens de ambos;
- arquivos de avatar/post;
- arquivo de chat no bucket privado e cópia legada no público;
- views, buscas, analytics, consentimento e aceite;
- CADU e `kc_unit_meta`;
- linhas de `audit_log`, `ad_campaign_audit` e `hero_banner_audit` com UUID
  direto, aninhado, em array e também como substring que deve ser preservada;
- DSR/Help canônicos vinculados.

Valide:

1. classificação exata;
2. identidade DSR/Help/Auth;
3. recusa de ticket autenticado apontando e-mail de terceiro;
4. exigência de prova para legado/anônimo;
5. diagnóstico/capability;
6. reversível e restauração;
7. `draft_only` e entrega manual;
8. corrida cancelamento versus confirmação;
9. ban e revogação;
10. recusa de escrita com JWT capturado;
11. reinventário após quiescência;
12. remoção em ambos os buckets;
13. preservação de terceiros;
14. eliminação de dados comportamentais;
15. reparo de pós-condições;
16. redaction recursiva exata dos três históricos, preservação de
    cardinalidade/ação/timestamp e canário zero UUID;
17. resultado explícito e retenção documentada de cada operador;
18. revisão registrada do encadeamento Cadu/OpenClaw/Hostinger VPS para UUIDs
    administrativos e referências `requested_by`/`resolved_by`;
19. DSR concluído, Help redigido e workflow marcado
    `erased/notification_pending` antes do e-mail; o fluxo administrativo só
    termina depois do aceite SMTP/manual e da remoção de `notification_pending`;
20. falha SMTP, recarga e retry automático pelo endereço cifrado;
21. concorrência/aceite CAS e ausência de e-mail, ciphertext e nonce em
    painel, logs e recibo;
22. expiração/purge da outbox e fallback manual por canal já verificado;
23. `notification_pending` e entrega manual quando o retry não é possível;
24. expurgo/redação conforme `retention_until`.

## Secrets

Configure somente no ambiente:

- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY` para `kc-account-erasure`/`kc-data-export-admin`;
- `SUPABASE_PUBLISHABLE_KEY` pode substituir a anon key somente em
  `kc-data-subject-request`, cujo handler declara esse fallback;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `KC_ALLOWED_ORIGINS`;
- `KC_PRIVACY_HELP_ALLOWED_ORIGINS`;
- `KC_TURNSTILE_SECRET_KEY`;
- `KC_TURNSTILE_EXPECTED_HOSTNAMES`;
- `KC_TURNSTILE_ENVIRONMENT` (`production` ou `test`);
- `KC_TURNSTILE_SITE_KEY` apenas no build do frontend; é pública, nunca deve ser
  copiada para os secrets da Edge como substituta do secret;
- `KC_STORAGE_BUCKET`;
- `KC_CHAT_STORAGE_BUCKET`;
- `KC_SMTP_USER`;
- `KC_SMTP_PASS`;
- host, porta, remetente e reply-to SMTP;
- `KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64` com exatamente 32 bytes aleatórios em
  Base64 ou Base64URL;
- `KC_ERASURE_OUTBOX_KEY_VERSION` (por exemplo `v1`);
- `KC_ERASURE_OUTBOX_TTL_SECONDS` entre `900` e `86400` (padrão `21600`);
- flags dos operadores efetivamente usados.

Não grave service role, senha SMTP, secret Turnstile, chave da outbox,
destinatário, ciphertext/nonce, token de deploy ou evidência bruta no
repositório/log.

## Governança organizacional antes do go-live

O canal público de direitos existe, mas a documentação operacional deve registrar
uma decisão organizacional separada sobre encarregado:

- formalizar e arquivar o ato de indicação e seus dados públicos; ou
- documentar, com base no enquadramento aplicável, a dispensa para agente de
  tratamento de pequeno porte, preservando em qualquer hipótese um canal de
  comunicação com o titular.

Não atribua o cargo a uma pessoa por inferência e não publique promessa de
conformidade antes dessa decisão. Se houver indicação formal, atualize de forma
coordenada Política de Privacidade, Transparência, Central de Ajuda e registros
internos com identidade e contato coerentes.

Gere a chave em um terminal seguro e registre somente no secret manager. Exemplo
para produzir 32 bytes em Base64, sem salvar em arquivo:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Rotação exige manter a versão/chave antiga disponível até não existir linha
`staged` daquela versão, ou aguardar o TTL/purge e usar entrega manual para
eventual workflow pendente. Não troque apenas `KC_ERASURE_OUTBOX_KEY_VERSION`
enquanto houver ciphertext não aceito.

## Publicação

`scripts/deploy-supabase-lgpd.ps1` é um preflight não mutante por padrão. Ele
confere projeto vinculado, histórico das migrations, schema canônico, funções,
checagem Deno e nomes de secrets sem imprimir valores. A opção
`-DeployFunctions` só deve ser usada depois de revisar toda a saída.

Com o projeto correto previamente vinculado, confira a cadeia que seria
aplicada:

```powershell
npx supabase db push --linked --dry-run
```

### 1. Banco expand

Depois de revisar a saída, confirmar backup/restauração e configurar os secrets,
aplique as migrations aditivas:

```powershell
npx supabase db push --linked
.\scripts\deploy-supabase-lgpd.ps1
```

Não use `--include-all` sem reconciliar previamente o histórico remoto; ele
pode aplicar migrations antigas que não pertencem ao rollout.

Ainda sem liberar o painel:

1. confirme versões;
2. execute pgTAP;
3. consulte advisors;
4. valide `kc_active_session_guard_coverage()`;
5. execute `scripts/verify-privacy-schema.sql` e rejeite qualquer valor diferente
   de `true`;
6. confirme `encrypted_completion_outbox = true`,
   `export_artifact_erasure_purge = true` e capability versão 5;
7. confirme `completion_outbox.encryption_ready = true` no `diagnose`;
8. verifique
   `kc_private.account_erasure_completion_outbox_schedule_state`: se
   `scheduled = false`, crie monitor/purge externo antes de liberar;
9. confirme `claimed_session_id`, as assinaturas session-bound e a
   compatibilidade transitória esperada para a Edge anterior;
10. inventarie claims/leases preexistentes e confirme o backfill inequívoco ou
    `EXPORT_SESSION_BINDING_MIGRATION_RETRY`, inclusive o CAS de corrida;
11. execute somente `diagnose` em smoke test;
12. não execute `erase_confirmed` em produção como teste.

### 2. Edge Functions

Publique apenas depois dos gates do banco:

```powershell
.\scripts\deploy-supabase-lgpd.ps1 -DeployFunctions
```

Confirme no projeto-alvo as versões e o `verify_jwt` efetivo; o repositório não
prova o estado remoto. Para `kc-account-erasure`, baixe a fonte publicada e
confirme literalmente o marcador `kc-account-erasure-2026-08-01-v1`; uma função
`ACTIVE` com versão maior ainda pode conter código antigo. O frontend deve chamar
`action=capabilities` antes de cada operação, exigir schema v5 e enviar
`expected_contract_version` nas chamadas seguintes. Execute canários de criação,
retry idempotente, claim,
heartbeat/recovery, cancelamento, expurgo e sessão administrativa revogada. Para
o gateway visitante, faça o primeiro canário enquanto a RPC direta ainda está
na janela expand: token válido deve criar/reproduzir, e token ausente, inválido,
repetido, action divergente, hostname divergente e origem não allowlisted devem
falhar sem linha nova.

### 3. Frontend, cópia e verificação

Publique o frontend compatível, valide protocolo versus referência do Help,
migre/verifique anexos de chat e confirme buckets, Vault e schedules. Observe
erros por assinatura e uso da compatibilidade antiga sem registrar protocolo,
e-mail, token, UUID bruto ou conteúdo do pacote na telemetria.

No artefato Vercel de produção, confirme que `KC_TURNSTILE_SITE_KEY` não está
vazia, não é uma chave oficial de teste e pertence ao widget dos hostnames de
produção. Confirme também o rate-limit/WAF distribuído e os alertas do gateway.
Faça um canário visitante e um autenticado antes do contract.

### 4. Contract guest e demais contracts diferidos

Depois dos dois canários e da janela de cache, consulte o maior timestamp do
histórico remoto. Em um commit posterior, renomeie e mova
`supabase/contracts/pending/help_privacy_guest_gateway_contract.template.sql`
para
`supabase/migrations/<timestamp-novo>_help_privacy_guest_gateway_contract.sql`,
usando uma versão de 14 dígitos maior que todas as migrations já aplicadas.
Não reutilize a data de criação do template, não o copie e não use
`--include-all` para contornar uma migration fora de ordem.

No mesmo commit de promoção:

1. adicione o timestamp novo às listas obrigatórias de
   `.github/workflows/edge-deploy.yml` e
   `scripts/deploy-supabase-lgpd.ps1`;
2. altere o contrato Jest de rollout para exigir template ausente e exatamente
   uma migration CONTRACT ativa;
3. mantenha o verificador de schema e os pgTAPs phase-aware: bridge somente
   `service_role`, comentário `CONTRACT:` e `anon` sem `EXECUTE` na criação
   direta;
4. execute reset local, lint, todos os pgTAPs, Jest e o dry-run remoto antes de
   aplicar.

Depois, aplique o contract guest e valide imediatamente:

1. chamada REST direta com papel `anon` a
   `kc_create_privacy_help_request_v1` falha por ACL;
2. Edge com token válido continua criando/reproduzindo;
3. conta real continua usando a RPC autenticada;
4. recovery guest por chave opaca mantém os estados esperados;
5. Help genérico e `external_access` continuam nos wrappers legados guardados.

Não há autorização para revogar as assinaturas públicas antigas no rollout
expand. Prepare uma migration posterior somente quando:

1. todas as Edge Functions compatíveis estiverem estáveis;
2. claims preexistentes tiverem concluído, sido vinculados de forma inequívoca ou
   migrado para `failed`/retry controlado;
3. canários de sessão revogada e troca de sessão continuarem fail-closed;
4. a telemetria demonstrar ausência de consumidores das assinaturas antigas;
5. houver rollback testado para a Edge, sem reabrir workers privados.

O contract deve remover apenas a compatibilidade comprovadamente ociosa. Não
remova guards, RLS, hooks de sessão, trilhas de auditoria ou dados já tratados.

## Rollback

Se o rollout falhar:

- interrompa ações administrativas;
- preserve workflow, claim e failure stage;
- reverta a versão da Edge Function, não dados já tratados;
- durante a fase expand, mantenha a compatibilidade pública transitória protegida
  para permitir rollback da Edge; não conceda execução a workers privados;
- não retire FKs/guards/policies para “destravar”;
- não torne todo `kino-media` privado;
- retome pelo estado permitido após corrigir a causa.

Alterações de FK, dados pseudonimizados, purge e movimentação de Storage não devem ser revertidos automaticamente. Valide qualquer rollback em clone.

A RPC de auditoria é a exceção operacional antes do commit da chamada: por
estar em uma única transação, falha de cardinalidade, integridade ou canário
zero UUID reverte automaticamente as três tabelas. Depois de uma chamada
bem-sucedida, não restaure o UUID; use o reparo idempotente.
