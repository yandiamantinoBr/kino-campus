# Auditoria do fluxo de exclusão de conta — 2026-08-01

## Escopo e método

Esta auditoria cobre o pedido público, a triagem em
`/admin/help-requests.html`, o adapter Supabase, a Edge Function
`kc-account-erasure`, migrations/RPCs, relatório administrativo, envio do
comprovante e gates de deploy. Nenhuma exclusão real, migration remota ou
alteração de secret foi executada durante a análise.

Classificação das afirmações:

- **confirmado**: observado no código, em teste automatizado ou por consulta
  remota somente leitura;
- **inferência**: consequência técnica sustentada pelas evidências, mas sem
  canário destrutivo em produção;
- **manual**: exige decisão ou validação operacional fora do código.

## Resumo executivo

O banco de produção já possui as migrations recentes, mas a Edge Function
`kc-account-erasure` publicada como ACTIVE v19 estava atrasada em relação ao
frontend. A fonte remota era a implementação de 2026-07-08 e não reconhecia o
contrato usado pelo painel atual. Isso podia transformar uma ação legítima em
erro, resultado ambíguo ou falsa impressão de disponibilidade.

O conjunto desta correção introduz três barreiras:

1. handshake de capability/versão antes de cada operação administrativa;
2. versão esperada em cada chamada subsequente, com falha fechada se o runtime
   mudar entre o probe e a mutação;
3. download e inspeção da fonte logo após o deploy, em vez de confiar apenas em
   status ACTIVE e número da versão.

Também foram corrigidos o fechamento prematuro do ticket, o tratamento de falhas
de transporte ambíguas, a persistência de PII em storage do navegador e a
interpretação de `erased`: núcleo excluído não equivale a comprovante entregue.

## Mapa ponta a ponta

| Etapa | Componente autoritativo | Resultado esperado |
|---|---|---|
| 1. Pedido | Help/DSR RPCs e Central de Ajuda | Ticket classificado e protocolo opaco |
| 2. Vínculo | RPC privada session-bound | Mesmo UUID em Help, DSR, workflow e ledger |
| 3. Diagnóstico | Edge + capability v5 | Inventário, bloqueadores e estado atual |
| 4. Ocultação | Edge/RPC CAS | Conteúdo reversível oculto e confirmação solicitada |
| 5. Confirmação | Evidência por canal verificado | Frase/evidência anterior à ação irreversível |
| 6. Exclusão | Edge + operadores + checkpoint Auth | Núcleo removido e workflow `erased/notification_pending` |
| 7. Entrega | Outbox criptografada/SMTP ou evidência manual | Aceite comprovado e `notification_pending=false` |
| 8. Fechamento | Leitura autoritativa no painel | Help pode ser Resolvido/Arquivado e relatório final exportado |

## Achados confirmados e correções

### P0 — runtime remoto divergente

**Evidência:** download somente leitura da função remota mostrou código antigo,
embora o Management API indicasse ACTIVE v19. O frontend já enviava ações que
essa fonte não implementava.

**Correção:** contrato `kc-account-erasure-2026-08-01-v1`, ação administrativa
`capabilities`, `expected_contract_version` obrigatório e readback da fonte no
workflow `.github/workflows/edge-deploy.yml`.

**Estado no momento do achado:** corrigido no repositório, mas ainda bloqueante
até o workflow publicar e o readback remoto comprovar o marcador exato. A
verificação pós-merge que encerrou esse bloqueio está registrada no adendo final
deste documento.

### P1 — resposta de mutação ambígua podia ser tratada como rejeição conhecida

**Evidência:** timeout/falha de rede depois de `apply_reversible` entrava no mesmo
caminho de uma rejeição sem commit. Repetir a mutação podia duplicar efeitos
externos, principalmente e-mail.

**Correção:** falhas de transporte e mudança de contrato após o probe deixam a
operação indeterminada, bloqueiam novas mutações e exigem recarga/diagnóstico
autoritativo. Só a pós-condição específica libera o fluxo.

### P1 — fechamento administrativo antes da entrega final

**Evidência:** `status=erased` comprova a exclusão do núcleo, mas não o aceite do
comprovante. A entrega pode continuar pendente ou retryable.

