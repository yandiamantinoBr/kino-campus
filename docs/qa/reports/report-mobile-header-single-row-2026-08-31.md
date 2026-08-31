# Cabeçalho mobile em uma linha — revisão do PR #907

O usuário rejeitou a altura e o espaço desperdiçado pelo cabeçalho em duas
linhas. A visibilidade do nome, isoladamente, não constituía uma aprovação
estética. A solução anterior e seus testes permanecem documentados como
histórico, não como critério de aceitação atual.

## Contrato atual

- Uma linha para marca, busca e ações. Sem retorno da classe de wrap.
- Nome KinoCampus inteiro, sem esconder texto nem encostar em controles.
- Margens horizontais de 8–12 px; marca 26–38 px; colunas utilitárias 26–36 px,
  sempre com 36 px de altura. Gaps crescem progressivamente com a largura.
- Nome com clamp entre .875rem e 1.05rem, preservando ampliação de texto.
- Conta mantém avatar, verificado e seta, com padding e gaps menores.
- Rótulo completo Login/Cadastro quando cabe; Entrar somente no déficit.
  O span completo permanece mensurável; somente o rótulo visível participa
  do nome acessível (Entrar compacto, Login/Cadastro normal), inclusive ao
  alternar mobile/desktop. Isso permite ativação por voz pelo texto visível.
  Nenhum botão, href, listener ou comportamento de autenticação é substituído.
- Desktop, admin, tokens globais, estilo ativo/inativo do chat e dados fora
  do escopo permanecem preservados.

## Medição e proteção contra regressão

O orçamento de uma linha sempre usa a largura do rótulo completo, mesmo
quando o curto está visível; soma padding, bordas, margens e gaps. Isso
evita a oscilação entre Entrar e Login/Cadastro. O subtítulo é dispensável
no mobile. A altura compartilhada continua sincronizada com o cabeçalho.
O rótulo completo recortado é ancorado à direita do próprio botão: continua
mensurável, mas não amplia o scrollWidth do body. Esse problema apareceu
na verificação WebKit com fontes externas bloqueadas e também foi medido
em Chromium com fonte ampliada; o contrato verifica root e scrollWidth do
próprio cabeçalho. O body também é registrado, mas seu overflow preexistente
no ranking da Home em 320 px não é atribuído a esta correção. O smoke global
cross-browser que verifica max(root,body) permanece intacto.

Asserções de navegador exigem centros verticais no mesmo eixo, altura
compacta, texto inteiro via Range, alvos atingíveis, largura do documento
contida e ausência de colisões. A faixa intermediária com navegação e texto
ampliado pode chegar a 72 px, ainda em uma linha; os telefones até 576 px
têm teto de 64 px. As capturas usuais de 320/390/412 mediram 56–58 px.

A matriz usa Home e Mensagens, 14 larguras de 320–768 px mais retorno a390,
visitante/markup autenticado, claro/escuro e fontes 100/125/150%. Há teste
dedicado ao nome acessível correspondente ao rótulo e abertura do formulário pelo
rótulo curto, além das regressões existentes de desktop e navegação.

## Limites de evidência

Chrome e Edge instalados com mobile emulado não equivalem a aparelhos
físicos. O estado autenticado é markup/cached shell de teste, não uma conta
real ou conversas privadas. Um evento do primeiro harness de capturas
sobrescrevia a fixture autenticada; o harness foi corrigido e agora valida
is-auth e visibilidade do sino antes de capturar. As capturas anteriores
não são usadas como prova do estado autenticado.

Resultados finais de suítes, CI, merge, SHA público e capturas de produção
serão registrados em `output/single-row-closeout-20260831.md` no worktree da
tarefa e no relatório local de QA Kino Campus, após a confirmação efetiva.
