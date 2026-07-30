# Runbook de exclusão de conta e dados (LGPD)

Este documento define o procedimento técnico e operacional do pedido de exclusão. Ele não substitui avaliação jurídica sobre uma retenção excepcional, mas impede que a plataforma:

- altere dados de uma pessoa com base em ticket de outra;
- apague conteúdo ou evidência de terceiros;
- confunda rascunho com mensagem entregue;
- comunique conclusão antes da conclusão real;
- trate execução parcial como sucesso;
- continue aceitando escrita de um access JWT cuja sessão já foi revogada.

## 1. Entrada correta no fluxo

O painel de exclusão só aparece para o tuple coerente:

- `type = account_access`;
- `topic = onboarding_settings`;
- `subtopic = account_deletion`;
- se `metadata.request_kind` existir, deve ser `account_erasure`.

`data_access_copy` e `data_portability` nunca entram neste fluxo. A palavra “LGPD” isolada não abre controles destrutivos. O fallback textual é apenas para Help legado sem `request_kind`, ainda exige a categoria de conta/configurações e semântica forte de eliminação da própria conta.

O caminho canônico cria atomically um DSR e um Help autenticados. Antes de qualquer ocultação, o worker confirma:

1. `help_requests.user_id`;
2. `data_subject_requests.user_id`;
3. usuário encontrado no Auth diretamente pelo UUID do Help;
4. `help_request_id`, `data_subject_request_id` e `request_kind`;
5. a mesma identidade em Help, DSR, workflow e Auth;
6. `metadata.identity_source` pertencente às origens permitidas.

Se qualquer identificador divergir, ocorre `identity_target_mismatch` e nada é ocultado.

Depois do vínculo, o e-mail nunca seleciona o titular. O UUID comum a
Help/DSR/Auth é a autoridade, e o endereço atual devolvido pelo Auth serve
somente para confirmação e comunicação. Se o titular alterar o e-mail mantendo
o mesmo UUID, a Edge valida primeiro toda a tupla e então sincroniza
explicitamente `contact_email` e `metadata.account_email`. O fluxo não depende
de salvar triagem ou de outra atualização incidental do Help. Falha na
sincronização mantém todas as mutações bloqueadas.

Um Help legado/anônimo não pode ser diagnosticado nem sofrer qualquer mutação do
workflow antes do vínculo administrativo dedicado. O operador informa o e-mail
exato da conta verificada, canal, referência, data e atestado. Se o Help ainda não
tiver DSR, a migration 12000 materializa exatamente um protocolo de exclusão na
mesma transação; um DSR existente é validado e reutilizado, e múltiplos DSRs
falham fechado. O painel mantém todas as demais ações bloqueadas até uma recarga
canônica confirmar `help_requests.user_id`.

Os canais permitidos são desafio respondido no e-mail da conta, resposta validada
na caixa de suporte, revisão documental por canal seguro ou verificação
presencial. A referência bruta não é persistida; somente um hash contextual por
ticket e canal.

## 2. Identificador pseudônimo

O recibo não usa SHA-256 de e-mail, UUID público ou Help ID. Esses valores determinísticos podem ser reidentificados.

- DSR canônico recebe 32 bytes aleatórios em `subject_hash`;
- Help legado recebe token aleatório por workflow;
- retries reutilizam o token persistido;
- o campo legado `account_erasure_requests.email_hash` guarda esse token opaco, não um hash de e-mail.

## 3. Estados, ações e concorrência

Fluxo normal:

```text
diagnosed
  -> reversible_applied
  -> pending_confirmation
  -> confirmed
  -> partial_failure
  -> erased
```

Estados laterais:

- `failed`: nenhuma medida irreversível foi comprovada;
- `partial_failure`: houve ban, revogação, remoção, sanitização ou Auth delete;
- `cancelled`: restauração reversível e cancelamento concluídos.

Ações:

- `diagnose`;
- `apply_reversible`;
- `record_confirmation_delivery`;
- `cancel_reversible`;
- `generate_receipt`;
- `erase_confirmed`;
- `retry_finalize`.