**Correção:** Resolvido/Arquivado fica bloqueado até cancelamento formal ou até a
leitura confirmar, em conjunto: núcleo apagado, ausência de erro retryable,
`notification_pending=false` e e-mail `sent`/`sent_manual`.

### P1 — dados de tickets no storage do navegador

**Evidência:** o snapshot anterior podia persistir linhas da fila e rascunhos
sensíveis antes da reautorização.

**Correção:** versões antigas são expurgadas. O storage contém somente filtros
não sensíveis e limite de paginação. Linhas, e-mail, assunto, descrição, UUIDs e
busca ficam apenas em memória e só são pintados após revalidar a sessão admin.

### P1 — rascunho público podia perder isolamento e persistir PII além da aba

**Evidência:** a Central de Ajuda salvava assunto, mensagem, e-mail e metadados em
`sessionStorage` e `localStorage`. Na hidratação, o rascunho também podia ser
carimbado depois da troca de `state.user`, atribuindo dados da conta anterior ao
novo escopo. Um snapshot precoce com `account_email` vazio ainda apagava o e-mail
preenchido pela sessão autenticada.

**Correção:** o snapshot ocorre antes de trocar o titular ativo; campo vazio do
snapshot precoce não substitui o e-mail autenticado; rascunhos ficam somente no
`sessionStorage`, e a chave legada em `localStorage` é expurgada sem restauração.
Reload e navegação na mesma aba continuam suportados.

### P1 — materialização de DSR para Help legado autenticado

**Evidência:** documentação/teste antigo afirmavam que zero DSR era aceito apenas
para Help anônimo. A migration
`20260731193000_materialize_dsr_for_authenticated_legacy_help.sql` passou a
cobrir também ticket legado autenticado.

**Correção:** teste pgTAP e documentação agora refletem os dois caminhos, ambos
atômicos e fail-closed diante de múltiplos DSRs.

### P2 — painel mobile denso e orientação desatualizada

**Evidência:** a página não tinha overflow em 390 px, mas campos de identidade e
ações destrutivas ficavam densos. O guia tinha sete etapas e ainda dizia para não
resolver antes da etapa 5.

**Correção:** controles com alvo mínimo de 44 px, ações destrutivas em uma coluna,
metadados/identidade alinhados à esquerda e texto coerente com entrega na etapa 6
e fechamento na etapa 7.

## Segurança e privacidade

- Service role permanece somente na Edge; o browser usa a sessão do admin.
- Toda chamada administrativa valida ator, sessão Auth ativa e autorização.
- O recipient final fica cifrado em outbox privada com AES-256-GCM; o painel não
  recebe plaintext depois da redação.
- A Edge não deve registrar e-mail, UUID alvo, frase de confirmação, ciphertext,
  nonce ou referência bruta.
- O relatório usa protocolo público válido quando existe; não substitui por UUID
  de workflow.
- Diagnóstico pós-core é obrigatório para relatório; ausência de estado
  autoritativo falha fechado, sem fabricar contagens zero.
- O token opaco retido não deve ser descrito como hash reversível do titular.

## Estado remoto observado

Consulta de produção somente leitura em 2026-08-01 encontrou workflows em cinco
estados: 1 cancelado, 2 diagnosticados, 2 apagados e 1 aguardando confirmação.
O item aguardando confirmação existe desde 2026-05-26. Não foram lidos nem
registrados neste documento e-mail, UUID, conteúdo do pedido ou outros dados do
titular.

O workflow antigo exige revisão operacional manual: confirmar se a ocultação
ainda é válida, se houve resposta do titular e se o prazo/processo interno exige
cancelamento ou retomada. Não corrigir com UPDATE manual e não executar exclusão
sem nova verificação de identidade e diagnóstico.

### Verificação pós-merge e bloqueadores de rollout

O merge do contrato iniciou o Edge Deploy `30707467650`, mas o preflight o
interrompeu antes de qualquer publicação. A primeira resposta HTTP 400 parecia
apontar para `cron.job`; a reprodução completa provou que o SQL é válido no
PostgreSQL local e no projeto remoto. A causa era o transporte de aproximadamente
96 KB por variáveis/argumentos do shell. O workflow passou a gerar request e
response em arquivos temporários restritos e a enviar o corpo com
`--data-binary`. A Essential Validation agora executa o mesmo arquivo SQL contra
o Supabase local e valida uma linha composta somente por booleanos.

