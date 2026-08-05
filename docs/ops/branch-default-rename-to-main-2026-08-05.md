# Branch default renomeado para `main` (2026-08-05)

## Contexto

O KinoCampus operava desde 2026-02-01 com `kinocampus-V75.0-foundations` como
branch permanente de produção. Em 2026-08-05 essa branch foi descontinuada e
o repositório passou a usar `main` como branch padrão, alinhando o projeto
com a convenção da plataforma e removendo o overhead cognitivo de uma branch
versionada.

A renomeação **não** é uma simples troca de nome: o histórico de commits
não foi reescrito, e o branch antigo continua existindo (mas congelado) para
preservar clones, dependabot branches históricas e referências externas.

## O que foi alterado

| Camada | Antes | Depois | Como |
|---|---|---|---|
| GitHub default branch | `kinocampus-V75.0-foundations` | `main` | https://github.com/yandiamantinoBr/kino-campus/settings/branches |
| Vercel productionBranch | `kinocampus-V75.0-foundations` | `main` | `PATCH /v9/projects/{id}/branch?teamId=...` |
| GitHub Actions — Essential Validation | filtrava `kinocampus-V75.0-foundations` | filtra `main` | `.github/workflows/essential-validation.yml` |
| GitHub Actions — Lighthouse CI | filtrava `kinocampus-V75.0-foundations` | filtra `main` | `.github/workflows/lighthouse-ci.yml` |
| GitHub Actions — Email deliverability | filtrava `kinocampus-V75.0-foundations` | filtra `main` | `.github/workflows/email-check.yml` |
| GitHub Actions — Deploy Edge Functions | escutava `kinocampus-V75.0-foundations` | escuta `main` | `.github/workflows/edge-deploy.yml` |
| GitHub Actions — Agent pitch reliability v2 | `BASE_BRANCH: kinocampus-V75.0-foundations` | `BASE_BRANCH: main` | `.github/workflows/agent-pitch-reliability-v2.yml` |
| Dependabot — npm | `target-branch: kinocampus-V75.0-foundations` | `target-branch: main` | `.github/dependabot.yml` |
| Dependabot — github-actions | `target-branch: kinocampus-V75.0-foundations` | `target-branch: main` | `.github/dependabot.yml` |
| `VERSION.json.branch` | `kinocampus-V75.0-foundations` | `main` | `VERSION.json` |
| `scripts/validate-version-map.js` | `CANONICAL_BRANCH = 'kinocampus-V75.0-foundations'` | `CANONICAL_BRANCH = 'main'` | scripts/ |
| `scripts/hygiene-check.js` | check apontava para a branch antiga | check aponta para `main` | scripts/ |
| `tests/contract/version-map.test.js` | asserção esperava a branch antiga | asserção espera `main` | tests/contract/ |
| `services/cadu-ufg-publisher/scripts/sync-candidate-source-registry.js` | `EXPECTED_KINO_BRANCH = 'kinocampus-V75.0-foundations'` | `EXPECTED_KINO_BRANCH = 'main'` | services/ |
| `README.md` | declarava branch antiga | declara `main` | raiz |

## O que **não** mudou

- A história de commits (`main` e `kinocampus-V75.0-foundations` apontam
  ambos para a história completa; não houve `git rebase` nem reescrita de
  SHA). Diferença hoje: `main` está 1 commit à frente (PR #807, merge
  automático após o `default branch` ser trocado).
- Aliases de produção do Vercel (`www.kinocampus.com.br`,
  `kino-campus-git-kinocampus-v750-63a2e7-...vercel.app` e demais) seguem
  servindo o último deploy válido (`dpl_3ccsTFrfQD8fUmAk92xF8g8V5QQy`,
  commit `e64cc653` de 2026-08-04). O Vercel **não** re-promove
  automaticamente ao trocar `productionBranch` — o próximo deploy de
  produção virá do próximo push em `main` (ou de um `vercel deploy
  --prod` manual).
- Edge Functions e Supabase Migrations continuam disparando apenas após
  `Essential Validation` verde em `main`, no mesmo contrato anterior.
- O branch `kinocampus-V75.0-foundations` permanece vivo, mas não recebe
  mais pushes. Ele existe para não quebrar:
  - 2 dependabot branches históricas (`dependabot/github_actions/.../actions/checkout-7`
    e `dependabot/npm_and_yarn/.../jsdom-30.0.1`), que abrem PRs contra
    `main` mas carregam o nome antigo no `headRefName`;
  - 0 PRs abertas contra a branch (confirmado em 2026-08-05 10:14 BRT);
  - 0 proteções ativas;
  - clones antigos e CI scripts que ainda referenciam o nome.

## Validação

- `npm run check:version` — OK (`VERSION.json.branch=main`).
- `npm run check:hygiene` — OK.
- `GET /v9/projects/prj_PTFmR4f3A1aAHV5mgXa24svL8umB?teamId=...` →
  `link.productionBranch = "main"`.
- `GET /repos/yandiamantinoBr/kino-campus` → `default_branch = "main"`.

## Próximos passos

1. Aguardar primeiro push em `main` para confirmar que o deploy de produção
   do Vercel dispara automaticamente.
2. Fechar as 2 dependabot PRs legadas contra a branch antiga (PR #730 e
   PR #796) — são PRs contra `main`, mas o `headRefName` ainda referencia
   `kinocampus-V75.0-foundations`. Devem ser mergeadas ou fechadas conforme
   aplicabilidade dos bumps.
3. Após 1 semana de validação sem incidente, considerar deletar
   `kinocampus-V75.0-foundations` (e suas dependabot branches) via
   `gh api -X DELETE repos/.../git/refs/heads/kinocampus-V75.0-foundations`.
   Manter como archive por ora é mais seguro.
4. Atualizar docs históricas que ainda mencionam
   `kinocampus-V75.0-foundations` apenas se a leitura ficar confusa — a
   maioria é datada e o nome antigo faz sentido no contexto.

## Risco

**Baixo.** Nenhuma das mudanças é destrutiva: o Vercel não re-deploya, o
GitHub não invalida webhooks, e o Supabase não toca em nada. O usuário
Yan confirmou `default_branch=main` antes da alteração, e a única ação
com efeito externo é o `productionBranch` do Vercel, que afeta apenas o
próximo deploy (que será feito a partir de um push em `main` revisado por
PR + CI).
