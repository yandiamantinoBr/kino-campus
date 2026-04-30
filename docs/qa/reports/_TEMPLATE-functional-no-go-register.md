# Template - Registro de No-Go Funcional

Use este template quando um candidato funcional nao puder avancar por falta de gate, evidencia,
rollback, escopo, ambiente, seguranca, teste ou owner de validacao.

---

## 1. Identificacao

- **Data:**
- **Versao/branch planejada:**
- **Candidato:**
- **Severidade:** P0 / P1 / P2
- **Owner de validacao:**
- **Status:** No-Go aberto / No-Go resolvido / Go aprovado apos reavaliacao

---

## 2. Codigo do Bloqueio

Marque todos os aplicaveis:

- [ ] `NO-GO-GATE` - gate obrigatorio ausente
- [ ] `NO-GO-EVIDENCE` - evidencia insuficiente
- [ ] `NO-GO-ROLLBACK` - rollback nao demonstrado
- [ ] `NO-GO-SCOPE` - escopo instavel
- [ ] `NO-GO-ENV` - ambiente real indisponivel
- [ ] `NO-GO-SECURITY` - risco de segredo ou dado sensivel
- [ ] `NO-GO-REGRESSION` - risco de regressao nao coberto
- [ ] `NO-GO-OWNER` - sem responsavel de validacao

---

## 3. Evidencia

| Evidencia | Fonte | Resultado | Redacao aplicada |
|---|---|---|---|
| | | | |

Notas:

- Nunca cole secrets, tokens, cookies, URLs assinadas, emails reais ou dados pessoais.
- Se a evidencia depender de dashboard externo, registre apenas resumo redigido e responsavel.

---

## 4. Risco se Ignorado

Descreva o impacto concreto:

- Fluxo afetado:
- Usuario afetado:
- Arquivos/ambiente em risco:
- Regressao possivel:

---

## 5. Condicao de Desbloqueio

O No-Go so pode virar Go quando:

- [ ] gate de entrada preenchido
- [ ] rollback demonstrado
- [ ] escopo congelado
- [ ] evidencia redigida anexada
- [ ] template especifico do candidato preenchido
- [ ] owner confirmou ambiente e validacao
- [ ] testes/gates locais definidos para a mudanca

---

## 6. Decisao

- **Decisao final:** Manter No-Go / Converter para Go
- **Justificativa:**
- **Proxima revisao:**
- **Artefatos relacionados:**
