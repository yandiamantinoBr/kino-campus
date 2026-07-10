# Incidente técnico: regressão de autenticação no dispatcher Edge

**Data da evidência:** 2026-07-10 11:15 UTC  
**Branch de correção:** `codex/edge-auth-config-hardening`  
**Base observada:** `e84d81d8` (`kinocampus-V75.0-foundations`)  
**Projeto Supabase:** `wacyrkwhkvzwkqpolrbg`  
**Modo remoto desta análise:** somente leitura; nenhum deploy, secret ou dado foi alterado

## 1. Resumo executivo

O deploy automático posterior ao merge da PR #641 publicou a versão 12 de
`kc-dispatch-notification-outbox` com `verify_jwt=true`. Esse valor não estava declarado em
`supabase/config.toml`; portanto, o Supabase CLI aplicou o default do gateway.

O dispatcher não usa JWT no caminho agendado. `public.kc_trigger_notification_dispatch()` envia
somente `Content-Type` e `x-kc-dispatch-secret`, e a Edge Function valida esse segredo com
comparação resistente a timing. Com `verify_jwt=true`, o gateway rejeita a requisição antes de o
handler executar.

Este é um **P1 confirmado de indisponibilidade do ciclo de dispatch**, com uma segunda lacuna de
observabilidade: o `pg_cron` registra `succeeded` porque apenas enfileira o HTTP assíncrono no
`pg_net`; ele não incorpora o status HTTP posterior.

## 2. Evidências correlacionadas

| Evidência | Estado observado |
|---|---|
| Deploy remoto | versão 12, `verify_jwt=true`, atualizada em `2026-07-10 02:22:08 UTC` |
| Última execução interna | `notification_dispatch_runs.created_at = 2026-07-10 02:20:04 UTC` |
| Respostas `pg_net` retidas | 71 respostas `401` entre 05:20 e 11:15 UTC; 1 timeout de transporte |
| Corpo do `401` | `UNAUTHORIZED_NO_AUTH_HEADER` / `Missing authorization header` |
| Edge logs | `POST | 401` a cada cinco minutos na versão 12 |
| Cron | ativo em `*/5 * * * *`; runs marcados como `succeeded` e `1 row` |
| Runtime privado | URL e segredo presentes; batch de 25 |
| Fila pronta | 16 itens antigos: 8 de e-mail e 8 de WhatsApp |

As respostas de `net._http_response` possuem retenção curta. A contagem de 71 não representa o
total desde 02:22 UTC; representa apenas a janela ainda disponível no instante da consulta.

## 3. Impacto e causalidade

Dois problemas coexistem e não devem ser confundidos:

1. **Regressão nova:** desde o deploy da versão 12, nenhuma requisição do cron alcança o handler.
2. **Configuração anterior incompleta:** antes da regressão, as execuções terminavam como
   `completed`, mas registravam `provider_ready.email=false` e
   `provider_ready.whatsapp=false`. Faltavam `KC_NOTIFICATION_EMAIL_PROVIDER` e
   `KC_NOTIFICATION_WHATSAPP_PROVIDER`.

Assim, o `401` quebrou inequivocamente o ciclo de execução e seu health signal. Entretanto, não há
evidência de mensagens novas que deixaram de ser entregues exclusivamente por essa regressão:
os 16 itens prontos são anteriores ao deploy, o mais novo é de 2026-06-06, e os provedores já
estavam desabilitados. A ativação dos provedores é uma decisão operacional separada, com custos,
credenciais e testes próprios.

## 4. Causa raiz

1. O estado remoto `verify_jwt=false` não estava versionado.
2. `supabase functions deploy` usa `verify_jwt=true` quando não há declaração por função.
3. O workflow verificava somente uma versão retornada pela Management API.
4. Falhas de `curl` ou parse eram convertidas em `?` e nunca faziam o job falhar.
5. Alterações em `supabase/config.toml` não selecionavam funções para redeploy.
6. O monitoramento observava o sucesso do cron, não a resposta HTTP nem a criação de um run.

`kc-invite-user` também opera com `verify_jwt=false` intencionalmente. Ela recebe Bearer JWT, mas
faz `auth.getUser()` e a autorização administrativa dentro do handler para preservar o preflight
CORS. Sem configuração versionada, um futuro deploy também poderia alterar esse contrato.

### 4.1 Auditoria dos oito modos de autenticação

