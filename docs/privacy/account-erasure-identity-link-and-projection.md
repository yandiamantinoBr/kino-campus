# Vínculo de identidade e projeção segura da exclusão de conta

Este complemento fecha três riscos do fluxo administrativo de exclusão:

1. tickets anônimos criados pelo formulário público apenas como `Help` agora
   recebem exatamente um DSR de `account_erasure` durante o vínculo
   administrativo verificado;
2. tickets legados ou anônimos que já possuem um DSR, mas ainda estão com
   `user_id = null`, podem reutilizá-lo sem editar tabelas manualmente;
3. `account_erasure_requests` deixou de ser legível diretamente pelo navegador.
   A Edge Function devolve somente uma projeção operacional, sem checkpoint de
   Auth, inventário de reparo, claims ou UUIDs internos da prova de identidade;
4. depois do vínculo, a autoridade deixa de ser o e-mail e passa a ser a tupla
   de UUIDs de Help, DSR, workflow e Auth. Rotação do endereço da mesma conta não
   escolhe outro titular e não depende de uma atualização incidental do ticket.

## Fronteiras e pré-condições

O vínculo é aceito somente quando todas estas condições forem verdadeiras na
mesma transação:

- o chamador do RPC é `service_role`;
- o ator é administrador e o `session_id` pertence a uma sessão Auth ainda
  ativa desse mesmo ator;
- existe exatamente um usuário Auth ativo para o e-mail normalizado;
- o perfil público correspondente existe;
- o Help tem a classificação canônica
  `account_access/onboarding_settings/account_deletion`;
- o `contact_email` do Help é exatamente o e-mail verificado;
- existem zero ou um DSR ligado ao Help; zero só é aceito para Help ainda
  anônimo e materializa um DSR de `account_erasure` com protocolo,
  `subject_hash` e chave idempotente aleatórios gerados no banco;
- quando já existe um DSR, ele é do tipo `account_erasure` e é reutilizado;
- Help e DSR ainda estão sem titular ou já apontam para o mesmo titular;
- o DSR está em `received` ou `failed`;
- o workflow está ausente ou ainda está em `diagnosed`, sem claim, confirmação,
  etapa reversível, checkpoint de Auth ou marcador irreversível;
- não existe fechamento durável nem outro DSR/workflow aberto para o titular.

Mais de um DSR, qualquer ambiguidade, duplicidade, estado avançado ou
divergência falha fechada. O RPC não escolhe “o primeiro” registro encontrado.

### UUID é a autoridade; e-mail é atributo operacional

No primeiro vínculo de um Help anônimo, o e-mail verificado serve somente para
localizar exatamente uma conta Auth ativa. A transação grava o mesmo UUID
canônico em `help_requests.user_id`, `data_subject_requests.user_id`, workflow e
ledger privado. A partir desse commit, nenhuma ação de exclusão usa e-mail,
texto livre ou metadado do navegador para escolher o titular.

Antes de qualquer diagnóstico ou mutação pré-core, a Edge Function:

1. lê `help_requests.user_id`;
2. consulta o Auth diretamente por esse UUID;
3. confirma que Help, DSR e workflow apontam para o mesmo titular;
4. confirma o ID do DSR armazenado no Help e a origem de identidade permitida;
5. usa o e-mail atual devolvido pelo Auth somente como endereço operacional.

Se o e-mail da mesma conta mudar, o UUID continua sendo a autoridade. Depois de
validar toda a tupla, a Edge sincroniza explicitamente `contact_email` e
`metadata.account_email` com o endereço atual do Auth e registra
`account_email_authority = auth_user_uuid` e o horário da sincronização. Essa
atualização acontece dentro da operação protegida; salvar status/prioridade ou
outro campo do Help não é pré-condição nem mecanismo de recuperação. Falha ao
confirmar UUID, e-mail atual ou atualização do Help retorna
`identity_email_synchronization_failed` e mantém as mutações bloqueadas.

### `metadata.account_email` não é autoridade

Para um Help autenticado de cópia, portabilidade ou exclusão, um trigger
server-side ignora `contact_email` e `metadata.account_email` enviados pelo
cliente e substitui ambos pelo e-mail normalizado do Auth vinculado ao
`user_id`. A migration também normaliza os tickets autenticados já existentes.
Esse trigger protege gravações comuns, mas o fluxo de exclusão não depende dele
para perceber uma rotação: a Edge sempre relê o Auth por UUID e faz a
sincronização explícita após validar a tupla.

