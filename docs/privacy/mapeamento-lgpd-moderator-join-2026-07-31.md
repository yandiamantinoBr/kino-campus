# Mapeamento LGPD / exclusão / exportação — atualizado 2026-07-31

Documento vivo. Substitui a auditoria original “somente leitura” do Codex e incorpora:

- o estado **atual** do código e da produção;
- os relatórios PDF históricos de moderação (`Em andamento` / `Resolvido` de 2026-05-26);
- a junção dos **dois rostos** do mesmo fluxo (titular × moderador).

---

## 1. Conclusão (atualizada)

| Pergunta | Situação **atual** (2026-07-31) |
|---|---|
| Há exclusão self-service imediata? | **Não** (e não deve haver). O titular **abre pedido**; o moderador **executa** com confirmação. |
| Há botão em Configurações? | **Sim** — card “Privacidade e seus dados” (cópia, portabilidade, exclusão, cancelar, baixar). |
| Há deep links na Central de Ajuda? | **Sim** — `?request=account_erasure` / `data_access_copy` / `data_portability`. |
| Há protocolo? | **Sim** — `KC-DSR-…` (titular autenticado) ou referência de atendimento (visitante até vínculo). |
| Existe painel admin para executar exclusão? | **Sim** — `admin/help-requests.html`, painel laranja **Solicitação LGPD** (o mesmo fluxo dos PDFs de maio/2026). |
| Exportação real de dados? | **Sim** (DSR + edges + download autenticado), com manifesto. |
| Classificador admin abre painel só por “LGPD”? | **Não** — exige tupla de exclusão / `request_kind=account_erasure`. |

**Em síntese:** a infraestrutura que você usou nos PDFs **ainda existe e é o caminho canônico de execução**. O que faltava para um moderador sem programação era um **roteiro numerado na tela** ligando pedido de ajuda + protocolo + etapas do PDF. Isso foi adicionado ao painel LGPD.

---

## 2. Os dois fluxos que precisam parecer um só

### Fluxo A — Titular (pedido)

```text
Configurações → Privacidade
  ou
Central de Ajuda (logado) → formulário exclusão
       │
       ▼
data_subject_requests (protocolo KC-DSR-…)
  + help_requests (ticket na fila admin)
```

### Fluxo B — Moderador (execução) — o dos PDFs

```text
admin/help-requests.html
  → cartão do pedido de exclusão
  → painel Solicitação LGPD
  → Edge kc-account-erasure
  → PDF “Exportar relatório LGPD”
  → marcar ticket Resolvido
```

### Junção real (backend)

| Entidade | Papel |
|---|---|
| `help_requests` | Fila que o moderador vê e tria |
| `data_subject_requests` | Protocolo do titular (Configurações) |
| `account_erasure_requests` | Máquina de estados da Edge (diagnóstico → ocultar → confirmar → excluir) |

**Não são dois motores de exclusão.** São **duas faces** do mesmo caso.

---

## 3. O que os PDFs de 26/05/2026 mostram

Arquivos:

- `Em andamento - kc-lgpd-2026-05-26 - 61b4 - 150333.pdf`
- `Resolvido - kc-lgpd-2026-05-26 - 61b4 - 150408.pdf`

Caso: help `61b446f7-…`, e-mail `caio_sardinha@discente.ufg.br`.

| Momento | Status pedido | Status LGPD | Pode fechar? |
|---|---|---|---|
| Em andamento 15:03 | `in_progress` | Aguardando confirmação do titular | **Não** |
| Resolvido 15:04 | `resolved` | Exclusão confirmada executada | **Sim** |

Etapas no PDF (modelo mental do moderador):

1. Validação da solicitação  
2. Diagnóstico de dados  
3. Ocultação reversível  
4. Confirmação do titular  
5. Exclusão/anonimização final  
6. *(implícito)* Fechar ticket + relatório  

Isso é exatamente o painel em `admin/help-requests.html` + `Exportar relatório LGPD`.

---

## 4. Roteiro para moderador (sem programação)

### Onde trabalhar

Abra: **https://www.kinocampus.com.br/admin/help-requests.html**  
(É a **única** tela de execução. Não há outra “tela de exclusão” escondida.)

### Passo a passo

1. **Ache o pedido**  
   Filtros: tipo Conta e acesso / busca pelo e-mail ou protocolo.  
   O cartão mostra o painel laranja **Solicitação LGPD** + **Roteiro unificado**.