O uso de autenticação dentro de um handler não implica, sozinho, que o gateway deva ser
desabilitado. O contrato foi classificado pelo chamador real e pelo estado remoto:

| Função | Remoto observado | Contrato versionado/esperado | Evidência principal |
|---|---|---|---|
| `cadu-publish` | `true` | `true` por default | publisher envia JWT; v20 publicou 2 posts depois do deploy com esse modo |
| `kc-account-erasure` | `true` | `true` por default | cliente Supabase envia JWT; handler exige admin |
| `kc-dispatch-notification-outbox` | `true` | **`false` explícito** | cron envia apenas `x-kc-dispatch-secret`; remoto responde 401 |
| `kc-external-access-decide` | `true` | `true` por default | cliente Supabase envia JWT; handler revalida sessão |
| `kc-ga4-reports` | `true` | `true` por default | dashboard envia Bearer; handler exige perfil admin |
| `kc-help-request-notify` | `true` | `true` por default | `functions.invoke` autenticado; handler usa service role após o gateway |
| `kc-invite-user` | `false` | **`false` explícito** | decisão histórica de CORS; handler revalida JWT e admin |
| `notify-admin-reports-threshold` | `true` | `true` por default | trigger prevê Bearer de gateway e assinatura HMAC própria |

O comentário no topo de `cadu-publish/index.ts` que afirma `verify_jwt=false` é documentação
legada. O estado remoto `true` foi preservado porque há prova de funcionamento posterior ao
deploy e ele adiciona uma camada de validação. Alterar apenas esse comentário faria o detector
redeployar a função; a limpeza deve acompanhar uma mudança funcional futura do Cadu, não ampliar
o rollout deste incidente.

## 5. Correção versionada nesta branch

- declara `verify_jwt=false` para as duas funções de autenticação interna;
- usa `tomllib` para comparar as seções `[functions.*]` antes/depois;
- inclui apenas funções cuja configuração mudou na matriz de deploy;
- consulta a Management API com `curl --fail-with-body` e retry;
- exige versão numérica, estado `ACTIVE` e `verify_jwt` igual ao TOML;
- remove o fallback silencioso `|| echo "?"`;
- adiciona contratos Jest para impedir regressão desses invariantes;
- fixa todas as GitHub Actions externas em commits imutáveis.

Validação local executada:

| Gate | Resultado |
|---|---|
| Parse de `supabase/config.toml` com `tomllib` | aprovado; duas funções com `false` |
| Simulação do diff de configuração | detectou exatamente dispatcher e convite |
| Jest do contrato de deploy | 9 de 9 testes aprovados |
| `actionlint 1.7.12` | todos os workflows aprovados |

## 6. Rollout e verificação remota necessários

Esta branch ainda não alterou produção. O rollout modifica autenticação de gateway e deve ocorrer
somente depois dos checks do pull request:

1. revisar a matriz esperada: somente `kc-dispatch-notification-outbox` e `kc-invite-user`;
2. promover o commit aprovado para a branch base;
3. confirmar que o workflow pós-CI publica ambas com `verify_jwt=false`;
4. aguardar o próximo intervalo de cinco minutos;
5. confirmar novo `notification_dispatch_runs` com `source='pg_cron'`;
6. confirmar que `net._http_response` deixou de acumular `401`;
7. confirmar nos Edge logs que a requisição passou a chegar ao handler;
8. manter os provedores desabilitados até haver decisão explícita sobre Resend/Twilio ou
   equivalentes.

Rollback: reverter o commit e redeployar somente as funções afetadas. Para o dispatcher, voltar a
`verify_jwt=true` sem adicionar um JWT ao chamador reproduz o incidente e não é um rollback
funcional.

## 7. Melhorias posteriores

| Prioridade | Item | Motivo |
|---|---|---|
| P1 | Monitorar status HTTP do `pg_net` | `cron.job_run_details` gera falso positivo de saúde |
| P1 | Alertar por ausência de `notification_dispatch_runs` | detecta gateway, timeout e handler indisponível |
| P1 | Decidir e testar provedores externos | fila pronta não é entregue com providers ausentes |
| P2 | Adicionar testes HTTP das Edge Functions | type-check não valida CORS, gateway nem auth runtime |
| P2 | Registrar versão, SHA e modo JWT por deploy | reduz drift entre Git, CLI e estado remoto |
