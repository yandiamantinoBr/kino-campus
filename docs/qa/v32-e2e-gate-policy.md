# V32 - Politica de Gate Playwright E2E

**Versao:** v32.0.0
**Atualizado em:** 2026-04-28
**Escopo:** politica documental de evidencia; sem alterar CI, scripts, runtime ou Playwright config

---

## 1. Objetivo

Definir quando `npm run test:e2e` deve ser evidencia obrigatoria, recomendada ou dispensavel em uma
mudanca. A V32 nao transforma Playwright em gate automatico de CI; ela padroniza decisao por tipo de
alteracao para reduzir risco sem bloquear iteracoes documentais ou operacionais que nao mudam runtime.

---

## 2. Classificacao por Tipo de Mudanca

| Tipo de mudanca | E2E esperado | Justificativa |
|---|---|---|
| JS funcional em controller, KCAPI, adapters ou shared | Obrigatorio | Pode alterar fluxo real de usuario |
| HTML de rota publica/admin | Obrigatorio | Pode quebrar seletores, carregamento ou navegacao |
| CSS de producao, layout ou shell | Obrigatorio + gate V27 | Pode quebrar visibilidade, responsividade e interacao |
| Supabase migration, RLS, RPC, Edge Function | Obrigatorio quando houver ambiente | Pode quebrar auth, dados ou notificacoes |
| Config Vercel/rewrites/build | Obrigatorio em preview quando possivel | Pode quebrar rotas e callback |
| Documentacao pura | Dispensavel | Sem impacto de runtime |
| Metadados de versao/validadores documentais | Dispensavel se `check:all` passar | Cobertura local ja valida contrato documental |
| Runbook/checklist sem execucao real | Dispensavel | E2E nao acrescenta evidencia ao conteudo planejado |

---

## 3. Excecoes Aceitas

| Excecao | Evidencia substituta minima |
|---|---|
| Ambiente local indisponivel | `npm run check:all` + motivo objetivo |
| Provider externo ausente | Report marcando Bloqueado e referencia ao checklist V30 |
| Preview protegido sem acesso automatizavel | Link/identificador redigido + erro de acesso |
| Falha conhecida de infraestrutura Windows/EPERM | Log resumido + plano de repetir em CI/Linux |
| Mudanca documental sem runtime | Declaracao no report/PR de que E2E nao se aplica |

Excecao nao pode mascarar falha funcional reproduzida.

---

## 4. Evidencia Esperada Quando Rodar

Registrar no report ou PR:

- comando executado;
- ambiente alvo;
- total de suites/testes Playwright;
- rotas cobertas;
- erros de console criticos, se houver;
- screenshots/traces quando falhar;
- decisao: Passou, Falhou ou Bloqueado.

---

## 5. Ordem Segura

1. Rodar `npm run check:all`.
2. Confirmar se a mudanca altera runtime, rota, CSS, banco ou deploy.
3. Se sim, rodar `npm run test:e2e` ou registrar bloqueio aceito.
4. Para CSS/layout, aplicar tambem o gate V27.
5. Para fluxos autenticados, cruzar com a matriz V31.
6. Para providers externos, cruzar com o checklist V30.

---

## 6. Resultado Esperado

Toda mudanca futura deve declarar uma das opcoes:

- `E2E obrigatorio: executado e passou`;
- `E2E obrigatorio: bloqueado com justificativa`;
- `E2E recomendado: executado como evidencia adicional`;
- `E2E nao aplicavel: mudanca documental/metadados sem runtime`.

---

## 7. Bloqueios

- Nao alterar `playwright.config.js` para contornar falha.
- Nao reduzir suites E2E para passar gate.
- Nao substituir falha funcional por excecao de ambiente sem evidencia.
- Nao tornar E2E gate de CI nesta versao documental.
- Nao tocar JS, CSS, HTML, migrations ou workflows funcionais nesta politica.
