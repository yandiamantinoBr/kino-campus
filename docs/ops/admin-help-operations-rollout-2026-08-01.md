# Operação administrativa de pedidos de ajuda - 2026-08-01

## Escopo e estado

Este registro consolida o funcionamento de `/admin/help-requests.html`, suas
integrações com Supabase, Moderação, Cadu/OpenClaw e os workers de privacidade.
Ele complementa os runbooks LGPD; não substitui a matriz de cobertura nem
autoriza exclusões destrutivas de teste.

As afirmações abaixo são separadas em:

- **observado**: confirmado no código, schema ou produção;
- **implementado**: alteração versionada neste rollout;
- **pendente**: depende de merge, deploy ou decisão operacional posterior.

## Diagnóstico observado antes da correção

- A fila tinha 98 tickets, dos quais 64 ainda apareciam como `new`.
- Cinquenta e seis solicitações de acesso externo já tinham decisão e entrega
  concluída, mas continuavam como `new` no Help genérico.
- A causa era contratual: `kc_complete_external_access_delivery(...)`
  persistia o resultado do e-mail, porém não reconciliava `help_requests.status`.
- Os cards exibiam somente 25 itens e os indicadores eram calculados sobre a
  página carregada, não sobre todo o filtro.
- A triagem escrevia diretamente em `help_requests`, sem evento de auditoria e
  sem impedir que duas sessões administrativas sobrescrevessem uma à outra.
- O estado de decisão/entrega de acesso externo existia no banco, mas não era
  mostrado na fila principal.
- A análise no Cadu exigia copiar manualmente contexto e podia incentivar o
  transporte desnecessário de dados pessoais.

Também foram encontrados tickets históricos adicionais associados ao mesmo
protocolo DSR. Eles foram enviados manualmente depois do pedido canônico e não
possuem prova de idempotência. Não foram apagados ou mesclados: o vínculo é
mantido para revisão humana. As fachadas atuais já aplicam idempotência a novos
pedidos.

## Fluxo consolidado

### Entrada e notificação

1. Help autenticado usa a fachada RPC idempotente correspondente.
2. Help LGPD visitante passa pelo widget Turnstile e pela Edge Function
   `kc-create-privacy-help-guest`.
3. Notificação comum usa claim/CAS e `kc-help-request-notify`; retry não deve
   duplicar e-mail aceito.
4. Solicitação de acesso externo é decidida em `/admin/moderation.html` pela
   Edge `kc-external-access-decide`.
5. O término da entrega externa agora reconcilia a fila genérica: `sent` leva a
   `resolved`; `link_generated`, `failed` ou estado incerto permanece
   `in_progress`; o próprio claim também marca o trabalho como `in_progress`
   de forma atômica, e fechamento administrativo explícito é preservado.
6. Direitos do titular continuam sob as Edges e guardas LGPD específicas. A
   triagem genérica não pode contornar `DSR_HELP_MUST_REMAIN_OPEN` nem
   `ERASURE_HELP_MUST_REMAIN_OPEN`.

### Consulta e triagem administrativa

`kc_admin_list_help_requests_v2(...)` é a projeção autoritativa da fila:

- aplica status, tipo, prioridade e busca no servidor;
- pagina por `limit/offset` com teto 100;
- expõe estado administrativo de acesso externo;
- retorna `total_count` do filtro e contadores operacionais globais: urgentes
  abertas, em andamento, acesso externo pendente e itens abertos há mais de 24
  horas;
- usa `kc_admin_help_queue_summary()` quando o filtro retorna zero cards, sem
  consultar o conteúdo de um ticket fora do filtro;
- mantém a RPC v1 para rollback de frontend durante o rollout.

`kc_admin_triage_help_request(...)`:

- exige administrador autenticado;
- valida status e prioridade;
- bloqueia a linha durante a alteração;
- aceita `expected_updated_at` e responde `HELP_REQUEST_STALE` quando outra
  sessão alterou o card;
- grava `help_request_triaged` em `audit_log` sem conteúdo do ticket, e-mail ou
  outro PII;
- preserva os triggers de fechamento LGPD como autoridade final.

### Interface

O painel passa a mostrar:

- tempo na fila e destaque progressivo para itens abertos;
- métricas globais, mesmo com paginação;
- decisão, entrega e nota administrativa de acesso externo;
- ação para abrir a solicitação correta no painel de Moderação;
- ação para preparar análise no Cadu;
- mensagem específica quando o card ficou desatualizado em outra sessão;
- chips LGPD bloqueados também no estado de acessibilidade após qualquer save.

No mobile, a faixa operacional e as ações quebram em linhas próprias sem exigir
largura fixa. A navegação continua usando os componentes administrativos
existentes.

## Limite seguro da integração com Cadu/OpenClaw

A integração da fila com Cadu é deliberadamente um handoff de interface:

- usa `sessionStorage` por no máximo cinco minutos e consumo único;
- envia somente categoria, tópico, status, prioridade, idade da fila e estado
  operacional de acesso externo;
- não envia e-mail, mensagem, UUID, protocolo ou nota administrativa;
- abre a aba OpenClaw e preenche o editor, mas nunca dispara a mensagem;
- exige revisão explícita do administrador antes do envio.

O `cadu-api` e o gateway OpenClaw no VPS estavam ativos durante a auditoria. Não
há, porém, endpoint autenticado dedicado a alertas administrativos genéricos.
Por isso `ADMIN_REPORTS_WEBHOOK_URL` e `KC_NOTIFY_HMAC_SECRET` continuam sem
configuração. Não apontar esse webhook para uma rota de chat ou Telegram sem
contrato de assinatura, replay protection, minimização e resposta verificável.

## Configuração operacional concluída

### Outbox de conclusão de exclusão

- A fila estava vazia antes da inicialização.
- `KC_ERASURE_OUTBOX_ENCRYPTION_KEY_B64`, versão `v1`, TTL e
  `KC_APP_BASE_URL` foram configurados sem registrar valores.
- Uma nova execução idempotente confirmou que a chave existente não é
  rotacionada.
- A primeira finalização real ainda deve confirmar o ciclo completo de
  cifrar/claim/decriptar/aceitar; não usar uma conta real como canário.

### Retenção de exportações

- O segredo Edge e os três valores correspondentes do Vault foram configurados.
- `kc-data-export-retention-purge` e `kc-data-export-retention-monitor` ficaram
  ativos, únicos e com project-ref/endpoint exatos.
- O alerta `EXPORT_RETENTION_SCHEDULE_UNHEALTHY` foi resolvido.
- Canário manual sem backlog terminou `succeeded`, com zero claimed, purged e
  failed.
- O procedimento reutilizável está em
  `scripts/configure-supabase-privacy-runtime.ps1` e recusa estado parcial.

### Turnstile do Help visitante

- Foi criado widget Cloudflare dedicado, modo gerenciado, limitado a
  `www.kinocampus.com.br` e `kinocampus.com.br`.
- O secret, environment, hostnames e origens exatas foram configurados na Edge.
- A site key pública foi configurada somente em Vercel Production.
- Preflight CORS da Edge respondeu 204 com a origem canônica e `no-store`.
- Preview não recebe essa site key: os hostnames `vercel.app` não pertencem à
  allowlist do widget de produção.
- `scripts/ops/apply-turnstile-keys.ps1` agora inclui a origem obrigatória,
  suporta remoção explícita do bundle temporário e permite aguardar o deploy
  normal do merge.

## Rollout da migration administrativa

Ordem obrigatória:

1. executar toda a suíte local e revisar `git diff --check`;
2. integrar o PR com CI verde;
3. aplicar somente `20260801194025_admin_help_operations.sql`;
4. confirmar o ledger remoto e ACLs das duas RPCs novas;
5. medir quantas linhas foram reconciliadas pelo evento
   `external_access_help_status_reconciled` com `source=migration_backfill`;
6. confirmar que nenhum Help LGPD com workflow não terminal ficou
   `resolved/archived`;
7. aguardar o deploy Vercel do mesmo merge;
8. validar desktop e mobile autenticados;
9. validar o widget visitante sem submeter um pedido real;
10. consultar advisors de segurança e performance e comparar somente achados
    novos.

O backfill não apaga tickets, decisões, metadados ou auditoria. Ele altera apenas
o status genérico dos casos externos que já possuem decisão e evidência de
entrega. A migration não deve ser revertida por restauração cega dos 56 estados
antigos; para rollback de interface, a RPC v1 e o fallback permanecem
disponíveis.

## Validação local concluída antes do merge

- 5 suites JS focadas, 119 testes;
- 29 arquivos pgTAP, 1309 asserções;
- novo contrato pgTAP de Help administrativo, 14 asserções;
- sintaxe dos controladores/adapters alterados;
- `supabase db lint --local` sem erro; dois avisos antigos de parâmetros não
  usados permanecem fora do escopo;
- `git diff --check` limpo.

O resultado de `npm run check:all`, CI, advisors e smoke pós-deploy deve ser
acrescentado ao registro após o merge.

## Pendências deliberadas

- Criar um webhook autenticado no VPS para alertas de denúncias/Cadu somente em
  mudança própria, com assinatura HMAC, nonce, janela curta e testes de replay.
- Revisar individualmente tickets históricos adicionais associados a um DSR;
  não os mesclar automaticamente.
- Executar um ciclo integral de exclusão apenas com conta descartável e dados
  descartáveis, inclusive entrega SMTP/outbox.
- Tratar workflows antigos parados por operação humana, sem UPDATE manual.
- Configurar um widget/hostname separado caso previews precisem testar
  Turnstile real.
