# Planejamento i18n, Acessibilidade e UX Writing — v11.24.0

> Documento de planejamento (docs-only). Nenhum arquivo funcional alterado nesta fase.
> Iteração: `v11.24.0` | Data: 11 de abril de 2026

---

## ETAPA 1 — Mapeamento Arquitetural

### 1.1 Inventário textual da base atual

#### Strings hardcoded em HTML (22 páginas)

| Categoria | Quantidade | Exemplos |
|-----------|-----------|----------|
| `<title>` | 22 | "KinoCampus - Comunidade UFG", "Caronas - KinoCampus" |
| `<meta description>` | 18 | "Compra e venda entre estudantes da UFG..." |
| `placeholder` | 33 únicos | "Busque por itens, eventos, vagas na UFG...", "R$ 0", "@seuusuario" |
| `aria-label` | 30+ únicos | "Buscar" (24x), "Notificações" (17x), "Alternar tema claro/escuro" (17x) |
| `og:title` / `og:description` | 18 pares | Todas as páginas públicas com metadata OG |
| Headings (h1-h3) | ~50 | "Top Contribuidores", "Complete sua conta...", nomes de módulos |
| `alt` text | 18 | "KinoCampus — Comunidade UFG", "Preview do avatar" |
| Botões visíveis | ~40 | "Destaques", "Recentes", "Comentados", "Criar publicação" |

#### Strings hardcoded em JavaScript (61 arquivos)

| Arquivo | Tipo | Quantidade |
|---------|------|-----------|
| `kc-constants.js` | Labels de módulos | 7 (MODULE_LABEL_MAP) |
| `kc-constants.js` | Labels de categorias | 60+ (CATEGORY_LABELS por módulo) |
| `kc-constants.js` | Áreas de oportunidade | 8 (OPPORTUNITY_AREA_DEFINITIONS) |
| `kc-create-post.js` | Labels de formulário | ~30 (selects, dropdowns, validação) |
| `components/voting.js` | Mensagens de erro | 3 ("Faça login para votar", etc.) |
| `components/toast.js` | Mensagens de toast | passthrough (sem strings fixas) |
| Controllers admin (4) | Mensagens de erro | ~12 ("Sessão expirada...", "Acesso negado...") |
| Controllers de página | Textos dinâmicos | ~20 (status, labels, empty states) |

**Total estimado de strings únicas a externalizar: ~250-300**

#### Atributos de acessibilidade existentes

| Atributo | Ocorrências | Estado |
|----------|------------|--------|
| `aria-label` | 140+ (30 valores únicos) | Hardcoded em pt-BR |
| `aria-selected` | Presente em tabs | Funcional |
| `aria-controls` | Presente em tabs | Funcional |
| `aria-expanded` | Presente em menus | Funcional |
| `aria-hidden` | Presente em decorativos | Funcional |
| `aria-live="polite"` | 2 instâncias | Funcional |
| `aria-modal="true"` | Presente em modais | Funcional |
| `aria-labelledby` | Presente em formulários | Funcional |
| `role="tab/tablist/tabpanel"` | Presente nos feeds | Funcional |
| `role="dialog"` | Presente em modais | Funcional |
| `lang="pt-BR"` | 22 páginas (todas) | Hardcoded |

**Avaliação:** A base de a11y da v9.4.2 está sólida. Os atributos ARIA estão presentes e funcionais. O problema é que os valores textuais de `aria-label` estão hardcoded em português, impedindo tradução automática para leitores de tela em outros idiomas.

### 1.2 Cruzamento i18n ↔ a11y ↔ UX Writing

