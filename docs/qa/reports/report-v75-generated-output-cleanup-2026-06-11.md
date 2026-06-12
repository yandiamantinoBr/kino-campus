# Report V75 - Generated Output Cleanup

**Data:** 2026-06-11 America/Sao_Paulo
**Escopo:** housekeeping de artefatos gerados versionados
**Mudanca local destrutiva:** nao; arquivos removidos apenas do indice Git com `git rm --cached`

---

## 1. Objetivo

Remover do repositorio artefatos antigos gerados por Playwright e logs locais em `output/`, mantendo
a evidencia canonica em Markdown dentro de `docs/qa/reports/`.

---

## 2. Evidencia Coletada

`git ls-files output` retornou 27 arquivos versionados:

- 2 logs locais de servidor Playwright;
- 24 screenshots PNG historicos de runs `v8.2.x`;
- 1 arquivo TXT de evidencia gerada.

O diretorio `output/playwright-report/` tambem existe localmente, mas ja estava fora do indice.

---

## 3. Alteracoes

- `.gitignore` passou a ignorar `output/` inteiro.
- Os 27 arquivos rastreados sob `output/` foram removidos do indice Git.
- Os arquivos locais foram preservados no disco de trabalho.

---

## 4. Criterio Futuro

Evidencias permanentes devem ser redigidas e registradas em `docs/qa/reports/`. Screenshots, videos,
logs e HTMLs gerados por Playwright/LHCI devem ficar em `output/`, `test-results/` ou diretórios
locais ignorados, salvo aprovacao explicita para versionar um artefato binario especifico.