O Edge Deploy seguinte, `30708599790`, confirmou que o transporte passou a
entregar os 95.886 bytes completos. Ele revelou uma segunda incompatibilidade:
o papel interno do endpoint Management API `/database/query/read-only` não tem
`EXECUTE` na função privada
`kc_data_export_retention_configuration_status(text)`, cuja ACL está
corretamente limitada a `service_role`. Não se ampliou essa ACL. O workflow e o
script manual passaram a usar o CLI vinculado dentro de `BEGIN TRANSACTION READ
ONLY`, mantendo a consulta sem escrita e permitindo que o diagnóstico seguro
retorne somente booleanos. A mesma chamada foi comprovada contra produção e
retornou `data_export_retention_schedule_configured=false`, sem mutação.

O script manual também tinha um bloqueio anterior ao contrato: `db push
--dry-run` tentava reconciliar migrations históricas preservadas no repositório,
mas anteriores ao ledger remoto. As 27 migrations LGPD a partir de
`20260728183022` foram comparadas e estão presentes nos dois lados. O deploy de
Edge deixou de usar o dry-run genérico e continua fechado pelos gates específicos
de histórico obrigatório, schema canônico e secrets. Nenhum `migration repair`,
`db push` ou `--include-all` foi executado; uma eventual reconciliação do
histórico legado deve ser tratada em operação separada e auditada.

A consulta remota somente leitura retornou 88 capacidades: 87 verdadeiras e
`data_export_retention_schedule_configured=false`. O status seguro da automação
confirmou Cron, pg_net, Vault, ACL do Vault e job de monitor presentes, mas
project-ref, endpoint e segredo ausentes; por isso o job de expurgo não existe,
`scheduled=false` e o alerta `EXPORT_RETENTION_SCHEDULE_UNHEALTHY` permanece
ativo. Isso é configuração operacional real, não erro do SQL de preflight.

O inventário de nomes, sem leitura de valores, também encontrou nove secrets de
Edge ausentes:

- `ADMIN_REPORTS_WEBHOOK_URL`;
- `KC_APP_BASE_URL`;
- `KC_DATA_EXPORT_RETENTION_SECRET`;
- `KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64`;
- `KC_NOTIFY_HMAC_SECRET`;
- `KC_PRIVACY_HELP_ALLOWED_ORIGINS`;
- `KC_TURNSTILE_ENVIRONMENT`;
- `KC_TURNSTILE_EXPECTED_HOSTNAMES`;
- `KC_TURNSTILE_SECRET_KEY`.

O preflight continuará falhando fechado e, a partir da correção, executará a
checagem de nomes mesmo quando o contrato de schema falhar. Nenhum secret foi
criado, lido, rotacionado ou alterado durante esta auditoria. A Edge remota de
exclusão continua na versão anterior até que um operador provisione os valores
conforme os runbooks e uma nova execução valide todos os gates.

O snapshot agregado adicional encontrou outbox de conclusão e claims de
notificação vazios, nenhum Help encerrado com exclusão não terminal, nenhum claim
de operação vencido e nenhum outbox vencido. Há três workflows ativos sem DSR
vinculado, um deles aguardando confirmação desde 2026-05-26, e um registro
`erased` legado sem DSR concluído. Esses registros antecedem ou não passaram pelo
fluxo canônico novo e exigem diagnóstico individual; não devem ser corrigidos por
escrita manual no banco.

## Validação realizada

- suite de privacidade: 7 suites, 153 testes;
- adapter Supabase: 49 testes;
- cenários de transporte/resultado ambíguo: 14 testes;
- sete arquivos pgTAP de exclusão: 183 asserções após sincronizar migrations
  locais, incluindo ponte de Help, recovery Auth, auditoria, leases, outbox,
  vínculo e pós-condições;
- `supabase db lint --local --level error` sem erro de schema;
- `deno check` da Edge Function;
- higiene, estrutura e `git diff --check`;
- reprodução visual desktop e mobile com ticket sintético;
- mobile a 390 x 844 sem overflow horizontal e com ações LGPD acessíveis;
- inspeção do `sessionStorage`/`localStorage` confirmou ausência do e-mail e do
  conteúdo do ticket sintético.

Os comandos completos devem ser repetidos no commit final e no CI. Testes locais
não substituem o canário remoto pós-deploy.

