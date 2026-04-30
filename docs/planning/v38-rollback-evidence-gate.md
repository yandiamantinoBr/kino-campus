# V38 - Gate de Evidencia de Rollback

**Versao:** v38.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Definir a evidencia minima de rollback antes de qualquer mudanca funcional futura. A V37 exige que
um rollback exista no gate de entrada; a V38 detalha como esse rollback deve ser descrito,
validado e anexado para evitar patches sem caminho seguro de retorno.

---

## 2. Checklist de Rollback

| Item | Obrigatorio | Evidencia esperada |
|---|---|---|
| Tipo de mudanca | Sim | JS, CSS, HTML, SQL, provider, config ou doc-only |
| Estado antes | Sim | Branch/commit, ambiente, dados afetados e screenshots/logs quando aplicavel |
| Passos de reversao | Sim | Comandos ou procedimentos manuais redigidos |
| Dados persistidos | Sim | Se ha perda, migracao reversa, backup ou somente cache/localStorage |
| Secrets/providers | Quando aplicavel | Confirmacao de que nada sensivel sera registrado |
| Validacao pos-rollback | Sim | Gates e checks esperados apos reverter |
| Tempo estimado | Recomendado | Janela de intervencao e impacto |
| Owner | Quando aplicavel | Responsavel por dashboard, provider ou banco |

---

## 3. Classificacao de Rollback

| Classe | Exemplo | Exigencia minima |
|---|---|---|
| R0 - doc-only | README, planning, reports | `git revert` ou commit inverso documentado |
| R1 - frontend estatico | JS/CSS/HTML sem dados persistidos | Reversao de arquivos + `check:all` + teste direcionado |
| R2 - dados locais/cache | localStorage, fixtures, flags locais | Limpeza controlada + validacao de nao perda de dados reais |
| R3 - Supabase/SQL | migrations, RLS, RPC, storage policies | Ambiente isolado, backup, migration reversa ou plano manual aprovado |
| R4 - providers/secrets | email, WhatsApp, webhooks, dashboards | Sandbox, disable switch, fail-closed e owner operacional |

---

## 4. Regras

- Nenhuma versao funcional deve iniciar sem rollback classificado.
- Rollback SQL nao pode depender apenas de "reverter commit" se a mudanca ja atingiu dados reais.
- Rollback de provider deve incluir caminho de desativacao sem expor secrets.
- Rollback visual deve anexar baseline antes/depois quando CSS ou layout forem tocados.
- Quando rollback nao for seguro, a decisao correta e `No-Go` ate haver ambiente isolado ou backup.

---

## 5. Saida Esperada

Para qualquer pacote funcional futuro, preencher `docs/qa/reports/_TEMPLATE-rollback-evidence.md`
ou anexar report equivalente com:

- classe de rollback;
- filescope afetado;
- passos de reversao;
- dados/secrets envolvidos;
- validacao pos-rollback;
- decisao Go/No-Go.
