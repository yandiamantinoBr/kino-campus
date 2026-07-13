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

## Próximo gate

O loader permanece em `scripts/lib`, fora de `src`, e o teste de isolamento varre recursivamente todo o runtime. Nenhum consumidor deve importá-lo no fluxo normal até que existam API v2, migração não destrutiva dos overrides, shadow dos modos quick/daily/full/IG, deduplicação de alvos e rollback exercitado. A página `/admin/cadu.html` continuará usando o endpoint legado até esse contrato estar pronto.
