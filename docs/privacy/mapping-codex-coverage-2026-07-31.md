# Cobertura do mapeamento Codex (LGPD / exclusão / exportação)

Data: 2026-07-31  
Fonte: auditoria “Mapeamento - Codex.md” (somente leitura no momento da auditoria original).

## Síntese

O mapeamento descrevia o estado **antes** da onda de privacidade (DSR, exportação, deep links, card em Configurações, classificador admin, etc.). **No repositório atual, a fase 1 e a maior parte das fases seguintes já estão implementadas.** O risco residual principal é **paridade de deploy** (migrations/edge em produção) e operação humana, não a ausência de entry points públicos.

## Matriz (código no repositório)

| Item do mapeamento | Status | Evidência |
|---|---|---|
| Classificador admin: `account_deletion` / `request_kind=account_erasure`; “LGPD” sozinho não abre painel | **Feito** | `admin-help-requests.controller.js` → `isLgpdErasureRequest` |
| Deep links seguros `?request=` | **Feito** | `help.controller.js` `PRIVACY_DEEP_LINKS` |
| Protocolo/referência após envio no Help | **Feito** | `setProtocol` + `#helpProtocol` |
| Card Configurações “Privacidade e seus dados” | **Feito** | `settings.html` `#settingsPrivacyData` |
| Campos condicionais de exclusão/cópia/portabilidade | **Feito** | `help.shared.js` `HELP_PRIVACY_CONDITIONAL_FIELDS` |
| FAQ LGPD na Ajuda | **Feito** | `ajuda.html` `#faq-lgpd` |
| Canais separados (form / contato@ / ajuda@ / WhatsApp) | **Feito** | `ajuda.html` + docs privacy |
| Exportação real (DSR + download autenticado) | **Feito** | migrations `20260728*`+, settings download, edge DSR/export |
| Baixar preferências de busca | **Feito** | `#settingsExportSearchPreferences` |
| Feedback Help no topo (invisível) | **Corrigido 2026-07-31** | toast `.kc-toast` via `setStatus` |
| Prioridade “Urgente” rebaixada silenciosamente | **Corrigido 2026-07-31** | `normalizeChoice` aceita labels PT |
| Máquina de estados / partial_failure Storage | **Feito** | `kc-account-erasure` |
| Chat: preservar coautor | **Feito** | edge + matrix de cobertura |
| Cancelar pedido em Configurações | **Feito** | `kc_cancel_data_subject_request` |
| Heurística legada de texto no classificador | **Residual** | fallback só para tickets antigos |
| Encarregado / DPO formal | **Governança** | processo org, não só código |

## Critérios mínimos de aceite (mapeamento) × status

| Critério | Status |
|---|---|
| Ações em até dois cliques (Configurações → ação) | Atende |
| Todo pedido recebe protocolo/referência | Atende (DSR protocol autenticado; referência de help para visitante) |
| `account_deletion` classificado corretamente | Atende |
| Acesso/cópia não abre painel destrutivo | Atende |
| Exportação só do titular autenticado | Atende |
| Falhas parciais de Storage ≠ erased | Atende no edge |
| Exclusão não apaga conteúdo de terceiros no chat | Atende na matriz |

## Produção (checado 2026-07-31)

### Banco

- RPC `public.kc_create_privacy_help_request_v1(jsonb)` presente.
- Tabela `public.data_subject_requests` presente.
- 25 migrations `>= 20260728` registradas no histórico remoto.

### Edge Functions (deployadas 2026-07-31)

| Function | Status | verify_jwt | Notas |
|---|---|---|---|
| `kc-account-erasure` | ACTIVE v19 | true | já existia |
| `kc-help-request-notify` | ACTIVE v18 | true | já existia |
| `kc-data-subject-request` | ACTIVE v1 | true | **deployado** (Settings download / DSR) |
| `kc-data-export-admin` | ACTIVE v1 | true | **deployado** |
| `kc-data-export-retention` | ACTIVE v1 | false | **deployado** (cron/secret) |
| `kc-create-privacy-help-guest` | ACTIVE v1 | false | **deployado** (exige Turnstile secret) |

Antes deste deploy, o repositório tinha o código de exportação/DSR, mas o projeto remoto **não** listava as quatro functions novas — o card “Baixar meus dados” e o gateway guest falhavam em produção mesmo com o front correto.

### Secrets operacionais ainda a confirmar

- `TURNSTILE_SECRET_KEY` (ou equivalente) no edge guest.
- Secrets de retention/cron se a automação de expurgo estiver ligada.

## Próximos passos seguros (não bloqueantes de produto)

1. Confirmar secrets Turnstile/retention no projeto Supabase.
2. Após fila limpa, considerar desligar o fallback textual do classificador admin.
3. Exercício operacional de `partial_failure` + `retry_finalize`.
4. Decisão formal de encarregado/DPO e alinhamento de textos legais.
