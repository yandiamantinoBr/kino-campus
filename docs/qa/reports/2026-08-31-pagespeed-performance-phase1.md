# Performance mobile — primeiro lote conservador (2026-08-31)

## Objetivo e limites

Melhorar carregamento sem alterar a estética aprovada, o cabeçalho mobile de uma
linha, a visibilidade do chat, o consentimento ou regras de autenticação/RLS.
Diagnóstico inicial em `43ac3541`; mudanças paralelas da main são preservadas.
Este registro separa relatório remoto, medições locais e verificação funcional.

## Evidência inicial

[PageSpeed informado pelo usuário](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/jz2zw256p6?hl=en_GB&form_factor=mobile),
capturado em 31/08 às 11:23 GMT-3, Lighthouse 13.4.1, Moto G Power/4G lento:

| Métrica | Relatório remoto |
| --- | ---: |
| Performance | 49 |
| FCP / LCP | 2,1 s / 5,9 s |
| TBT / CLS | 470 ms / 0,22 |
| Speed Index | 5,9 s |
| Acessibilidade / boas práticas / SEO | 95 / 96 / 100 |

CrUX de 28 dias: LCP 1,7 s, INP 118 ms, CLS 0,23. A falha de Web Vitals é
principalmente instabilidade visual; esses dados históricos não mudam logo após
um deploy. O relatório identifica deslocamentos do guia da comunidade (0,151 e
0,049), cards (~0,01) e fonte de ícones. O LCP é o parágrafo de consentimento.

Duas medições locais controladas na produção anterior, Lighthouse 12.6.1:

| Execução | Performance | FCP | LCP | TBT | CLS | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 64 | 2,69 s | 4,22 s | 87,5 ms | 0,2335 | 6,49 s |
| 2 | 70 | 2,78 s | 3,91 s | 112,5 ms | 0,2209 | 4,01 s |

Controle explícito: somente a URL de JavaScript injetada pelo antivírus local
foi bloqueada dentro da auditoria. Nenhuma proteção da máquina foi desativada.
A primeira execução não controlada estava contaminada por esse script e não
serve como comparação de performance do produto. Não comparar diretamente as
notas locais (Lighthouse 12) com a nota remota (Lighthouse 13).

## Auditoria conectada

- Vercel MCP confirmou a produção main `43ac3541`, READY, região gru1. Alertas
  históricos de Cadu/OG não foram atribuídos indevidamente ao carregamento home.
- Supabase MCP confirmou o projeto da plataforma, PG 17.6 e cache hit acima de
  99,98%. Advisors de performance retornaram apenas índices sem uso em INFO;
  não houve justificativa para apagar índices ou mudar RLS.
- EXPLAIN público do feed: ~1,67 ms, sem leitura de disco nessa amostra. Não é
  prova de latência equivalente para sessões autenticadas ou rede.
- GitHub consultado para evitar duplicar trabalhos e preservar integrações
  paralelas. Nenhuma branch alheia ou configuração de proteção foi alterada.

## Mudanças

1. Reserva da área inicial do feed home enquanto vazio e `loading`, independente
   do fim do anti-FOUC. Liberada por conteúdo ou estado terminal; sem reserva no
   modo sem JavaScript. Sem altura fixa no feed concluído e sem ocultar conteúdo.
2. Preload da mesma fonte local Font Awesome solid, com URL e CORS compatíveis.
   Um único download comprovado; nenhum ícone ou glifo removido.
3. Consentimento como primeiro script `defer` na home. Ele aparece após o HTML
   estar parseado, antes de aguardar scripts posteriores; permissões continuam
   negadas por padrão. Nenhum atraso artificial ou ocultação para melhorar LCP.
4. Corridas do consentimento antecipado cobertas: propriedade do scroll lock,
   elementos inertes adicionados depois e menu mobile inicialmente inerte.
   Fechar preferências não libera outro modal nem prende a rolagem.
5. Uma promessa compartilhada somente durante a requisição pública de banners.
   TTL, consultas, estados vazios, falhas e novas tentativas preservados.
6. Minificação somente de `dist/assets/js/**`, com Terser 5.51.2 fixado,
   `compress:false`, `mangle:false`, nomes/licenças preservados e arquivos
   clássicos separados. Fontes, vendor, CSS, HTML e APIs não são reescritos.
   Falhas de sintaxe impedem o build; revisão de cache é aplicada depois.

Ganho isolado dos 98 scripts próprios da home: gzip 440.869 → 345.924 bytes
(−21,54%) na medição anterior à pequena proteção adicional de consentimento.
Os 175 scripts próprios totalizaram −17,48% gzip. São bytes de artefato,
não promessa de igual redução no tempo de carregamento.

## Validação pré-integração

- 340 suítes / 5.788 testes passaram, 7 testes preexistentes ignorados; suíte
  iniciada antes de adicionar os 7 testes novos de consentimento, também verdes.
