# Espelho somente leitura do catálogo de fontes UFG

Data de corte atual dos dados: 2026-07-15 (registro `2026-07-15.8`)

O KinoCampus mantém uma cópia byte a byte dos três artefatos canônicos publicados pelo OpenClaw Cadu. O commit upstream, os Git blob OIDs, os SHA-256 e os tamanhos válidos estão no arquivo `upstream-manifest.json`; a documentação não duplica esses valores para evitar duas fontes de verdade.

## Dois estados diferentes, por projeto

O contrato upstream deve chegar exatamente como `activation.state="shadow"`, com `runtimeConsumers=["cadu-api"]`. Isso significa que o `cadu-api` pode expor o catálogo para consulta, conciliação e revisão. Não significa que coleta ou publicação estejam ativas: todas as fontes web e todos os perfis Instagram continuam com `enabled=false`, e o relatório precisa declarar `collectionActivated=false` e `publishAttempted=false`.

No KinoCampus, essa cópia é projetada de forma ainda mais restritiva:

- `activation.state="candidate"` e `runtimeConsumers=[]` na resposta do fallback local;
- `X-Cadu-Registry-Origin: kino-campus-mirror` identifica inequivocamente a projeção;
- nenhuma fonte ou perfil é habilitado ou executado;
- readiness e mutações nunca usam o espelho;
- o publisher continua lendo exclusivamente `services/cadu-ufg-publisher/config/sources.json`.

O manifesto registra essa separação com `lifecycle="shadow"`, `readOnlyMirror=true`, `runtimeActivated=false`, `publisherUsesLegacySources=true` e o caminho exato do inventário legado ativo. Qualquer desvio faz o loader falhar fechado.

## Artefatos espelhados

- `ufg-source-registry.candidate.json`: entidades, fontes web e perfis Instagram estruturados;
- `ufg-source-registry.schema.json`: contrato JSON Schema Draft 2020-12;
- `source-reconciliation-report.json`: métricas, conflitos, quarentenas e gates de segurança;
- `upstream-manifest.json`: proveniência e política local do espelho.

## Verificação

```bash
npm run cadu:sources:check
npm run test:cadu:registry
```

O check é somente leitura. Ele valida os bytes contra o manifesto, Git blob OIDs, SHA-256, tamanhos, schema e, de forma independente do schema espelhado, os limites e enums executáveis do catálogo (`maxItems`, estratégias, tiers, papéis, tipos, endpoints, padrões, observações e transportes). Também valida hierarquia, referências entre fontes e perfis, diretórios institucionais canônicos, datas de auditoria nunca posteriores ao corte, nomes e URLs sem placeholders, URLs normalizadas, ordem canônica dos modos de execução, estados de transporte/quarentena fail-closed, IDs/URLs/handles globais, `profileUrl`, transições `supersededBy`, ativação upstream exata, `enabled=false`, proveniência cruzada entre candidato/relatório/schema, métricas normalizadas, blockers de ativação e o envelope de segurança local. Assim, adulterar e recalcular o hash do próprio schema não amplia silenciosamente os limites aceitos pelo importador.

## Atualização intencional

Uma atualização só pode ocorrer depois do merge do contrato no branch `main` do OpenClaw:

```bash
node services/cadu-ufg-publisher/scripts/sync-candidate-source-registry.js \
  --openclaw-repo /caminho/para/openclaw-cadu \
  --openclaw-commit COMMIT_COMPLETO
```

O importador:

1. confere o remoto declarado no checkout fornecido e busca a `main` canônica em um repositório bare descartável, sem alterar o checkout do operador;
2. prova que o SHA completo é ancestral do branch remoto;
3. lê os artefatos diretamente do objeto Git, recalcula os blobs e confirma, no mesmo histórico isolado, os commits/caminhos/hashes dos três inputs OpenClaw declarados na proveniência;
4. cria um segundo bare descartável, busca exclusivamente o remoto oficial KinoCampus e o branch publicado fixo `kinocampus-V75.0-foundations`, e prova nele o commit, a ancestralidade, o caminho, o tipo blob, o Git OID e o hash canônico do input `kino_publisher`, sem ler nem alterar qualquer checkout local;
5. valida catálogo, schema, relatório, métricas, referências e manifesto antes de tocar no destino;
6. adquire um lock exclusivo entre processos, revalida o baseline e impede importações/rollbacks concorrentes;
7. prepara arquivos temporários, preserva os originais como backups, substitui os artefatos e instala o manifesto por último;
8. ainda dentro da transação e com os backups preservados, relê tudo pelo mesmo verificador usado em `--check`; só então confirma a instalação e remove backups. Arquivos simples temporários e de backup são removidos com `unlink` e tentativas limitadas para contenção transitória do Windows; o retorno só ocorre depois que o nome removido deixa de existir. Qualquer falha restaura integralmente o conjunto anterior, e uma falha de rollback preserva o backup afetado para recuperação manual.

