# V33 - Politica de Baseline Lighthouse/LHCI

**Versao:** v33.0.0
**Atualizado em:** 2026-04-28
**Escopo:** politica documental de evidencia; sem alterar `.lighthouserc.js`, CI, thresholds ou runtime

---

## 1. Objetivo

Definir como registrar evidencias de Lighthouse/LHCI sem confundir falhas de ambiente com regressao
real. A V33 documenta quando `npm run lhci` deve ser evidencia, como classificar erros de Windows,
preview protegido ou provider ausente, e qual saida minima deve acompanhar uma decisao de Go/No-Go.

---

## 2. Classificacao

| Resultado | Significado | Acao |
|---|---|---|
| Passou | LHCI executou e atingiu thresholds atuais | Registrar comando, ambiente e resumo |
| Falhou por score | LHCI executou e score ficou abaixo do esperado | Tratar como regressao ate prova contraria |
| Falhou por ambiente | Erro de rede, preview protegido, SSL/EPERM ou browser indisponivel | Registrar Bloqueado com log resumido |
| Nao aplicavel | Mudanca documental/metadados sem runtime | Declarar no report/PR |
| Pendente CI/Linux | Falha local Windows precisa repeticao em CI/Linux | Criar follow-up de evidencia, nao bug funcional |

---

## 3. Quando Rodar

| Tipo de mudanca | LHCI esperado |
|---|---|
| CSS de producao, layout, shell publico/admin | Obrigatorio quando ambiente permitir |
| HTML ou assets que afetem first paint/interatividade | Obrigatorio quando ambiente permitir |
| JS que afete boot, feed, busca, auth ou render inicial | Recomendado/obrigatorio conforme risco |
| Config Vercel/build/rewrite | Recomendado em preview |
| Documentacao pura | Nao aplicavel |
| Runbook/checklist sem runtime | Nao aplicavel |

Para CSS/layout, LHCI nao substitui o gate visual/a11y V27; ele complementa.

---

## 4. Evidencia Minima

Registrar:

- comando executado;
- URL alvo;
- ambiente local/preview/producao;
- navegador/OS quando relevante;
- status Passou/Falhou/Bloqueado/Nao aplicavel;
- scores principais quando disponiveis;
- erro resumido quando bloqueado;
- decisao Go/No-Go.

Nao commitar screenshots com tokens, URLs assinadas, cookies ou headers sensiveis.

---

## 5. Tratamento de Windows/Preview

| Sintoma | Classificacao inicial |
|---|---|
| EPERM/permission em cache/browser local | Bloqueado por ambiente |
| SSL revoke/Schannel em Windows | Bloqueado por ambiente; repetir com ambiente compatvel |
| Preview protegido por Vercel Authentication | Bloqueado por acesso; validar com URL autorizada |
| CSP bloqueando feedback Vercel em preview protegido | Nao regressao automatica sem impacto real no app |
| Provider externo ausente | Bloqueado operacional, nao regressao de performance |

---

## 6. Saida Esperada

Quando LHCI for aplicavel, o report deve declarar uma destas opcoes:

- `LHCI passou`;
- `LHCI falhou por score`;
- `LHCI bloqueado por ambiente`;
- `LHCI pendente em CI/Linux`;
- `LHCI nao aplicavel`.

---

## 7. Bloqueios

- Nao reduzir thresholds para passar evidencia.
- Nao alterar `.lighthouserc.js` nesta versao documental.
- Nao tratar falha de ambiente como score aprovado.
- Nao bloquear mudanca documental por LHCI nao aplicavel.
- Nao usar LHCI como substituto de teste funcional, E2E ou visual regression.
