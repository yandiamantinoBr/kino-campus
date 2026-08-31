# Performance — CSS conservador e avatares de autoria (2026-08-31)

## Escopo e evidência

Terceiro lote sobre `bc4e7a2d`, mantendo o cabeçalho mobile aprovado e todas as
regras de apresentação, autenticação, privacidade, conteúdo e banco. Nenhuma
migração, índice, política RLS, TTL de imagem ou plano de serviço foi alterado.
Os relatórios dos dois lotes anteriores registram baseline e variações de PSI.

### CSS apenas no artefato

O build compacta somente comentários explicativos entre regras completas de
primeiro nível, mantendo comentário vazio como delimitador. Não é uma limpeza
de CSS não usado, reordenação, fusão de regras ou alteração de seletor/valor.
Fontes originais, vendor e HTML permanecem intactos.

O tokenizer já transitivo foi fixado em `@csstools/css-tokenizer@3.0.4` como
dependência de build disponível na instalação production do Vercel. A revisão
independente identificou que comentários dentro de custom properties, `var()`
e `@property initial-value` são observáveis via CSSOM: todos esses contextos,
blocos, funções e prelúdios são preservados integralmente. Cada token restante
mantém bytes, whitespace e metadados; offsets de localização podem mudar.

Licenças, mapas de origem e hacks são preservados. Arquivos com sourcemap não
mudam; erros lexicais/UTF-8 impedem o build; delimitadores incompletos conservam
o arquivo original. Todos os arquivos são preparados antes de gravar qualquer
CSS. Há limites de caminho, symlink e hardlink para proteger os fontes.

| Conjunto | gzip anterior | gzip novo | Redução |
| --- | ---: | ---: | ---: |
| 18 CSS próprios (11 modificados) | 101.075 B | 90.515 B | 10.560 B |
| 5 CSS próprios da home | 61.879 B | 53.740 B | 8.139 B (13,2%) |
| styles.css | 54.297 B | 46.819 B | 7.478 B |

Home Brotli: 49.526 → 42.917 B (−13,3%). São bytes medidos dos arquivos, não
promessa de redução proporcional na latência. CSSOM, valores computados e
geometria foram comparados em navegador real, em claro/escuro; JSDOM sozinho
não serve para validar preservação dos comentários em valores.

### Avatar do feed compartilha a miniatura do ranking

O boot real ainda buscava o JPEG original de 862.958 B em `kc-card__author`,
renderizado a 20 × 20 CSS px. O ranking buscava separadamente 6.118 B em 144 px.
Agora somente avatares de autoria elegíveis usam exatamente a mesma URL do
ranking; não se introduz uma segunda variante de tamanho. O navegador pode
compartilhar a resposta. O arquivo/API de perfil original não é alterado.

Allowlist: HTTPS, origem Supabase configurada exata, bucket público kino-media,
subpasta profile-avatars e JPG/JPEG/PNG/WebP. Query, assinatura, fragmento,
credenciais, origem externa e formatos não elegíveis mantêm o comportamento
anterior. Um listener CSP-safe, instalado antes do primeiro card, captura erro
somente de imagens marcadas no slot de autoria e restaura a original uma vez.
Não há MutationObserver/varredura de imagens, inline onerror ou loop de retry;
erros tardios não substituem uma origem que já mudou.

Revisão independente confirmou DOM equivalente em sete módulos, exceto os
atributos intencionais da imagem; título, preço, links, badges e ações intactos.
Os testes incluem cards adicionados depois, erro cacheado, fallback 503, falha
da original e fonte alterada enquanto havia requisição pendente.

## Verificação e publicação

- 345 suítes / 5.936 testes Jest passaram (7 ignorados preexistentes); após
  incorporar a main, 221 testes relevantes adicionais passaram.
- 245 E2E completos do fonte passaram, mais quatro novos testes do boot real
  feed/ranking coletados depois; o artefato completo final passou 249/249.
- Chrome e Edge nativos: 42/42 testes do artefato passaram, cobrindo 720 estados
  de cabeçalho, consentimento antecipado, imagens/fallback e CSSOM claro/escuro.
- Chromium/Firefox/WebKit desktop/mobile: 15/15 testes de rotas, runtime e abas.
- Typechecks, estrutura, versões, cadeia de 33 HTMLs, rotas, higiene, registry,
  build/revisão de cache e auditoria npm completa passaram, zero vulnerabilidades
  reportadas. Scan delimitado de padrões de segredo sem achados.
- A revisão independente repetiu 212 Jest e os quatro E2Es do feed; comparou DOM
  em sete módulos. CSS: 83 testes e 12 cenários CSSOM de navegador independentes.

O primeiro full artifact teve uma falha de coordenadas no teste de loading a
768 px, embora o isolado passasse. Uma reprodução independente de 30 casos
produziu duas falhas em outras larguras. A investigação confirmou a causa: a
animação de entrada de 220 ms do **ancestral feed** troca `offsetParent` de
feed para body ao terminar; largura, altura e posição relativa não mudaram.
Não era deslocamento da plataforma. O teste agora aguarda animações finitas
dos ancestrais e compara geometria de documento e relativa ao feed, preservando
as verificações de reserva, empty/error/retry e paginação. Não muda CSS, não
insere sleep fixo e não remove a asserção de estabilidade.

A correção do harness passou 30/30 repetições com dois workers e 12/12 casos
independentes em Chrome/Edge reais. Seis controles negativos confirmaram que
margem do card, padding do feed e deslocamento do próprio feed ainda fazem a
asserção falhar precisamente na comparação geométrica. Nenhum teste foi
silenciado para conseguir um resultado verde.

