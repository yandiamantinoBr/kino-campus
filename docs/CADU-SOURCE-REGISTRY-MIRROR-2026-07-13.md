# Espelho candidato do registro de fontes UFG

Data de corte: 2026-07-13

O KinoCampus mantém um espelho byte-idêntico do contrato candidato publicado pelo OpenClaw Cadu no commit `2d579048a5e013572a1270742db48ba8aa465ca9`.

Esta etapa não muda o universo de coleta do publisher. O runtime continua lendo somente `services/cadu-ufg-publisher/config/sources.json`; o espelho existe para que API, admin, curador, scanner e publisher possam ser migrados em PRs separados com o mesmo SHA e rollback explícito.

## Artefatos espelhados

- `ufg-source-registry.candidate.json`: 166 entidades, 194 fontes web e 83 perfis Instagram, todos desativados;
- `ufg-source-registry.schema.json`: contrato Draft 2020-12;
- `source-reconciliation-report.json`: conflitos e bloqueios de ativação;
- `upstream-manifest.json`: commit OpenClaw, Git blob OID, SHA-256 e tamanho de cada arquivo.

## Verificação

```bash
npm run cadu:sources:check
npm run test:cadu:registry
```

O check é read-only. Ele valida os bytes contra o manifesto, o Git blob de origem, os hashes SHA-256, o schema Draft 2020-12 completo, as relações entre entidades, o lifecycle `candidate`, `runtimeConsumers=[]`, IDs globais e `enabled=false` para todas as fontes e perfis.

## Atualização intencional

Uma atualização exige primeiro merge do contrato no OpenClaw. O importador atualiza `origin/main`, prova que o commit é ancestral do branch remoto, lê os três artefatos diretamente daquele objeto Git, deriva os blobs internamente e nunca confia em arquivos soltos informados pelo operador:

```bash
node services/cadu-ufg-publisher/scripts/sync-candidate-source-registry.js \
  --openclaw-repo /caminho/para/openclaw-cadu \
  --openclaw-commit COMMIT_COMPLETO
```

O importador rejeita commit inexistente ou ainda não publicado em `origin/main`, remoto divergente, caminho/objeto inesperado, schema inválido, hierarquia cíclica ou qualquer byte que não corresponda ao blob presente naquele commit.

## Estado do painel e próximo gate

O loader espelhado permanece em `scripts/lib`, fora de `src`, e o publisher continua isolado do candidato. A página `/admin/cadu.html`, porém, já lê a projeção viva da API v2 em modo shadow. A escrita de tier/nota só é habilitada quando, na mesma carga:

1. a lista possui ETag forte e SHA-256 coerente;
2. `/api/source-registry/readiness` confirma `cadu-unit-meta-cas-v1`, fase A, todas as verificações verdadeiras e o mesmo SHA/versão;
3. a fonte é escrita por ID estável com `If-Match` e o efeito é relido com o novo ETag.

Se readiness/CAS falhar, o catálogo continua visível, mas os controles ficam somente leitura. Se o próprio contrato da lista falhar, o mapa legado também fica somente leitura e não pode chamar publicação. O boundary OpenClaw ainda deve rejeitar qualquer URL/perfil que pertença ao registro shadow, mesmo que um cliente contorne a UI.

O painel agora preserva `viaSourceObservation` e `viaEntityIds`: um Instagram confirmado só pode ser selecionado como referência executável futura quando houver exatamente uma associação direta e não compartilhada. Conflitos CAS preservam a máscara explícita dos campos tocados, inclusive a intenção `tier:null`/`note:null`, sem retry automático.

O fallback direto mapeia explicitamente `/api/cadu/sites/source-registry...` para `/api/source-registry...`; produção continua usando o proxy same-origin, sem expor `CADU_API_TOKEN` no navegador.

Ainda não é gate de ativação: quick/daily/full/IG e a Pipeline Completa continuam nos inventários legados. A migração desses consumidores exige quarentena das fontes inseguras, transporte/endpoints verificados, deduplicação de alvos, rollout observável e rollback exercitado. Nenhuma fonte ou perfil do registro deve ser habilitado antes desses critérios.
