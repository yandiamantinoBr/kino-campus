# Edge Deploy: divergencia de fonte e prontidao operacional

**Data:** 2026-08-01
**Escopo:** `.github/workflows/edge-deploy.yml`, fontes remotas do projeto
Supabase `wacyrkwhkvzwkqpolrbg` e contratos de seguranca associados.
**Natureza:** correcao de CI/deploy. Nenhuma migration, secret ou configuracao
de producao e alterada por este trabalho.

## Diagnostico confirmado

O workflow de Edge Functions selecionava todas as funcoes locais depois de cada
push validado na branch base. Antes de qualquer deploy, um unico preflight
exigia simultaneamente:

1. todas as capacidades estruturais do schema;
2. a automacao operacional de retencao de exportacoes;
3. todos os secrets de todas as integracoes, inclusive recursos
   deliberadamente inativos.

Isso produzia um bloqueio global. Uma funcao sem relacao com Turnstile,
retencao ou alertas de denuncias nao podia receber uma correcao enquanto
qualquer uma dessas integracoes estivesse em modo seguro/inativo.

O estado remoto somente leitura confirmou:

- `data_export_retention_schedule_configured=false` por ausencia de
  configuracao operacional de endpoint/project-ref/secret;
- nove nomes de secrets ausentes, sem leitura de valores;
- `notify-admin-reports-threshold` deliberadamente sem HMAC/webhook e com o
  trigger mantido fail-closed;
- codigo remoto divergente do commit validado em nove das quinze funcoes;
- codigo remoto igual em seis funcoes.

Comparacao manual do snapshot remoto, seguindo apenas imports relativos
alcancaveis a partir de cada `index.ts`:

| Resultado | Funcoes |
|---|---|
| Sincronizadas | `cadu-auth-proxy`, `kc-create-privacy-help-guest`, `kc-data-export-admin`, `kc-data-export-retention`, `kc-data-subject-request`, `kc-dispatch-notification-outbox` |
| Divergentes | `cadu-publish`, `kc-account-erasure`, `kc-analytics-subject-id`, `kc-external-access-decide`, `kc-ga4-reports`, `kc-help-request-notify`, `kc-invite-user`, `kc-search-console-reports`, `notify-admin-reports-threshold` |

Essa comparacao nao imprime conteudo, credenciais ou valores de ambiente. O
resultado contem apenas nome da funcao, caminhos relativos e tipo da diferenca.

## Separacao dos gates

O deploy passa a distinguir tres categorias:

| Categoria | Exemplos | Comportamento |
|---|---|---|
| Integridade do codigo | fonte remota diferente, funcao ainda nao publicada, `verify_jwt` divergente | seleciona/deploya ou falha o deploy |
| Contrato estrutural | migrations obrigatorias, RPCs/tabelas/ACLs, PostgREST sem `net`/`vault` | bloqueia o deploy |
| Prontidao operacional | cron de retencao inativo, secret de integracao ainda ausente | gera warning e resumo; runtime permanece fail-closed |

`data_export_retention_schedule_configured` e a unica capacidade atualmente
classificada como operacional. As demais capacidades do contrato continuam
bloqueantes. Essa allowlist e intencionalmente pequena para evitar que um novo
requisito estrutural seja rebaixado por engano.

## Selecao por fonte remota

O fluxo automatico agora e:

1. valida o SHA que passou pela `Essential Validation` e os entrypoints locais;
2. baixa as fontes remotas pela Management API, sem executar as funcoes;
3. percorre imports relativos alcancaveis de cada entrypoint;
4. compara bytes de cada arquivo remoto alcancavel com o arquivo local;
5. monta a matrix somente com funcoes divergentes ou ainda ausentes no remoto;
6. alerta sobre funcoes presentes apenas no remoto, sem remove-las;
7. pula o deploy quando tudo ja esta sincronizado;
8. executa os gates estruturais uma vez;
9. publica no maximo tres funcoes em paralelo;
10. valida status `ACTIVE`, `verify_jwt` e fonte baixada apos cada deploy;
11. tenta o readback ate tres vezes para tolerar propagacao curta, mas falha se
    a fonte nao convergir.

