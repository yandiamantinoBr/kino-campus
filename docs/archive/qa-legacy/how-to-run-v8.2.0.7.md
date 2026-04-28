# Como executar QA v8.2.0.7 (guia para leigo)

Este guia explica, sem jargão técnico, como rodar a validação real e preencher o relatório:
- `docs/qa/report-v8.2.0.7-run1.md`

## 1) Antes de começar (check rápido)

Você precisa ter:
1. URL do ambiente que será testado (Preview ou Prod).
2. Conta comum e conta admin (login/senha válidos).
3. Acesso ao Supabase Dashboard do projeto.
4. Pasta para salvar prints: `docs/qa/evidence/v8.2.0.7-run1/`.

Se faltar algum item, **não invente resultado**: marque como **BLOQUEADO** no relatório.

---

## 2) Convenção de evidências (nomes de arquivo)

Salvar prints com nomes padronizados:
- `E2E-01-cadastro.png`
- `E2E-02-callback.png`
- `E2E-03-login.png`
- `E2E-04-criar-post.png`
- `E2E-05-detalhe-post.png`
- `E2E-06-comentario.png`
- `E2E-07-voto.png`
- `E2E-08-denuncia.png`
- `E2E-09-admin-moderacao.png`
- `RLS-01-reports-anon-select.png`
- `RLS-02-posts-author-update.png`
- `RLS-03-profiles-insert-mismatch.png`
- `WEBHOOK-threshold.png` (se aplicável)

Dica: se houver erro no navegador, salve também print do Console (F12).

---

## 3) Executar E2E no navegador (itens 1–9)

Referência detalhada: `docs/qa/e2e-checklist.md`.

Passo a passo:
1. Abra a URL do ambiente.
2. Execute os 9 cenários na ordem (cadastro até moderação admin).
3. A cada cenário:
   - anote se deu **PASSOU**, **FALHOU** ou **BLOQUEADO**;
   - tire print da tela final (ou erro);
   - copie a URL usada.
4. Preencha a tabela E2E no `report-v8.2.0.7-run1.md`.

Regra de ouro:
- **PASSOU** = comportamento esperado + evidência.
- **FALHOU** = comportamento incorreto + evidência.
- **BLOQUEADO** = não foi possível testar por falta de pré-condição.

---

## 4) Executar RLS Smoke no Supabase (itens 1–3)

Arquivo de referência: `docs/qa/rls-smoke.sql`.

No Supabase:
1. Abrir **SQL Editor**.
2. Copiar/colar os blocos do arquivo `rls-smoke.sql` **um por vez**.
3. Rodar primeiro o bloco de setup (buscar `post_id`).
4. Rodar TEST 1, TEST 2 e TEST 3.
5. Tirar print de cada execução (query + resultado/erro).
6. Registrar no report:
   - Resultado esperado vs resultado atual;
   - nome do print;
   - observações.

Importante:
- Se o SQL Editor não representar anon/authenticated de forma fiel, use as alternativas descritas no próprio `rls-smoke.sql` e registre isso nas observações.

---

## 5) Testar limiar de denúncias + webhook (ou marcar N/A)

1. Verifique se existe integração de webhook habilitada no ambiente.
2. Se existir, reproduza o fluxo de denúncias até o limiar esperado.
3. Capture evidência do disparo (log, painel, resposta, print).
4. Se não existir webhook neste ambiente, marque **N/A com justificativa objetiva** no report.

Nunca use “PASSOU” sem evidência real.

---

## 6) Como preencher o report final

Arquivo: `docs/qa/report-v8.2.0.7-run1.md`

Preencha nesta ordem:
1. Metadados da execução (ambiente, horários, contas, responsável).
2. Tabela E2E (1–9).
3. Tabela RLS (1–3).
4. Webhook/alerta (executado ou N/A justificado).
5. Bugs encontrados (severidade + status + evidência).
6. Conclusão “Apto para seguir?” com justificativa.

---

## 7) Critério de honestidade da rodada QA

Se não executou, escreva **PENDENTE**.
Se executou parcialmente, registre parcial e detalhe o que faltou.
Sem evidência, sem aprovação.
