# Direitos do titular: acesso, cópia, portabilidade e exclusão

**Versão operacional:** 2026-07-29
**Escopo:** interface pública, Central de Ajuda, API, Supabase, atendimento
administrativo e provedores técnicos do KinoCampus.

Este documento é o contrato canônico para solicitações relativas aos dados de uma
pessoa. Ele separa três operações que não devem ser tratadas como sinônimos:

1. `data_access_copy`: confirmação de tratamento e cópia eletrônica dos dados
   pessoais associados à conta;
2. `data_portability`: pedido de portabilidade, sujeito ao escopo, formato,
   padrões disponíveis e proteção de dados de terceiros;
3. `account_erasure`: encerramento da conta e eliminação ou anonimização dos dados
   aplicáveis, com confirmação antes da etapa irreversível.

O exercício desses direitos é gratuito. Um pedido autenticado ou cuja identidade
já foi verificada produz um protocolo não sequencial e rastreável. O formulário
público da Central de Ajuda produz primeiro uma referência de atendimento; ele
não deve afirmar que um protocolo de titular foi aberto antes da verificação.

## Pontos de entrada públicos

| Situação | Caminho principal | Alternativa |
|---|---|---|
| Pessoa autenticada | `settings.html#settingsPrivacyData` | Central de Ajuda |
| Pessoa sem acesso à conta | `ajuda.html#dados-e-privacidade` | `contato@kinocampus.com.br` |
| Cópia eletrônica | ação autenticada nas Configurações | `ajuda.html?request=data_access_copy#helpRequestForm` para recuperação de acesso/verificação |
| Portabilidade | ação autenticada nas Configurações | `ajuda.html?request=data_portability#helpRequestForm` para recuperação de acesso/verificação |
| Exclusão | ação autenticada nas Configurações | `ajuda.html?request=account_erasure#helpRequestForm` para recuperação de acesso/verificação |
| Dados permitidos somente deste navegador | seção `browser_local_data` da cópia em `settings.html#settingsPrivacyData` e controle local | incluídos apenas no navegador atual; tokens, credenciais e dados possivelmente pertencentes a outra conta são excluídos |

Parâmetros de URL só podem selecionar um `request_kind` conhecido. Nome, e-mail,
mensagem, token, protocolo ou qualquer outro dado pessoal não pode ser aceito por
query string.

O formulário é o canal preferencial e `contato@kinocampus.com.br` é o fallback
formal de privacidade. `ajuda@kinocampus.com.br` permanece como suporte comum.
WhatsApp não deve receber pedido formal, documento de identidade, pacote de
exportação ou evidência sensível.

### Governança do encarregado

As páginas públicas identificam o controlador operacional e oferecem canal para
o titular, mas o repositório não prova uma decisão organizacional sobre
encarregado. Antes de declarar conformidade, é necessário formalizar e arquivar
uma das alternativas:

- ato de indicação do encarregado, com identidade e contato publicados de forma
  clara e coerente em Privacidade, Transparência e Central de Ajuda; ou
- enquadramento documentado como agente de tratamento de pequeno porte
  dispensado de indicação, mantendo o canal de comunicação exigido.

Não inferir cargo a partir do nome do controlador nem publicar uma pessoa sem ato
formal. A Resolução CD/ANPD nº 18/2024 disciplina a divulgação quando houver
encarregado; a Resolução CD/ANPD nº 2/2022 prevê dispensa para certos agentes de
pequeno porte, sem eliminar o dever de canal.

## Contrato de solicitação

`data_subject_requests` mantém somente o necessário para protocolo, estado,
idempotência, titularidade e auditoria. O pacote de exportação não deve ser salvo
nessa tabela.

Estados permitidos:

| Estado | Significado |
|---|---|
| `received` | pedido protocolado e ainda não processado |
| `processing` | geração ou análise em andamento |
| `ready` | cópia disponível durante a janela informada |
| `pending_confirmation` | exclusão aguardando confirmação verificada |
| `completed` | atendimento concluído e comprovante emitido |
| `cancelled` | cancelado antes da etapa irreversível |
| `failed` | falha sem efeito parcial confirmado |
| `partial_failure` | parte foi executada e ainda existem pendências |
| `expired` | janela de download ou continuidade expirada |