Cada mutação usa `kc_claim_account_erasure_operation`. O claim compara status e `operation_version`, cria `operation_claim_token` e expiração. Todo update subsequente filtra por request ID, token e versão. Claims concorrentes ou perdidos falham fechados.

Uma resposta HTTP perdida não prova que a transação falhou. Depois de toda
mutação, inclusive em erro de transporte, o painel relê o Help exato por ID e
executa diagnóstico seguro quando necessário. Ele valida a pós-condição
específica da ação: vínculo, estágio/timestamp reversível, entrega registrada,
cancelamento, `auth_deleted` ou conclusão com notificação. Se o commit for
comprovado, não repete a ação. Se o resultado permanecer ambíguo, marca o fluxo
como indeterminado e bloqueia novas mutações até recarga e diagnóstico.

Desde `20260729004000`, o workflow registra também
`operation_claim_session_id`. Claim, heartbeat, transição e execução
administrativa exigem a mesma sessão ativa; logout, revogação ou perda do papel
administrativo bloqueiam a continuação. Outra sessão do mesmo administrador não
herda a lease. Claims vencidos seguem somente o recovery/CAS versionado.

Na confirmação irreversível, a ordem é:

1. adquirir claim;
2. fazer CAS do DSR de `pending_confirmation` para `processing`;
3. somente então gravar workflow `confirmed`.

Se o titular vencer a corrida e cancelar o DSR, o CAS falha, o claim é liberado, o workflow não vira `confirmed` e nenhuma mutação irreversível começa.

As mudanças públicas do protocolo usam `kc_transition_data_subject_request`, que grava status e evento na mesma transação.

## 4. Diagnóstico e capability

O diagnóstico cobre:

- Auth, perfil e continuidade administrativa;
- posts, post_media, comentários e curtidas de terceiros;
- votos, salvos, denúncias e visualizações;
- buscas, afinidade, preferências, analytics, consentimentos e aceites;
- avaliações e bloqueios, separando linhas recebidas de terceiros;
- conversas, mensagens próprias e de terceiros, reações e leitura;
- notificações, canais, outbox e tentativas;
- CADU, `kc_unit_meta`, limites, convites, auditoria e Helps;
- objetos referenciados e órfãos de avatar, post e chat.

O hard delete é bloqueado se:

- o usuário não existe;
- a conta é o último administrador;
- há erro ou limite excedido no inventário;
- `kc_account_erasure_capabilities()` não retorna versão compatível e todos os flags estritamente `true`;
- a capability não anuncia `encrypted_completion_outbox = true`;
- `KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64` não contém uma chave AES de 32 bytes válida;
- a barreira de escrita não está completamente instalada.

O capability comprova:

- preservação de chat, comunidade e registros de segurança;
- `SET NULL` seguro para CADU e `kc_unit_meta`;
- `write_quiescence = true`;
- redaction transacional dos identificadores de auditoria;
- caixa de saída final criptografada, com CAS de entrega e expurgo por TTL;
- decisão explícita de cópia anterior à exclusão;
- lock compartilhado com a exportação e expurgo comprovado dos artefatos
  temporários;
- cobertura de triggers/policies, pre-request hook do PostgREST e policy global do Storage.

O gate administrativo é bifásico:

- antes da remoção do Auth, nenhuma ação é aceita sem UUID válido no Help, ID
  canônico do DSR e origem de identidade permitida; o handler repete essa
  validação depois de revalidar a sessão administrativa;
- depois da remoção do Auth, Help e DSR podem ter seus `user_id` limpos por FK.
  Nesse estado, etapas pré-core continuam proibidas. Somente diagnóstico,
  recibo e uma finalização recuperável permanecem disponíveis.

No pós-core, `identity_assurance` precisa ter origem em allowlist, prova manual
com canal/hash quando aplicável e coerência com todos os IDs ainda presentes no
Help, DSR, workflow e checkpoint. Fonte desconhecida ou vínculo divergente
falha fechado. `retry_finalize` só aparece depois que o diagnóstico confirma
`auth_deleted` e um `failure_stage` recuperável ou notificação final pendente.

