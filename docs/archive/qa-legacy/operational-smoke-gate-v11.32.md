# Gate Operacional Minimo - v11.32.x

**Objetivo:** padronizar a validacao minima de publicacao da trilha `v11.32.x` sem adicionar uma nova dependencia E2E ao `package.json`.

---

## 1. Gates obrigatorios do repositorio

Toda iteracao da trilha deve passar:

```powershell
npx jest --passWithNoTests --runInBand
node scripts/hygiene-check.js
git diff --check
```

Sem esses 3 sinais, nao existe promote.

---

## 2. Gate operacional minimo publicado

Depois do merge da branch na base:

1. Confirmar deployment `READY` no Vercel
2. Validar smoke HTTP `200`
3. Validar smoke funcional minimo em navegador **quando o ambiente permitir**

---

## 3. Smoke HTTP obrigatorio

Rodar pelo menos:

```powershell
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/?ts=<timestamp>"
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/compra-venda-feed.html?ts=<timestamp>"
curl.exe --ssl-no-revoke -L "https://www.kinocampus.com.br/create-post.html?ts=<timestamp>"
```

### Detalhe do post

O detalhe publico deve ser validado com um post publicado real:

1. descobrir um `/_product.html?id=...` valido na home ou em um feed
2. fazer o fetch desse detalhe especifico
3. exigir `200`

Se nao houver ID estavel conhecido de antemao, o discovery do ID faz parte do smoke.

---

## 4. Smoke de navegador minimo

### Ordem preferencial

1. **Playwright CLI local**, se o ambiente estiver funcional
2. **inspecao remota do preview/deployment** + smoke HTTP, se o browser local estiver bloqueado

### Cenarios minimos

1. Home publica abre sem erro fatal
2. Um feed de modulo abre e renderiza
3. Um detalhe publico de post abre
4. `create-post.html` abre
5. Um fluxo sem autenticacao exibe guard visivel

### Guard sem autenticacao recomendado

Usar um destes, conforme estiver mais estavel no ambiente:

- tentativa de comentar no detalhe do post
- tentativa de salvar post
- tentativa de abrir fluxo autenticado de criacao/edicao

O objetivo do smoke nao e exaurir o produto. O objetivo e detectar regressao publica obvia antes de considerar a iteracao publicada.

---

## 5. Uso em iteracoes documentais

Mesmo quando a iteracao for documental/auditoria:

- manter Jest + hygiene verdes
- validar `READY` no deployment da base
- validar smoke HTTP `200` ao menos em home, um feed e `create-post.html`

Isso evita que uma rodada "so de docs" deixe de registrar regressao operacional na base principal.

---

## 6. Regra de falha

Se qualquer item abaixo falhar, a iteracao nao deve ser considerada fechada:

- deployment nao `READY`
- smoke HTTP sem `200`
- erro fatal publico em home/feed/detalhe/create-post
- guard nao autenticado quebrado de forma evidente

Nesses casos:

1. registrar o bloqueio no relatorio/README
2. nao promover como iteracao concluida
3. abrir a correcao em fatia separada
