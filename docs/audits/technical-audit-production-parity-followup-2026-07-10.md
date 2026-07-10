# Auditoria técnica KinoCampus - paridade pós-rollout

**Data da evidência:** 2026-07-10 16:45 UTC

**Branch de trabalho:** `codex/schema-security-followup`

**Base remota observada:** `ff9ec1d1` (`kinocampus-V75.0-foundations`)

**Projeto Supabase observado:** `wacyrkwhkvzwkqpolrbg`

**Modo remoto:** somente leitura; nenhuma migration, configuração, secret ou linha de produção foi alterada

## 1. Síntese executiva

Esta rodada verificou o estado posterior à PR #644 e aprofundou a diferença entre a cadeia de
migrations versionada e o banco de produção. O resultado separa quatro situações que antes
podiam parecer um único problema:

1. A regressão de autenticação do dispatcher Edge foi remediada e o ciclo de cinco minutos voltou
   a alcançar o handler.
2. Os providers de e-mail e WhatsApp continuam desabilitados por configuração; execução saudável
   do dispatcher não significa entrega externa ativa.
3. O schema remoto conserva objetos que existem funcionalmente, mas não registra várias versões
   locais; outros objetos, principalmente consentimento de privacidade e ACLs finais, estão
   realmente ausentes.
4. A migration local de hardening de banners corrigia comportamento, mas reintroduziria uma
   função `SECURITY DEFINER` executável por `authenticated` no schema público. Uma migration
   posterior preserva a fronteira mais segura já observada em produção.

Não há P0 confirmado. Permanecem P1 de rollout de schema, proteção de credenciais, providers de
notificação e governança de deploy.

## 2. Estado GitHub e CI

| Item | Estado observado | Interpretação |
|---|---|---|
| PR #644 | incorporada externamente em `47b09cbe` | publicou o contrato explícito de `verify_jwt` |
| Deploy Edge da PR #644 | concluído com sucesso | publicou apenas dispatcher e convite, ambos v13 |
| PR #646 | incorporada externamente em `b8d6e5d7` | corrigiu o import que bloqueava o type-check de `cadu-publish` |
| PR #645 | incorporada externamente em `ed4d2cd6` | hardening de dependências e Dependabot semanal ativos |
| Commit `ff9ec1d1` | CI e deploy Edge concluídos | publicou `cadu-publish` v21 com threshold configurável |

O erro intermediário do PR #645 não foi causado pelas dependências: `fd9ce526` passou a usar
`stripTrailingEllipsis` no mapper Deno sem importá-lo. A correção isolada importa o helper já
existente e adiciona contrato de regressão. O CI final da base passou em validadores, Jest,
Playwright, reset/lint/pgTAP e type-check das oito Edge Functions.

## 3. Supabase Edge e scheduler

O projeto remoto está `ACTIVE_HEALTHY`, em Postgres 17.6.1.054. As funções relevantes estão:

| Função | Versão | Estado | `verify_jwt` |
|---|---:|---|---:|
| `kc-dispatch-notification-outbox` | 13 | `ACTIVE` | `false` |
| `kc-invite-user` | 13 | `ACTIVE` | `false` |
| `cadu-publish` | 21 | `ACTIVE` | `true` |

Na janela consultada:

- 53 chamadas do dispatcher v12 retornaram HTTP 401;
- após o rollout, 19 chamadas v13 retornaram HTTP 200;
- o menor tempo v13 foi 2.142 ms e o maior, 19.210 ms;
- o job `kc-dispatch-notification-outbox` permanece ativo em `*/5 * * * *`;
- 20 de 20 runs entre 15:05 e 16:40 UTC terminaram como `completed`;
- `provider_ready.email=false` por ausência de `KC_NOTIFICATION_EMAIL_PROVIDER`;
- `provider_ready.whatsapp=false` por ausência de `KC_NOTIFICATION_WHATSAPP_PROVIDER`.

### Timeout residual

`kc_trigger_notification_dispatch(...)` ainda configura `timeout_milliseconds := 5000`. Como a
Edge Function levou até 19,2 s, `pg_net` pode registrar timeout mesmo quando o handler termina e
grava um run completo. Isso explica falsos negativos de transporte observados às 16:00 e 16:10.

O `pg_net` aceita timeout por chamada; a documentação oficial define esse campo como o tempo
máximo antes do cancelamento. A correção deve aumentar o orçamento com margem baseada em
percentis, não apenas no máximo de uma amostra, e correlacionar `request_id`, resposta HTTP e
`execution_id`. Não foi alterado nesta rodada porque exige migration e teste operacional.

## 4. Paridade de migrations e objetos

A produção registra 72 migrations; a mais recente é
`20260703180959_harden_chat_anon_execute`. A cadeia ativa do repositório usa uma baseline
sintética mais incrementais e não corresponde diretamente a esse histórico. Portanto,
`supabase db push` contra produção continua proibido.

### 4.1 Presente e funcional, apesar do histórico diferente

- colunas de leitura/resposta do chat;
- tabela e índices de `chat_reactions`;
- constraints de `audio` e `document` em mensagens e conversas;
- RPC de envio com suporte a mídia;
- tabelas `caronas_locations` e `kc_unit_meta`;
- tabela `privacy_analytics_events`.

### 4.2 Ausente ou divergente no remoto