## 5. Etapa reversível

`apply_reversible`:

1. salva uma vez `profile_public`, `contact_cta_enabled` e `social_visibility`;
2. torna o perfil não público e remove o CTA;
3. registra status/visibilidade anterior de cada post no marcador reversível;
4. oculta os posts;
5. envia o pedido de confirmação.

Falha SMTP produz `draft_only`; não produz `sent`. O painel exige referência, data e atestação do envio manual.

`cancel_reversible` restaura somente o snapshot e os posts marcados pelo mesmo workflow. Um cancelamento owner após ocultação deixa o Help em andamento com `reversible_restore_required`; só a restauração administrativa resolve o ticket.

Antes da confirmação irreversível, o painel exige uma das decisões:

- o titular dispensou a cópia;
- uma solicitação de cópia foi concluída com evento `downloaded`;
- houve decisão orientada, cuja referência é persistida apenas como hash.

Uma seleção visual ou texto livre sem essa evidência não satisfaz a barreira.

## 6. Confirmação do titular

O e-mail pede a resposta:

`CONFIRMO A EXCLUSÃO DA MINHA CONTA KINOCAMPUS`

O administrador registra canal, data, referência e atestação. A resposta deve ser posterior à entrega. Depois, digita a barreira:

`EXCLUIR email@dominio`

Nenhuma exclusão pode depender apenas dessa frase digitada pelo administrador; entrega, resposta e vínculo de identidade também são obrigatórios.

## 7. Barreira contra access JWT residual

Ban e exclusão de refresh tokens não invalidam criptograficamente um access JWT já emitido; ele pode continuar válido até `exp`.

Antes da exclusão:

1. a conta recebe ban longo;
2. `kc_revoke_user_sessions_for_erasure` apaga refresh tokens por `user_id` e por IDs das sessões;
3. apaga `auth.sessions`;
4. pós-condiciona zero em ambos;
5. a barreira global rejeita qualquer request autenticado sem sessão ativa;
6. o worker refaz todo o inventário de banco e Storage.

Essa segunda fotografia, feita depois da quiescência, é a única usada para sanitização e pós-condições. A fotografia anterior serve somente para detectar objetos existentes antes do bloqueio.

Edge Functions que recebem JWT e escrevem com service role também precisam consultar sessão ativa antes de usar o cliente privilegiado. O hook PostgREST não protege uma Edge Function que contorna o Data API.

## 8. Storage e cutover do chat

Avatares e mídia de post permanecem no bucket público `KC_STORAGE_BUCKET`, padrão `kino-media`.

Chat deve usar bucket privado `KC_CHAT_STORAGE_BUCKET`, padrão `kino-chat-media`, com path:

`chat-media/{conversationId}/{userId}/{file}`

Durante o cutover, o worker varre e remove `chat-media/...` nos dois buckets:

- privado novo `kino-chat-media`;
- público legado `kino-media`.

Falha de listagem, remoção ou pós-verificação em qualquer bucket é bloqueante. Tornar todo `kino-media` privado não é rollback aceitável porque quebraria avatares e posts. Objetos de chat no bucket público devem ser migrados/removidos.

## 9. Limpeza e preservação

Após ban, revogação e reinventário bloqueado:

- posts viram tombstones sem texto, localização ou mídia pessoal;
- metadata do post não guarda workflow ID, DSR ID nem UUID do usuário;
- comentários preservam thread/curtidas, mas perdem autoria e corpo;
- denúncias preservam motivo/alvo/status, mas limpam `details` e autoria;
- mensagens próprias preservam cronologia com conteúdo, mídia e envelope nulos;
- mensagens de terceiros permanecem;
- reações e leitura do titular são removidas;
- avaliações recebidas permanecem sem `target_user_id`;
- bloqueios recebidos permanecem com token opaco e sem `blocked_id`;
- CADU e `kc_unit_meta` permanecem sem o UUID apagado.