Regras:

- o servidor deriva `user_id` e e-mail da sessão validada; esses valores nunca são
  confiados ao corpo enviado pelo navegador;
- depois que um atendimento é vinculado, o UUID comum a Help, DSR, workflow ou
  artefato e Auth é a autoridade sobre o titular. E-mail, texto livre e
  `metadata.account_email` deixam de selecionar a conta;
- se o endereço da mesma conta mudar, o servidor relê o Auth pelo UUID,
  revalida Help/DSR/workflow e só então sincroniza explicitamente o e-mail
  operacional. O fluxo não depende de salvar triagem ou de outra atualização
  incidental do Help;
- o formulário registra o estado Auth observado antes do envio. Se uma conta
  entrar, sair ou mudar até a gravação, adapter e RPC rejeitam a operação sem
  criar Help ou DSR. Pedidos iniciados como visitante permanecem sem `user_id`
  mesmo quando o provedor usa um usuário Auth anônimo;
- a mesma chave idempotente não pode abrir pedidos duplicados para o mesmo titular
  e finalidade;
- a interface conserva a chave ainda pendente em um namespace de
  `sessionStorage` exclusivo da conta e do tipo de direito, até receber uma
  resposta definitiva. Assim, uma perda de resposta seguida de recarregamento
  repete a operação original, enquanto troca ou limpeza de outra conta não
  sobrescreve esse retry;
- uma listagem vazia, paginada ou que mostre apenas pedidos terminais nunca é
  tratada como prova para apagar essa chave. A interface só a gira quando o
  backend devolve o pedido terminal da combinação exata
  titular/tipo/chave com `reused_existing: true` e
  `reuse_reason: "idempotency_key"`; a nova tentativa usa outra chave e nunca
  reabre a linha terminal;
- “Limpar dados deste navegador” fica desabilitado e também recusa disparos
  programáticos enquanto uma criação ou um download de protocolo estiver em
  andamento. Isso impede que a chave de retry seja removida entre o envio e a
  resposta;
- refresh, download e e-mails de segurança guardam a geração e a conta de
  origem. Uma resposta tardia de outra conta não altera status, botões ou dados
  da conta atual, e ações duplicadas são serializadas;
- preferências explícitas de busca e afinidade consentida usam namespaces de
  `localStorage` separados por conta. O slot sem sufixo permanece exclusivo do
  modo visitante e nunca é adotado silenciosamente por uma conta, pois não há
  prova de titularidade;
- a seção local da cópia autenticada inclui apenas o namespace de busca da conta
  atual, rascunhos vinculados a ela e configurações neutras allowlisted. Filas,
  marcadores técnicos e afinidades globais possivelmente compartilhadas por
  várias pessoas no dispositivo são excluídos;
- sob o lock do titular, o servidor devolve o pedido aberto canônico compatível,
  mesmo quando um cliente perdeu a chave local, em vez de criar fluxos paralelos;
- alterações de estado são monotônicas e precisam registrar horário e ator;
- `ready` não pode regredir para `received`;
- `completed` e `cancelled` são terminais;
- a expiração do download não apaga ou altera o protocolo;
- o driver local/offline nunca cria uma referência fictícia para acesso, cópia,
  portabilidade ou exclusão e não persiste o conteúdo desses pedidos no
  navegador; sem backend seguro, a interface informa que o envio não ocorreu;
- o identificador persistido do titular deve ser pseudônimo e não pode conter
  e-mail cru;
- pedidos que precisam de atendimento humano devem criar ou vincular um
  `help_request` estruturado, nunca um ticket órfão.

### Vinculação entre atendimento e protocolo

- quando o formulário é enviado com sessão válida, ticket e solicitação do
  titular são criados ou reutilizados na mesma operação transacional;
- quando não há sessão, o sistema guarda apenas a referência de atendimento e os
  dados mínimos de contato necessários. O operador verifica a identidade antes
  de executar a vinculação segura;
