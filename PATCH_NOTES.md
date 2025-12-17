# Patch Notes - KinoCampus V5.4 (Correções + Mobile)

## O que foi corrigido/melhorado

### Navegação e filtros (feeds com tabs)
- Corrigido filtro por tabs que falhava por causa de acentos e variações singular/plural.
- Busca e tabs agora funcionam juntas (sem “sumir” cards ao digitar depois de filtrar).
- Implementado filtro unificado em `filters.js` e ativado em:
  - caronas-feed.html
  - oportunidades.html
  - eventos.html
  - achados-perdidos.html
  - moradia.html

### Conflitos com busca global (`search.js`)
- `search.js` agora respeita páginas que já têm filtro próprio:
  - Se existir `window.filterPosts`, ele delega para ela.
  - Se o input tiver `onkeyup` (filtro local), ele não tenta aplicar `filterCurrentPageCards`.

### Bugs/ajustes gerais
- Removida duplicação de `<script src="script.js">` em `compra-venda-feed.html`.
- Corrigidos links quebrados no sidebar do `index.html` (categorias e “Ver detalhes”).

### Mobile
- Ajustes de safe-area para iOS (notch/home indicator) no padding inferior da navegação e do body.
- Melhorado tap target (min-height 44px) na navegação inferior.