Históricos administrativos não são apagados, mas também não podem conservar o
UUID dentro de JSON. A RPC transacional
`kc_redact_account_audit_identifiers(uuid)` inventaria e trata
`audit_log.payload`, `ad_campaign_audit.snapshot` e
`hero_banner_audit.snapshot` dentro do PostgreSQL. Ela:

- substitui recursivamente somente valores string exatamente iguais ao UUID;
- mantém chaves JSON e textos que apenas contenham o UUID como substring;
- nulifica `actor_id`/`changed_by` quando apontam para o titular;
- troca `audit_log.entity_id` exatamente igual ao titular por UUID operacional
  aleatório, pois a coluna é `NOT NULL`;
- preserva ID do evento, ação, entidade/campanha/banner e timestamp;
- bloqueia as três tabelas, valida cardinalidade e zero residual;
- reverte as três alterações juntas se qualquer etapa ou pós-condição falhar.

O diagnóstico e a pós-condição usam
`kc_account_audit_identifier_inventory(uuid)`; a Edge não baixa a tabela
inteira nem aceita um limite silencioso de linhas. O reparo repete a RPC
idempotente e não gira novamente um pseudônimo já aplicado. A resposta possui
tamanho constante — somente contagens, flags e digest de integridade — e não
retorna nem persiste arrays de IDs em `core_inventory`.

Dados comportamentais/linkáveis são eliminados antes do Auth delete por IDs estáveis:

- `post_view_events`;
- `search_queries`;
- `home_category_affinity`;
- `search_preferences`;
- `privacy_analytics_events`;
- `privacy_consent_events`.

`user_legal_acceptances` é verificado após o cascade do perfil. O inventário guarda os IDs até a conclusão ou reparo e confirma que nenhuma linha permaneceu.

## 10. Ordem irreversível

1. prova de confirmação e claim;
2. CAS DSR para `processing`;
3. workflow `confirmed`;
4. inventário inicial de Storage;
5. ban;
6. revogação comprovada de sessões/refresh tokens;
7. reinventário de banco sob quiescência;
8. aquisição do lock de privacidade e expurgo CAS dos artefatos em
   `kino-data-exports`; uma build com lease ativa retorna `retry_after`. Claims
   novos de exportação assistida são vinculados à sessão administrativa pela
   `20260729006000`; claim anterior com lease viva recebe vínculo somente se
   houver uma sessão ativa inequívoca, e os demais mudam para
   `failed/EXPORT_SESSION_BINDING_MIGRATION_RETRY`;
9. inventário de Storage nos buckets novo e legado;
10. remoção de Storage;
11. sanitização/preservação, redaction transacional dos históricos e eliminação de dados comportamentais;
12. varredura tardia e pós-verificação de Storage;
13. `auth.admin.deleteUser(userId)`;
14. pós-condições por IDs e canário SQL de UUID residual;
15. `partial_failure` até finalizar operadores externos.

Qualquer falha após ban é `partial_failure`. Storage incompleto — inclusive um
artefato de exportação não confirmado como removido — nunca permite Auth delete.

Uma falha de pós-condições depois do Auth delete é reparável:
`retry_finalize` usa `core_inventory` e `repair_target_user_id` temporários para
repetir sanitização, remover objetos e verificar novamente. Esses campos são
removidos na finalização.

Quando o checkpoint prova que o Auth já foi removido, mas o workflow ainda não
consolidou essa verdade, a Edge reconcilia o estado e responde
`retryable = true` e `next_action = retry_finalize`, com erro
`auth_delete_reconciled_retry_finalize_required`. Falhas recuperáveis dentro de
`retry_finalize` mantêm o mesmo contrato. O painel não confia somente nessa
resposta: ele diagnostica novamente e exige coincidência de status,
`failure_stage`, `auth_deleted` e estado de notificação antes de liberar outro
retry.

## 11. Operadores externos e retenções

Os operadores externos são uma etapa obrigatória, não uma observação opcional.

Nenhum operador manual é considerado concluído implicitamente. Cada um recebe:

- `deleted`;
- `retention_documented`;
- `not_applicable`.

