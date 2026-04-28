# Auditoria de Cobertura — Trilha B2 (i18n Runtime) — v12.7.3

**Data:** 25 de abril de 2026
**Escopo:** Trilha B2 do ciclo v12 — i18n em runtime (fases 1, 2 e 3)
**Iteracoes:** v12.7.0 → v12.7.1 → v12.7.2 → v12.7.3 (gate)

---

## 1. Objetivo da trilha B2

Instrumentar o runtime do KinoCampus com um dicionario pt-BR centralizado e helpers declarativos que aplicam as traducoes nos atributos de elemento relevantes, preservando o texto pt-BR estatico como fallback. A trilha B2 nao introduz locale switcher nem suporte a en-US — ambos sao deferred para apos a trilha B4 (Playwright E2E) ter rede de segurança visual.

---

## 2. Estado final do modulo (v12.7.3)

| Metrica | Valor |
|---|---|
| Arquivo | `assets/js/kc-i18n.js` |
| Linhas | **803L** |
| Bytes | `41 693` bytes |
| Total de chaves no dicionario | **440** chaves unicas |
| Metodos no contrato publico `window.KCi18n` | **9** (`locale`, `t`, `n`, `keys`, `applyDocumentMetadata`, `applyStaticAlts`, `applyAriaLabels`, `applyPlaceholders`, `applyTooltips`) |
| Locale fixo | `pt-BR` |
| Fallback | chave devolvida intacta (para `t()`) ou atributo atual preservado (para helpers runtime) |

---

## 3. Namespaces do dicionario (440 chaves)

| Namespace | Qtd | Descricao |
|---|---|---|
| `auth.*` | 61 | Mensagens de autenticacao, cadastro, reset de senha |
| `aria-label.*` | 59 | Rotulos de acessibilidade para botoes, links e elementos interativos |
| `placeholder.*` | 47 | Textos sugestivos de inputs e textareas |
| `common.*` | 41 | Acoes universais de UI (salvar, cancelar, editar, etc.) |
| `form.*` | 27 | Labels e feedbacks de formulario |
| `a11y.*` | 27 | Strings de acessibilidade parametrizaveis (counters, avatares, etc.) |
| `tooltip.*` | 28 | Tooltips de elementos (atributo `title`) |
| `meta-title.*` | 22 | Page-titles dos 22 HTMLs canonicos |
| `meta-description.*` | 22 | Meta-descriptions dos 22 HTMLs canonicos |
| `nav.*` | 18 | Labels de navegacao |
| `feedback.*` | 16 | Mensagens de retorno pos-acao |
| `error.*` | 14 | Mensagens de erro |
| `uxw.*` | 13 | Strings de UX Writing / tom e voz |
| `time.*` | 11 | Labels de tempo relativo |
| `notif.*` | 11 | Rotulos do sistema de notificacoes |
| `empty.*` | 11 | Estados vazios (nenhum post, nenhum comentario, etc.) |
| `module.*` | 7 | Nomes dos modulos do KC_CONSTANTS.MODULE_LABEL_MAP |
| `alt.*` | 5 | Textos alternativos de imagens estaticas |
| **TOTAL** | **440** | |

---

## 4. Superficies declarativas cobertas

### 4.1. Superfice de metadata de documento (v12.7.0)

Atributos no elemento `<html>`:
- `data-i18n-title="meta-title.<nome>"` → atualiza `document.title`
- `data-i18n-description="meta-description.<nome>"` → atualiza `<meta name="description" content="...">`

**Cobertura:**
- 22 HTMLs declaram `data-i18n-title` (22 chaves `meta-title.*`)
- 22 HTMLs declaram `data-i18n-description` (22 chaves `meta-description.*`)

Helper: `applyDocumentMetadata()`

### 4.2. Superfice de alt estatico (v12.7.0)

Atributo em `<img>`:
- `data-i18n-alt="alt.<nome>"` → atualiza `alt="..."`