| Superfície | i18n | a11y | UX Writing | Intersecção |
|------------|------|------|------------|-------------|
| Botões de ação (votar, salvar, compartilhar) | Labels traduzíveis | `aria-label` hardcoded | Verbo de ação claro | Label traduzida deve ser o mesmo texto do aria-label |
| Tabs de feed (Destaques, Recentes, Comentados) | Labels traduzíveis | `role="tab"` + `aria-selected` | Nomenclatura consistente nos 6 feeds | Tradução deve manter paridade nos 6 módulos |
| Formulário create-post | Placeholders + labels traduzíveis | Falta `aria-describedby` em campos com ajuda | Texto de ajuda e validação | Mensagens de erro devem ser acessíveis e traduzíveis |
| Toasts de feedback | Mensagens traduzíveis | `aria-live="polite"` (2 instâncias, deveria ser mais) | Tom e clareza da mensagem | Toast deve anunciar ao leitor de tela com texto traduzido |
| Navegação (shell público, admin) | Labels de menu traduzíveis | `aria-label` no nav | Nomenclatura curta e clara | Navegação traduzida deve respeitar `white-space: nowrap` |
| Dropdown de notificações | "Marcar todas como lidas" traduzível | `aria-expanded` funcional | Ação clara e reversível | Texto traduzido pode expandir e quebrar layout |
| Cards de produto | Título, preço, categoria traduzíveis | Caroussel com `aria-label` | Formatação monetária (R$) | Moeda e formato numérico dependem do locale |
| Metadata SEO | `<title>`, `<meta>`, OG tags traduzíveis | Não impacta a11y diretamente | Descrições otimizadas para busca | SEO requer `hreflang` se houver múltiplos idiomas |

### 1.3 Componentes mais impactados (ordenados por risco)

1. **kc-constants.js** — Epicentro de labels: 75+ strings que alimentam 6 feeds, filtros, create-post e admin. Externalizar aqui desbloqueia ~30% do inventário.
2. **kc-create-post.js** — 30+ labels de formulário dinâmicas por módulo. Segundo maior concentrador.
3. **kc-utils.js** — Funções `renderPostCard`, `buildContactAction`, `escapeHtml` que geram HTML com texto hardcoded.
4. **Shell público (17 páginas)** — Navegação, search bar, tema toggle, notificação badge — todos com `aria-label` hardcoded repetidos 12-17x.
5. **Admin shell (5 páginas)** — Navegação admin com labels fixas.
6. **Controllers de feed (6)** — Empty states, filtros, tabs com texto fixo por módulo.

---

## ETAPA 2 — Análise de Risco

### 2.1 Expansão textual entre idiomas

Referência: textos em português são tipicamente 20-40% mais curtos que equivalentes em alemão e 10-20% mais curtos que em francês.

| Componente | Arquivo CSS | Restrição | Risco | Detalhe |
|-----------|-------------|-----------|-------|---------|
| Nome do usuário no header | `styles.css:524-537` | `max-width: 160px/120px` + `ellipsis` | CRÍTICO | Nomes longos já truncam; tradução piora |
| Nome no admin header | `admin-shell.css:183` | `clamp(92px, 14vw, 164px)` + `ellipsis` | CRÍTICO | Extremamente restrito |
| Tabs de feed | `styles.css:1212-1230` | `white-space: nowrap` | CRÍTICO | "Destaques" (9) → "Highlights" (10) → "Hervorhebungen" (15) |
| Botões de ação do produto | `product.css:375-396` | `nowrap` + `ellipsis` | ALTO | CTAs truncados invalidam usabilidade |
| Chips de categoria | `styles.css:4302-4325` | `nowrap` + `border-radius: 999px` | ALTO | Chips com pill shape quebram com texto longo |
| Ranking de filtros | `styles.css:918-937` | `font-size: 0.7em` + `nowrap` | ALTO | Já minúsculos; +2 caracteres pode overflow |
| Nav mobile | `styles.css:2174-2186` | `font-size: 0.75em` | ALTO | "Início" → "Startseite" = 2x crescimento |
| Gaps de formulário | `styles.css:4327-4343` | `gap: 12px/10px` | MÉDIO | Labels mais longos desalinham grid |
| Placeholders de busca | 6 módulos HTML | Sem restrição de width | MÉDIO | Texto longo será cortado pelo input |

**Total de instâncias `white-space: nowrap` com texto**: 65+
**Total de `text-overflow: ellipsis` em texto visível**: 25+
**Total de `max-width` fixo em containers de texto**: 15+

### 2.2 Fragilidade de testes

| Métrica | Valor |
|---------|-------|
| Total de suites de teste | 51 |
| Total de testes | 530 |
| Testes com strings literais pt-BR | 12 arquivos (24%) |
| Testes com `data-testid`/`data-kc` | 40 arquivos (78%) |
| Testes mistos (ambos) | 6 arquivos (12%) |

**Exemplos de assertions frágeis:**
- `expect(html).toContain('aria-label="Voto positivo"')` — quebra se traduzir aria-label
- `expect(html).toContain('aria-label="Pesquisar"')` — idem
- `expect(productHtml).toContain('aria-label="Alternar tema claro/escuro"')` — idem

