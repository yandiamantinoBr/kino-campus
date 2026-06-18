# Report V76 - Resiliência de conteúdo público para AdSense

**Data:** 2026-06-17
**Escopo:** feeds públicos, cards, SSR de produto e operação Search Console/AdSense
**Tipo:** correção funcional de baixo risco + SEO + documentação operacional
**Status:** PASSOU; PR #585 PRONTO PARA MERGE
**Runtime alterado:** sim, somente renderização pública e metadata SSR

---

## 1. Objetivo

Concluir o P1 remanescente do plano AdSense após os PRs de conteúdo editorial,
RSS e dados estruturados. A etapa cobre quatro lacunas relacionadas: textos
alternativos de cards/feeds, estados vazios públicos, canonical/snippets das
páginas de produto e instrução operacional para Search Console/AdSense.

## 2. Decisões técnicas

### 2.1 Canonical e snippets

- `api/og-product.js` não usa mais `Host` ou `X-Forwarded-Host` para construir
  canonical e imagem Open Graph de fallback;
- canonical e fallback ficam sempre ancorados em
  `https://www.kinocampus.com.br`, inclusive em previews da Vercel;
- title SSR é limitado a 70 caracteres e description a 180;
- o item só pode ser indexado quando a descrição real da publicação, sem o
  prefixo editorial, tiver pelo menos 24 caracteres;
- `og:image:alt` e `twitter:image:alt` recebem o título da publicação.

### 2.2 Imagens de cards e feeds

- `renderPostCard` usa `Imagem da publicação: {título}`;
- títulos contendo apenas emoji recebem fallback pelo módulo, por exemplo
  `Imagem de Eventos publicada no KinoCampus`;
- cards relacionados usam contexto explícito de publicação relacionada;
- `npm run seo:audit` verifica imagens estáticas indexáveis e contratos
  dinâmicos de cards, relacionados e imagens sociais.

### 2.3 Estados vazios

- os seis módulos têm títulos e ações específicos por domínio;
- o feed central cria fallback útil quando termina sem posts e não existe um
  estado vazio próprio da página;
- mensagens foram mantidas curtas para não colidir com a navegação fixa no
  mobile;
- busca interna recebe instrução para revisar os termos ou consultar módulos.

### 2.4 Operação

`docs/ops/adsense-search-console-readiness-runbook.md` separa gate local,
verificação de produção, inspeção de URL e solicitação de revisão. Nenhum slot,
Auto Ads, secret, configuração Google, Search Console ou revisão foi ativado.

## 3. Arquivos afetados

- `api/og-product.js` e `_product.html`;
- renderizadores `kc-utils.presentation.js` e `product.related.js`;
- controller central `kc-feed.controller.js`;
- seis páginas de módulo e `search-results.html`;
- `scripts/seo-audit.js`;
- testes de apresentação, feed, produto e indexação;
- changelog, mapa SEO, índice documental e runbooks.

## 4. Cobertura adicionada

Os testes novos comprovam:

1. canonical e imagem de fallback no domínio oficial;
2. limites de title e description;
3. No-Go de indexação sem descrição real;
4. alt por título e fallback por módulo para título somente com emoji;
5. alt contextual de relacionados e imagens sociais;
6. estado vazio criado no DOM quando o feed termina sem posts;
7. copy específica nos seis módulos públicos;
8. presença dos novos gates na auditoria SEO.

## 5. Validação local

| Gate | Resultado |
|---|---|
| `git diff --check` | passou; apenas avisos LF/CRLF esperados no Windows |
| `node --check` nos JS alterados | passou |
| `npm run seo:audit` | passou; 14 páginas indexáveis, 9 noindex, zero warnings e zero errors |
| testes focados | passou; 6 suites / 92 testes, seguido de 3 suites / 60 testes após ajuste |
| `npm run check:all` | passou; 5 validadores, 177 suites, 3.600 testes e 3 snapshots |
| `npx playwright test --list` | passou; 59 testes em 9 arquivos |
| Playwright completo local | 58 passaram; 1 ressalva de baseline no breakpoint de 769 px |
| smoke visual 1440 x 900 | passou; estado vazio legível, sem overflow horizontal |
| smoke visual 390 x 844 | passou; estado vazio legível, sem overflow e sem sobreposição do CTA com a navegação fixa |

## 6. Ressalva Playwright local

O teste de header em 769 px falhou porque, no Chromium/Windows local, a barra de
rolagem reduz a largura CSS efetiva e aciona a regra histórica de ícones para o
intervalo até 767 px. O mesmo arquivo passou em 1366, 1024, 900 e 390 px. Esta
etapa não altera `styles.css`, header ou o teste responsivo; por isso o problema
foi classificado como baseline ambiental fora do escopo. O merge permanece
condicionado ao CI remoto integralmente verde.

## 7. Deploy e estado remoto

- PR: #585;
- CI remoto: Validators/Jest/Playwright, Lighthouse, Vercel e Preview Comments
  aprovados;
- preview Vercel: publicado e aprovado;
- deploy de produção: pendente do merge;
- Search Console: nenhuma ação executada;
- AdSense: nenhuma revisão ou ativação executada;
- Supabase: nenhuma alteração.

## 8. Risco e rollback

O maior risco é uma publicação curta deixar de ser indexada quando não possui
descrição real suficiente. Esse comportamento é intencional para evitar páginas
finas; a publicação continua acessível com `noindex,follow,noarchive`.

Rollback: reverter o commit restaura metadata, alt e estados anteriores. O
runbook é documental e pode ser revertido sem efeito remoto.