- o vínculo usa identificadores internos e `request_kind` estruturado. E-mail ou
  texto livre não podem ser usados como única prova de titularidade;
- no vínculo administrativo inicial, o e-mail verificado pode localizar uma
  conta Auth única, mas a transação precisa gravar e confirmar o mesmo UUID em
  Help, DSR e workflow/artefato. Depois disso, somente essa tupla é autoridade;
- se já existir solicitação ativa compatível, a operação a reutiliza de forma
  idempotente em vez de abrir protocolos paralelos;
- depois da vinculação, a interface pode apresentar protocolo e andamento ao
  titular autenticado. A referência do Help Desk continua distinta e não deve
  ser renomeada retroativamente como protocolo.

Depois da remoção do Auth, FKs podem limpar os `user_id` públicos. Isso não
autoriza novo vínculo. A recuperação usa a prova armazenada somente quando sua
origem pertence à allowlist e todos os IDs ainda disponíveis em Help, DSR,
workflow e checkpoint são coerentes. Fonte forjada ou vínculo divergente falha
fechado.

## Conteúdo da cópia eletrônica

O pacote usa JSON UTF-8, versão explícita de schema e `Cache-Control: no-store`.
Ele deve conter:

- `manifest`: versão, protocolo, finalidade, horário, categorias, contagens,
  avisos, categorias indisponíveis e motivos;
- `subject`: dados seguros da conta e datas relevantes de autenticação, sem
  credenciais, tokens, segredos ou metadados administrativos;
- `data`: conjuntos de dados próprios, separados por categoria;
- `media_manifest`: caminhos ou URLs das mídias próprias, com tipo e origem;
- `retention_disclosures`: dados não elimináveis imediatamente, fundamento
  operacional ou legal e próxima providência;
- `third_party_boundaries`: decisões aplicadas para impedir vazamento de dados de
  outras pessoas.

O download não inclui chave pública ou administrativa, JWT, refresh token,
cookie, segredo de integração, IP bruto, resposta de provedor, anotação interna de
moderador, configuração administrativa, conteúdo privado de outra pessoa ou
envelope criptográfico de terceiro.

### Limites e suplemento assistido

A entrega direta tem limites explícitos de linhas, bytes de origem e tamanho
final. O limite de anexos assinados controla apenas quantas URLs privadas são
emitidas; ele não pode reduzir a quantidade de mensagens de texto coletadas.
Quando uma categoria é truncada, fica indisponível, excede o orçamento ou exige
revisão humana, o arquivo declara `partial_manual_supplement_required`, o pedido
fica em `partial_failure` e o ticket permanece `in_progress`.

Nesse caso, o mesmo protocolo recebe um artefato assistido no bucket privado
`kino-data-exports`. O nome do objeto é aleatório e não contém e-mail, protocolo
ou UUID. Metadados privados guardam apenas referência opaca, hash SHA-256,
tamanho, formato, manifesto operacional sem PII, versão CAS e expiração. O
artefato só muda para `ready` quando:

- nenhuma categoria da coleta ampliada está truncada ou indisponível;
- nenhum limite de origem foi esgotado;
- todos os operadores manuais da matriz compartilhada têm evidência mínima
  registrada por hash;
- upload, tamanho e hash foram verificados.

A existência desse fluxo não representa promessa de completude automática
global. Se uma fonte ou operador não oferece extração segura, o atendimento
continua aberto, informa a limitação e não muda para `completed`. A conclusão
ocorre apenas depois de uma sessão ativa do próprio titular reservar, receber e
validar o artefato integral.

O titular pode cancelar uma exportação enquanto ela for reversível, inclusive
quando estiver em `partial_failure`. O cancelamento invalida a capacidade de
download, leva o objeto privado ao fluxo de expurgo por versão CAS e mantém a
falha de limpeza visível e retryable. O sistema não declara o objeto removido
antes da confirmação do Storage.

