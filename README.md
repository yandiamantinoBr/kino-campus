# KinoCampus — Protótipo WEB (V5.5.4)

KinoCampus é um **protótipo de plataforma universitária** voltada para a comunidade (ex.: UFG), com foco em **compartilhamento de oportunidades** e **publicações por módulos** (Compra & Venda, Caronas, Moradia, Eventos, Achados/Perdidos e Oportunidades).

Este repositório/ZIP foi organizado para rodar **sem backend**, com dados iniciais em JSON e publicações do usuário salvas em **localStorage**.

---

## ✅ O que está pronto

### Publicações (posts)
- **Criar publicação via modal “Nova Publicação”** (overlay/blur, grid de módulos e campos dinâmicos).
- Campos **se adaptam ao módulo e ao subtópico/tag** (ex.: Compra & Venda → Compro/Vendo + condição; Moradia → Repúblicas/Quartos/Apartamentos/Procurando; Eventos → Sustentabilidade/Acadêmicos/Culturais/Esportivos/Workshops).
- **Upload de imagens**: até **5 imagens** (**1 capa + 4 adicionais**) com preview, remover e selecionar capa (⭐).
- Ao publicar, o usuário é **redirecionado para a página do módulo**, e o post passa a aparecer nos cards do feed do módulo correspondente.

### Filtros e navegação
- **Tabs / subcategorias** (`kc-feed-tabs`) para filtrar rapidamente os posts da página.
- **Busca** (barra de busca + página de resultados).
- **Tema claro/escuro** com persistência.

### Responsividade
- Layout adaptado para mobile (cards, grids e espaçamentos).
- Navegação inferior no mobile (quando presente no HTML).

---

## 🧠 Como funciona a persistência

### 1) Publicações do usuário (localStorage)
- As publicações criadas pelo modal são salvas no navegador em:
  - `localStorage["kc_user_posts"]`
- Imagens são armazenadas como **DataURL (base64)** junto do post (atenção ao limite de armazenamento do navegador).

**Reset rápido (limpar suas publicações):**
```js
localStorage.removeItem("kc_user_posts");
location.reload();
```

### 2) Banco de dados de exemplo (JSON)
- Arquivo: `data/database.json`
- Estrutura:
  - `anuncios`: lista de anúncios (seed / exemplos)
  - `categorias`: mapeamentos de categorias/subcategorias
  - `sinonimos`: sinônimos usados na busca

> Observação: a busca carrega esse JSON via `fetch()`. Para evitar bloqueios de CORS quando abrir pelo `file://`, recomenda-se rodar com um servidor local (veja “Como rodar”).

---

## 🚀 Como rodar (recomendado)

### Opção A — VSCode Live Server (mais simples)
1. Abra a pasta no VSCode  
2. Clique em **“Go Live”**
3. Acesse `index.html`

### Opção B — Python (servidor local rápido)
Na pasta do projeto:
```bash
python -m http.server 5500
```
Abra:
- `http://localhost:5500/index.html`

> Rodar via servidor local melhora compatibilidade com `fetch('data/database.json')`.

---

## 🔎 Busca
- Script: `search.js`
- Página: `search-results.html`
- A busca lê o parâmetro `q` na URL e consulta o banco `data/database.json`.

Exemplo:
```
search-results.html?q=notebook
```

---

## 📁 Estrutura de arquivos (clean)

```
/
├─ index.html
├─ compra-venda-feed.html
├─ compra-venda.html
├─ caronas-feed.html
├─ caronas.html
├─ achados-perdidos.html
├─ eventos.html
├─ moradia.html
├─ oportunidades.html
├─ product.html
├─ search-results.html
├─ styles.v554.css
├─ script.v554.js
├─ filters.js
├─ search.js
└─ data/
   └─ database.json
```

---

## ⚙️ Onde editar módulos, tags e campos do “Nova Publicação”
As regras (quais módulos existem, quais tags/subtópicos e quais campos aparecem) ficam no:
- `script.v554.js`

Procure por algo como:
- `KC_CREATE_SCHEMA`
- funções relacionadas a “create modal” / “kcEnsureCreateModal”

Ali você consegue:
- adicionar/remover módulos
- mudar tags/subtópicos
- alterar validações e quais campos aparecem

---

## 🧩 Dependências
- **Font Awesome** via CDN (ícones).  
Se quiser rodar 100% offline, substitua por ícones locais (download do CSS/fontes) e ajuste o `<link>` no HTML.

---

## 📝 Notas e limitações conhecidas
- Sem backend: tudo fica no **client-side**.
- localStorage tem limite (imagens podem ocupar espaço rapidamente).
- Recomenda-se rodar com servidor local para evitar bloqueios ao carregar JSON via `fetch()`.

---

## Versão
- **V5.5.4** — foco em melhorias de mobile/cards/tabs + modal de publicação + schema por módulo.