**Estratégia recomendada:** Migrar assertions de texto literal para seletores estáveis (`data-testid`, `role`, `[aria-*]` sem valor fixo) ANTES de externalizar strings. Isso deve ser uma subtarefa de v11.24.1.

### 2.3 Impacto SEO

| Superfície | Quantidade | Impacto |
|-----------|-----------|---------|
| `<title>` | 22 páginas | Alto — indexação Google |
| `<meta description>` | 18 páginas | Alto — snippet nos resultados |
| `og:title` / `og:description` | 18 pares | Médio — compartilhamento social |
| `api/og-image.js` / `api/og-product.js` | 2 Edge Functions | Médio — imagens OG dinâmicas |

**Recomendação:** Manter pt-BR como idioma primário e único no curto prazo. Se i18n for implementado para outro idioma, usar `hreflang` e canonical URLs. Não alterar metadata SEO até ter estratégia clara de multi-idioma.

### 2.4 Risco de hydration e inject-env

A plataforma é estática (HTML+JS, sem SSR), portanto **não há risco de hydration mismatch** no sentido clássico. O `inject-env.js` injeta apenas variáveis de ambiente (SUPABASE_URL, SUPABASE_ANON_KEY) em build-time, sem strings de UI. Se i18n for feito por detecção de locale em runtime (via `navigator.language`), não há divergência com build-time.

**Risco residual:** Se strings traduzidas forem injetadas em build-time (ex: gerar HTML por locale), seria necessário um build por idioma. A recomendação é fazer i18n em runtime para evitar isso.

### 2.5 Trade-off incremental vs. big-bang

A regra da v11 (seção 8.6 do RELATORIO) é clara: **nunca big-bang**. O rollout de i18n deve ser por camada:

1. Infraestrutura (dicionário, helper) — sem impacto visual
2. Componentes core (botões, modais, toasts, nav) — impacto controlado
3. Páginas complexas (home, feeds, produto, perfil, SEO) — impacto amplo

Cada camada deve ser uma iteração separada com regressão completa (51 suites, 530+ testes).

---

## ETAPA 3 — Estratégia de Implementação Incremental

### 3.1 Roadmap em 3 subfases

#### v11.24.1 — Infraestrutura base

**Escopo:**
- Criar `assets/js/kc-i18n.js` (módulo IIFE, `window.KCi18n`)
- Dicionário base pt-BR como objeto JavaScript (sem JSON externo para evitar fetch)
- Helper `KCi18n.t('chave')` com fallback para chave crua se tradução não existir
- Helper `KCi18n.n(number, options)` para formatação numérica (R$, datas)
- Extrair primeiro lote: labels de `kc-constants.js` (MODULE_LABEL_MAP, CATEGORY_LABELS, OPPORTUNITY_AREA_DEFINITIONS)
- Definir dicionário base de voz e tom em pt-BR (vocabulário preferido vs. evitado)
- Migrar assertions frágeis (12 arquivos de teste) para seletores estáveis
- Adicionar testes para `kc-i18n.js`

**Arquivos novos:**
- `assets/js/kc-i18n.js`
- `tests/kc-i18n.test.js`

**Arquivos alterados:**
- `kc-constants.js` (externalizar strings para chaves i18n)
- 12 arquivos de teste (migrar assertions de texto literal)
- Docs e relatório

**Critérios de QA:**
- 51/51 suites verdes, 530+ testes
- Nenhuma regressão visual (strings permanecem idênticas em pt-BR)
- `kc-i18n.js` carrega sem erros em todos os 22 HTML

#### v11.24.2 — Componentes core

**Escopo:**
- Externalizar strings de: botões globais, modais, toasts, navegação (shell público + admin)
- Alinhar `aria-label` com chaves i18n (mesmo texto do label visível)
- Adicionar `aria-live="polite"` nos toasts que faltam (atualmente só 2 instâncias)
- Adicionar `aria-describedby` em campos de formulário com texto de ajuda
- Revisar `white-space: nowrap` nos componentes migrados para comportamento seguro

**Arquivos alterados:**
- 17 páginas HTML públicas (shell: nav, search, tema toggle, badge)
- 5 páginas admin HTML (admin shell)
- `kc-public-shell.js`, `admin-shell.js`
- `components/toast.js`, `components/voting.js`
- `kc-auth.ui.js` (modal de login)
- CSS: ajustes pontuais em `styles.css`, `admin-shell.css`