Uma exclusão de conta ativa prevalece sobre qualquer entrega de exportação:
download direto, complemento assistido e novo download ficam bloqueados no banco
e não são apresentados como disponíveis na interface. Para voltar a receber uma
cópia, o titular deve cancelar a exclusão enquanto ela ainda estiver reversível,
atualizar os protocolos e reutilizar ou reabrir a solicitação de acesso ou
portabilidade. Depois do claim irreversível ou do encerramento da conta, não se
reativa uma capacidade de download; o atendimento fornece apenas o comprovante
mínimo compatível com a etapa já executada.

Um suplemento entregue continua fisicamente disponível até `expires_at` para os
novos downloads prometidos. A retenção automática comum não pode antecipar esse
prazo com base apenas em `delivered_at`. O expurgo coordenado por uma exclusão
confirmada é uma exceção deliberada e remove os artefatos antes de apagar ou
anonimizar a conta.

## Matriz de dados

| Categoria/tabelas | Cópia do titular | Tratamento na exclusão |
|---|---|---|
| `auth.users`, `auth.identities`, `profiles` | campos cadastrais e datas seguras; nunca token ou segredo | apagar quando não houver dependência compartilhada; caso contrário, pseudonimizar, remover contato/metadados e bloquear acesso |
| `posts`, `post_media` | publicações próprias e manifesto de mídia | remover mídia e dados pessoais; preservar apenas um shell oculto/redigido quando apagar a linha destruir conteúdo de terceiro |
| `comments`, `comment_likes`, `post_votes` | conteúdo e interações criados pelo titular | eliminar conteúdo/interações próprios |
| `saved_posts` | referências salvas pelo titular | eliminar |
| `reports` | denúncias feitas pelo titular, sem notas internas | eliminar ou desidentificar conforme necessidade de segurança/exercício de direitos |
| `user_ratings` | avaliações próprias; avaliações recebidas com identidade de terceiro protegida | eliminar vínculos pessoais; registrar eventual retenção de segurança |
| `user_blocks` | bloqueios criados pelo titular, com identificadores de terceiros minimizados | eliminar vínculos |
| `chat_messages`, `chat_reactions`, `chat_read_state` | somente conteúdo, reação e estado próprios | remover conteúdo/mídia próprios; nunca apagar mensagem pertencente ao outro participante |
| `chat_conversations` | identificador e datas mínimos das conversas do titular; sem preview ou conteúdo de terceiro | preservar integridade de dados de terceiro por anonimização do participante quando o `CASCADE` tornar a exclusão rígida destrutiva |
| `notifications`, `notification_preferences`, `notification_channel_targets` | notificações e escolhas próprias; destino privado apenas para o próprio titular | eliminar |
| `notification_delivery_outbox`, `notification_delivery_attempts` | não exportar resposta interna de provedor | eliminar ou desidentificar; pendência de provedor deve aparecer no comprovante |
| `search_preferences`, `home_category_affinity` | preferências e afinidades do titular | eliminar |
| preferências, consentimentos, afinidades e rascunhos locais da conta | seção `browser_local_data`, gerada no próprio navegador; preferências de busca também têm arquivo específico | removidos pelo controle “Limpar dados deste navegador”, exceto durante criação/download de protocolo; sessão de autenticação não é apagada por esse controle |
| `privacy_consent_events` | histórico de escolhas associado ao titular | desidentificar ou eliminar conforme base e necessidade de prova |
| `privacy_analytics_events`, `post_view_events`, `search_queries` | somente eventos efetivamente vinculados à conta; dados agregados ou já desvinculados são descritos no manifesto | remover vínculo; dados realmente anonimizados deixam de ser dados pessoais |
| `user_legal_acceptances` | versões e horários de aceite | resumir no comprovante e conservar somente o mínimo justificável, quando necessário |
| `help_requests` | mensagem e andamento próprios, sem nota/decisão interna de terceiros | redigir e-mail, mensagem, assunto e metadados pessoais; preservar protocolo mínimo quando necessário |
| `data_subject_requests`, `account_erasure_requests` | protocolos e estados visíveis ao titular enquanto autenticado | manter comprovante pseudônimo e mínimo; nunca manter e-mail cru |
| `kc_invited_emails` | convite relativo ao e-mail atual, quando encontrado | apagar ou redigir o e-mail |
| limites pessoais de publicação | limites aplicados ao titular, quando relevantes | eliminar; registros criados pelo titular como administrador exigem análise separada |
| `audit_log` e auditorias administrativas | não expor payload ou dados de outros usuários em download automático | remover vínculo direto e redigir dado pessoal; conservar somente quando houver fundamento de auditoria/exercício de direitos |
| preferências e configurações administrativas | somente quando forem dados pessoais do titular e após análise | conta administrativa exige segundo operador e plano de continuidade; não executar exclusão rígida automaticamente |

