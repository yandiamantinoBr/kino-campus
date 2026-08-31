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

Integração e medições finais serão registradas após os respectivos checks.
Evidências locais permanecem em `output/playwright` nos três worktrees de
performance; alguns reporters resolvem esse caminho relativo à própria config.