`retention_documented` exige base/justificativa e data futura de revisão. O recibo e a mensagem final distinguem eliminação, desidentificação e retenção e apresentam a revisão documentada.

Há uma exceção deliberada para `hostinger_smtp_mailbox`: antes da conclusão e
da entrega do comprovante, o único resultado permitido é
`retention_documented`, com escopo
`pre_completion_and_delivery`, base/justificativa e revisão futura. Marcar esse
provedor como `deleted` nessa etapa seria uma afirmação falsa, porque o envio
final ainda precisa passar pelo SMTP. A revisão posterior dos logs/mailbox deve
seguir a retenção documentada.

A matriz inclui, no mínimo, Supabase (backups/logs), Vercel, Hostinger
(SMTP/mailbox), Resend e Twilio quando configurados, GA4 quando configurado e
o encadeamento Cadu/OpenClaw/Hostinger VPS. Este último é obrigatório porque
as integrações administrativas podem transmitir o UUID do administrador e
manter referências `requested_by`/`resolved_by` fora do banco principal. O
resultado deve ser `deleted`, `retention_documented` (com base e revisão
futura) ou `not_applicable` com referência verificável; ele também aparece no
comprovante final enviado ao titular.

## 12. Finalização e notificação

A ordem correta é:

1. validar todos os operadores;
2. ainda sob o claim e antes de redigir o Help, cifrar o endereço do titular
   com AES-256-GCM e guardar apenas ciphertext/nonce na tabela privada efêmera;
3. transicionar o DSR para `completed`;
4. redigir os Helps exatos;
5. gravar workflow e receipt como `erased`, com `notification_pending = true`;
6. adquirir o claim CAS da entrega, decifrar somente dentro da Edge e enviar;
7. após aceite do SMTP, marcar a entrega e nulificar ciphertext/nonce;
8. somente então remover `notification_pending`.

A chave nunca fica no PostgreSQL: vem de
`KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64`, deve ter 32 bytes e é identificada por
`KC_ERASURE_OUTBOX_KEY_VERSION`. O AAD vincula ciphertext ao workflow, DSR e
versão da chave, impedindo transplante entre pedidos. A tabela
`kc_private.account_erasure_completion_outbox` não concede leitura direta nem
ao `service_role`; somente RPCs com gates de estado podem armazenar, reclamar,
aceitar, liberar ou expurgar.

Uma falha de SMTP não desfaz a verdade da exclusão. O workflow continua
`erased` com `notification_pending`; o claim de entrega que falhou é liberado e
uma recarga permite nova tentativa usando o mesmo destinatário cifrado, sem
exibi-lo ao administrador. Claims simultâneos são recusados. Se o SMTP aceitou
e o banco registrou o aceite, retries observam `accepted` e não reenviam.

Se essa nova tentativa falhar de forma recuperável, a resposta inclui
`retryable: true` e `next_action: "retry_finalize"`. A ação continua bloqueada
quando o diagnóstico não confirma exatamente a mesma pendência; uma indicação
otimista ou um corpo de erro isolado não é autoridade para reenviar.

Existe uma janela inevitavelmente ambígua entre o aceite remoto do SMTP e a
confirmação local no banco. Se o envio retornar sucesso, mas a RPC de aceite
falhar, o worker não libera o claim de entrega: o painel mostra estado ambíguo
e novas tentativas ficam bloqueadas pelo lease de 15 minutos. O operador deve
consultar mailbox/log do provedor sem copiar PII; se a mensagem foi entregue,
registra evidência manual, e só reenvia após comprovar que não houve aceite.

O ciphertext é nulificado imediatamente no aceite e toda linha expira por TTL
(padrão de 6 horas, mínimo de 15 minutos e máximo de 24 horas). O expurgo
horário usa `pg_cron` quando disponível; ausência do agendador deixa alerta
operacional persistente e exige chamar a RPC de purge por rotina externa. Se o
TTL vencer, a RPC também apaga a linha sem lançar uma exceção que reverta o
DELETE. Depois da expiração, não se reconstrói o e-mail a partir de hashes ou
do Help redigido: resta apenas entrega por canal já verificado e registro da
evidência manual completa.