## Fluxo de exclusão

```text
pedido protocolado
  -> diagnóstico sem mutação
  -> verificação de titularidade
  -> envio da confirmação
  -> confirmação registrada com evidência hash
  -> restrições reversíveis
  -> decisão registrada sobre receber ou dispensar uma cópia
  -> nova verificação técnica
  -> claim transacional e idempotente
  -> bloqueio coordenado de novas exportações
  -> expurgo confirmado dos artefatos temporários de exportação
  -> eliminação ou anonimização por categoria
  -> revogação de sessões e bloqueio/remoção da conta
  -> verificação pós-operação
  -> comprovante e comunicação de conclusão
```

Invariantes:

- mencionar “LGPD” em texto livre não classifica um pedido como exclusão;
- o classificador usa primeiro `metadata.request_kind === "account_erasure"` e o
  subtipo canônico; texto livre é apenas fallback conservador;
- a frase digitada pelo operador é uma proteção operacional, não prova da vontade
  do titular;
- a confirmação precisa de canal, horário, evidência hash e operador que a
  registrou;
- a execução irreversível exige estado `confirmed`, claim transacional e versão
  esperada;
- a etapa irreversível exige uma preferência explícita de cópia: dispensa,
  download comprovado ou decisão orientada registrada somente por referência
  hash;
- exportação e exclusão usam o mesmo lock por titular. Uma lease ativa de
  exportação bloqueia temporariamente a exclusão; a exclusão, ao obter o lock,
  impede novo upload;
- artefatos de `kino-data-exports` são apagados e confirmados antes da limpeza de
  banco e Auth;
- chamadas repetidas retornam o mesmo resultado ou estado; não repetem efeitos;
- uma resposta perdida depois de mutação é reconciliada pela leitura exata do
  Help e por diagnóstico/pós-condição específica. Se o commit não puder ser
  comprovado, novas mutações ficam bloqueadas até recarga e diagnóstico;
- uma falha em Storage, Auth, banco ou provedor impede o estado `completed`;
- efeitos parciais produzem `partial_failure`, lista de pendências e instrução de
  retomada;
- quando o Auth delete já foi comprovado e a finalização ainda é recuperável, a
  resposta informa `retryable: true` e `next_action: "retry_finalize"`. O painel
  só libera esse retry depois que um diagnóstico confirma o mesmo status,
  `failure_stage`, `auth_deleted` e pendência de notificação;
- a geração de comprovante nunca regride o estado da solicitação;
- nenhuma função de diagnóstico pode ocultar publicação, remover mídia, enviar
  confirmação ou alterar a conta;
- nenhuma ação marcada `draft_only` pode mudar estado ou enviar comunicação real;
- contas administrativas, FKs `RESTRICT`/`NO ACTION` e conteúdo compartilhado
  exigem tratamento específico e falham fechado quando não houver caminho seguro.

## Sessões e autenticação

Excluir `auth.users` não invalida imediatamente um access token JWT já emitido.
Antes de remover ou pseudonimizar a conta, o processo deve:

1. revogar as sessões e refresh tokens do titular;
2. bloquear novas autenticações;
3. remover objetos de Storage pertencentes ao titular antes de `deleteUser`;
4. registrar no comprovante que o JWT já emitido só deixa de ser aceito ao expirar;
5. evitar políticas que autorizem operação sensível apenas pela assinatura do JWT
   sem confirmar a existência atual do usuário/sessão.

