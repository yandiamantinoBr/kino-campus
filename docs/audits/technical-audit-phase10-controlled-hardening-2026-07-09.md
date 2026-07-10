# Auditoria técnica KinoCampus - Fase 10: hardening controlado de chat

**Data:** 2026-07-09
**Branch de trabalho:** `codex/audit-phase4-6-2026-07-09`
**Escopo:** corrigir grants de execução de RPCs de chat no código versionado e validar somente no Supabase Docker local.

## Evidência

Uma consulta somente leitura ao Supabase remoto e um `supabase db reset --local --no-seed` no estado atual do repositório produziram o mesmo problema em funções relevantes:

| Função | Remoto: `anon EXECUTE` | Local antes da correção | Consequência observada |
|---|---:|---:|---|
| `kc_private.kc_chat_list_messages` | Sim | Sim | Implementação `SECURITY DEFINER` invocável por anon |
| `public.kc_chat_set_message_reply` | Sim | Sim | Wrapper `SECURITY INVOKER` invocável por anon |
| `public.kc_chat_toggle_reaction` | Sim | Sim | Wrapper `SECURITY INVOKER` invocável por anon |

No local, as chamadas anônimas de reply e reação retornaram `{"ok": false, "error": "unauthenticated"}`. Isso confirma que não houve mutação anônima demonstrada, pois as implementações privadas validam `auth.uid()`. Ainda assim, o grant amplo é uma regressão de defesa em profundidade e pode virar bypass se uma implementação futura perder essa guarda.

## Causa raiz

`20260707000000_security_linter_fixes.sql` usa `DROP FUNCTION` seguido de `CREATE FUNCTION` para wrappers de reply e reação. Em PostgreSQL, `GRANT EXECUTE ... TO authenticated` não revoga o `EXECUTE` implícito de `PUBLIC`. O mesmo padrão existia para a implementação privada de listagem.

## Mudança aplicada no repositório

`supabase/migrations/20260709000000_harden_chat_rpc_execute_grants.sql`:

1. revoga `PUBLIC`, `anon` e `authenticated` nas três implementações privadas e três wrappers públicos;
2. concede `EXECUTE` exclusivamente para `authenticated`;
3. recarrega o schema PostgREST.

O contrato `tests/contract/chat-continuity-contract.test.js` impede que uma recriação futura das funções remova esse hardening da cadeia local.

## Validação executada localmente

1. `supabase db reset --local --no-seed` aplicou a baseline e oito migrations incrementais, incluindo esta migration.
2. As seis funções passaram a retornar `anon_execute = false` e `authenticated_execute = true`.
3. Sob `SET ROLE authenticated` e uma identidade JWT sintética, reply e reação alcançaram as implementações privadas e devolveram erros de domínio (`message_not_found`/`invalid_emoji`), não erro de permissão. A listagem devolveu `not_a_participant`, confirmando que chegou à verificação de participante.
4. `npm run check:all` passou com 203 suítes, 3.903 testes e 3 snapshots; `tests/e2e/pages-load.spec.js` passou com cinco cenários.

## Validação ainda necessária antes de rollout remoto

1. Exercitar reply, reação e listagem com uma conversa de fixture e dois participantes autenticados.
2. Executar `npm run check:all` e a suite Playwright definida pela CI no commit final.
3. Aplicar somente em branch Supabase/reconciliação controlada, repetindo a matriz anônimo/autenticado/participante/não participante.

## Limite operacional

Esta migration **não foi aplicada ao Supabase remoto**. O histórico remoto e o baseline local permanecem divergentes; não é permitido usar `supabase db push` diretamente contra produção. A aplicação remota requer branch Supabase ou procedimento manual reconciliado, com matriz de RLS anônimo/autenticado/participante/não participante.

## Drift de schema confirmado e fora de escopo desta migration

| Presente somente no remoto | Presente somente no reset local | Impacto |
|---|---|---|
| `caronas_locations`, `kc_unit_meta` | `privacy_consent_events` | O ambiente local não reproduz integralmente os fluxos de caronas/Cadu; o remoto não reproduz a tabela de consentimento esperada pelos controllers admin. Requer reconciliação de schema versionada e testada. |

## Atualização de progressão - 2026-07-10

O drift acima foi reconciliado **na cadeia versionada local**, não em produção, pelas migrations
`20260710011442`, `20260710012022`, `20260710012926` e `20260710015000`. O reset local agora
reconstrói 43 tabelas públicas, passa sem avisos no linter e possui 106 contratos pgTAP.

A validação consolidada passou com 207 suítes/3.921 testes Jest, 85 cenários Playwright e
type-check das 8 Edge Functions. Evidências, limites e plano de rollout estão em
`technical-audit-phase10-schema-ci-reconciliation-2026-07-10.md`. A produção continua sem
`privacy_consent_events`; nenhuma migration remota foi executada.
