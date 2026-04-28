# Guia de Desenvolvimento para IA — KinoCampus

**Versão:** v21.0.0 · **Atualizado em:** 2026-04-28

> **Leia este documento integralmente antes de qualquer modificação.**
> Este guia é auto-contido: uma IA sem contexto anterior deve conseguir trabalhar
> no projeto apenas com este documento + os catálogos referenciados ao final.

---

## Índice

1. [Contexto do projeto](#1-contexto-do-projeto)
2. [Workflow obrigatório por iteração](#2-workflow-obrigatório-por-iteração)
3. [Padrões obrigatórios de código JS](#3-padrões-obrigatórios-de-código-js)
4. [Os 5 validators — o que verifica e como corrigir](#4-os-5-validators--o-que-verifica-e-como-corrigir)
5. [Testes — como adicionar e rodar](#5-testes--como-adicionar-e-rodar)
6. [Documentação — como atualizar](#6-documentação--como-atualizar)
7. [Comunicação e commits](#7-comunicação-e-commits)
8. [O que NUNCA fazer](#8-o-que-nunca-fazer)
9. [Onde aprender mais — referência rápida](#9-onde-aprender-mais--referência-rápida)

---

## 1. Contexto do projeto

### O que é o KinoCampus

Plataforma de comunidade universitária para a **Universidade Federal de Goiás (UFG)**. Conecta alunos, professores e egressos em 6 módulos temáticos: Compra e Venda, Caronas, Moradia, Eventos, Oportunidades e Achados e Perdidos. Acesso restrito a e-mails institucionais (`@ufg.br`, `@discente.ufg.br`, `@egresso.ufg.br`).

**URL de produção:** [kinocampus.com.br](https://www.kinocampus.com.br)

### Stack — imutável

| Camada | Tecnologia | Restrição |
|--------|-----------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS (IIFE, sem framework) | **Sem React, Vue, TypeScript, bundler, transpiler ou npm em prod** |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions + Realtime) | — |
| Hosting | Vercel | `vercel.json` é imutável sem aprovação explícita |
| Build | `node scripts/inject-env.js` | Substitui placeholders `__KC_*__` nas variáveis |
| Testes | Jest (134 suites) + Playwright (8 suites E2E) | Nunca reduzir contagem |
| JS | `import`/`export` ES modules **proibidos** | Somente `window.*` para exports |

### Estado atual (v21)

| Campo | Valor |
|-------|-------|
| Branch principal | `kinocampus-V21.0-foundations` |
| Branch de features | `feature/v21.X.Y-descricao-curta` |
| appVersion | `21.0.0` (V21 encerrada; `.claude/worktrees/*` ignorado e artefatos V9 preservados em `docs/archive/claude-worktree-v9/`) |
| frontendRuntimeVersion | `8.6.0` (constante canônica — **nunca alterar**) |
| Jest | 134 suites · 3046 testes |
| check:all | 5/5 validators verdes |
| Itens validados (check:structure) | 158 |

### Onde fica cada coisa

```
kino-campus/
├── assets/js/                  ← Todo JavaScript do frontend
│   ├── boot/          (6)      ← kc-constants.js, kc-env.js, kc-feature-flags.js, ...
│   ├── core/         (11)      ← kc-auth.ui.js, kc-notifications.js, kc-core.js, ...
│   ├── api/          (16)      ← kc-api.client.js (fachada KCAPI) + sub-módulos
│   ├── utils/         (8)      ← kc-utils.js + sub-módulos _KCU.*
│   ├── features/     (10)      ← funcionalidades de página: feed, search, create, ...
│   ├── features/create-post/ (7)
│   ├── shared/        (7)      ← componentes reutilizáveis entre páginas
│   ├── legacy-shims/  (1)      ← compatibilidade retroativa
│   ├── components/    (3)      ← carousel.js, toast.js, voting.js
│   ├── adapters/local/   (8)   ← driver de dados local (localStorage + JSON)
│   └── adapters/supabase/(11)  ← driver de dados Supabase (produção)
│   controllers/
│   ├── public/       (31)      ← 1 controller por página pública
│   └── admin/        (10)      ← controllers das 5 páginas admin
├── assets/css/                 ← 5 arquivos CSS de produção
├── assets/css/future-split/    ← stubs não carregados (não modificar)
├── data/database.json          ← fixture para driver local
├── docs/                       ← Toda documentação técnica
├── scripts/                    ← 5 validators + inject-env.js
├── tests/                      ← 134 suites Jest
│   ├── unit/         (22)
│   ├── integration/  (90)
│   ├── contract/      (7)
│   ├── structure/    (10)
│   ├── a11y/          (5)
│   └── e2e/           (8)      ← Playwright
└── VERSION.json                ← Fonte de verdade de versão
```

---

## 2. Workflow obrigatório por iteração

### Sequência exata — não pular etapas

```
1. git checkout kinocampus-V21.0-foundations
2. git pull
3. git checkout -b feature/v21.X.Y-descricao-curta
4. [ implementar mudanças ]
5. npm run check:all          ← DEVE ser 5/5 verdes
   npm test                   ← DEVE ser ≥134/134 suites, ≥3046/3046 testes
6. git add <arquivos específicos>
7. git commit -m "tipo(escopo): descrição\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
8. git push -u origin feature/v21.X.Y-descricao-curta
9. gh pr create --title "..." --body "..."
10. gh pr merge <número> --squash --delete-branch
11. git checkout kinocampus-V21.0-foundations
12. git pull
```

### Nomeação de branches

```
feature/v21.X.Y-descricao-curta

Exemplos válidos:
  feature/v21.1.0-worktree-archive
  feature/v21.2.0-repo-hygiene
  feature/v21.3.0-history-index

Proibido:
  main, master, develop, fix/..., hotfix/...
  Qualquer nome sem o prefixo feature/v21.X.Y-
```

### Regras do PR

- **Squash merge obrigatório** (`--squash`) — mantém histórico limpo
- **Delete branch obrigatório** (`--delete-branch`) após merge
- Título do PR: igual ao commit principal, máximo 70 caracteres
- Corpo do PR: seções `## Summary` (bullets) e `## Test plan` (checklist)
- Sempre incluir `🤖 Generated with [Claude Code](https://claude.com/claude-code)` no corpo

### Antes de qualquer commit

```bash
npm run check:all    # OBRIGATÓRIO — deve exibir 5 "OK" em sequência
npm test             # OBRIGATÓRIO — deve exibir "134 passed, 134 total"
```

Se qualquer check falhar → corrigir antes de commitar. Nunca commitar com falha.

---

## 3. Padrões obrigatórios de código JS

### IIFE + `'use strict'` — obrigatório em todos os módulos

```javascript
// ✅ CORRETO — todo módulo JS deve ter esta estrutura
(function () {
  'use strict';

  // implementação aqui

  window.MeuModulo = Object.freeze({
    metodo1,
    metodo2,
  });
})();
```

```javascript
// ❌ PROIBIDO — ES modules
export function metodo() { ... }
import { metodo } from './outro.js';

// ❌ PROIBIDO — classe sem IIFE
class MeuModulo { ... }
window.MeuModulo = new MeuModulo();
```

### `window.*` para exports — sem exceções

```javascript
// ✅ CORRETO
window.KC_CONSTANTS = Object.freeze({ VERSION: '8.6.0', ... });
window.KCAPI = Object.freeze({ getPosts, createPost, signIn, ... });
window.KCUtils = Object.freeze({ escapeHtml, normalizeText, ... });

// ❌ PROIBIDO
module.exports = { ... };
export default { ... };
```

### `Object.freeze()` para contratos públicos

Todo objeto exposto via `window.*` deve ser congelado para prevenir mutação acidental em runtime:

```javascript
// ✅ CORRETO
window.MeuModulo = Object.freeze({
  metodo1,
  metodo2,
});

// ❌ PROIBIDO — objeto mutável
window.MeuModulo = {
  metodo1,
  metodo2,
};
```

### `escapeHtml()` ANTES de `innerHTML` — obrigatório

**Todo conteúdo controlado pelo usuário** exibido via `innerHTML` DEVE ser sanitizado:

```javascript
// ✅ CORRETO — obrigatório
el.innerHTML = '<h2>' + KCUtils.escapeHtml(post.titulo) + '</h2>';
el.innerHTML = '<p>' + KCUtils.escapeHtml(post.descricao) + '</p>';
el.innerHTML = '<span>' + KCUtils.escapeHtml(user.nome) + '</span>';

// ❌ PROIBIDO — vulnerabilidade XSS direta
el.innerHTML = post.titulo;
el.innerHTML = '<p>' + descricao + '</p>';
container.innerHTML = userInput;
```

**Quando `escapeHtml` NÃO é necessário:**
- Conteúdo estático em strings literais do código
- `textContent` (não renderiza HTML — é seguro por natureza)
- `el.textContent = post.titulo;` ← correto

### Sem event handlers inline no HTML

```html
<!-- ❌ PROIBIDO — viola CSP e é detectado pelo check:hygiene -->
<button onclick="handleClick()">Publicar</button>
<a href="javascript:void(0)" onclick="doSomething()">Link</a>
<form onsubmit="handleSubmit(event)">

<!-- ✅ CORRETO — addEventListener no JS -->
<button id="btn-publicar">Publicar</button>
```

```javascript
// ✅ CORRETO — no arquivo JS do controller
document.getElementById('btn-publicar').addEventListener('click', handleClick);
```

### Convenções de nomenclatura de arquivos

| Tipo | Padrão | Exemplos |
|------|--------|---------|
| Módulo boot | `kc-nome.js` | `kc-constants.js`, `kc-env.js` |
| Módulo utils | `kc-utils.nome.js` | `kc-utils.string.js`, `kc-utils.format.js` |
| Sub-módulo KCAPI | `kc-api.nome.js` | `kc-api.auth.js`, `kc-api.posts-feed.js` |
| Controller público | `nome.controller.js` | `eventos.controller.js`, `product.controller.js` |
| Controller admin | `admin-nome.controller.js` | `admin-dashboard.controller.js` |
| Adapter local | `local.nome.adapter.js` | `local.posts-read.adapter.js` |
| Adapter Supabase | `supabase.nome.adapter.js` | `supabase.posts-read.adapter.js` |

### Checklist para adicionar um novo módulo JS

1. Criar o arquivo no diretório canônico correto (`assets/js/<grupo>/`)
2. Envolver tudo em `(function () { 'use strict'; ... })();`
3. Expor via `window.NomeModulo = Object.freeze({...})`
4. Adicionar a entrada em `CANONICAL_JS` em `scripts/validate-repository-structure.js`
5. Adicionar `<script defer src="...">` nos HTMLs que precisam do módulo (após suas dependências)
6. Criar suite de testes em `tests/` cobrindo o contrato público
7. Atualizar `docs/architecture/module-catalog.md` com a entrada do novo módulo

---

## 4. Os 5 validators — o que verifica e como corrigir

### Executar todos de uma vez

```bash
npm run check:all
# Equivalente a:
npm run check:version && npm run check:structure && npm run check:scripts && npm run check:routes && npm run check:hygiene && npm test
```

---

### `check:version` — `scripts/validate-version-map.js`

**O que verifica:**
- `VERSION.json` existe e tem todos os 6 campos obrigatórios: `project`, `appVersion`, `frontendRuntimeVersion`, `branch`, `status`, `updatedAt`
- `frontendRuntimeVersion` é exatamente `"8.6.0"` (constante canônica imutável)
- `branch` é exatamente `"kinocampus-V21.0-foundations"`
- `appVersion` tem formato semântico `X.Y.Z`
- `updatedAt` tem formato `YYYY-MM-DD`
- A string `'8.6.0'` aparece literalmente em ~17 arquivos JS (todos devem bater)

**Como corrigir:**

```json
// VERSION.json — campos obrigatórios
{
  "project": "KinoCampus",
  "appVersion": "21.0.0",
  "frontendRuntimeVersion": "8.6.0",
  "branch": "kinocampus-V21.0-foundations",
  "status": "v21 encerrada",
  "updatedAt": "2026-04-28"
}
```

Nunca altere `frontendRuntimeVersion` — é `8.6.0` para sempre nesta baseline.

---

### `check:structure` — `scripts/validate-repository-structure.js`

**O que verifica:**
- Todos os diretórios em `REQUIRED_DIRS` existem (inclui `assets/js/components`)
- Todos os 72 arquivos em `CANONICAL_JS` existem nos seus caminhos exatos
- A raiz `assets/js/` está **vazia** (zero arquivos `.js` direto na raiz)
- Total: **156 itens verificados**

**Como corrigir se falhar:**

```
[validate-repository-structure] ERRO: arquivo não encontrado: assets/js/components/toast.js
→ O arquivo foi movido ou excluído. Restaurar ao caminho exato.

[validate-repository-structure] ERRO: assets/js/ não está vazia — arquivo detectado: kc-novo.js
→ Mover o arquivo para um subdiretório canônico (boot/, core/, api/, utils/, etc.)

[validate-repository-structure] ERRO: diretório não encontrado: assets/js/components
→ O diretório foi removido. Restaurar ou criar.
```

**Para adicionar um novo arquivo JS canônico:**

```javascript
// Em scripts/validate-repository-structure.js
var CANONICAL_JS = [
  // ... entradas existentes ...
  // meu-grupo/
  'assets/js/meu-grupo/meu-modulo.js',  // ← adicionar aqui
];
```

---

### `check:scripts` — `scripts/validate-script-chains.js`

**O que verifica:**
- Os 22 HTMLs canônicos contêm a cadeia de boot obrigatória **na ordem correta**:
  ```
  assets/js/boot/kc-constants.js
  assets/js/boot/kc-env.js
  assets/js/boot/kc-feature-flags.js
  assets/js/boot/kc-sw-register.js
  assets/js/boot/kc-telemetry.js
  ```

**Como corrigir:**

```
[validate-script-chains] ERRO: _eventos.html — kc-env.js aparece antes de kc-constants.js
→ Reordenar as tags <script defer> para que kc-constants.js venha primeiro.

[validate-script-chains] ERRO: _events.html — kc-feature-flags.js não encontrado
→ Adicionar <script defer src="../assets/js/boot/kc-feature-flags.js?v=8.6.0"></script>
   (prefixo ../ para páginas em subdiretórios, assets/ para páginas na raiz)
```

**Padrão de tag script em páginas da raiz:**
```html
<script defer src="assets/js/boot/kc-constants.js?v=8.6.0"></script>
<script defer src="assets/js/boot/kc-env.js?v=8.6.0"></script>
```

**Padrão de tag script em páginas admin (`admin/*.html`):**
```html
<script defer src="../assets/js/boot/kc-constants.js?v=8.6.0"></script>
<script defer src="../assets/js/boot/kc-env.js?v=8.6.0"></script>
```

---

### `check:routes` — `scripts/validate-public-routes.js`

**O que verifica:**
- 22 rotas declaradas em `vercel.json` correspondem aos 22 arquivos HTML existentes
- CSS de produção (`styles.css`, `kc-theme-boot.css`, etc.) está presente

**Como corrigir:**

```
[validate-public-routes] ERRO: rota /minha-pagina declarada mas _minha-pagina.html não existe
→ Criar o arquivo HTML ou remover a rota do vercel.json (somente com aprovação explícita).

[validate-public-routes] ERRO: assets/css/styles.css não encontrado
→ O arquivo CSS foi movido ou excluído. Restaurar ao caminho canônico.
```

**ATENÇÃO:** `vercel.json` é imutável. Nunca adicionar, remover ou alterar rotas sem aprovação explícita do usuário.

---

### `check:hygiene` — `scripts/hygiene-check.js`

**O que verifica (múltiplos gates):**

| Gate | O que verifica |
|------|----------------|
| `runVersionChecks()` | String `'8.6.0'` em ~17 arquivos JS canônicos |
| `runI18nB2GateChecks()` | `kc-i18n.js` ≥440 chaves, ≥800 linhas; 22 HTMLs com ≥189 `data-i18n-aria-label`, ≥59 `data-i18n-placeholder`, ≥55 `data-i18n-tooltip`, ≥5 `data-i18n-alt` |
| `runKcUtilsChainChecks()` | Cadeia `kc-utils.string → format → dom → identity → taxonomy → location → presentation → kc-utils.js` em 22 HTMLs |
| `runInlineHandlerChecks()` | Nenhum `on*=` inline nos 22 HTMLs (`onclick=`, `onsubmit=`, etc.) |
| `runScriptChainChecks()` | Cadeias canônicas: local adapters, supabase adapters, admin-dashboard, profile |
| `runA11yStructureChecks()` | `<h1>` único por página, skip link, `<main id="kc-main">`, nav com `aria-label` |

**Como corrigir cada gate:**

```
Hygiene FAILED: kc-api.client.js — string '8.6.0' não encontrada
→ O arquivo perdeu a declaração VERSION = '8.6.0'. Restaurar a constante.

Hygiene FAILED: _eventos.html — inline handler detectado: onclick="..."
→ Remover o atributo onclick e usar addEventListener() no JS.

Hygiene FAILED: kc-utils chain inválida em _product.html
→ Verificar a ordem das tags <script> dos sub-módulos kc-utils.*.js.

Hygiene FAILED: i18n B2 gate — kc-i18n.js tem 430 chaves (mínimo: 440)
→ Não remover chaves do dicionário i18n. Restaurar as chaves removidas.
```

---

## 5. Testes — como adicionar e rodar

### Onde colocar novos testes

| Tipo de mudança | Diretório | Padrão de arquivo |
|----------------|-----------|-------------------|
| Novo módulo JS (unit) | `tests/unit/` | `nome-modulo.test.js` |
| Controller ou fluxo de integração | `tests/integration/` | `nome.controller.test.js` |
| Contrato KCAPI (métodos, assinaturas) | `tests/contract/` | `kc-api-nome.test.js` |
| Validators, estrutura de repositório | `tests/structure/` | `nome-check.test.js` |
| Acessibilidade (WCAG 2.1 AA) | `tests/a11y/` | `nome-a11y.test.js` |
| E2E (fluxo no browser real) | `tests/e2e/` | `nome.spec.js` (Playwright) |

### Como rodar testes

```bash
# Rodar tudo (obrigatório antes de commitar)
npm test

# Rodar apenas uma suite específica
npx jest tests/unit/kc-utils-string.test.js

# Rodar suites que correspondem a um padrão
npx jest --testPathPattern="kc-utils"

# Rodar com output detalhado
npx jest --verbose

# Rodar apenas testes que falharam recentemente
npx jest --onlyFailures

# Rodar E2E com Playwright
npm run test:e2e
```

### Estrutura mínima de uma nova suite

```javascript
// tests/unit/meu-modulo.test.js
'use strict';

// Carregar dependências do módulo no contexto do Node.js
const fs = require('fs');
const path = require('path');

// Configurar globals necessários (simular browser)
global.window = {};
global.window.KC_CONSTANTS = { VERSION: '8.6.0' };

// Carregar o módulo sendo testado
eval(fs.readFileSync(
  path.join(__dirname, '../../assets/js/meu-grupo/meu-modulo.js'),
  'utf8'
));

describe('MeuModulo', () => {
  describe('contrato estático', () => {
    it('deve estar exposto em window.MeuModulo', () => {
      expect(window.MeuModulo).toBeDefined();
    });

    it('deve ser um objeto frozen', () => {
      expect(Object.isFrozen(window.MeuModulo)).toBe(true);
    });

    it('deve expor os métodos do contrato público', () => {
      expect(typeof window.MeuModulo.metodo1).toBe('function');
      expect(typeof window.MeuModulo.metodo2).toBe('function');
    });
  });

  describe('metodo1', () => {
    it('deve retornar X quando recebe Y', () => {
      expect(window.MeuModulo.metodo1('Y')).toBe('X');
    });
  });
});
```

### Regra de ouro dos testes

**Nunca reduzir o número de suites ou de testes.**

- Antes de commitar: `npm test` deve mostrar `≥134 passed, 134 total` e `≥3046 passed, 3046 total`
- Se uma nova suite é criada, a contagem sobe — o gate da suite nova deve ser documentado no commit
- Nunca deletar suites existentes
- Nunca comentar ou pular testes (`it.skip`, `describe.skip`) sem aprovação explícita

---

## 6. Documentação — como atualizar

### Quando atualizar documentação

| Tipo de mudança | Documentos a atualizar |
|----------------|------------------------|
| Novo módulo JS | `module-catalog.md` + `repository-structure.md` |
| Novo controller | `controllers-catalog.md` + `script-loading-reference.md` |
| Novo script em HTML | `script-loading-reference.md` |
| Nova rota / HTML | `script-loading-reference.md` + `api-contract.md` + `repository-structure.md` |
| Mudança em KCAPI | `api-contract.md` + `module-catalog.md` |
| Mudança no banco | `db-schema.md` + `rpc-catalog.md` |
| Mudança em CSS | `css-architecture.md` |
| Mudança nos validators | seção correspondente deste guia (`ai-development-guide.md`) |
| Nova versão de release | `CHANGELOG.md` + `VERSION.json` + `README.md` + relatório raiz da versão |

### Documentos canônicos por domínio

| Domínio | Documento |
|---------|-----------|
| Arquitetura geral | `docs/architecture.md` |
| Estrutura do repositório | `docs/architecture/repository-structure.md` |
| Catálogo de módulos (~84) | `docs/architecture/module-catalog.md` |
| Catálogo de controllers (41) | `docs/architecture/controllers-catalog.md` |
| Ordem de scripts nos 22 HTMLs | `docs/architecture/script-loading-reference.md` |
| Fluxo de dados ponta a ponta | `docs/architecture/data-flow-guide.md` |
| Este guia (comportamento de IA) | `docs/architecture/ai-development-guide.md` |
| Estratégia de testes | `docs/architecture/test-strategy.md` |
| Arquitetura CSS | `docs/architecture/css-architecture.md` |
| Contrato KCAPI | `docs/api-contract.md` |
| Esquema do banco | `docs/db-schema.md` |
| RPCs e triggers | `docs/rpc-catalog.md` |
| Schemas de módulos | `docs/module-schemas.md` |
| Variáveis de ambiente | `docs/env-vars.md` |
| Design system | `docs/design-system.md` |
| Índice de documentos | `docs/index.md` |

### Versionamento de documentos

Todo documento canônico deve ter uma linha de versão no cabeçalho:

```markdown
**Versão:** v16.8.0 · **Atualizado em:** 2026-04-27
```

Ao atualizar um documento existente:
1. Incrementar a versão no cabeçalho (usar a iteração atual, ex: `v16.11.0`)
2. Atualizar a data
3. Registrar o delta no `CHANGELOG.md` se for mudança significativa

---

## 7. Comunicação e commits

### Idioma

- **Documentação, comentários, commits, PRs:** português do Brasil (pt-BR)
- **Nomes de arquivos, variáveis, funções, namespaces, APIs:** inglês (convenção técnica)
- **Strings de usuário no frontend:** português do Brasil

### Formato de commit

```
tipo(escopo): descrição curta em pt-BR (máx 72 chars)

Parágrafo opcional com contexto adicional.
O que foi feito e por que — não o como.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**Tipos válidos:**

| Tipo | Quando usar |
|------|-------------|
| `feat` | Nova funcionalidade de negócio |
| `fix` | Correção de bug |
| `docs` | Documentação apenas |
| `refactor` | Refactor sem mudança de comportamento |
| `test` | Adicionar ou corrigir testes |
| `chore` | Tarefas de manutenção (validators, configs) |

**Exemplos válidos:**

```bash
# ✅ CORRETO
git commit -m "$(cat <<'EOF'
docs(v16.8.0): adiciona guia de desenvolvimento para IA

Documento auto-contido com workflow, padrões de código, validators,
testes e referência rápida para qualquer IA trabalhar no projeto.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

git commit -m "$(cat <<'EOF'
fix(validator): adiciona components/ ao CANONICAL_JS

carousel.js, toast.js e voting.js estavam faltando da lista de
arquivos canônicos. Validator agora verifica 158 itens (baseline V21).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Exemplos inválidos:**

```bash
# ❌ PROIBIDO — vago demais
git commit -m "update"
git commit -m "fix stuff"
git commit -m "changes"

# ❌ PROIBIDO — em inglês
git commit -m "add documentation for AI guide"

# ❌ PROIBIDO — sem Co-Author
git commit -m "docs: guia de IA"
```

### Staging seletivo

Sempre usar `git add <arquivo específico>` — nunca `git add .` ou `git add -A`:

```bash
# ✅ CORRETO — staging seletivo
git add docs/architecture/ai-development-guide.md
git add README.md docs/index.md

# ❌ PROIBIDO — pode incluir .env, arquivos temporários, etc.
git add .
git add -A
```

---

## 8. O que NUNCA fazer

### Arquivos e configurações

| Proibido | Motivo |
|----------|--------|
| Alterar `vercel.json` sem aprovação explícita | Quebra rotas de produção |
| Alterar `vercel.json` rewrites/routes | Contrato imutável com Vercel |
| Mover arquivos JS de um diretório para outro | V15 encerrou a fase de reorganização; check:structure falhará |
| Deletar arquivos JS canônicos | check:structure falhará |
| Alterar `assets/css/future-split/` | São stubs não-carregados; preservar para futura execução |

### Código

| Proibido | Motivo |
|----------|--------|
| `import` / `export` ES modules | Não funciona sem bundler; viola padrão IIFE |
| `require()` no código de produção | É Node.js; o browser não tem |
| `eval()` no código de produção | Viola CSP; risco de segurança |
| `on*` inline em HTML (`onclick=`, `onsubmit=`) | Viola CSP; detectado por check:hygiene |
| `innerHTML` sem `escapeHtml()` em conteúdo de usuário | Vulnerabilidade XSS direta |
| Instalar dependências de produção (`npm install --save`) | Stack vanilla — sem npm em prod |
| Usar React, Vue, Angular, TypeScript, Babel, Webpack, Vite | Stack imutável |
| Push direto para `kinocampus-V21.0-foundations` | Branch protegida — fluxo via PR |
| `git push --force` em qualquer branch | Proibido sem aprovação explícita |
| `git commit --amend` em commits já publicados | Reescreve histórico público |

### Testes

| Proibido | Motivo |
|----------|--------|
| Deletar suites existentes | Reduz cobertura; vide regra de ouro |
| `it.skip` ou `describe.skip` sem aprovação | Mascara falhas |
| Reduzir contagem de testes sem aprovação explícita | Contagem mínima é 134/3046 |
| Commitar com `npm test` com falhas | Proibido terminantemente |

### Validators

| Proibido | Motivo |
|----------|--------|
| Commitar com `check:all` falhando | Proibido terminantemente |
| Remover entradas de `CANONICAL_JS` | Reduz gate de integridade |
| Remover entradas de `REQUIRED_DIRS` | Idem |
| Alterar `frontendRuntimeVersion` | Constante canônica = `8.6.0` para sempre |
| Rebaixar thresholds dos validators | Enfraquece a proteção estrutural |

---

## 9. Onde aprender mais — referência rápida

| Dúvida | Documento |
|--------|-----------|
| O que cada módulo JS faz, namespace, dependências, testes | `docs/architecture/module-catalog.md` |
| O que cada controller faz, quais KCAPI calls usa | `docs/architecture/controllers-catalog.md` |
| Quais scripts cada HTML carrega e em que ordem | `docs/architecture/script-loading-reference.md` |
| Como os dados fluem de controller → KCAPI → adapter → banco | `docs/architecture/data-flow-guide.md` |
| Estrutura do repositório, grupos JS, namespaces, delta de versões | `docs/architecture/repository-structure.md` |
| Onde adicionar novos testes, estrutura das 134 suites | `docs/architecture/test-strategy.md` |
| CSS em produção, `future-split/`, convenções | `docs/architecture/css-architecture.md` |
| Arquitetura geral, camadas, hotspots | `docs/architecture.md` |
| Métodos públicos de KCAPI, contratos de retorno | `docs/api-contract.md` |
| Tabelas do banco, políticas RLS, índices, Storage, cron | `docs/db-schema.md` |
| RPCs, triggers e funções PostgreSQL | `docs/rpc-catalog.md` |
| Variáveis de ambiente, `KC_ENV`, Supabase, Vercel | `docs/env-vars.md` |
| Tokens visuais, componentes CSS, popovers, responsividade | `docs/design-system.md` |
| Estado atual da release V21, iterações, DoD | `RELATORIO-KINOCAMPUS-V21.md` |
| Histórico de releases e hotfixes | `CHANGELOG.md` |
| Invariantes Vercel/Supabase de produção | `docs/ops/vercel-supabase-invariants.md` |
| Índice de todos os documentos técnicos | `docs/index.md` |

### Chamadas KCAPI de referência rápida

```javascript
// Leitura — feed com paginação cursor
KCAPI.getFeedCursor({ module: 'eventos', sortBy: 'recentes', limit: 20, cursor: null });

// Busca full-text
KCAPI.searchPosts({ q: 'moradia setor oeste', module: 'moradia', limit: 12 });

// Post individual
KCAPI.getPostById(postId);

// Ranking
KCAPI.getTopContributors('month', 'moradia', 10);

// Criação (requer auth)
KCAPI.createPost({ titulo, descricao, moduleDB, categoryDB, images });

// Auth
KCAPI.signIn(email, password);
KCAPI.signUp(email, password, options);
KCAPI.getCurrentUser();           // null se não autenticado
KCAPI.logout();

// Notificações Realtime
const channel = KCAPI.subscribeNotifications(userId, callback);
KCAPI.unsubscribeNotifications(channel);

// Admin
KCAPI.listAdminHelpRequests({ status: 'new', type: 'question', limit: 25, offset: 0 });

// Sanitização obrigatória
el.innerHTML = KCUtils.escapeHtml(userContent);
```

### Verificações rápidas de saúde do projeto

```bash
# Tudo em um comando (usar antes de todo commit)
npm run check:all

# Individualmente
npm run check:version    # VERSION.json válido
npm run check:structure  # 158 itens + raiz limpa
npm run check:scripts    # cadeia de boot nos 22 HTMLs
npm run check:routes     # 22 rotas + CSS
npm run check:hygiene    # 8.6.0, i18n B2, inline handlers, cadeias

# Testes
npm test                 # 134 suites · 3046 testes
npm run test:e2e         # 8 suites Playwright · 51 testes
```