## Provedores e retenção técnica

| Provedor | Possível dado | Procedimento |
|---|---|---|
| Supabase | conta, banco, Storage, logs e backups | automatizar banco/Auth/Storage; declarar ciclo residual de logs/backups |
| Vercel | logs de acesso e execução | registrar verificação/limitação operacional; não prometer eliminação seletiva inexistente |
| Hostinger SMTP | e-mail de confirmação e atendimento | concluir comunicação e aplicar política da caixa postal |
| Resend | entrega de notificação por e-mail, quando configurada | criar pendência de provedor quando houver dado identificável |
| Twilio | destino e entrega de WhatsApp, quando configurado | criar pendência de provedor quando houver dado identificável |
| Google Analytics 4 | User-ID pseudônimo e eventos consentidos | registrar o pseudônimo e a providência disponível; não confundir pseudonimização com anonimização |
| Google AdSense | cookies/eventos conforme consentimento e controles Google | informar o limite de controle e a escolha de consentimento |
| Google Search Console | dados agregados da descoberta pública | normalmente não vinculado à conta KinoCampus |
| Cadu/OpenClaw no VPS | conta técnica confiável, jobs, logs e conteúdo publicado automaticamente | usuários comuns não devem ter dados copiados para esse runtime; verificar logs/filas e registrar ausência ou pendência. Para a conta técnica, rotacionar credenciais, retirar a allowlist e preservar continuidade sem exportar segredos |

Um provedor pendente mantém o pedido em `partial_failure` ou com pendência explícita
até que o operador registre o desfecho. Não se declara exclusão externa sem
evidência. Para cópia/portabilidade, um operador manual ou potencialmente ligado
à conta também impede a conclusão automática até que os dados tenham sido
fornecidos ou que a ausência de dados daquela conta esteja documentada.

## Atendimento e prazos

- confirmação de existência ou acesso simplificado: imediatamente quando for
  tecnicamente possível;
- declaração completa de acesso: até 15 dias do requerimento, conforme o art. 19
  da LGPD;
- exclusão e portabilidade: o protocolo informa andamento, verificações,
  dependências, eventual impedimento e previsão operacional; o prazo de 15 dias
  não deve ser apresentado como prazo universal dessas operações;
- impossibilidade de atendimento imediato: comunicar as razões de fato ou de
  direito;
- antes da etapa irreversível: permitir cancelamento pelo mesmo protocolo.

## Operação administrativa

1. localizar o pedido pelo protocolo;
2. conferir o `request_kind` estruturado e não apenas o texto;
3. executar diagnóstico;
4. conferir ou criar o vínculo seguro entre a referência do atendimento e o
   protocolo;
5. oferecer cópia antes da exclusão e registrar a escolha explícita;
6. enviar confirmação ao canal verificado;
7. registrar somente a evidência mínima, preferencialmente hash;
8. aplicar restrições reversíveis;
9. revisar riscos de chat, conteúdo de terceiros, Storage, conta administrativa e
   provedores;
10. obter claim idempotente, purgar artefatos de exportação e executar;
11. verificar contagens e pendências;
12. gerar e enviar comprovante final;
13. redigir dados pessoais do ticket e manter apenas o registro necessário.

Se qualquer resposta administrativa for interrompida, não repita a ação. O
painel deve reler o ticket exato por ID, sem depender de filtros/paginação, e
executar diagnóstico seguro. Pós-condição confirmada encerra a tentativa sem
duplicar efeitos; resultado indeterminado bloqueia mutações até recarga e nova
leitura. No pós-core permanecem somente diagnóstico, recibo e
`retry_finalize` comprovadamente recuperável. Para suplemento de cópia depois
da remoção da conta, o modo cleanup-only permite apenas expurgo elegível.

Toda operação administrativa usa o ator e a sessão validados. Claims de exclusão
persistem `operation_claim_session_id`; claims novos de exportação assistida
persistem `claimed_session_id` a partir da `20260729006000`. Logout, revogação,
demissão administrativa ou substituição da sessão impedem a continuação; outra
sessão do mesmo usuário não herda a lease.

