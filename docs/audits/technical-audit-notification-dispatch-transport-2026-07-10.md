# Auditoria do transporte do dispatcher de notificações

**Data:** 2026-07-10

**Escopo:** `pg_cron` -> `pg_net` -> `kc-dispatch-notification-outbox`

**Modo remoto:** somente leitura

**Fora de escopo:** deploy, alteração de secrets, execução manual do dispatcher e aplicação de migration em produção

## Resumo executivo

O dispatcher voltou a responder depois da correção de `verify_jwt`, mas o transporte do banco
ainda registrava falsos negativos. A função `public.kc_trigger_notification_dispatch(...)`
cancelava a espera no `pg_net` após 5 segundos. Três execuções da Edge Function terminaram com
HTTP 200 em 5.521 ms, 5.954 ms e 19.210 ms, enquanto as respostas correspondentes no banco foram
registradas como timeout de 5 segundos.

A comparação de privilégios também revelou drift entre ambientes. Produção permite executar a
função `SECURITY DEFINER` apenas a `service_role`; o reset local concedia execução a `PUBLIC`,
`anon` e `authenticated`. A migration deste lote corrige os dois pontos sem disparar uma chamada:
timeout de 30 segundos e ACL restrita a `service_role`.

## Evidência observada

| Superfície | Fato observado | Classificação |
|---|---|---|
| `cron.job` remoto | job ativo `*/5 * * * *`, comando `select public.kc_trigger_notification_dispatch();` | Fato |
| `pg_get_functiondef` remoto | `timeout_milliseconds := 5000` | Fato |
| `net._http_response` remoto | 24 respostas HTTP 200 e 3 timeouts após a remediação do gateway, no recorte consultado | Fato |
| Logs Edge remotos | 28 respostas HTTP 200; mínimo 2.142 ms, p50 3.179 ms, p95 5.954 ms e máximo 19.210 ms | Fato |
| Correlação temporal | timeouts de 16:00, 16:10 e 16:30 UTC correspondem a handlers HTTP 200 de 5.954, 19.210 e 5.521 ms | Fato |
| ACL remota | `anon=false`, `authenticated=false`, `service_role=true` | Fato |
| ACL após reset local | `anon=true`, `authenticated=true`, `service_role=true` | Fato |

Os logs do `pg_cron` isoladamente não provam sucesso HTTP: o job apenas enfileira a requisição
assíncrona. O estado deve ser verificado em `net._http_response` e nos logs da Edge Function.

## Diagnóstico

### P1 confirmado: falso negativo de transporte

O timeout de 5 segundos ficou abaixo do p95 observado e abaixo de três execuções bem-sucedidas.
Isso produz erro no `pg_net` mesmo quando a Edge Function conclui o processamento. O efeito é
observabilidade contraditória e risco de reexecução manual desnecessária.

### P1 confirmado: reset local amplia privilégio

O baseline sintético não reproduziu a revogação histórica da função privilegiada. Embora a
produção esteja segura, testes locais poderiam aprovar uma migration com superfície maior do que
a real. O pgTAP novo transforma a ACL de produção em contrato reconstruível.

## Correção versionada

- migration `20260710172239_harden_notification_dispatch_transport.sql`;
- timeout do `net.http_post(...)` elevado para 30.000 ms;
- `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`;
- `EXECUTE` concedido somente a `service_role`;
- `SECURITY DEFINER` e `search_path = ''` preservados;
- pgTAP verifica definição, timeout e privilégios.

Trinta segundos cobre o máximo observado com margem sem se aproximar do intervalo de cinco
minutos do cron. O `pg_net` continua assíncrono: a transação apenas enfileira a chamada, e a
resposta fica disponível temporariamente em `net._http_response`.

Referência oficial: [pg_net: Async Networking](https://supabase.com/docs/guides/database/extensions/pg_net).

## Rollout seguro

1. Validar a migration em reset local, lint e pgTAP.
2. Aplicar primeiro em branch Supabase ou janela controlada, sem alterar URL ou segredo.
3. Confirmar ACL com `has_function_privilege(...)`.
4. Observar pelo menos seis ciclos do cron em `net._http_response` e logs Edge.
5. Tratar HTTP não-2xx e timeout separadamente; não usar apenas `cron.job_run_details` como sinal de sucesso.

Nenhuma etapa remota de escrita foi executada durante esta auditoria.