**Critérios de QA:**
- Nenhuma regressão visual em mobile e desktop
- `aria-*` presentes e corretos nos componentes migrados
- Toasts anunciam corretamente via `aria-live`
- Paridade entre os 6 feeds e as 5 telas admin

#### v11.24.3 — Páginas complexas e SEO

**Escopo:**
- Externalizar strings restantes: home, feeds (6), produto, perfil, settings, create-post
- Metadata dinâmica: `<title>` e `<meta description>` via `KCi18n.t()`
- Estratégia de `hreflang` documentada (implementação só se houver segundo idioma)
- Testes e2e resilientes a mudança de texto
- QA de layout em mobile e desktop para expansão textual

**Arquivos alterados:**
- Todos os 22 HTML (metadata)
- `kc-create-post.js` (labels de formulário)
- `kc-utils.js` (renderPostCard, textos dinâmicos)
- Controllers de feed (6) e controllers de página
- CSS: ajustes de layout para expansão textual

**Critérios de QA:**
- Nenhuma regressão em 530+ testes
- Nenhuma quebra visual em mobile/desktop
- Metadata SEO preserva qualidade de indexação
- Sem drift entre feeds equivalentes
- Deploy validado em browser

### 3.2 Ferramentas recomendadas para a stack real

| Necessidade | Recomendação | Justificativa |
|-------------|-------------|---------------|
| Biblioteca i18n | Nenhuma (helper próprio) | Sem bundler, vanilla JS IIFE — dependência externa adiciona complexidade desnecessária |
| Dicionário | Objeto JS em `kc-i18n.js` | Evita fetch de JSON, carrega síncrono, compatível com IIFE |
| Helper | `KCi18n.t('chave')` | API mínima, fallback para chave crua, expansível |
| Formatação | `Intl.NumberFormat`, `Intl.DateTimeFormat` | Nativo do browser, zero dependência |
| Lint | Script de hygiene expandido | Detectar strings hardcoded em commits novos |
| Testes | Seletores estáveis (`data-testid`, `role`) | Desacoplar testes de texto literal |

### 3.3 Dicionário de voz e tom (pt-BR)

| Aspecto | Diretriz |
|---------|----------|
| Tom | Informal mas respeitoso. Comunidade universitária, não corporativo. |
| Pessoa | Segunda pessoa informal ("você") — nunca formal ("o senhor") |
| Verbos de ação | Infinitivo em labels ("Criar", "Buscar", "Salvar"), imperativo em CTAs ("Crie sua publicação") |
| Termos técnicos | Evitar. Usar "publicação" (não "post"), "buscar" (não "pesquisar" — exceto campo de busca) |
| Mensagens de erro | Empatia + ação: "Não foi possível salvar. Tente novamente." |
| Abreviações | Evitar quando possível. "Compra e Venda" (não "C&V") |
| Gênero | Neutro quando possível: "pessoa", "usuário/a" → preferir construções sem gênero |

### 3.4 Critérios globais de aceitação

- [ ] Nenhuma regressão nos testes existentes em NENHUMA subfase
- [ ] Nenhuma quebra visual em mobile (375px) ou desktop (1440px)
- [ ] `aria-*` attributes presentes e corretos nos componentes migrados
- [ ] Sem drift entre feeds equivalentes (paridade obrigatória)
- [ ] Deploy validado em browser após cada subfase
- [ ] Documentação atualizada (RELATORIO, README, CHANGELOG)
- [ ] Smoke HTTP em produção confirmando 200

---

## Referência de arquivos críticos

| Arquivo | Tamanho | Papel no i18n |
|---------|---------|---------------|
| `assets/js/kc-constants.js` | — | Epicentro de labels (75+ strings) |
| `assets/js/kc-create-post.js` | 108 KB | 30+ labels de formulário |
| `assets/js/kc-utils.js` | 96 KB | renderPostCard, textos dinâmicos |
| `assets/css/styles.css` | 235 KB | 65+ nowrap, 25+ ellipsis, 15+ max-width fixo |
| `assets/css/product.css` | 43 KB | Botões de ação com nowrap |
| `assets/css/admin-shell.css` | 26 KB | User name clamp extremo |
| `tests/a11y.test.js` | — | 14 assertions de aria-label hardcoded |