Claims de exportação anteriores ao vínculo de sessão não recebem
`claimed_session_id` manualmente. A `06000` vincula somente claim com lease viva
e uma sessão ativa inequívoca; os demais mudam para
`failed/EXPORT_SESSION_BINDING_MIGRATION_RETRY`. Uma continuação concorrente só
pode fazer o bind sob CAS do mesmo artefato, versão, token, status e lease.

## Rollout dos contratos LGPD

Use a sequência **banco expand → Edge compatível → canários/frontend →
cópia/verificação → contract diferido**:

1. inventarie DSRs, Helps, workflows, claims, leases e artefatos preexistentes;
2. aplique as migrations em ordem até
   `20260729012000_bridge_anonymous_help_to_erasure_dsr.sql`;
3. valide guards, capabilities, a reconciliação inequívoca/falha retryable dos
   claims preexistentes e os oito wrappers actor-only necessários às Edges
   anteriores, que devem aceitar somente uma sessão ativa exata; valide também
   zero DSR materializado uma vez, um DSR reutilizado e múltiplos DSRs rejeitados
   sem gravação parcial;
4. publique as Edge Functions compatíveis e execute canários de sessão ativa,
   revogada e substituída, rotação de e-mail com UUID constante, fonte pós-core
   válida/forjada, resposta perdida depois de commit, idempotência, lease
   vencida, recovery e purge;
5. publique o frontend, reconcilie a cópia das páginas, migre/verifique anexos e
   confira buckets, Vault, schedules, limites e telemetria minimizada;
6. remova assinaturas públicas antigas apenas em migration contract posterior,
   depois que a telemetria demonstrar ausência de consumidores e claims antigos.

Na fase expand, zero ou múltiplas sessões administrativas fazem o wrapper legado
falhar fechado, e os workers privados permanecem fechados. Não produza uma
janela quebrada entre banco e Edge e não transforme o contract diferido em
comando manual ad hoc.

A entrega de operador externo é descrita como `supplied_out_of_band`: exige
atestado, canal enumerado e horário, e o JSON declara explicitamente
`content_in_export=false`. O navegador nunca envia bundle, registros ou payload
do operador. O suplemento privado é armazenado temporariamente até `expires_at`;
depois da primeira entrega pode ser baixado novamente dentro dessa janela. A
reserva expirada restaura `delivered`, e mídias são limitadas a 100 referências
assinadas em lote por bucket.

## Segurança e validação

- RLS habilitada em toda tabela pública nova;
- `anon` sem leitura ou escrita de solicitações;
- `authenticated` lê apenas pedidos cujo `user_id = auth.uid()`;
- criação e transições sensíveis passam por RPC/Edge Function validada;
- grants explícitos e mínimos;
- `service_role` existe somente no servidor;
- Edge Functions repetem a validação de autenticação mesmo com
  `verify_jwt = true`;
- CORS usa allowlist de origens;
- exportações usam `no-store` e nunca são registradas em log;
- testes cobrem acesso cruzado, ausência de sessão, replay, rate limit, transições
  inválidas, proteção de dados de terceiros e falha parcial;
- migrations são reconstruídas e testadas em Supabase local antes de produção;
- advisors de segurança e desempenho são comparados antes e depois da migration.

## Referências

- [LGPD — Lei nº 13.709/2018, arts. 16, 18 e 19](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
- [ANPD — denúncia e petição de titular](https://www.gov.br/anpd/pt-br/canais_atendimento/cidadao-titular-de-dados/denuncia-peticao-de-titular-referente-lgpd)
- [ANPD — regulamentações, incluindo a Resolução CD/ANPD nº 18/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd)
- [ANPD — Resolução CD/ANPD nº 2/2022, agentes de tratamento de pequeno porte](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- [Supabase — gerenciamento, exclusão e exportação de usuários](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase — sessões de usuário](https://supabase.com/docs/guides/auth/sessions)
