# Guard de origem dos deploys Vercel de producao

## Objetivo

`scripts/inject-env.js` executa o guard antes de criar ou alterar qualquer
artefato. Um build com target `production` so continua quando a origem declarada
pela Vercel corresponde a integracao GitHub oficial do Kino Campus e a branch e
`main`.

Previews e builds de desenvolvimento nao passam por esse bloqueio.

## Contrato aceito em producao

O build precisa expor simultaneamente:

- `VERCEL=1`;
- `VERCEL_GIT_PROVIDER=github`;
- owner `yandiamantinoBr`, repositorio `kino-campus` e o ID GitHub estavel
  `1115961791`;
- `VERCEL_GIT_COMMIT_REF=main`;
- `VERCEL_GIT_COMMIT_SHA` completo.

O ID do repositorio e deliberadamente obrigatorio. Deploys criados pela CLI a
partir de um checkout local podem carregar ref e SHA, inclusive quando o
checkout esta sujo, mas nao possuem a identidade completa da integracao GitHub.
Por isso `vercel deploy --prod` e bloqueado mesmo quando executado em `main`.

Quando a identidade completa da integração GitHub está ausente e existe um
checkout Git local válido, o guard também coleta diagnósticos e exige:

- `git status --porcelain` vazio, incluindo arquivos nao rastreados;
- `HEAD` igual a `VERCEL_GIT_COMMIT_SHA`;
- branch local `main`, aceitando detached HEAD apenas com SHA coincidente.

Builds da integração GitHub não dependem de `git status`: a Vercel remove
`.git` e parte das fontes por `.vercelignore`, o que tornaria um checkout
sanitizado indistinguível de um checkout dirty. Nesses builds, a identidade
imutável do repositório, branch e SHA é a autoridade.

Qualquer sinal ausente, divergente ou impossivel de verificar encerra o build
com `KC_VERCEL_PRODUCTION_ORIGIN_REJECTED`.

## Fluxo operacional

1. Crie e valide previews normalmente em branches de trabalho.
2. Abra e aprove o PR.
3. Faca merge em `main`.
4. Deixe a integracao GitHub criar o deployment de producao.

Para reaplicar variaveis de ambiente sem alterar codigo, use no Dashboard da
Vercel **Create Deployment** a partir da referencia Git `main`. Nao use
`vercel --prod`.

### Limite do guard de build

`vercel deploy --prebuilt --prod`, `vercel promote` e a promoção de um artefato
criado antes deste guard não executam `buildCommand`, portanto não podem ser
interceptados por código deste repositório. Para bloquear também a atribuição do
alias, configure no projeto Vercel um **Deployment Check** obrigatório que
bloqueie `deployment-alias` e valide os metadados do deployment. Até essa
política externa ser ativada, não use `--prebuilt --prod` nem `promote`; confirme
branch, SHA, `source` e `gitDirty` no Inspector para qualquer recuperação manual.

## Validacao local

```powershell
npm test -- --runInBand tests/unit/vercel-production-guard.test.js
node scripts/validate-repository-structure.js
```

As variaveis de identidade acima nao sao segredos. Tokens Vercel ou GitHub nao
devem ser adicionados ao repositorio nem ao log do build.