Em Help anônimo, o metadado não ganha autoridade automaticamente. Ele permanece
sem titular até a verificação administrativa. No vínculo, o binder usa o
`contact_email` conferido contra o único Auth e substitui qualquer
`metadata.account_email` de terceiro pelo e-mail verificado. Assim, um payload
de A não pode deixar B como alvo operacional.

`metadata.data_subject_request_id` também não autoriza a criação nem a escolha
de um DSR. Se o metadado declarar uma ponte que não existe no banco, o vínculo
falha fechado. No caminho zero DSR, tipo, formato, origem, escopo, identificador,
protocolo e evento são definidos exclusivamente pelo materializador privado.

## Ordem de bloqueio e atomicidade

As migrations `20260729009000_harden_erasure_identity_link_and_projection.sql`
e `20260729012000_bridge_anonymous_help_to_erasure_dsr.sql` usam a mesma
barreira global dos fluxos 04000/07000:

1. lock de titular (`kc_lock_privacy_subject`);
2. lock do Help;
3. lock do DSR;
4. lock do workflow.

Depois dos locks, a conta Auth, a sessão e todos os vínculos são revalidados.
No caminho zero, o materializador insere um DSR e seu evento `created`; a folha
estrita então cria o vínculo, o evento de identidade, o workflow, o ledger e a
auditoria. Tudo pertence à mesma chamada e transação. Uma falha em qualquer
etapa, inclusive depois da materialização, desfaz tudo.

O wrapper público conserva a assinatura usada pela Edge Function e é o único
executável por `service_role`. O materializador
`kc_private.kc_materialize_anonymous_erasure_dsr` e a folha estrita ficam em
`kc_private`, sem `EXECUTE` para `service_role`, `anon` ou `authenticated`;
somente o wrapper `SECURITY DEFINER` consegue encadear as duas folhas.

## Como executar o vínculo

Use a ação dedicada da Edge Function `kc-account-erasure`:

```json
{
  "action": "link_verified_identity",
  "help_request_id": "UUID_DO_HELP",
  "account_email": "titular@example.com",
  "identity_evidence": {
    "channel": "support_mailbox_reply",
    "reference": "referencia-interna-nao-secreta-com-6-ou-mais-caracteres",
    "verified_at": "2026-07-29T14:00:00.000Z",
    "attested": true
  }
}
```

Canais aceitos:

- `verified_email_challenge`;
- `support_mailbox_reply`;
- `identity_document_review`;
- `in_person_verification`.

`verified_at` deve estar entre 30 dias atrás e cinco minutos no futuro. O e-mail
não é persistido no DSR/ledger nem devolvido na resposta; ele permanece no
ticket Help conforme a política operacional e é normalizado pelo Auth depois
do vínculo.
`reference` recebe um SHA-256 inicial apenas em memória. Antes de chamar o RPC,
a Edge Function deriva um hash contextual:

```text
SHA-256(
  "kc:account-erasure-identity:v1"
  + "|" + help_request_id
  + "|" + verification_channel
  + "|" + SHA-256(reference)
)
```

Somente esse hash contextual cruza a fronteira do worker e é persistido. A
referência e seu hash cru não são gravados. Isso impede que a mesma referência
gere um identificador correlacionável entre tickets, canais ou futuras versões
do protocolo.

Uma resposta bem-sucedida informa apenas:

- `linked` e `idempotent`;
- protocolo público do DSR;
- status do DSR e do workflow;
- origem da verificação;
- projeção segura do workflow.

O retry com os mesmos canal, hash e instante retorna `idempotent: true` sem novo
evento ou auditoria. Alterar qualquer componente da prova em um Help já
vinculado retorna conflito.

A ação também está disponível diretamente no painel administrativo do ticket.
O administrador deve informar o e-mail exato verificado, canal, referência,
data/hora e atestado. Depois do sucesso, as demais ações de exclusão continuam
travadas até a recarga canônica confirmar que `help_requests.user_id` foi
vinculado; a resposta otimista do primeiro clique não é autoridade para
desbloqueá-las.

## Prova armazenada e recuperação pós-core

Depois que o Auth e o perfil são removidos, os FKs limpam os UUIDs públicos e o
Help pode já estar redigido. Esse estado não autoriza reabrir o vínculo nem
reexecutar etapas pré-core. Somente `diagnose`, `generate_receipt` e, quando
comprovadamente necessário, `retry_finalize` permanecem possíveis.

