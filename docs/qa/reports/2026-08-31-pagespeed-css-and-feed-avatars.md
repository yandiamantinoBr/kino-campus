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

Resultados completos, integração e medições finais serão registrados após os
respectivos checks. Evidências locais permanecem em `output/playwright` nos
três worktrees de performance. Não se versionam screenshots privados, dados
de sessão ou credenciais. Nenhuma conversa foi enviada, publicação criada ou
perfil alterado durante a verificação autenticada de leitura.
