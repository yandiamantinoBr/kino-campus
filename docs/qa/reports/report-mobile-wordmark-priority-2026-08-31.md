# Nome da marca no mobile — correção de prioridade

## Reprovação real e causa

As duas capturas enviadas pelo usuário mostram Mensagens no tema escuro com
símbolo, busca, chat ativo, tema e Login/Cadastro, mas sem nome da marca.
A reprodução em Google Chrome e Microsoft Edge instalados confirmou a falha
na base `3ec4d805`: nome ausente em 360, 375, 390, 400, 412, 414 e 430 px.
Em 412 px, sobravam 121,91 px para a marca e ela exigia cerca de 147 px.

O PR #903 media corretamente o déficit, mas respondia escondendo o nome.
Seus testes aceitavam essa ausência nas larguras relevantes: comparar
`logoVisible === logoFits` reproduzia a decisão da implementação, não o
requisito do usuário. O teste anterior não era prova suficiente da entrega.

O subtítulo já estava oculto nessa faixa. Escondê-lo novamente, forçar
visibility ou reduzir minimamente a fonte não corrigiria a prioridade de
espaço. O problema não era particular de um navegador nem do tema escuro.

## Decisão e escopo

- Nome legível e símbolo preservados; subtítulo dispensável no mobile.
- Uma linha quando o conjunto cabe. Caso contrário, marca e busca ficam na
  primeira linha, e os controles continuam completos na segunda.
- A navegação intermediária de 577–767 px mantém seus acessos; se também
  houver déficit com fontes ampliadas, recebe sua própria linha.
- Nenhuma alteração em autenticação, texto dos botões, rotas, chat, dados,
  permissões, ranking, dependências ou tokens globais.
- Desktop e cabeçalho administrativo preservados.

O orçamento hipotético de uma linha desconta busca, soma das ações visíveis,
margens, gaps e ao menos um alvo de navegação. Não usa a sobra da linha já
reorganizada: isso evitaria o erro de alternar continuamente entre layouts.
O gap horizontal permanece independente do estado; só o gap vertical muda.
O nome é medido separadamente do subtítulo. A altura `--kc-header-height`
acompanha o reflow para não encobrir ou reduzir incorretamente Mensagens.

## Contrato de verificação

- Nome visível e texto integral em Home e Mensagens: 320, 360, 375, 390, 400,
  412, 414, 430, 440, 480, 576, 577, 767 e 768 px, com retorno a 390 px.
- Visitante e markup autenticado com sino, avatar, nome, verificado e
  chevron Font Awesome reais. Não implica login autenticado real.
- Temas claro/escuro reais e fonte raiz a 100%, 125% e 150%; essa variação
  testa ampliação de texto, não afirma representar todos os tipos de zoom.
- Geometria do texto via Range, tamanho legível, ausência de colisão,
  controles dentro do cabeçalho e hit testing, altura compartilhada correta
  e conteúdo principal abaixo do cabeçalho.
- Estabilização após transições finitas de tema/fonte; não se espera que um
  skeleton infinito termine. O teste não relaxa o requisito de altura.
- Execução adicional nos canais instalados `chrome` e `msedge`, além da
  cobertura Playwright regular. Mobile emulado, não aparelhos físicos.
- Vision Assist analisa as capturas e compara o resultado com as imagens
  do usuário; a fonte de produção só é aprovada após merge, READY e SHA
  dos assets públicos conferido.

O fechamento com resultados, PR, SHA e evidências locais será registrado em
`output/wordmark-priority-closeout-20260831.md` do worktree da tarefa e no
relatório local de QA Kino Campus, sem antecipar resultados pendentes.
