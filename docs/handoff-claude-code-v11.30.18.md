# Handoff Claude Code — KinoCampus após `v11.30.18`

Copie o prompt abaixo para Claude Code quando quiser continuar a linha de desenvolvimento a partir do estado real atual do repositório.

---

## Prompt

Atue como um engenheiro de software sênior responsável por continuar a evolução do projeto **KinoCampus** com segurança máxima, sem quebrar funcionalidades existentes.

### 1. Contexto do projeto

- **Projeto:** KinoCampus
- **Objetivo do produto:** plataforma universitária da UFG para economia circular e comunidade, com módulos de compra e venda, caronas, moradia, eventos, oportunidades e achados/perdidos
- **Stack:** HTML5 + CSS3 + Vanilla JS sem bundler/framework
- **Padrão JS:** todos os arquivos de runtime seguem IIFE (`(function () { 'use strict'; ... })();`)
- **Comunicação entre módulos:** `window.*`
- **Hospedagem:** Vercel
- **Backend:** Supabase
- **Branch principal:** `kinocampus-V11.0-foundations`
- **Produção:** `https://www.kinocampus.com.br`

### 2. Regras arquiteturais que não podem ser violadas

1. Não quebrar nenhuma funcionalidade consolidada da plataforma.
2. Sempre manter compatibilidade com a arquitetura atual baseada em IIFE e globals controlados via `window.*`.
3. Nunca usar `require`/`import` nos assets JS carregados por `<script defer>`.
4. Sempre sanitizar dados dinâmicos antes de `innerHTML` com `window.KCUtils.escapeHtml(...)` ou helper local equivalente que delegue para ele.
5. Preferir mudanças pequenas, incrementais e reversíveis.
6. Sempre que uma mudança atingir padrões equivalentes, revisar todos os arquivos irmãos relacionados antes de concluir.
7. Toda iteração deve atualizar:
   - `README.md`
   - `RELATORIO-KINOCAMPUS-V11.md`
8. Toda iteração deve seguir o fluxo completo:
   - criar branch
   - implementar
   - rodar testes
   - commit
   - push
   - abrir PR
   - validar deploy/preview
   - squash merge
   - deletar branch
   - pull na base
9. Validar deploy no Vercel e smoke HTTP 200 em produção ao final.
10. Se houver SQL/migration futura, aplicar no Supabase quando a fase exigir, documentando exatamente o que foi aplicado.

### 3. Estado atual consolidado da base

- A rodada principal da `v11` foi concluída no release gate `v11.23.0`.
- A trilha de i18n/a11y/UX Writing foi planejada e parcialmente implantada em `v11.24.x`.
- A trilha iOS/Safari foi encerrada em `v11.27.x`.
- A trilha de paridade de controllers foi encerrada em `v11.28.x`.
- A trilha SWR residual foi concluída em `v11.29.x`.
- A trilha `v11.30.x` foi encerrada com hardening final em `v11.30.18`.

### 4. Baseline atual obrigatória

- **Testes:** `80/80` suites
- **Testes totais:** `1303/1303`
- **Hygiene:** `8.6.0`

Comandos que devem continuar verdes:

```bash
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

### 5. Estado do split dos hotspots

#### `supabase.adapter.js`

- Trilha encerrada.
- Split concluído: `10/10` grupos extraídos.
- Arquivo reduzido de `4041L` para `420L`.
- Namespace interno: `window._KCSA`.

#### `product.controller.js`

- Trilha `v11.30.x` encerrada.
- O controller foi reduzido de `3368L` para `1298L`.
- O split foi estabilizado com submódulos em `window._KCProduct`.

Submódulos já existentes:

- `product.report.js`
- `product.related.js`
- `product.calendar.js`
- `product.save.js`
- `product.ratings.js`
- `product.edit.js`
- `product.analytics.js`
- `product.popovers.js`

Script order atual em `_product.html`:

1. `product.controller.js`
2. `product.report.js`
3. `product.related.js`
4. `product.calendar.js`
5. `product.save.js`
6. `product.ratings.js`
7. `product.edit.js`
8. `product.analytics.js`
9. `product.popovers.js`

### 6. O que a `v11.30.18` fez

- Adicionou a suíte estática `tests/product.controller-split-contract.test.js`
- Travou em contrato:
  - guards de `window._KCProduct.*`
  - delegação do `renderPost(...)` para submódulos
  - delegação do `DOMContentLoaded`
  - ausência das implementações já extraídas dentro do core
  - ordem canônica dos scripts do detalhe em `_product.html`
- Normalizou o bloco de scripts `defer` em `_product.html`
- Não criou novo submódulo nem abriu refactor amplo
- Encerrrou a trilha `v11.30.x`

### 7. Arquivos que você deve ler antes de continuar

Leia primeiro:

- `README.md`
- `RELATORIO-KINOCAMPUS-V11.md`
- `docs/roadmap-v11.25-v11.30.md`
- `docs/monolith-audit-v11.30.md`
- `assets/js/controllers/product.controller.js`
- `assets/js/controllers/product.report.js`
- `assets/js/controllers/product.related.js`
- `assets/js/controllers/product.calendar.js`
- `assets/js/controllers/product.save.js`
- `assets/js/controllers/product.ratings.js`
- `assets/js/controllers/product.edit.js`
- `assets/js/controllers/product.analytics.js`
- `assets/js/controllers/product.popovers.js`
- `_product.html`
- `tests/product.controller-split-contract.test.js`

### 8. Próxima fase recomendada

Inicie por uma **nova auditoria controlada** do próximo hotspot monolítico, com recomendação inicial para:

- `kc-create-post.js`

Objetivo da próxima fase sugerida:

1. medir tamanho, grupos internos e pontos de acoplamento
2. mapear riscos de extração segura
3. definir se o próximo ciclo deve ser:
   - apenas hardening/contrato
   - ou novo split incremental em submódulos

Se, após a auditoria, `kc-create-post.js` não for o melhor hotspot, você pode propor alternativa, mas precisa justificar tecnicamente com base no repositório atual.

### 9. Estratégia de execução esperada para a próxima rodada

1. Auditar o hotspot escolhido antes de editar.
2. Preferir PRs pequenos e monotemáticos.
3. Não misturar refactor estrutural com mudança funcional grande.
4. Se houver extração, seguir o padrão já consolidado:
   - core/orquestrador enxuto
   - submódulos em namespace `window._...`
   - suíte estática de contrato
   - `_product.html` ou HTML equivalente com ordem de scripts explícita
5. Validar preview no Vercel antes do merge.
6. Validar produção após promote.

### 10. Workflow obrigatório de Git / PR / Deploy

Use sempre este fluxo:

```bash
git checkout kinocampus-V11.0-foundations
git pull
git checkout -b codex/<nome-da-iteracao>

# implementar

npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check

git add <arquivos>
git commit -m "<tipo>: <resumo da iteracao>"
git push -u origin codex/<nome-da-iteracao>
gh pr create --base kinocampus-V11.0-foundations
gh pr checks <PR> --watch
gh pr merge <PR> --squash --delete-branch
git checkout kinocampus-V11.0-foundations
git pull
```

Depois:

```bash
vercel ls kino-campus --scope yannakamurabrs-projects
vercel inspect <deployment-ou-url> --scope yannakamurabrs-projects
vercel promote <deployment-id> --scope yannakamurabrs-projects --yes
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/<rota>?ts=<timestamp>"
```

### 11. Resultado esperado de você

Quando continuar:

- faça primeiro uma leitura técnica do estado real do hotspot escolhido
- proponha uma fase pequena e segura
- implemente
- valide
- atualize `README.md` e `RELATORIO-KINOCAMPUS-V11.md`
- preserve rigor, coerência e continuidade com a linha v11 já existente

Se encontrar alguma fragilidade estrutural inesperada, não force refactor grande. Replaneje em uma fase menor e documente o motivo.

---

Fim do handoff.