A prova armazenada só é aceita quando `verified = true`, a origem pertence à
allowlist operacional e todos os identificadores ainda disponíveis são
coerentes. As origens aceitas são:

- `linked_authenticated_data_subject_request`;
- `admin_verified_anonymous_erasure`;
- `authenticated_help_request_owner_match`;
- `legacy_manual_identity_verification`.

Quando presentes, Help, DSR, workflow, `identity_assurance` e checkpoint de
Auth delete devem apontar para o mesmo titular e para os mesmos Help/DSR. Provas
administrativas também precisam conservar canal enumerado e hash SHA-256 da
referência. Fonte desconhecida, UUID divergente, vínculo trocado ou prova manual
incompleta retorna `identity_assurance_missing_after_core_erasure` e falha
fechado.

Se o worker comprovar por checkpoint que o Auth já foi removido, mas o workflow
ainda não registra `auth_deleted = true`, ele reconcilia essa verdade e responde:

```json
{
  "ok": false,
  "error": "auth_delete_reconciled_retry_finalize_required",
  "retryable": true,
  "next_action": "retry_finalize"
}
```

Uma falha recuperável produzida dentro de `retry_finalize` também preserva
`retryable: true` e `next_action: "retry_finalize"`. O painel só mantém a ação
habilitada quando uma nova leitura por diagnóstico confirma o mesmo estado,
`failure_stage`, `auth_deleted` e pendência de notificação. A resposta de erro
isolada não libera retry.

## Dados internos versus resposta do navegador

Internamente, `identity_assurance.target_user_id` permanece no workflow porque
as rotinas 07000 precisam provar que o alvo do checkpoint é o mesmo titular
verificado. Essa informação nunca atravessa a resposta HTTP.

A projeção central da Edge Function permite no workflow somente status,
timestamps operacionais, hash opaco, domínio, contagens, recibo e metadados já
sanitizados. Ela remove recursivamente:

- qualquer chave `auth_delete_*`;
- `checkpoint` e `checkpoint_state`;
- `core_inventory`;
- `repair_target_user_id`;
- tokens, ator e sessão de claim;
- qualquer chave terminada em `_id`, `_ids` ou `_by`, inclusive dentro de
  metadados arbitrários;
- identificadores de Help/DSR/workflow, listas internas de UUIDs e valores UUID
  que apareçam sob uma chave futura não prevista;
- `target_user_id`, `help_user_id` e `recorded_by` de
  `identity_assurance`.

A mesma projeção é aplicada a sucesso, conflito, falha de pós-condição e
recuperação. Os objetos internos usados pelo worker não são alterados.

## Resposta perdida e commit ambíguo

Toda ação administrativa com efeito usa reconciliação por pós-condição, inclusive
quando a chamada retorna erro ou a resposta é interrompida. O painel:

1. relê o Help exato por ID, sem reaplicar filtros da fila;
2. para ações além do vínculo, executa um diagnóstico seguro;
3. verifica a pós-condição específica da ação, não apenas a existência da linha;
4. só informa sucesso quando a leitura autoritativa comprova o commit.

Exemplos de pós-condição são vínculo canônico Help/DSR/Auth, timestamp e estágio
da ocultação reversível, cancelamento efetivo, `auth_deleted`, ou finalização
com notificação comprovada. Se a pós-condição for confirmada, a ação não é
repetida. Se não puder ser confirmada, o resultado fica indeterminado e todas as
mutações daquele fluxo são bloqueadas. O operador deve recarregar o ticket e
executar diagnóstico antes de qualquer nova tentativa. Remover `disabled` no
DOM ou disparar clique programático não atravessa o gate no handler.

## Retry terminal da criação do DSR

Um retry com a mesma combinação de titular, tipo e chave idempotente recupera o
mesmo DSR mesmo quando ele já está `cancelled` ou `completed`. A resposta marca
`reused_existing: true` e `reuse_reason: "idempotency_key"`, sem devolver
`user_id`, `subject_hash` ou a própria chave idempotente.

Esse retry nunca reabre a linha e nunca cria uma duplicata. Uma chave nova pode
seguir o fluxo canônico quando o estado e a barreira irreversível permitirem.
Assim, uma resposta perdida pode ser recuperada sem transformar a ausência em
listagem em autorização para girar a chave.

## Acesso ao banco

