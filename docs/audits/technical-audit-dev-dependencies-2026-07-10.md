# Auditoria técnica: dependências de desenvolvimento

**Data:** 2026-07-10
**Branch:** `codex/dev-dependency-hardening`
**Base:** `e84d81d8` (`kinocampus-V75.0-foundations`)
**Escopo:** `package.json`, `package-lock.json`, npm, Jest, Playwright, Lighthouse CI e Dependabot

## 1. Resumo executivo

O runtime npm do KinoCampus não apresentava advisories, mas a toolchain de desenvolvimento tinha
15 ocorrências: 5 altas, 7 moderadas e 3 baixas. A correção foi mantida fora da PR de autenticação
Edge para não misturar risco operacional de produção com manutenção do ambiente de CI.

O lockfile atualizado elimina os 15 achados conhecidos sem `npm audit fix --force`, sem major de
dependência direta e sem alteração de código da aplicação. O único uso de override é restrito à
cadeia estagnada de `@lhci/cli@0.15.1`, cuja versão mais recente ainda declara ranges antigos de
`tmp` e `uuid`.

## 2. Estado antes da correção

| Verificação | Resultado |
|---|---|
| `npm audit --omit=dev --json` | 0 vulnerabilidades em dependências de produção |
| `npm audit --json` | 15: 5 altas, 7 moderadas, 3 baixas |
| `npm outdated --json` | updates patch/minor para Babel, Jest e Playwright; major de `@vercel/og` disponível |
| Dependabot no repositório | alerts e security updates desabilitados; sem arquivo de version updates |

As cadeias afetadas eram exclusivamente de teste, build ou auditoria local: Babel/Jest,
Playwright/Chrome, `http-server` e Lighthouse CI.

## 3. Atualização controlada do lockfile

O plano de `npm audit fix --dry-run` foi revisado antes da aplicação. Ele previa 31 updates
patch/minor e remoção de uma duplicata, sem adicionar pacote e sem alterar dependência direta.

Principais correções resolvidas dentro dos ranges existentes:

- Babel `7.29.x`, incluindo `@babel/core` e `plugin-transform-modules-systemjs`;
- `ws` 7.5.11/8.21.0;
- `picomatch` 2.3.2/4.0.5;
- `brace-expansion` 1.1.16/2.1.2;
- `express` 4.22.2 e `qs` 6.15.3;
- `basic-ftp` 5.3.1;
- `ip-address` 10.2.0;
- `js-yaml` 3.15.0.

## 4. Overrides do Lighthouse

Após os updates compatíveis restavam cinco achados, todos herdados de `@lhci/cli@0.15.1`:

- `uuid@8.3.2`, usado pelo CLI somente por `uuid.v4()`;
- `tmp@0.1.0` e `tmp@0.0.33`, usados por `fileSync()` e `tmpNameSync()`.

O `package.json` força somente:

```json
{
  "overrides": {
    "tmp": "0.2.6",
    "@lhci/cli": {
      "uuid": "11.1.1"
    }
  }
}
```

Compatibilidade comprovada no pacote instalado:

- `require('uuid').v4` continua sendo função;
- `tmp.fileSync` e `tmp.tmpNameSync` continuam sendo funções;
- `lhci --version` retorna `0.15.1`;
- `lhci autorun` coletou, validou e publicou três relatórios sem erro de execução.

Não foi usado o `--force` sugerido pelo npm, pois ele tentaria instalar
`@lhci/cli@0.1.0`, um downgrade incorreto e incompatível com o estado atual.

## 5. Dependabot

Foi criado `.github/dependabot.yml` com atualizações semanais, segundas-feiras, para:

1. ecossistema npm;
2. GitHub Actions.

As PRs têm limite de cinco por ecossistema, apontam para a branch canônica e não possuem
auto-merge. O arquivo não habilita os Dependabot alerts/security updates do repositório; essa
configuração remota continua pendente e deve ser ativada administrativamente depois do merge.

## 6. Validação

| Gate | Resultado |
|---|---|
| `npm ci` | instalação limpa reproduzida; 729 pacotes instalados |
| Validadores do `check:all` | versão, estrutura, scripts, rotas, higiene e busca aprovados |
| Jest | 207 suítes, 3.921 testes e 3 snapshots aprovados |
| Playwright Chromium | 85 de 85 cenários aprovados, 1 worker |
| Lighthouse CI 0.15.1 | 3 rotas concluídas; apenas warnings locais de best-practices 0,79 |
| `npm audit --offline --json` | 0 vulnerabilidades com o advisory cache atualizado nesta sessão |
| YAML do Dependabot | parse estruturado aprovado; 2 ecossistemas semanais |
| `git diff --check` | aprovado |

O endpoint online de audit do registry retornou `ECONNRESET` em tentativas posteriores. Por isso,
o resultado zero deve ser confirmado novamente pela CI/rede do GitHub. O audit offline não foi
usado para ocultar um advisory: o cache foi populado pela execução online que encontrou os 15
itens e pelo plano de correção que os reduziu primeiro a cinco.

## 7. Riscos residuais e próximos passos

| Prioridade | Item | Decisão |
|---|---|---|
| P2 | Dependabot alerts/security updates remotos desabilitados | habilitar no GitHub após revisão administrativa |
| P2 | Overrides atravessam ranges declarados pelo LHCI | manter testes do CLI e remover quando upstream atualizar dependências |
| P3 | Avisos deprecados de `inflight`, `rimraf`, `glob` e `whatwg-encoding` | atualizar os pacotes-pai em rodada própria; não há advisory ativo após este patch |
| P3 | `@vercel/og` possui versão major mais nova | avaliar API e snapshots separadamente; não atualizar nesta rodada |

Nenhum secret, deploy, configuração remota ou arquivo de runtime da aplicação foi alterado.