O branch KinoCampus é deliberadamente fixo, e não descoberto dinamicamente por `HEAD`: o remoto oficial ainda não publica `refs/heads/main`. Uma futura migração para `main` exige mudança explícita e revisada deste contrato; refs locais, `HEAD`, replace refs, grafts e rewrites de URL nunca servem como prova de publicação.

A transação protege contra exceções e encerramentos normais do processo, mas não promete durabilidade contra queda de energia ou falha do kernel: os temporários e o diretório ainda não recebem `fsync`. O manifesto instalado por último mantém o estado fail-closed após uma interrupção, e backups não restaurados são preservados para recuperação; isso não equivale a uma transação durável de filesystem.

Os hashes de proveniência têm duas semânticas intencionais. `openclaw_curator`, `instagram_scanner` e `admin_markdown` declaram o SHA-256 do texto no respectivo `commit:path` depois de normalizar `CRLF` e `CR` para `LF`, exatamente como o gerador OpenClaw; o Git blob OID continua provando separadamente os bytes brutos do objeto. Já `kino_publisher` declara `canonicalPayloadSha256`: o blob histórico `sources.json` é decodificado, o payload exato `{meta,sources}` é ordenado recursivamente por chave na ordem lexicográfica JavaScript por unidades UTF-16, serializado como JSON compacto e então submetido a SHA-256. Chaves JSON como `__proto__` são preservadas como dados durante essa canonicalização. O importador também confirma que o objeto é blob e que seus bytes correspondem ao Git OID; não compara incorretamente o hash canônico com o SHA bruto do arquivo.

Se já houver um espelho válido, o importador também exige avanço monotônico de commit,
`registryVersion` e `auditCutoff`. Um rollback deliberado requer `--allow-downgrade`; o override não
relaxa proveniência, schema, shadow, desativação de fontes ou qualquer outro gate de segurança. Mesmo
em rollback, uma versão já publicada não pode receber bytes diferentes.

Uma interrupção nunca transforma um conjunto parcial em catálogo confiável: o manifesto antigo passa a detectar drift, e o fallback deixa de ser servido. Para recuperar o mesmo mirror — ou avançá-lo — sem confundir reparo com rollback, execute novamente a importação com `--repair`:

```bash
node services/cadu-ufg-publisher/scripts/sync-candidate-source-registry.js \
  --openclaw-repo /caminho/para/openclaw-cadu \
  --openclaw-commit COMMIT_COMPLETO \
  --repair
```

O reparo aceita somente artefatos incoming integralmente validados e continua exigindo monotonicidade contra todo manifesto válido encontrado no destino ou em resíduos de uma transação interrompida. Para servir como baseline, o manifesto precisa conter o conjunto exato e único `candidate`/`schema`/`reconciliation-report`, caminhos fixos, Git OIDs e SHA-256 completos e tamanhos positivos seguros; os arquivos apontados podem estar em drift, pois são justamente o alvo do reparo. `--repair` não pode ser combinado com `--allow-downgrade`. Se nenhum manifesto válido permitir provar o baseline, o comando falha fechado e exige recuperação operacional do manifesto; não infere versão a partir de bytes corrompidos.

O lock registra PID, token único e ticket de eleição, é removido no encerramento normal e bloqueia uma segunda importação enquanto o processo proprietário estiver ativo. Cada participante usa arquivos de intenção imutáveis por token; assim, a limpeza de um owner comprovadamente encerrado nunca remove o intent de um processo novo. O processo também mantém em memória seus tokens ativos: um intent com o próprio PID, mas token não rastreado, é resíduo seguro de uma reutilização daquele PID e pode ser removido sem liberar um lock aninhado ainda ativo. Intents recém-criados com metadados incompletos recebem um período de proteção para evitar remover um processo ainda inicializando. Para um PID alheio ainda reportado como vivo, não há identidade de processo portável confiável neste contrato; um resíduo causado por reutilização desse PID exige recuperação manual depois de confirmar que não existe importação em curso.

## Gate de escrita e publicação

A página `/admin/cadu.html` pode consultar o espelho quando a rota do `cadu-api` estiver indisponível, mas mantém overrides bloqueados. Escrita só é possível com a resposta shadow autenticada do `cadu-api`, ETag forte, SHA-256 coerente e readiness/CAS da mesma versão. O fallback local não participa de readiness nem de `PATCH`.

O proxy mantém `GET /api/sites/{unitId}/meta` apenas para leitura compatível. O `PATCH` legado fica
desabilitado por padrão e só pode ser reaberto temporariamente com
`CADU_LEGACY_META_WRITE_ENABLED=1`; produção não deve definir essa flag.

Este espelho não é um gate de ativação. Quick, daily, full, Instagram e Pipeline Completa permanecem nos inventários legados até haver quarentena, transporte e endpoints verificados, deduplicação, dry-run observável e rollback exercitado. Nenhuma fonte ou perfil do catálogo deve ser habilitado antes desses critérios.