O e-mail usa o protocolo público DSR quando existe, nunca apresenta o workflow UUID como “protocolo público”.

## 13. Recibo, logs e retenção

O recibo não contém e-mail, ciphertext, nonce, chave/versão de chave, claim de
entrega, texto livre de Help, conteúdo de mensagem, token, cookie, IP,
user-agent nem segredo. Pode conter:

- token opaco do titular;
- protocolo;
- datas e status;
- contagens;
- hashes de evidências;
- pós-condições;
- contagens de sessões/refresh tokens;
- resultados e retenções dos operadores;
- aviso honesto sobre access JWT residual.

Logs da Edge não recebem objetos de erro Supabase/provider. Registre apenas estágio/código estável; objetos de erro podem conter query, UUID, e-mail ou response.

O endereço decifrado existe apenas na memória da chamada que entrega a
mensagem. Nem ele nem ciphertext/nonce entram no painel, recibo, auditoria ou
logs. A resposta de redaction dos históricos também possui tamanho constante:
contagens, flags e digest, nunca arrays de IDs.

`account_erasure_requests` possui `retention_until`. Workflows terminais devem ser redigidos/purgados junto da rotina de retenção; workflows `failed`/`partial_failure` vencidos geram alerta e não são apagados silenciosamente.

## 14. Rollback e incidentes

Rollback funcional existe apenas antes de `confirmed`.

Depois de ban/revoke ou qualquer remoção, usa-se retry controlado. Nunca tente “cancelar e restaurar” uma execução irreversível.

Em incidente:

1. não resolva o Help;
2. preserve claim/versão, failure stage e hashes;
3. não copie dados pessoais para notas;
4. corrija capability, guard ou policy;
5. recarregue o Help exato por ID, sem depender do filtro atual da fila;
6. refaça o diagnóstico;
7. se a operação anterior estiver indeterminada, não a repita até confirmar sua
   pós-condição específica;
8. retome apenas a ação permitida;
9. valide pós-condições e operadores;
10. conclua e só depois notifique.

Para incidente na notificação final, diferencie: falha SMTP comprovada (libera
o claim e permite retry), entrega já aceita (não reenviar), claim em andamento
(aguardar), aceite SMTP ambíguo (verificar o provedor antes de reenviar) e
outbox expirada/ausente (entrega manual por canal verificado).
Nunca copie o destinatário ou ciphertext para notas operacionais.

## 15. Rollout e contract diferido

A publicação do conjunto LGPD segue banco **expand** → Edge compatível →
canários/frontend → cópia/verificação → **contract** posterior.

1. faça backup/restauração e inventarie workflows, claims de exclusão, artefatos
   de exportação e leases abertos;
2. aplique as migrations em ordem, inclusive
   `20260729006000_bind_data_export_admin_work_to_session.sql`, sem liberar ações
   destrutivas no painel;
3. confirme `write_quiescence`, coverage de sessão, capabilities, outbox,
   buckets e os caminhos de recovery para claims preexistentes;
4. publique `kc-data-export-admin`, `kc-data-subject-request`,
   `kc-account-erasure` e `kc-data-export-retention` compatíveis;
5. execute canários descartáveis para sessão ativa, revogada e substituída,
   heartbeat, lease vencida, recovery, corrida com cancelamento, purge e retry;
6. publique o frontend, migre/verifique a cópia de chat e observe uso das
   assinaturas transitórias sem registrar PII;
7. revogue assinaturas públicas antigas apenas em migration contract posterior,
   quando a telemetria mostrar ausência de clientes antigos e os claims
   preexistentes tiverem concluído ou sido reconciliados para vínculo
   inequívoco/falha retryable.

Na fase expand, as assinaturas session-bound novas coexistem temporariamente com
cinco wrappers públicos actor-only necessários à Edge anterior. Eles funcionam
somente quando existe exatamente uma sessão administrativa ativa; zero ou
múltiplas sessões falham fechado. Os workers privados permanecem fechados.
Rollback da Edge pode usar essa compatibilidade protegida; não reverta colunas de
claim, não afrouxe guards e não conceda execução direta a `kc_private`.