`authenticated` e `anon` não possuem `SELECT` em
`public.account_erasure_requests`, e a policy administrativa antiga é removida.
RLS não seria suficiente porque ela filtra linhas, não colunas.

O ledger
`kc_private.account_erasure_ticket_identity_links` também não concede acesso
direto nem ao `service_role`; apenas a função `SECURITY DEFINER` pode usá-lo.
Ele contém IDs relacionais internos, canal, SHA-256 e timestamps, sem colunas de
e-mail ou referência em texto puro.

## Diagnóstico de erros

Erros esperados e sua interpretação:

- `valid_account_email_required`: o payload não trouxe um e-mail válido;
- `identity_attestation_required`: o administrador não confirmou a
  verificação;
- `erasure_identity_account_not_unique`: zero ou mais de uma conta Auth;
- `erasure_admin_session_not_active`: sessão administrativa expirada ou
  divergente;
- `erasure_identity_help_mismatch`: classificação, e-mail ou titular do Help
  divergente;
- `erasure_identity_dsr_not_unique`: múltiplos DSRs no Help ou tentativa de
  usar a ponte zero DSR em um Help já autenticado;
- `erasure_identity_dsr_mismatch`: o Help declara uma referência de DSR que não
  existe ou diverge da relação canônica;
- `erasure_identity_subject_conflict`: já existe outro DSR/workflow de exclusão
  aberto para o titular;
- `erasure_identity_dsr_materialization_conflict`: uma corrida violou a
  unicidade durante a materialização; nenhuma gravação parcial é mantida;
- `erasure_identity_dsr_state_invalid`: DSR já atravessou a janela segura;
- `erasure_identity_subject_closed`: exclusão irreversível já iniciou;
- `erasure_identity_link_conflict`: retry alterou a prova ou os vínculos;
- `identity_email_synchronization_failed`: a tupla por UUID foi validada, mas o
  Help não confirmou o e-mail operacional atual do mesmo Auth;
- `identity_assurance_missing_after_core_erasure`: a origem armazenada não
  pertence à allowlist ou diverge dos vínculos/checkpoint ainda disponíveis;
- `auth_delete_reconciled_retry_finalize_required`: o checkpoint comprovou
  Auth ausente; recarregue/diagnostique e prossiga somente com
  `retry_finalize`;
- `identity_link_capability_missing`: a Edge Function foi publicada antes das
  migrations 09000/12000.

Não corrija esses casos com `UPDATE` manual. Resolva a inconsistência de origem,
gere um novo ticket quando aplicável ou encaminhe para revisão técnica.

## Implantação e verificação

A ordem mínima é:

1. migrations até 07000;
2. migration 08000 de entrega/retensão de exportação;
3. migrations 09000 e 11000;
4. migration 12000;
5. preflight de schema;
6. publicação da Edge Function;
7. teste com contas sintéticas.

Verificações obrigatórias:

- reset local completo até 12000;
- `supabase db lint --level error`;
- pgTAP `account_erasure_identity_link_projection_test.sql` e
  `account_erasure_anonymous_help_bridge_test.sql`;
- Jest `account-erasure-admin.test.js` e gates de deployment;
- `deno fmt --check`, `deno lint` e `deno check` da Edge Function;
- retry idêntico, retry divergente, sessão inválida, DSR terminal e closure
  ativa;
- rotação de e-mail mantendo o mesmo UUID, comprovando uso imediato do endereço
  Auth atual e sincronização explícita sem salvar a triagem;
- fonte pós-core válida, fonte forjada, checkpoint divergente e Help/DSR
  divergentes, todos com comportamento fail-closed;
- zero DSR materializado exatamente uma vez, um DSR reutilizado e múltiplos DSRs
  rejeitados sem alteração parcial;
- metadata de DSR forjada, conflito com outro pedido aberto e falha posterior do
  workflow, comprovando rollback de DSR, evento e ledger;
- retry da criação do DSR com a mesma chave após `cancelled` e `completed`, sem
  reabertura ou duplicação;
- resposta perdida depois de commit em cada mutação, confirmando pós-condição
  específica ou bloqueio até recarga e diagnóstico;
- redação de Help ligado, confirmando que o trigger de normalização não
  reintroduz e-mail Auth;
- inspeção da resposta para confirmar ausência de e-mail, UUID de identidade,
  chaves `*_id`/`*_ids`/`*_by`, `auth_delete_*`, checkpoint e inventário.