O comparador e `scripts/compare-edge-function-source.js`. Dependencias externas
(`jsr:`, `npm:`, `https:`) nao sao lidas pelo comparador; elas fazem parte do
texto do modulo importador e qualquer alteracao no specifier causa divergencia
nesse arquivo. Dependencias relativas em `_shared` sao seguidas
recursivamente. Arquivos compartilhados nao alcancaveis pela funcao nao causam
redeploy indevido.

## Secrets e fail-closed

O inventario remoto usa somente nomes. Os requisitos sao associados a cada
funcao selecionada e publicados no `GITHUB_STEP_SUMMARY`. Ausencias nao liberam
a funcionalidade:

- `kc-account-erasure` bloqueia a finalizacao quando a chave AES-GCM nao esta
  disponivel/valida;
- `kc-create-privacy-help-guest` responde
  `GUEST_PRIVACY_CONFIG_UNAVAILABLE` sem Turnstile/origens validos;
- `kc-data-export-retention` responde `RETENTION_UNAVAILABLE` sem o secret
  dedicado e o job permanece sem agendamento;
- `notify-admin-reports-threshold` responde
  `missing_server_configuration` sem HMAC, webhook e URL base;
- integracoes Google e SMTP continuam indisponiveis quando sua configuracao
  especifica nao existe.

Portanto, warning significa "codigo pode ser atualizado, recurso continua
inativo". Nao significa prontidao para uso real. O go-live de cada integracao
continua sujeito ao runbook proprio, provisionamento manual de secrets e canario
controlado.

## Garantias e limites

- Pull requests nunca publicam Edge Functions.
- Somente um push na branch base com `Essential Validation` verde inicia o
  fluxo de producao.
- O SHA usado para comparar, validar e publicar e o SHA aprovado pelo workflow
  anterior.
- O deploy continua serializado pelo grupo de concorrencia de producao.
- Remocao remota de funcao nao e automatizada.
- Funcoes presentes apenas no remoto aparecem no resumo e exigem decisao manual.
- Valores de secrets nao sao lidos nem escritos.
- O comparador nao substitui `deno check`, testes Deno ou contratos Jest.
- O workflow nao configura Vault, cron, SMTP, Turnstile, webhook ou provider.

## Rollback

O rollback e a reversao do commit do workflow/comparador. Nao existe rollback
de banco porque este patch nao aplica migration nem modifica dados. Se uma
funcao publicada falhar o readback, interromper o rollout e nao ativar a
integracao; restaurar uma versao anterior deve ser uma operacao explicita e
auditada, nunca uma exclusao automatica.

## Validacao minima

Antes do merge:

- testes unitarios do comparador com fonte igual, dependencia compartilhada
  divergente, funcao remota ausente e import incompleto;
- contrato do workflow, incluindo SHA validado, gates estruturais, warnings,
  matrix por drift, `verify_jwt` e readback;
- contratos fail-closed das quatro integracoes sem configuracao;
- `git diff --check` e suite completa.

Apos o merge:

- confirmar `Essential Validation` verde;
- conferir a matrix real no resumo do Edge Deploy;
- confirmar que funcoes iguais nao ganharam nova versao;
- confirmar status `ACTIVE`, `verify_jwt` e readback das selecionadas;
- registrar separadamente qualquer warning de prontidao ainda pendente.

## Evidencia local desta alteracao

- corpo exato do step de selecao executado em Git Bash contra o snapshot remoto:
  matrix com nove funcoes divergentes, seis sincronizadas e zero remotas orfas;
- `actionlint` v1.7.12 passou no workflow, usando o binario oficial Windows
  validado pelo checksum SHA-256 publicado no mesmo release;
- testes focados do comparador, contrato de deploy e exclusao: 65/65;
- `npm run check:all`: 287 suites, 4.970 testes aprovados, 7 ignorados e 3
  snapshots aprovados;
- validadores de versao, estrutura, scripts, rotas, higiene, registro de busca e
  fontes Cadu aprovados;
- `git diff --check` sem erro.

Essas provas validam o codigo local. A prova autoritativa do estado remoto e o
readback do workflow executado apos o merge.