O `deno check --no-lock --node-modules-dir=none` usado pelo CI passa. O lint Deno
irrestrito ainda encontra 78 ocorrências legadas (principalmente `any`, imports
por URL, `require-await`, símbolos antigos não usados e `prefer-const`). O lint
das demais regras passa quando essas cinco categorias conhecidas são excluídas.
Essa limpeza deve ser feita em refatoração própria, com tipagem e testes por
blocos; não é seguro misturá-la ao rollout de contrato e entrega.

## Rollout seguro

1. integrar o commit somente com Essential Validation verde;
2. deixar o Edge Deploy executar o preflight remoto de schema/secrets;
3. confirmar deploy de `kc-account-erasure` e readback do marcador de contrato;
4. consultar `capabilities` com uma sessão administrativa de teste;
5. validar `diagnose` somente leitura em ticket sintético;
6. testar o ciclo completo apenas com conta descartável e dados descartáveis;
7. confirmar relatório, SMTP/outbox, não reenvio e fechamento do Help;
8. revisar manualmente o workflow antigo pendente;
9. só então liberar operação real normal.

## Critérios de parada

Interrompa o rollout se ocorrer qualquer um destes casos:

- marcador remoto diferente ou ausente;
- capability abaixo de v5 ou qualquer gate crítico falso;
- secret obrigatório ausente;
- `diagnose` expõe PII em log/resposta além do contrato;
- fechamento permitido com `notification_pending=true`;
- retry após resposta ambígua sem diagnóstico autoritativo;
- divergência entre Help, DSR, Auth, workflow ou sessão do administrador.

## Pendências não resolvidas por código

- revisão humana do workflow pendente desde maio;
- canário destrutivo somente em conta descartável após o deploy;
- confirmação do recebimento real no provedor SMTP sem copiar PII para logs;
- decisão formal de governança/DPO e prazos de atendimento;
- monitoramento periódico de workflows parados em
  `pending_confirmation`, `partial_failure` ou `notification_pending`.

## Adendo operacional posterior: deploy por divergência de fonte

A afirmação histórica acima de que qualquer secret operacional ausente deveria
bloquear todo o Edge Deploy foi substituída depois que o comportamento global
do workflow foi auditado. Esse gate impedia a atualização do próprio código
fail-closed e deixava a Edge remota de exclusão em contrato anterior.

O contrato atualizado continua bloqueando migrations, schema, ACLs,
`verify_jwt` e fonte remota inconsistentes. Prontidão de runtime passa a ser
reportada por função, sem ativar o recurso: sem
`KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64`, a exclusão continua bloqueada pela Edge.
O desenho, as evidências e o rollback estão documentados em
`docs/ops/edge-deploy-source-drift-and-readiness-2026-08-01.md`.

## Verificação pós-merge final — 2026-08-01

O PR `#789` foi integrado no commit
`56aa62f03f916daddf2ba2f363dda7183bbfa937`. A Essential Validation
`30711115214` e o Edge Deploy `30711238944` terminaram com sucesso. A seleção
comparou as 15 Edge Functions locais com as fontes remotas: nove divergentes
foram publicadas e seis já sincronizadas não foram republicadas.

`kc-account-erasure` ficou `ACTIVE` na versão 20, com `verify_jwt=true`. O job
baixou novamente a fonte implantada, comparou o arquivo e suas dependências
alcançáveis com o commit validado e confirmou o marcador
`kc-account-erasure-2026-08-01-v1`. Os assets críticos de
`/admin/help-requests.html` servidos pela Vercel também correspondem ao merge; o
HTML recebe apenas a substituição esperada dos sufixos de cache pela SHA.

Permanecem três bloqueios operacionais explícitos e fail-closed:

- `KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64` ausente: nenhuma exclusão irreversível
  pode avançar até a chave ser provisionada pelo procedimento operacional;
- `ADMIN_REPORTS_WEBHOOK_URL`, `KC_APP_BASE_URL` e `KC_NOTIFY_HMAC_SECRET`
  ausentes: o alerta de limiar não envia webhook;
- `data_export_retention_schedule_configured=false`: o agendamento automático
  de retenção ainda precisa ser configurado e validado.

Esses avisos não representam falha de deploy e não foram contornados. Nenhum
secret foi lido ou alterado, nenhuma migration foi aplicada e nenhum canário
destrutivo foi executado nesta verificação.
