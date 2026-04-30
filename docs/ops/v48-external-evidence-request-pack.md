# V48 - Pacote de Evidencias Externas Sem Secrets

**Versao:** v48.0.0
**Data:** 2026-04-29
**Escopo:** operacional/documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Transformar os bloqueios externos mapeados em V47 em uma lista objetiva de evidencias que podem ser
coletadas fora do repositorio, redigidas e anexadas aos templates de QA antes de qualquer implementacao
funcional. A V48 nao pede secrets, nao configura dashboard e nao executa envio, migration ou teste real.

---

## 2. Regras de Redacao

| Tipo de dado | Permitido no repo | Proibido no repo |
|---|---|---|
| URLs | dominio e rota sem tokens | query string com token, magic link, signed URL |
| E-mails | dominio institucional e alias redigido | caixa real completa sem consentimento |
| Supabase | nome da policy, resultado do advisor, print redigido | project ref privado, service role key, JWT |
| Provider | nome do provider e ambiente sandbox | API key, webhook secret, payload com contato real |
| Banco isolado | nome logico do ambiente e resultado agregado | dump com dados reais ou PII |
| Screenshots | tela com dados anonimizados | nomes, e-mails, telefones ou tokens visiveis |

Toda evidencia deve apontar data, ambiente, executor e resultado. Quando a redacao remover contexto
essencial, registrar a decisao como "Bloqueado ate evidencia privada verificavel".

---

## 3. Evidencias por Candidato

| Candidato | Evidencia externa minima | Onde registrar |
|---|---|---|
| `AUTH-CB-01` | callback real com usuario institucional de teste, link redigido e resultado de sessao | `_TEMPLATE-auth-callback-evidence.md` |
| `PROFILE-AV-01` | policies de `profile-avatars`, upload proprio, leitura publica/privada esperada e negativa de outro usuario | `_TEMPLATE-profile-avatar-evidence.md` |
| `ADMIN-MOD-01` | conta admin e conta nao-admin, acesso permitido/bloqueado, acao moderadora sem dados reais | `_TEMPLATE-admin-moderation-evidence.md` |
| `NOTIF-SB-01` | sandbox email/WhatsApp, segredo fora do repo, fail-closed sem provider e envio controlado | `_TEMPLATE-notification-provider-evidence.md` |
| `SEARCH-FTS-01` | banco isolado descartavel, plano de rollback R3, comparativo de busca antes/depois | `_TEMPLATE-search-fts-evidence.md` |
| `CSS-SM-01` | baseline visual desktop/mobile, rota e componente unico, criterio de rollback R1/R2 | `_TEMPLATE-css-small-change-evidence.md` |
| `PUBLIC-A11Y-01` | rota/componente alvo, evidencia a11y/i18n atual, impacto de usuario e rollback | `_TEMPLATE-public-a11y-evidence.md` |

---

## 4. Ordem de Coleta

1. Confirmar ambiente autorizado e usuario de teste.
2. Coletar evidencia bruta fora do repositorio.
3. Redigir tokens, dados pessoais, project refs privados e contatos.
4. Preencher `_TEMPLATE-external-evidence-redaction.md`.
5. Preencher o template especifico do candidato.
6. Preencher `_TEMPLATE-implementation-readiness-selection.md`.
7. Declarar Go, Go condicionado, No-Go ou Bloqueado.

---

## 5. No-Go Operacional

Nao abrir branch funcional se:

- a evidencia exige copiar secret para o repositorio;
- o unico ambiente disponivel e producao sem usuario de teste autorizado;
- o rollback depende de acao manual nao documentada;
- o print ou log nao pode ser redigido sem perder validade;
- o candidato mistura duas superficies de alto risco;
- os gates `npm run check:all` e `npm test` nao foram planejados antes do patch.

---

## 6. Saida Esperada

Um candidato so sai do estado "Bloqueado" quando houver:

- evidencia redigida em `docs/qa/reports/`;
- template especifico preenchido;
- selecao V47 preenchida;
- rollback V38 aplicavel;
- filescope pequeno e reversivel.

Sem esses itens, a versao correta continua sendo documental ou de QA real, nao funcional.