## 16. Decisão LGPD: preservação de conteúdo de chat gerado por terceiros

Quando o titular pede a exclusão da conta, a estratégia de `kc-account-erasure`
**preserva o conteúdo das conversas de chat** das quais ele participou. Esta
seção registra a base legal e operacional dessa decisão e como auditá-la.

### Por que preservar (e não deletar)

A LGPD (art. 18, VI) garante ao titular o direito de "eliminação dos dados
pessoais tratados com o seu consentimento". Mas o mesmo artigo lista
exceções — entre elas, o cumprimento de obrigação legal/regulatória e o
exercício regular de direitos em processo (art. 16).

Em uma conversa 1:1, cada mensagem é **co-autoria de dois titulares**. A
mensagem "Oi Maria, vamos almoçar?" foi escrita por Pedro; o pedido de
exclusão é de Maria. Apagar a mensagem unilateralmente atenderia Maria, mas
**apagaria expressão de Pedro**, sem o consentimento dele.

A solução adotada é preservar a estrutura da conversa e aplicar redação
(redaction) apenas nos elementos que identificam o titular que pediu a
exclusão. Isso atende:

- O titular que pediu exclusão (seus identificadores sumiram do banco).
- O outro participante (a conversa dele continua íntegra do ponto de vista
  de conteúdo autoral).
- A ANPD, que pode verificar que houve tratamento compatível com a LGPD.

### O que é preservado e o que é redatado

| Elemento | Tratamento | Onde |
|---|---|---|
| Estrutura da conversa | preservada | `public.chat_conversations` |
| `participant_low` / `participant_high` | preservado (aponta para UUID que não existe mais) | idem |
| Conteúdo de mensagens (`content`, `media_path`) | **preservado** — pertence a ambos | `public.chat_messages` |
| Identificadores do titular no `profiles` | redatados | `public.profiles` |
| Identificadores em `audit_log` | redatados | `public.audit_log` |
| E-mail e nome de exibição | redatados | várias tabelas |

A ausência de `FOREIGN KEY` explícita em `chat_conversations.participant_*`
e em `chat_messages.sender_id` é intencional: torna a operação de erasure
**fail-soft**. O titular some do `auth.users` e do `public.profiles`, mas
as conversas onde ele aparece viram **referências históricas**, não órfãs
que quebram queries em CASCADE.

### Como auditar a aplicação dessa decisão

1. Antes de aprovar o pedido, o painel admin consulta
   `public.kc_account_erasure_capabilities()` e checa se
   `chat_preserving_delete === true`. A recusa quebra o pipeline.
2. Após a execução, o relatório de diagnóstico
   (`buildDiagnostics` em `kc-account-erasure/index.ts`) deve listar:
   - `counts.chat_conversations` — conversas onde o titular é participante
   - `counts.chat_messages` — mensagens enviadas pelo titular
   - `counts.chat_messages_third_party` — mensagens do outro participante
3. A checklist de pós-condições
   (`harden_account_erasure_privacy_postconditions.sql`) verifica que
   `chat_preserving_delete` permaneceu `true` durante todo o pipeline.
4. O time de privacidade pode rodar, em staging, um teste com duas contas
   reais (A e B), A conversa com B, A pede exclusão. Após o pipeline, B
   continua vendo a conversa sem avatar/nome do A (porque foram redatados
   em `profiles`), mas com o conteúdo autoral de B intacto.

### Quando reverter a decisão

A decisão pode ser revista se:

- A ANPD emitir orientação vinculante dizendo que o titular pode pedir
  apagamento total mesmo de conteúdo coautorado.
- O outro participante consentir explicitamente (em fluxo opcional).
- O modelo de ameaça mudar (ex.: chat passa a ser E2E encrypted, e o
  servidor não tem mais como preservar o conteúdo do outro).

Qualquer reversão exige migration nova, atualização deste runbook e
republicação do `kc-account-erasure` e do frontend.