**Cobertura:**
- 5 marcacoes `data-i18n-alt` em 5 imagens com alt textual estatico
- Imagens decorativas (`alt=""`) nao sao marcadas (correto)

Helper: `applyStaticAlts()`

### 4.3. Superfice de aria-label (v12.7.1)

Atributo em qualquer elemento:
- `data-i18n-aria-label="aria-label.<nome>"` → atualiza `aria-label="..."`

**Cobertura:** 189 marcacoes em 22 HTMLs
- Header (logo, notificacoes, busca, tema, menu mobile)
- Botoes de acao (criar post, salvar, fechar, compartilhar)
- Navegacao mobile e admin
- Editor de rich-text (8 botoes de formatacao)
- Comentarios (botao postar)
- Admin (nav, tabela de audit, aside de insights, modal de grafico)
- Banners admin (fechar modal)
- Moderation admin (filtros, convite)

Helper: `applyAriaLabels(root)`

### 4.4. Superfice de placeholder (v12.7.1)

Atributo em `<input>` e `<textarea>`:
- `data-i18n-placeholder="placeholder.<nome>"` → atualiza `placeholder="..."`

**Cobertura:** 59 marcacoes em 22 HTMLs
- Busca global e mobile
- Comentario / textarea de post
- Formularios de auth (reset, confirmacao de senha)
- Account setup (email, Lattes, redes sociais)
- Ajuda (assunto, mensagem, e-mail)
- Settings (WhatsApp)
- Admin banners (8 campos: pill, title, subtitle, cta, url, icon, gradient)
- Admin help-requests / moderation / invites (7 campos)

Helper: `applyPlaceholders(root)`

### 4.5. Superfice de tooltip (atributo title) (v12.7.2)

Atributo em botoes, selects, links e divs:
- `data-i18n-tooltip="tooltip.<nome>"` → atualiza `title="..."`

Nota: nao conflita com `data-i18n-title` (exclusivo do `<html>` para page-title).

**Cobertura:** 55 marcacoes em 22 HTMLs
- Tema (`tooltip.theme-toggle` x22, um por HTML)
- Ranking/info (`tooltip.how-it-works` x6, `tooltip.how-ranking-works` x2)
- Perfil (`tooltip.view-author` x1, `tooltip.verified-user` x1)
- Editor rich-text (8 botoes: bold, italic, underline, strike, code, quote, bullet, link)
- Filtros admin (6 selects: status, category, urgency, report-status, reason, module)
- Controles admin (period-filter, refresh, remove-global-limit)
- Banners admin (color-start, color-end)
- ODS badges (4 links em index.html: ODS 04, 11, 12, 13)

Helper: `applyTooltips(root)`

---

## 5. Resumo de cobertura (totais)

| Superficie | Atributo HTML | Helper | Markings | Keys usadas |
|---|---|---|---|---|
| Metadata documento | `data-i18n-title/description` | `applyDocumentMetadata` | 44 | 44 (`meta-title.*` + `meta-description.*`) |
| Alt estatico | `data-i18n-alt` | `applyStaticAlts` | 5 | 5 (`alt.*`) |
| Aria-label | `data-i18n-aria-label` | `applyAriaLabels` | 189 | 58 unicas (`aria-label.*`) |
| Placeholder | `data-i18n-placeholder` | `applyPlaceholders` | 59 | 47 unicas (`placeholder.*`) |
| Tooltip | `data-i18n-tooltip` | `applyTooltips` | 55 | 28 unicas (`tooltip.*`) |
| **TOTAL** | | | **352** | **182 keys de runtime** |

---

## 6. Superficies fora do escopo da trilha B2 (intencional)

As superficies abaixo foram conscientemente excluidas da trilha B2 por exigirem uma abordagem diferente (template engine ou chamadas JS explicitas) e por serem de risco mais alto para a estetica:

- **Textos visiveis**: headings (`<h1>`-`<h6>`), paragrafos (`<p>`), labels (`<label>`), opcoes de select (`<option>`), texto de botoes (`<button>` textContent)
- **Strings em JS**: mensagens de toast, erros gerados em runtime, labels em controllers — ja cobertas em parte por `auth.*`, `error.*`, `feedback.*` no dicionario, mas sem aplicacao automatica nos controllers
- **Locale switcher**: deferred para apos a trilha B4 (Playwright E2E) fornecer rede de segurança visual
- **Suporte a `en-US`**: deferred

Estas superficies sao candidatas para trilha B2 fase 4+ (v12.7.4+) ou ciclo v13.

---

## 7. Gate v12.7.3 — tresholds de regressao

Os seguintes valores foram estabelecidos como piso de regressao e sao validados pelo `scripts/hygiene-check.js` e pela suíte `tests/i18n-b2-gate.test.js`:

| Treshold | Valor minimo | Finalidade |
|---|---|---|
| Chaves totais no dicionario | **>= 440** | Previne remocao de chaves |
| Linhas de `kc-i18n.js` | **>= 800** | Previne stripping do modulo |
| Marcacoes `data-i18n-aria-label` nos 22 HTMLs | **>= 189** | Previne remocao de markup de acessibilidade |
| Marcacoes `data-i18n-placeholder` nos 22 HTMLs | **>= 59** | Previne remocao de markup de placeholder |
| Marcacoes `data-i18n-tooltip` nos 22 HTMLs | **>= 55** | Previne remocao de markup de tooltip |
| Marcacoes `data-i18n-alt` nos 22 HTMLs | **>= 5** | Previne remocao de markup de alt |
| Metodos no contrato `window.KCi18n` | **9** | Previne regressao do contrato publico |

---

## 8. Hygiene checks da trilha B2

Todos os gates declarativos sao validados por `node scripts/hygiene-check.js`:

| Funcao hygiene | Adicionada em | O que valida |
|---|---|---|
| `runI18nMetadataChecks()` | v12.7.0 | Os 22 HTMLs tem `data-i18n-title` + `data-i18n-description` no `<html>`, e imagens com alt textual tem `data-i18n-alt` |
| `runI18nAriaPlaceholderChecks()` | v12.7.1 | Toda tag com `aria-label="..."` tem `data-i18n-aria-label`; toda tag com `placeholder="..."` tem `data-i18n-placeholder` |
| `runI18nTooltipChecks()` | v12.7.2 | Toda tag com `title="..."` (exceto `<html>` e `<title>`) tem `data-i18n-tooltip` |
| `runI18nB2GateChecks()` | v12.7.3 | `kc-i18n.js` tem >= 440 chaves e >= 800 linhas; totais de markings nao caem abaixo dos pisos |

---

## 9. Suites de teste da trilha B2

| Suite | Criada em | Testes | Cobre |
|---|---|---|---|
| `tests/i18n-metadata.test.js` | v12.7.0 | 9 | Contrato estatico, marcacao nos 22 HTMLs, runtime de title/meta/alt |
| `tests/kc-i18n.test.js` | pre-v12 (expandido) | varies | Contrato completo t(), n(), keys(), locale |
| `tests/i18n-aria-placeholder.test.js` | v12.7.1 | 18 | Helpers applyAriaLabels e applyPlaceholders, cobertura declarativa |
| `tests/i18n-tooltip.test.js` | v12.7.2 | 18 | Helper applyTooltips, cobertura declarativa |
| `tests/i18n-b2-gate.test.js` | v12.7.3 | ~14 | Gate de regressao: key count, line count, totais de markings, contrato 9 metodos |

---

## 10. Proximas etapas (pos-B2)

A trilha B2 esta encerrada formalmente com v12.7.3. As proximas iteracoes sao:

1. **v12.8.x** — Trilha B3 (a11y audit estrutural + correcoes)
2. **v12.9.x** — Trilha B4 (Playwright E2E scaffold)
3. **Pos-B4** — Retomar locale switcher pt-BR/en-US com rede de segurança visual