| Objeto | Estado remoto | Estado versionado | Impacto |
|---|---|---|---|
| `privacy_consent_events` | ausente | criada por `20260710011442` | consentimento não é persistido; admin usa fallback |
| `kc_record_privacy_consent` | ausente | criada por `20260710011442` | chamadas do frontend retornam RPC ausente |
| `kc_admin_privacy_analytics` | ausente | criada por `20260710011442` | métricas completas ficam indisponíveis |
| ACLs finais do chat | grants amplos em três funções | corrigidas por `20260709000000` | superfície desnecessária, sem bypass demonstrado |
| `kc_unit_meta` | policies antigas e sem índice `updated_by` | policies otimizadas e índice parcial | warnings de performance e drift de grants |
| helpers RPC reconciliados | alguns corpos ainda usam `search_path=public` | qualificados em `20260710012926` | risco de manutenção e resolução ambígua |
| ACLs `kc_admin_*` | sete RPCs de anúncios executáveis por `anon` | revogadas por `20260710015000` | superfície administrativa excessiva |

O índice parcial local de `kc_unit_meta(updated_by) WHERE updated_by IS NOT NULL` ainda pode ser
reportado pelo Advisor como FK sem cobertura. Isso precisa ser medido com o plano de consultas;
não é justificativa para remover ou duplicar índice sem benchmark.

## 5. Advisors atuais

### Segurança

Há um warning remoto confirmado: `auth_leaked_password_protection`. A proteção contra senhas
comprometidas permanece desabilitada. A correção é manual no Auth e precisa de teste de cadastro,
login e reset; não é migration SQL.

### Performance

O Advisor retornou 63 itens:

- 1 FK sem índice reconhecido, em `kc_unit_meta.updated_by`;
- 3 policies antigas de `kc_unit_meta` com `auth.uid()` recalculado por linha;
- 59 índices sem uso registrado.

Os 59 índices não devem ser removidos em lote. Estatísticas de uso reiniciam e dependem da janela
de tráfego; índices de FK, jobs raros e rotas administrativas podem legitimamente permanecer sem
uso por períodos longos.

## 6. Fronteira de segurança dos banners

`20260710015000_harden_admin_rpc_acl_and_banner.sql` corrige update inexistente, auditoria e ACLs,
mas deixa `public.kc_admin_save_banner(jsonb)` como `SECURITY DEFINER` executável por
`authenticated`. O lint 0029 do Supabase classifica exatamente esse padrão como warning, pois
qualquer conta autenticada alcança uma função que roda como owner privilegiado.

O corpo verifica `kc_is_admin`, portanto não foi demonstrado bypass. Mesmo assim, a produção já
possuía uma separação melhor:

- `public.kc_admin_save_banner`: wrapper `SECURITY INVOKER`;
- `kc_private.kc_admin_save_banner`: implementação `SECURITY DEFINER`;
- ACL explícita e validação interna de administrador.

A migration `20260710164556_preserve_admin_banner_invoker_boundary.sql` mantém as correções de
comportamento e restaura essa fronteira no estado final da cadeia local.

## 7. Validação da mudança local

| Gate | Resultado |
|---|---|
| `supabase start` | cadeia completa aplicada, incluindo a nova migration |
| `supabase db lint --local --level warning` | sem erros ou warnings |
| `supabase test db --local supabase/tests` | 4 arquivos, 111 testes aprovados |
| contrato Jest específico | 3 de 3 testes aprovados |
| comportamento pgTAP | create, update, erro `P0002` e dois eventos de auditoria aprovados |
| ACL pgTAP | wrapper público e implementação privada negam `anon` e aceitam `authenticated` |

Nenhuma migration foi aplicada remotamente. O reset e os testes ocorreram apenas no Docker local.

## 8. Priorização atual

| Prioridade | Item | Próxima ação segura |
|---|---|---|
| P1 | Corrigir parsing/contrato do threshold do Cadu | configuração inválida não pode desativar o gate nem mudar códigos estáveis |
| P1 | Testar reconciliação em branch Supabase | requer confirmação de custo antes de criar a branch |
| P1 | Habilitar leaked-password protection | alteração manual acompanhada de teste Auth |
| P1 | Decidir providers externos | configurar e testar um canal por vez, com custo e rollback definidos |
| P1 | Impedir deploy Vercel antes dos checks | branch protection/deployment checks fora do código |
| P2 | Corrigir timeout e correlação do dispatcher | migration própria, teste de latência e monitor de ausência de runs |
| P2 | Pin gradual das dependências Deno | um grupo pequeno de Edge Functions por PR |
| P2 | Avaliar índices sem uso | janela de métricas e planos reais antes de qualquer remoção |

## 9. Limites e decisões não executadas

- nenhuma migration ou SQL de escrita foi executado em produção;
- nenhuma configuração de Auth foi alterada;
- nenhum provider ou secret foi lido/configurado;
- nenhuma Edge Function foi publicada por esta branch;
- nenhum merge que dispare deploy de produção foi executado;
- nenhuma branch Supabase paga foi criada sem confirmação de custo.

## 10. Referências oficiais

- [Supabase Advisor 0029: `authenticated_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: pg_net - Async Networking](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Supabase: Managing Edge Function dependencies](https://supabase.com/docs/guides/functions/dependencies)
