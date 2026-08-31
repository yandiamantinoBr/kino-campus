# S24: ergonomia do cabeçalho e carregamento inicial

## Estado desta revisão

Trabalho iniciado em 2026-08-31 às 17:04 UTC. Os ajustes foram integrados pelas [PR #922](https://github.com/yandiamantinoBr/kino-campus/pull/922) e [PR #923](https://github.com/yandiamantinoBr/kino-campus/pull/923), após CI verde. O domínio canônico foi conferido no SHA `e6c3e82d227aa1fa8bfde60df71868b2d1adb649`; não apenas o preview.

Resultado: controles maiores e melhor distribuição de espaço; redução comprovada de bytes/requisições; reserva do ranking; uma falha preexistente de rascunho corrigida. **A performance ainda não está resolvida:** três novos PageSpeed ficaram em 70/71/87, enquanto os Lighthouse locais variaram de 63 a 92. Os números e limites estão registrados abaixo, sem selecionar somente a melhor execução.

Preservados: linha única no mobile, nome KinoCampus, paleta e estados dos controles, chat transparente em repouso/laranja ativo, funcionalidades, consentimento, isolamento de contas, cache de conteúdo e contratos Supabase. Nenhuma migração, alteração de RLS, conteúdo, credencial, TTL, proteção Vercel ou configuração de telemetria.

## Cabeçalho: causa e ajuste

O CSS anterior limitava os controles a 26–36px de largura e 36px de altura. A coluna flexível da marca absorvia a sobra; o cálculo anterior apenas encurtava o login. Em perfil autenticado, isso deixava aproximadamente 35–51px depois do nome, sem aproveitar a largura para os botões.

O ajuste distribui o orçamento entre alvos e espaçamento, usando medidas intrínsecas da marca/login/perfil, não a largura já atribuída pelo quadro anterior. Altura de toque 44px; largura até 44px; ícones 16–22px; gaps até 5px entre ações e 6px entre grupos. Escritas idempotentes e remoção das variáveis ao voltar ao desktop. A transição de largura foi removida: ela animava o botão separadamente da coluna e causava sobreposição transitória na hidratação de auth.

Medidas iguais nos Chrome e Edge instalados, a 100% de fonte, com perfil fictício:

| Largura CSS | Estado | Alvo | Ícone | Gap entre ações | Espaço após o nome |
|---|---|---:|---:|---:|---:|
| 384px | perfil | 40,05 × 44px | 20,02px | 2px | 3,47px |
| 412px | perfil | 44 × 44px | 22px | 2,09px | 4,92px |
| 430px | perfil | 44 × 44px | 22px | 5px | 10,33px |
| 412px | visitante | 43,89 × 44px | 21,95px | 0px | 2,84px |

Em visitante 412 px no Windows, manter `Login/Cadastro` custa apenas 0,11 px por alvo frente ao teto de 44 px; trocá-lo por `Entrar` deixava um vazio desnecessário de 46,92 px. No Chromium Linux, a fonte Liberation Sans torna o mesmo rótulo 1,39 px mais largo. A banda final explícita de 43–44 px preserva o texto nos dois sistemas, por medida real, sem exceção de navegador ou viewport. No Linux os alvos ficaram em 43,42 × 44 px e a sobra depois do nome caiu de 45,55 para 2,63 px. Nos menores viewports, `Entrar` permite alvos maiores. No extremo de 320 px/fonte 150%, permanece o fallback de 26 × 44 px, sem esconder controles ou criar segunda linha. Não se afirma largura de 44 px em todos os casos nem teste físico no aparelho do usuário.

Verificações: 51 Jest; 23 E2E de layout; seis Chrome/Edge de medidas e fluxos; nove pares visuais claros e três escuros analisados. Nome inteiro, ausência de colisão/overflow, altura sincronizada, hit-testing, Tab/Enter/Escape, busca, sino, tema, formulário de login, drawer de perfil e navegação para Mensagens. Auth testado com fixture fictícia e código AuthUI real; nenhuma mensagem, voto ou mutação de conta enviado a APIs reais. As pequenas margens após o nome e o maior peso visual do botão de busca foram registrados como limites estéticos, não ignorados.

A revisão final da banda passou em 52 Jest, 29 E2E Chromium, seis Chrome/Edge e quatro orçamentos medidos em Chromium Linux real. O novo caso de integração reproduz exatamente as métricas da fonte Linux, falha antes da correção e preserva a exigência de rótulo completo, área de toque, ausência de colisões e acessibilidade. Os testes de limite anteriores foram deslocados para a nova banda sem remover suas verificações de compactação.

Uma verificação complementar usou Roboto real, confirmada pelo CDP, para aproximar as métricas de texto Android: 40 combinações Chrome/Edge × 360/384/390/412/430 px × claro/escuro × visitante/perfil fictício. Em 412 px, os alvos ficaram em 44 × 44 px; sobra após o nome 6,42 px no perfil e 5,59 px no visitante. Tema aplicado pela API real `kcSetTheme`, incluindo body/root, e capturas feitas após o fim das transições. Quatro capturas finais foram aprovadas pelo VisionAssist. Não é teste físico em S24 Ultra nem prova da configuração de fontes do aparelho. Os dois conjuntos intermediários de capturas foram preservados como diagnóstico, mas não são a evidência final de tema: `s24-roboto-header-settled/` é o conjunto válido.

### Regressão adicional de toque: hover persistente

A QA pós-deploy não se limitou ao estado em repouso. Em Chrome e Edge com `isMobile`/`hasTouch`, `(hover: none)` e ponteiro coarse, um toque no tema mantinha `:hover`. A regra global de botões aplicava `scale(1.1)`: um alvo de aproximadamente 44 px virava 48,4 px e interceptava a borda do chat. Não era apenas aumento da caixa geométrica: `elementFromPoint`, `touchstart`, `pointerdown` e `click` comprovaram o alvo errado.

A correção adicional em `kc-chat-shortcut.css` neutraliza **somente a transformação de hover** dos botões/links diretos das ações do cabeçalho público, em até 768 px e sem hover disponível. Mantém cores, estado laranja ativo, foco, dimensões calculadas e animações no desktop. Não altera o orçamento de largura, o texto do login nem o layout de admin.

O teste preserva coordenadas de toque medidas antes da mudança de tema, sem mover o mouse para limpar o hover. A regressão falha no código anterior no ponto correto, não em uma comparação genérica de screenshots. Há um limite do navegador documentado: mesmo com o DOM corrigido, Chromium pode redirecionar um toque a 1 px da borda por ajuste da área de contato. Na investigação, 2/4 px e centro passaram com o fix; o teste mantém a verificação DOM estrita a 1 px e verifica navegação real a 4 px, sem afirmar precisão universal de dedo na borda extrema.

Validação local do complemento: 14/14 Chrome/Edge em 384/412/430 px, visitante/perfil fictício, mais controle desktop 1280 px; caixas anteriores/posteriores exatas, áreas de toque preservadas, chat abrindo no estado laranja correto. Os 54 Jest das três suítes de cabeçalho e 59 de duas suítes da revisão independente passaram (contagens sobrepostas, não somadas). Commit `6267f0a8`; este complemento ainda depende da integração e confirmação de produção registradas no fechamento, não estava no SHA `e6c3e82d` das capturas anteriores.

## Fonte: redução sem mudar os ícones

Somente a home opta pela família derivada. Original Font Awesome Free6.4.0, seus CSS/fontes e as famílias regular/brands continuam intactos. Ícones não listados, erro de download do subset ou erro da folha opcional preservam o caminho original.

- Original: 150.124 bytes.
- Subset final: 31.732 bytes, redução78,9%.
- Arquivo: `kc-ui-icons-solid-d63ef97ba52b.woff2`.
- SHA256: `d63ef97ba52b320f45e902f0c4524e0dd25734a8eead3718a8d1dca0e742ab83`.
- CSS roteia os mesmos281 pontos revisados, mais U+20 necessário à métrica da fonte. O restante continua em face disjunta apontando para o original.
- Fonte interna preserva549 entradas de cmap/325 glifos para contexto de rasterização; isso não amplia o roteamento visível do subset.

A primeira versão de27.052B passou no Windows, mas o CI Linux detectou diferenças em sete glifos. Comparação de outlines/avanços não bastava: o auto-hinter FreeType usa outros caracteres Latin da mesma fonte para alinhamento. Preservar apenas aliases ainda falhava; preservar o Basic Latin original inteiro e todos os aliases dos glifos retidos eliminou a diferença. [Contexto técnico do FreeType](https://freetype.org/autohinting/blues.html).

Controle causal em Chromium Linux151: versão anterior e variante aliases-only reproduziram o defeito; versão final zerou a comparação de pixels dos281 ícones em16/22/32px. Chrome/Edge:18/18 testes, pixels exatos, CDP confirmando a fonte que realmente desenha o glifo, fallback, famílias regulares/brands e um único download do subset na home sem a fonte completa. Nenhum limiar de pixels foi relaxado.

O gerador usa versões fixadas de FontTools/Brotli, valida cmap, métricas globais, avanços e outlines; validações continuam ativas sob `python -O`. Recusa symlinks/junctions/hardlinks, ancestrais e tipos de destino incompatíveis antes da primeira escrita. Contexto, fontes, hashes e nomes são reproduzíveis. Nome interno próprio e licença OFL preservados. O arquivo hash anterior foi mantido para referências já cacheadas.

## Estabilidade do ranking

Uma reserva CSS restrita à home em até520px cobre apenas lista vazia inicial ou status de carregamento. A altura deriva do avatar responsivo, duas linhas de texto, margens e padding já existentes. Não fixa nem corta a altura final de contribuintes, erro ou vazio terminal; no-JS e layouts maiores permanecem naturais.

Em412px/fonte100%, a sequência anterior era5 →43,39 →86,73px; agora86,75 →86,75 →86,73px. Isso reduz o deslocamento interno de81,73px para aproximadamente0,016px nesse cenário, não uma promessa de CLS zero universal. Com fonte150%, pontuações ainda podem quebrar e aumentar a altura final24,44px; legibilidade foi preservada. Capturas do estado final antes/depois foram byte-idênticas.

Cobertura:25 casos Chromium e50 Chrome/Edge, incluindo1/10 usuários, cache fresco/antigo, vazio/erro/indisponibilidade/retry, no-JS,320–1280px e fonte125/150%.

## Build e conexão essencial

Quatro grupos contíguos de IIFEs de definição passam de38 arquivos para quatro, reduzindo99 para65 tags de script na home. Não são agrupados boot, cliente Supabase, consentimento, auth ou outros inicializadores. Os arquivos originais continuam publicados para outras páginas. Nenhum corpo de função é reescrito pelo agrupamento.

Guardas AST/HTML verificam estritamente definições, efeitos permitidos, origem do programa formatado, fronteiras, atributos, UTF-8 e caminhos. Mudança incompatível falha o build, sem fallback silencioso. As fronteiras de erro usam `reportError` para preservar continuação/identidade/cancelamento; em navegador sem essa API, a exceção é entregue no próximo timer, diferença de timing documentada. Uma falha HTTP de um bundle tem alcance maior que a de um arquivo individual; os testes de erro de execução não são apresentados como equivalência de todas as falhas de rede possíveis.

Precache: os URLs antigos são mantidos para outras páginas e o bundle de utils é acrescentado porque contém três definições já precacheadas. Política, listeners, flag de ativação e fonte do Service Worker não mudam. O build aplica a mesma revisão ao HTML, aos15 itens de precache e ao namespace. Acorn/parse5 são dependências de produção exatas, não transientes de testes.

Preconnect: uma origem Supabase HTTPS configurada, somente no HTML copiado, sem chave, request de dados ou telemetria. URL raw, CSP de headers e meta, idempotência e caminhos são verificados; configurações desconhecidas continuam funcionando sem a otimização. A observação anterior de89–200ms de DNS/TLS é expectativa de latência antecipável, não ganho de LCP garantido; o navegador pode ignorar o hint. [Semântica do preconnect](https://html.spec.whatwg.org/multipage/links.html#link-type-preconnect).

## Performance: evidência e limites

O [relatório mobile enviado pelo usuário](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/0y0vjwynji?hl=en_GB&form_factor=mobile) foi produzido antes deste lote: performance66, FCP1,85s, LCP simulado10,12s, TBT0, CLS0,019 e SI7,95s. O elemento LCP era o parágrafo do consentimento, não uma imagem do feed. Os dados CrUX de28 dias eram da origem: LCP1,7s/INP118ms, mas CLS0,23. Campo histórico e execução de laboratório não são intercambiáveis.

No baseline de produção7ec29005, três Lighthouse locais simulados produziram72/87/87, com LCP4,39/3,29/3,28s. Essa variabilidade impede atribuir uma nota isolada à mudança. Um trace DevTools de produção terminou com `NO_TTI_CPU_IDLE_PERIOD`: score nulo, não zero e não auditoria completa aprovada.

A/B controlado local HTTP/2+TLS+Brotli5, Lighthouse13.4.1, Chrome152, DevTools4G/CPU4x, três execuções completas por variante:

| Mediana | Baseline | Fonte27KB experimental | Fonte27KB + bundles |
|---|---:|---:|---:|
| FCP | 4.991ms | 4.852ms | 4.698ms |
| LCP | 5.248ms | 5.066ms | 4.941ms |
| DCL | 6.731ms | 6.416ms | 6.252ms |
| TBT | 982ms | 826ms | 890ms |
| Transferência | 625.292B | 505.620B | 489.094B |

Os snapshots tinham o mesmo CSS e nenhum dado real de API. A versão final da fonte tem mais 4.680 B de contexto Linux; as medições de produção abaixo já usam essa versão. O ganho de 125 ms de LCP entre fonte e bundles é descritivo desse experimento; não há ganho de TBT demonstrado. Uma amostra sobreposta à QA foi excluída; duas execuções terminaram com erro Windows de limpeza temporária após gerar relatórios e não compõem a tabela de execuções completas. O bloqueio do recurso injetado do antivírus foi restrito à auditoria, sem alterar a segurança do sistema. Certificado local aceito somente pelo browser de auditoria.

O CSS principal transferia45.656B, mas concorria com100 scripts e até105 requests em voo. Após o download, o primeiro layout de283 objetos custava438–576ms antes do FCP. A tarefa longa rotulada com a URL do modal de busca continha o despacho de vários listeners DOMContentLoaded, não custo exclusivo do modal. O listener Core ocupava aproximadamente198–208ms e merece uma investigação separada de invalidação/layout, sem adiar sessão, consentimento ou disponibilidade dos controles.

### Produção: três medições locais completas e novo Google PageSpeed

Mesma versão Lighthouse 13.4.1, Chrome 152, modo simulado e configuração nas seis execuções. Nenhum outro browser de QA estava ativo nas três coletas pós-deploy. Não foram intercaladas; o benchmark de CPU variou entre 2.537,5 e 3.415, limitando atribuição causal.

| Execução | Nota | LCP simulado | LCP observado no trace | TBT simulado |
|---|---:|---:|---:|---:|
| Baseline 1 | 72 | 4,393 s | 795 ms | 21,5 ms |
| Baseline 2 | 87 | 3,285 s | 481 ms | 27 ms |
| Baseline 3 | 87 | 3,277 s | 532 ms | 82,5 ms |
| Produção 1 | 81 | 3,493 s | 605 ms | 119 ms |
| Produção 2 | 92 | 2,608 s | 522 ms | 61 ms |
| Produção 3 | 63 | 6,849 s | 2.408 ms | 224,5 ms |

Medianas locais: nota 87 → 81; LCP 3,285 → 3,493 s; TBT 27 → 119 ms. Portanto, estas amostras **não comprovam melhora consistente de LCP/TBT**. Arquivos e inventário equivalentes confirmam scripts 102 → 68, bytes JS transferidos 675.144 → 579.158, fonte 152.552 → 34.105 B, total 140 → 107 requests e aproximadamente 8,9% menos bytes. A terceira produção recebeu uma imagem a menos: os 114.557 B dessa imagem não são atribuídos à otimização.

Na execução lenta, fonte terminou em 319 ms, consentimento em 295 ms e CSS principal em 418 ms; DCL/load ocorreram em 833/839 ms. Dois RAF aguardaram 663 e 952 ms, com 503,5 e 861,3 ms sem tarefas na main thread. Isso aponta para atraso de agendamento/apresentação de frames, mas não prova causa de sistema operacional ou ocultação da janela. O callback atribuído a CoreWidgets custou 89,7 ms observados, sendo 89,2 ms de layout acumulado de 1.023 objetos sujos. Os aproximadamente 397 ms da auditoria incluem escala de CPU ×4, não 397 ms de JavaScript real. Seu CLS zero tampouco prova ausência de mudança: a primeira pintura só veio depois das atualizações assíncronas. Não foi feito um hotfix de cabeçalho baseado nessa atribuição incompleta.

O [novo PageSpeed do Google](https://pagespeed.web.dev/analysis/https-www-kinocampus-com-br/ax1whhos2c?form_factor=mobile), às 19:05 UTC sobre `727d8bdd`, marcou **70/95/96/100**, FCP 1,9 s, LCP 6,3 s, TBT 40 ms, CLS 0,049 e SI 6,5 s. Frente ao relatório enviado, houve melhora pontual de nota/LCP, mas piora de CLS/TBT; não se afirma causalidade ou ganho universal com um par de execuções. O LCP continua sendo o parágrafo do consentimento, com 2.460 ms de atraso observado de render. A estimativa de CSS bloqueante é 500 ms, não a soma dos downloads concorrentes (5.340 ms). Os dados históricos CrUX continuam LCP 1,7 s, INP 118 ms, CLS 0,23: a janela de 28 dias não reflete imediatamente o deploy.

O erro de console do Google continua sendo três tentativas WebSocket `ERR_NAME_NOT_RESOLVED` para a mesma origem Supabase. A observação não foi convertida em alteração de RLS, retry ou remoção de Realtime: as sessões públicas e os logs inspecionados tiveram conexão 101/HTTP 2xx. As capturas textuais foram sanitizadas para não preservar o JWT público completo. O trace DevTools pós-deploy também ficou sem nota/TBT completos e terminou com erro Windows de limpeza; não compõe a tabela de execuções completas.

Duas repetições adicionais usaram como entrada exatamente `https://kinocampus.com.br/`, sem `www`. O Google informou que apresentava resultados para o endereço canônico com `www` após o redirecionamento. Nenhuma mudança de home foi publicada entre elas:

| Google / horário UTC | Nota | FCP | LCP | TBT | CLS | SI |
|---|---:|---:|---:|---:|---:|---:|
| [19:05 — entrada canônica](https://pagespeed.web.dev/analysis/https-www-kinocampus-com-br/ax1whhos2c?form_factor=mobile) | 70 | 1,9 s | 6,3 s | 40 ms | 0,049 | 6,5 s |
| [19:22 — entrada original](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/92srp6kztt?form_factor=mobile) | 71 | 1,9 s | 6,3 s | 30 ms | 0 | 5,9 s |
| [19:24 — entrada original](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/o67ig3b3h5?form_factor=mobile) | 87 | 1,4 s | 3,9 s | 0 ms | 0,061 | 2,7 s |

Mediana descritiva das três novas medições Google: **71 pontos, LCP 6,3 s, TBT 30 ms, CLS 0,049**. Não confundir esses números com a mediana do Lighthouse local nem com o campo CrUX. A grande variação mesmo sem alteração da home confirma que publicar apenas 87 seria enganoso. A diferença de entrada/redirecionamento foi explicitada; não foi removido redirecionamento da plataforma para melhorar a comparação.

### Investigações adicionais, não confundidas com mudanças entregues

O probe do Core isolou a inserção do CSS de ripple seguida de leituras/escritas geométricas. Antecipar o mesmo CSS no experimento reduziu a mediana do listener de 128 para 100 ms sob CPU 4×. Isso pode apenas deslocar custo para o primeiro render; houve também variação de ordem de montagem dos modais, que depende de RAF e disponibilidade entre scripts defer. A alteração não foi aplicada sem comprovação de foco, teclado e impacto global.

O ensaio complementar de custo total congelou o artefato `e6c3e82d` em memória e comparou três pares alternados, CPU 4×, H2/TLS/Brotli local. Único delta: os mesmos 450 B de CSS no fim do head, preservando a ordem final e o instalador original. Medianas observadas: Core 111,1 → 98,2 ms, FCP 552 → 480 ms, LCP 1.072 → 1.000 ms, Style/Layout total 558,4 → 533,9 ms. Um par piorou FCP em 164 ms e Style/Layout em 185,1 ms; excesso de tarefas acima de 50 ms na janela fixa piorou 272 → 282 ms. Esse último indicador não é TBT Lighthouse. CSS/ordem/79 controles/retângulos coincidiram nos três pares; consentimento visível nos seis casos, sem erro CSP/pageerror ou escrita. A redução do listener foi repetível, mas **não houve ganho global consistente suficiente para publicar a hipótese**. Não extrapolar esses 72 ms descritivos para os 500 ms estimados pelo PSI nem afirmar que todos os candidatos LCP locais eram o mesmo parágrafo do Google.

Três imagens públicas já presentes no relatório foram consultadas como originais e prévias de 480 px, `contain`, qualidade 90. Os bytes passaram de 297.417/168.533/147.693 para 14.622/33.888/32.340. Foram seis GETs, nenhum original sobrescrito, sem mudanças de conteúdo, galeria, Storage ou TTL. A primeira transformação demorou mais que o original; estes tempos isolados não são benchmark. A investigação precisa respeitar imagens animadas, arredondamento de proporções e fallback diante de erro antes de virar uma alteração de produto. [Opções e limites oficiais do Supabase](https://supabase.com/docs/guides/storage/serving/image-transformations).

A revisão encontrou dois riscos concretos na proposta de imagens: o handler global de erro poderia esconder a imagem original durante o fallback, e o arredondamento alterava a classificação da proporção dos cards (1000×1126 → 480×540 muda de 4:5 para 1:1). O renderer também atende busca/módulos. **Redimensionamento de imagens não foi aplicado neste lote.**

A investigação de ordem dos modais identificou duas limitações anteriores ao lote: filtro de foco inclui descendentes invisíveis de `details` fechado e fechamento do auth com Escape pode devolver foco ao body. Reproduzidas antes/depois do experimento, não atribuídas aos bundles. Um reparo de ciclo de vida/empilhamento de modais exige escopo e regressão próprios; não foi incorporado ao ajuste de performance. Isso limita qualquer afirmação de acessibilidade universal, embora os fluxos de teclado específicos do cabeçalho tenham passado.

A análise adicional de CSS confirmou que as sete folhas críticas já têm prioridade alta, Brotli e cache Vercel ativo. O parágrafo LCP usa a pilha de texto do body, não a fonte de ícones. Juntar quatro CSS contíguos economizaria apenas 1.395 B com Brotli Q5 no cálculo local; embutir o CSS de tema pouparia um request e apenas 86 B líquidos no mesmo cálculo, com custos de cache e ordem. Nenhuma dessas opções foi publicada sem provar benefício global. Não se ativou uma configuração de compressão/cache que já estava ativa, nem se removeu CSS com base em cobertura de uma única tela.

## Ajuda: rascunho atrasado não pode apagar edição atual

A suíte completa revelou uma falha intermitente anterior ao lote: restauração agendada em 400 ms concorria com salvamento de input com debounce de 200 ms. O rascunho anterior era reaplicado sobre campos recém-editados, recriando inputs condicionais e limpando informações antes do submit.

A PR #923 acrescenta uma guarda de três linhas: não restaurar enquanto houver salvamento pendente ou envio em andamento. TTL, proprietário do rascunho, isolamento entre contas, autenticação, consentimento, transporte e política de rascunho vazio permanecem iguais. Não é um redesenho geral de estado sujo.

O teste executa os callbacks reais na ordem causal, sem sleeps nem refills: três casos falhavam antes e passaram depois; o controle de restauração normal continuou passando. Oito testes Chrome/Edge, 34 de ajuda/privacidade e dez repetições do caso antes intermitente passaram. Revisão independente: 35 Jest e dez casos VM sobre a função real, incluindo TTL/proprietário. A prova efêmera não vai para Storage. APIs são simuladas e todos os métodos externos não GET/HEAD são bloqueados; nenhum pedido real de exclusão de conta foi enviado.

## Serviços e segurança

Auditoria somente leitura de Supabase/Vercel: nenhuma evidência de gargalo de banco justificando DDL/RLS. Na janela inspecionada, feed/ranking/banners/categories responderam200, WebSocket101; sem5xx, conexões bloqueadas ou deadlocks. Dois400 de metadados Storage representavam objeto ausente, sem vínculo demonstrado com thumbnails da home. Não foram inventados reparos ou removidos índices só por relatório de uso.

Vercel preview permaneceu protegido. A proteção não foi removida nem foi criado link público de bypass. Produção confirmada após comparar SHA, bytes dos quatro bundles e fonte com o artefato local, revisão dos 15 itens de precache e namespace do SW. O SW continua desligado por padrão; a validação em perfil local isolado passou em nove cenários, incluindo instalação, hashes, preservação de caches alheios e fallback offline com rede do próprio worker bloqueada.

Na janela pós-deploy 18:55–19:06 UTC, os logs inspecionados tiveram 363 acessos Supabase edge, todos 101/2xx, cinco funções 200 e quatro Storage 200; Vercel sem 5xx nem 404 de assets observados. Um SQL 42703 estava atribuído a `mgmt-api/SELECT`, sem vínculo com o feed; nenhum corpo de consulta foi necessário. Doze 404 Vercel eram de rotas não-assets, majoritariamente varreduras externas, e o aviso DEP0169 era histórico. Runtime logs não cobrem todo o inventário CDN nem provam disponibilidade universal.

## Verificações e artefatos locais

- Validadores de versão, estrutura,33 cadeias HTML,33 rotas, higiene e registros: aprovados.
- Jest completo serial:354 suítes,6.278 aprovados,7 skips preexistentes,3 snapshots; `output/playwright/s24-full-jest.json`. Execução paralela anterior também passou, antes de três novos casos do hint.
- TypeScript contracts e UMD/checkJs: aprovados.
- `npm audit --audit-level=high`: zero vulnerabilidades na repetição; primeira tentativa falhou por ECONNRESET, não por vulnerabilidade detectada.
- Build real local:175 JS e19 CSS;32 HTML,2.639 referências revisadas,15 itens de precache; validação de cache aprovada.
- E2E completo final no código-fonte: **300/300 aprovados**, em 9,4 minutos, após corrigir a causa do rascunho. O primeiro baseline do lote havia passado 295/296, com a falha investigada acima; não foi removido nem afrouxado o teste.
- E2E completo no artefato inicial: 293/296 aprovados, incluindo o formulário de ajuda. As três falhas envolvem `/404.html`: o servidor de arquivos local não executa a função Vercel que entrega esse template com HTTP 404. O build deliberadamente não publica um arquivo estático nesse caminho. Três testes de integração da rota/build passaram; o domínio canônico confirmou HTTP 404, conteúdo correto, `noindex` e revisão atual. Regressão final do artefato: 31 casos cabeçalho/ranking e nove de fonte aprovados.
- CI final PR #923: **354 suítes, 6.279 Jest aprovados, sete skips preexistentes, três snapshots, 300 E2E e 15 cross-browser**. Banco reset/lint/pgTAP, Edge typecheck, DNS/Auth e Lighthouse de quatro páginas verdes.
- Bundles/build/cache:160 Jest e10 Chrome/Edge. Preconnect66 Jest. Revisão independente de fonte/SW/hint79 testes.
- Scans direcionados das linhas staged e `git diff --check`: sem achados. Não se afirma auditoria formal universal de segurança.
- Evidências ignoradas pelo Git: `s24-header-report.md`, `s24-header-native-visual/`, `s24-header-comparison*/`, `font-autohint-linux-result.json`, `s24-trace-diagnostics.{md,json,cjs}`, `s24-baseline-public/`, relatórios Lighthouse e `s24-built-immediate.png` em `output/playwright/`.

## Integração e acompanhamento

PR #922 integrada às 18:54 UTC, merge `727d8bdd1a48d1560395f7b5041c8549d1b4f52c`, deploy `dpl_8R6AxsjwxwSNdWHF9s4gHHGkhijF` READY. PR #923 integrada depois de todos os checks verdes, merge `e6c3e82d227aa1fa8bfde60df71868b2d1adb649`, deploy `dpl_3Xx65rXE8kKR31fpbHYehetYJrbh` READY. O domínio foi revalidado nesse segundo SHA às 19:15 UTC; fonte/bundles byte-idênticos ao build e `/404.html` correto. Um CDN MISS imediatamente após deploy não foi classificado como falha: headers de cache imutável permanecem corretos.

A QA pública de cinco rotas após #922 retornou cinco HTTP 200, zero erros de página/console e cinco análises visuais válidas. Em Moradia, o último filtro parcialmente cortado pertence à faixa horizontal rolável já existente; o placeholder longo foi registrado sem alegar regressão nova. A repetição oficial após #923 também retornou cinco HTTP 200 e zero erros, com cinco análises individuais VisionAssist válidas. Capturas de 19:16 UTC, antes da correção de hover: logo-texto, ícones, imagens, alinhamento e consentimento legíveis, sem defeito concreto nas áreas visíveis. Screenshots desktop e áreas cobertas pelo consentimento não substituem QA mobile/interativa. Os oito testes isolados do rascunho passaram também sobre os recursos reais de produção, com o JS servido byte-idêntico ao build (61.533 B; SHA256 `95e768067f35f7cd8cb2221816d0d77e2a3ece55c8e2faf1e5949d70072335d8`).

O [inventário de branches e worktrees](2026-08-31-s24-branch-audit.md) registra os quatro heads remotos, as PRs de dependências preservadas e a análise dos 18 patches antigos sem patch ID equivalente. Nenhum patch antigo foi reaplicado automaticamente, nenhum gate de frescor foi ampliado e nenhum checkout de outra tarefa foi apagado.

Às 19:30 UTC, o responsável pela integração reconfirmou os HEADs exatos, ancestralidade e ausência de checkout das duas refs locais `codex/s24-header-performance-20260831` e `codex/help-draft-pending-edit-20260831`, e as removeu com `git branch -d`, sem força. Seus commits permanecem na main e seus SHA estão documentados; os diretórios, arquivos ignorados, evidências e trabalhos de outras tarefas foram preservados. As refs remotas já estavam ausentes após os merges.