Boot controlado: zero downloads da original e uma miniatura compartilhada.
Thumbnail 503/original 200: uma original compartilhada. Se ambos retornam 503,
o navegador pode realizar até dois GETs da original, um por consumidor; eventos
de erro repetidos não causam novos requests. Não se introduziu cache negativo
global para forçar compartilhamento de respostas que falharam.

Verificação autenticada real no Chrome conectado: home, menu de conta e shell
de Mensagens carregaram. Em 320 e 390 px, nome KinoCampus completo, uma linha,
sem sobreposição ou overflow do cabeçalho; chat inativo sem fundo persistente.
Foi inspeção DOM, não captura visual da conta: a tentativa de screenshot via
extensão expirou. O viewport foi restaurado e só as abas criadas para QA foram
fechadas. Nenhuma conversa foi enviada/aberta, publicação criada ou perfil
alterado. Não se versionam dados privados, screenshots de sessão ou credenciais.

## Integração e produção

PR [#918](https://github.com/yandiamantinoBr/kino-campus/pull/918) integrada em
31/08 às 16:25 UTC, merge `63a74c979177993c003a93e0aad73287ff904af8`, todos os
checks verdes. CI final: 345 suítes / 5.940 Jest, 7 ignorados preexistentes,
249 E2E, cross-browser, typechecks de Edge Functions, Supabase reset/lint/pgTAP,
Lighthouse de quatro páginas e DNS/Auth aprovados. O job de banco precisou de
uma repetição por HTTP 502 ao iniciar o container local Edge Runtime; não houve
mudança de migração, workflow, limite ou asserção para fazê-lo passar.

Vercel `dpl_8psrSbUVJ1a2KbkrWFfj1HEoCdwP` confirmado READY/production/main,
com SHA correspondente também no HTML do domínio canônico. Os onze artefatos
públicos comparados são byte a byte iguais ao esperado desse Git SHA: cinco
CSS próprios, JavaScript de apresentação, CSS Font Awesome e quatro WOFF2.

QA após deploy: cinco módulos HTTP 200, zero erros JS/console; Chrome e Edge
nativos em 390 px, claro/escuro, oito navegações e quatro aberturas de login
passaram. Logo íntegro, cabeçalho em uma linha, sem colisões; chat inativo
transparente e ativo laranja. A varredura anterior de 25 rotas canônicas também
mostrou conteúdo visível em todas, com 404 esperado, gates de login e estados
sem parâmetros corretos; não se enviou formulário, mensagem ou publicação.

### Todas as amostras finais de PageSpeed, sem selecionar só o pico

Lighthouse 13.4.1, Moto G Power, 4G lento:

| Amostra GMT-3 | Performance | FCP | LCP | TBT | CLS | SI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Original 11:23](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/jz2zw256p6?hl=en_GB&form_factor=mobile) | 49 | 2,1 s | 5,9 s | 470 ms | 0,22 | 5,9 s |
| [Terceiro lote 13:26](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/wfblmsswsr?hl=en_GB&form_factor=mobile) | 80 | 1,4 s | 4,6 s | 30 ms | 0,071 | 4,1 s |
| [Repetição 13:27](https://pagespeed.web.dev/analysis/https-kinocampus-com-br/oaz0z1wgay?hl=en_GB&form_factor=mobile) | 67 | 1,7 s | 7,0 s | 20 ms | 0,156 | 4,5 s |

As duas notas finais ficaram acima da original e o TBT caiu fortemente, mas
**não há ganho uniforme de LCP nem nota fixa**. A segunda amostra identifica
0,137 de CLS no wrapper do feed e 0,010 no card; esses resíduos são distintos
do salto do guia tratado no primeiro lote. O relatório anterior também guarda
as amostras intermediárias 89, 66 e 67. Acessibilidade/boas práticas/SEO se
mantiveram 95/96/100 nos relatórios remotos. CrUX permanece histórico de 28 dias,
portanto não se declara aprovação imediata de Core Web Vitals de campo.

Não se removeram CSS/JS ditos não usados, ícones, galerias, consentimento ou
funcionalidades para aumentar a nota. Reduções adicionais de boot e reservas
de conteúdo assíncrono exigem outra investigação com os mesmos contratos.

### Repetição local controlada e rede da página completa

Lighthouse 12.6.1, mesmo controle de antivírus da baseline, após encerrar os
outros navegadores de teste locais. Não comparar suas notas diretamente com
Lighthouse 13 do PageSpeed remoto:

| Execução | Performance | FCP | LCP | TBT | CLS | SI | Transferência total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 71 | 3,71 s | 4,53 s | 14,5 ms | 0,0824 | 5,43 s | 2.374.792 B |
| 2 | 80 | 2,63 s | 4,13 s | 39,5 ms | 0,0672 | 3,89 s | 2.374.781 B |

Antes do complemento do feed, a amostra local do segundo lote tinha 3.245.746 B.
Agora são aproximadamente **871 KB a menos (26,8%) nessa página/amostra**.
As duas novas capturas de rede contêm uma única resposta da thumbnail real
de 6.118 B e **nenhuma requisição da original** de 862.958 B. Essa evidência é
da home anônima; não implica que fotos de perfil, galeria ou todas as outras
imagens tenham sido reduzidas, nem que todo visitante economize o mesmo total.

Observação operacional: Vercel não retornou 5xx no agrupamento público desde
o deploy até a checagem; Supabase continuou ACTIVE_HEALTHY, com zero deadlocks
e conflitos, e cache hit arredondado a 100,000% na amostra. Isso não é prova
de ausência universal de erros nem de latência igual para todas as contas.

Evidências locais permanecem em `output/playwright` nos worktrees de
performance; alguns reporters resolvem esse caminho relativo à própria config.