- 233 E2E do fonte passaram; 15 testes cross-browser passaram, incluindo
  Chromium, Firefox e WebKit desktop/mobile.
- Artefato minificado: Chrome e Edge nativos passaram 10 E2E, incluindo 720
  estados de cabeçalho e fluxos de consentimento/menu/login durante boot lento.
- Revisão independente: 86 testes em 10 suítes e nenhum P1/P2 pendente.
- Estrutura, rotas, cadeia de scripts, versões, higiene e `npm audit --omit=dev`
  aprovados; zero vulnerabilidades de produção reportadas.
- QA pública inicial dos cinco módulos: HTTP 200 e zero erros de console/página.
- Vision Assist comparou produção anterior e artefato com os mesmos dados:
  nenhuma diferença visual detectável em cores, tipografia, espaçamentos ou
  composição desktop; mobile 390 px com logo completo, uma linha e sem colisões.
  O banner de privacidade permanece visível e operável, como antes.

O teste de artefato usa config pública apenas em memória para QA visual e modo
local para testes determinísticos. O template 404 continua fora de `dist`, pois
é renderizado por função em produção. Portas/versões fixas no harness antigo
foram identificadas e ajustadas para permitir testar um artefato revisionado;
não foram relaxadas as verificações de origem externa ou da fonte.

Evidências locais preservadas em `output/playwright/performance-*` no worktree
`kino-campus-pagespeed-20260831`. Integração/produção e segunda rodada de imagens
serão registradas após os respectivos checks, sem confundir preview com produção.

## Integração e primeira medição em produção

PR [#915](https://github.com/yandiamantinoBr/kino-campus/pull/915) integrada após
todos os checks verdes. Merge `68c5b74a948d232cb354f0c9851516f7ed663391`, deploy
Vercel `dpl_9AUTiqyBpbWSmjH9JegmEJ17ax69`, READY/production/main e domínio
canônico verificados. HTML público confirmou a revisão e a ordem antecipada do
consentimento. O preview protegido redirecionou para login Vercel; sua auditoria
foi descartada, sem usar esses números como evidência da plataforma.

[Novo PageSpeed mobile](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/c4jzbd78rq?hl=en_GB&form_factor=mobile),
31/08 às 12:23 GMT-3, mesmo Lighthouse 13.4.1/Moto G Power/4G lento:

| Métrica | Antes | Primeiro lote publicado |
| --- | ---: | ---: |
| Performance | 49 | 89 |
| FCP | 2,1 s | 1,4 s |
| LCP | 5,9 s | 3,2 s |
| TBT | 470 ms | 20 ms |
| CLS | 0,22 | 0,075 |
| Speed Index | 5,9 s | 4,0 s |
| Acessibilidade / boas práticas / SEO | 95 / 96 / 100 | 95 / 96 / 100 |

As duas medições locais controladas pós-deploy (Lighthouse 12.6.1) deram notas
68 e 78; CLS 0,0805 e 0,0910, TBT 72,5 e 33,5 ms. FCP/LCP/SI variaram com a
rede local, portanto não são apresentados como ganho uniforme. O resultado
remoto é uma amostra de laboratório, não uma garantia de nota constante; CrUX
permanece histórico de 28 dias.

Produção passou 6 E2E no Chrome/Edge nativos: 720 combinações de cabeçalho
mobile (larguras, claro/escuro, fontes ampliadas e conta sintética) e abertura do
formulário de login. Conta sintética comprova layout, não autenticação real.
Os cinco módulos retornaram HTTP 200, sem erros de console/página no runner.

A comparação visual encontrou distribuição horizontal diferente no cabeçalho
desktop. A investigação reproduziu os dois estados em **ambos** os commits
(baseline `43ac3541` e produção minificada): fonte antes do DOMContentLoaded
mostra quatro rótulos e seta; fonte depois mostra três rótulos, sem seta. Seis
cenários controlados (atraso de fonte/defer) comprovaram geometria equivalente
entre commits, sem erros de página. A recálculo explícito leva ambos ao mesmo
estado. Trata-se de uma variação preexistente da inicialização responsiva,
não de CSS alterado ou código perdido na minificação. Não se aplicou mudança
estética arbitrária para tornar capturas com temporizações distintas idênticas.

Evidências `header-timing-audit.json` e `header-timing-early-font-audit.json` no
worktree do primeiro lote. As imagens dos demais módulos preservam o estilo;
faixas horizontais de categorias podem mostrar um item parcial junto da seta,
comportamento preexistente. A cobertura visual não inclui áreas sob o banner
de consentimento; os controles também foram exercitados sem o banner.

## Referências técnicas consultadas

- [Google: investigar e reduzir CLS](https://web.dev/articles/optimize-cls).
- [Google: preload de recursos críticos](https://web.dev/articles/preload-critical-assets).
- [Terser: opções e API](https://terser.org/docs/api-reference/).
