# QA Run Report — Kino Campus V8.2.2.0 — Run 1

## 1) Metadados
- Data (AAAA-MM-DD):
- Hora aproximada:
- Ambiente: ( ) Produção  ( ) Preview
- URL testada:
- Commit/Branch testado:
- Navegador + versão:
- Dispositivo:
- Resolução/Viewport:
- Tester (nome):

## 2) Resultado geral (Go/No-Go)
- Status do Run 1: ( ) GO  ( ) NO-GO
- Bloqueadores abertos: ( ) 0  ( ) 1+  → listar na seção 6
- Observações rápidas (5–10 linhas):

---

## 3) Smoke pós-Rescue Fix (obrigatório)
Marque PASSOU/FALHOU e cole evidências.

| Item | Passou | Falhou | Evidência (link/print) | Observações |
|---|:---:|:---:|---|---|
| Home abre sem erro vermelho no Console |  |  |  |  |
| Feed renderiza posts |  |  |  |  |
| Network: assets críticos retornam 200 |  |  |  |  |
| Não existe `Unexpected token '<<'` |  |  |  |  |

---

## 4) E2E Checklist (1 a 9)
> Use o `docs/qa/e2e-checklist.md` como roteiro e registre aqui.

| Etapa | Passou | Falhou | Evidência (link/print) | Observações |
|---|:---:|:---:|---|---|
| 1) Cadastro |  |  |  |  |
| 2) Confirmação de e-mail (callback) |  |  |  |  |
| 3) Login |  |  |  |  |
| 4) Criar post (com e sem imagem) |  |  |  |  |
| 5) Abrir detalhe do post |  |  |  |  |
| 6) Comentar |  |  |  |  |
| 7) Votar (hot/cold) |  |  |  |  |
| 8) Denunciar post |  |  |  |  |
| 9) Admin: fechar denúncia/moderar |  |  |  |  |

---

## 5) RLS Smoke Tests (SQL)
> Rode `docs/qa/rls-smoke.sql` e registre.

| Teste | Passou | Falhou | Evidência (print/erro) | Observações |
|---|:---:|:---:|---|---|
| Test 1 — reports select anon (não expor dados) |  |  |  |  |
| Test 2 — UPDATE posts.author_id (bloquear) |  |  |  |  |
| Test 3 — UPDATE profile de outro usuário (bloquear) |  |  |  |  |

---

## 6) Bugs encontrados (classificação)
> Para cada bug: passos, esperado vs atual, severidade, evidência.

| ID | Severidade | Onde | Passos de reprodução (curto) | Esperado | Atual | Evidência |
|---|---|---|---|---|---|---|
| B-01 | Bloqueador/Alta/Média/Baixa |  |  |  |  |  |
| B-02 | Bloqueador/Alta/Média/Baixa |  |  |  |  |  |

---

## 7) Console / Network (copiar trechos)
### Console (erros vermelhos)
- (colar aqui)

### Network (requests relevantes)
- (colar aqui)

---

## 8) Conclusão do Run 1
- Próxima ação recomendada:
- Se NO-GO: quais bloqueadores precisam ser corrigidos antes do Run 2:
