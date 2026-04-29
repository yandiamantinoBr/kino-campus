# V34 - Plano de Reconciliacao A11y/i18n

**Versao:** v34.0.0
**Atualizado em:** 2026-04-28
**Escopo:** planejamento documental; sem alterar textos de UI, HTML, CSS, JS ou testes

---

## 1. Objetivo

Separar o que e historico de a11y/i18n do que ainda precisa ser validado no estado atual da
plataforma. A V34 nao corrige copy, ARIA, contraste, foco, idioma ou internacionalizacao; ela define
como auditar essas areas antes de abrir backlog funcional.

---

## 2. Fontes

| Fonte | Uso |
|---|---|
| `docs/archive/audits-accessibility/` | Historico V12 de a11y/i18n |
| `docs/qa/v27-visual-a11y-regression-gate.md` | Gate atual antes de CSS/layout |
| `tests/a11y/` | Cobertura automatizada existente |
| `docs/design-system.md` | Tokens, componentes e convencoes visuais |
| `docs/architecture/ai-development-guide.md` | Regras para evitar mudancas inseguras |

Docs historicos devem orientar contexto, nao servir como checklist ativo sem revalidacao.

---

## 3. Dimensoes de Auditoria

| Area | Validacao esperada | Saida |
|---|---|---|
| Idioma da pagina | `lang`, copy pt-BR e consistencia terminologica | Lista de gaps |
| Foco/teclado | Ordem de foco, skip links, modais/popovers | Passou/Falhou/Bloqueado |
| Semantica | Headings, landmarks, labels e nomes acessiveis | Lista por rota |
| Contraste | Estados normal/hover/focus/disabled | Evidencia visual |
| Feedback de erro | Formularios, auth, create-post e admin | Gaps por fluxo |
| Texto dinamico | Toasts, notificacoes, empty states | Gaps por componente |
| i18n tecnico | Hardcodes duplicados e chaves existentes | Backlog classificado |

---

## 4. Rotas Prioritarias

| Prioridade | Rotas |
|---|---|
| P0 | `index.html`, `auth-callback.html`, `account-setup.html`, `profile.html`, `create-post.html` |
| P0 | `admin/index.html`, `admin/moderation.html`, `admin/help-requests.html` |
| P1 | feeds dos 6 modulos publicos |
| P1 | `_product.html`, `search-results.html`, `settings.html`, `my-posts.html` |
| P2 | `ods.html`, `ajuda.html`, paginas informativas e estados vazios raros |

---

## 5. Criterios para Abrir Backlog Funcional

Abrir item funcional apenas quando houver:

1. rota/componente afetado;
2. evidencia redigida;
3. impacto para usuario;
4. severidade P0/P1/P2;
5. proposta de correcao reversivel;
6. teste ou gate que deve acompanhar a correcao.

---

## 6. Saida Esperada

Criar report futuro em `docs/qa/reports/report-v34-a11y-i18n-reconciliation-run1.md` contendo:

- rotas verificadas;
- ferramentas usadas;
- gaps confirmados;
- itens historicos descartados por nao se aplicarem mais;
- itens que viram backlog;
- itens bloqueados por ambiente ou ausencia de baseline visual.

---

## 7. Bloqueios

- Nao alterar copy ou idioma sem evidencia de fluxo.
- Nao alterar ARIA para silenciar ferramenta sem validar experiencia real.
- Nao mexer em contraste/CSS sem gate visual V27.
- Nao tratar docs historicos como estado atual sem revalidacao.
- Nao reduzir testes a11y existentes.