2. **Se o ticket for anônimo**  
   Preencha e-mail exato + canal + referência + data + checkbox →  
   **Vincular identidade ao protocolo**.

3. **Preparar diagnóstico**  
   Botão correspondente. Veja contagens (perfil, posts, chat…).

4. **Ocultar conta e pedir confirmação**  
   Ocultação reversível + e-mail ao titular.

5. **Aguarde a frase do titular**  
   `CONFIRMO A EXCLUSÃO DA MINHA CONTA KINOCAMPUS`  
   (no e-mail do titular).

6. **Executar exclusão confirmada**  
   Evidência + digite exatamente `EXCLUIR email@dominio` → botão de exclusão.

7. **Exportar relatório LGPD**  
   Gera o PDF no mesmo estilo dos arquivos de maio (andamento/resolvido).

8. **Só então** Salvar triagem → **Resolvido**.  
   Se tentar fechar antes, o sistema **avisa e pede confirmação**.

### O que o titular vê

- Configurações → Privacidade → protocolo `KC-DSR-…`  
- Cancelar (enquanto ainda for permitido)  
- O mesmo protocolo aparece no painel admin (quando vinculado)

---

## 5. Estado de implementação (matriz)

| Item | Status |
|---|---|
| Classificador exclusão estruturado | Feito |
| Deep links + FAQ + canais | Feito |
| Protocolo + DSR + export autenticado | Feito |
| Painel admin LGPD (fluxo dos PDFs) | Feito |
| Edges DSR/export/erasure em produção | Feito (2026-07-31) |
| RPC privacy help autenticada | Feito |
| Roteiro numerado no painel admin | **Feito 2026-07-31** |
| Protocolo DSR visível no painel | **Feito 2026-07-31** |
| Aviso ao fechar ticket cedo demais | **Feito 2026-07-31** |
| PDF com etapas alinhadas (vínculo + fechamento) | **Feito 2026-07-31** |
| CAPTCHA visitante (Turnstile) | Fail-closed até chaves Cloudflare |
| Lista admin só de DSRs (sem Help) | Não necessária — Help é a fila |
| Wizard que esconde botões “do futuro” | Parcial (roteiro + gates de servidor; botões ainda listados) |

---

## 6. Problemas que o mapeamento original apontava — e o desfecho

| Problema original | Desfecho |
|---|---|
| Exclusão escondida em 3 selects | Deep links + Configurações |
| Sem protocolo na UI | Protocolo + recibo no Help e Settings |
| Classificador por palavra “LGPD” | Discriminador estruturado |
| Admin PDF como única evidência | PDF mantido + workflow Edge autoritativo |
| Dois fluxos confusos (Settings vs Admin) | **Mesmo caso**; roteiro no admin explica a junção |
| Moderador precisa “saber programar” | Roteiro em português + confirmação de fechamento |

---

## 7. Próximas melhorias (opcionais, baixa urgência)

1. Filtro rápido “Só exclusões LGPD” na fila de ajuda.  
2. Wizard que **desabilita visualmente** botões fora da etapa atual (o servidor já bloqueia).  
3. Provisionar Turnstile (só se quiser pedido visitante sem login).  
4. Exercício operacional de `partial_failure` + `retry_finalize`.

---

## 8. Critérios de aceite (moderador)

- [ ] Encontrar um pedido de exclusão na fila em &lt; 2 minutos  
- [ ] Ver o **próximo passo** escrito em português no painel  
- [ ] Ver o **protocolo KC-DSR** quando existir  
- [ ] Gerar PDF “Em andamento” e “Resolvido” como em maio/2026  
- [ ] Não conseguir fechar como Resolvido sem aviso se a exclusão não terminou  

---

## 9. Referências de código

| Peça | Caminho |
|---|---|
| Fila + painel LGPD | `admin/help-requests.html` |
| Controller admin | `assets/js/controllers/admin/admin-help-requests.controller.js` |
| Edge exclusão | `supabase/functions/kc-account-erasure` |
| Runbook | `docs/privacy/account-erasure-runbook.md` |
| Matriz técnica | `docs/privacy/mapping-codex-coverage-2026-07-31.md` |
| Titular | `settings.html` + `settings.controller.js` |
| Ajuda pública | `ajuda.html` + `help.controller.js` |
