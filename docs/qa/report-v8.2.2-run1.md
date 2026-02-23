# KinoCampus - QA Run 1 (V8.2.2 / saneamento pós-conflito)

Data: 2026-02-23  
Branch: `kinocampus-V8.2.2.0-CLEANROOM`

## 1) Reprodução no commit ruim (`f904cb6`)

Passos executados para reproduzir a regressão de feed vazio:

1. Fazer checkout do commit ruim:
   - `git checkout f904cb6`
2. Abrir a Home e páginas com feed (`index.html`, `explore.html`, `community.html`) em ambiente local.
3. Observar carregamento dos scripts críticos (`assets/js/kc-api.client.js` e `assets/js/kc-core.js`).
4. Verificar que o parser de JavaScript interrompe execução por marcadores de conflito Git no topo/miolo dos arquivos.
5. Resultado esperado da regressão: feed não inicializa/renderiza cards, deixando Home e páginas de feed vazias.

## 2) Evidências do diff/conteúdo com conflito não resolvido

Evidência direta no commit `f904cb6` (marcadores `<<<<<<<`, `=======`, `>>>>>>>` presentes em produção):

- `assets/js/kc-api.client.js` começa com `<<<<<<< Updated upstream` na linha 1.
- `assets/js/kc-core.js` começa com `<<<<<<< Updated upstream` na linha 1.
- `assets/js/kc-core.js` contém bloco duplicado separado por `=======` (linha ~2566) e fechamento `>>>>>>> Stashed changes` (linha ~5168).

Comandos usados na triagem:

```bash
git show f904cb6:assets/js/kc-api.client.js | rg -n "^(<<<<<<<|=======|>>>>>>>)"
git show f904cb6:assets/js/kc-core.js | rg -n "^(<<<<<<<|=======|>>>>>>>)"
```

Saída observada:

- `kc-api.client.js`: `1:<<<<<<< Updated upstream`
- `kc-core.js`: `1:<<<<<<< Updated upstream`, `2566:=======`, `5168:>>>>>>> Stashed changes`

## 3) Resultado antes/depois do saneamento

### Antes (commit ruim `f904cb6`)

- Scripts críticos inválidos por conflito Git não resolvido.
- Execução interrompida no parse inicial de JS.
- Impacto funcional: Home e páginas de feed sem renderização de posts (feed vazio).

### Depois (estado saneado)

- Arquivos críticos sem marcadores de conflito.
- Boot do front volta a seguir fluxo normal de inicialização dos controllers de feed.
- Home + páginas de feed voltam a carregar/renderizar cards conforme dados disponíveis.

Comando de verificação pós-fix:

```bash
rg -n "^(<<<<<<<|=======|>>>>>>>)" assets/js/kc-api.client.js assets/js/kc-core.js
```

Saída observada: sem ocorrências.

## 4) Console/Network após fix

- Console: sem erro de sintaxe ligado a marcadores de merge (`Unexpected token '<'` / conflito Git).
- Network: requisições de feed deixam de ficar mascaradas por falha de parse do bundle/script e o fluxo segue para chamadas normais de carregamento.
- Observação: podem permanecer warnings não-bloqueantes já conhecidos (ex.: browser privacy/autocomplete/aria), sem relação com a regressão de feed vazio.

## 5) Arquivos afetados e impacto funcional

Arquivos diretamente afetados pela regressão/saneamento:

- `assets/js/kc-api.client.js`
- `assets/js/kc-core.js`

Impacto funcional mapeado:

- Home (`index.html`) e páginas de feed (`explore.html`, `community.html`) dependem desses scripts para normalização de dados, bootstrap de controllers e renderização de cards.
- Com conflito não resolvido nesses arquivos, o feed fica vazio por quebra global de execução JavaScript.
