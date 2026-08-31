# Estados de Mensagens e marca adaptativa — 31/08/2026

## Escopo e decisão

Base: `origin/main` `8da90c49`, incluindo os PRs #902 e #901. O trabalho de
capas do PR #901 foi preservado; não houve alteração em dados ou permissões.

O círculo cinza vinha do background/border mobile de `kc-chat-shortcut.css`.
O atalho agora é transparente em repouso, sem borda persistente. Pressionar o
atalho ou estar em `/mensagens.html` aplica cor laranja e fundo laranja suave.
O estado da rota usa `aria-current="page"`, inclusive com query/hash, não
`aria-expanded` (o atalho navega; não abre um dropdown). Hover fica restrito a
dispositivos que o suportam, e o foco de teclado permanece explícito.

O nome da marca era oculto por limites fixos de 480 e 400 px. Esses limites
foram substituídos por medição da coluna grid livre: largura intrínseca do
símbolo + nome inteiro + gap + 1 px de reserva. Texto oculto continua mensurável,
mas invisível e fora do fluxo. O link da marca conserva seu nome acessível.

ResizeObserver considera mudanças de tamanho do nome, símbolo e espaço livre,
mesmo sem resize de viewport. Resize, orientação, perfil, autenticação e fontes
prontas revalidam em um único requestAnimationFrame; a classe só muda quando
necessário. Inicialização idempotente, fallback sem ResizeObserver e exclusão
do cabeçalho admin foram testados. Desktop não recebe a ocultação mobile.

A lógica pertence ao módulo existente `kc-core-widgets.js`, carregado antes
de `kc-core.js` nos consumidores. Nenhum asset ou carregamento remoto novo foi
introduzido, e o limite de tamanho do core foi preservado.

## Cobertura e limites

- Validação final local: 338 suítes Jest, 5.742 aprovados, sete pulados e
  três snapshots; 222 E2E e 15 cross-browser aprovados. Validadores e ambos
  os contratos TypeScript passaram; npm audit sem vulnerabilidades.
- O gate de tamanho do core inicialmente identificou a nova função no arquivo
  residual; ela foi movida para widgets e a suíte completa repetida. O core
  terminou com 848 linhas, sem relaxar o limite de 850.
- Testes de geometria cobrem 320, 360, 390, 412, 440, 480, 481, 576, 577,
  767, 768, 769 e 1280 px; ida e volta; temas claro/escuro; visitante e markup
  autenticado, incluindo sino e identidade verificada no QA independente.
- O teste de colisão considera o nome completo, não somente o símbolo.
- A matriz independente verifica 106 estados Chromium/WebKit, com 8 capturas,
  transparência inativa, estado laranja ativo, foco de teclado, click-through,
  largura do documento e resposta dinâmica à troca de markup de autenticação.
- Os novos testes de medição usam dimensões JSDOM simuladas. Geometria real,
  estilos computados e navegação são verificados separadamente no navegador.
- O QA de tema usa `kcSetTheme` e confirma `data-theme`; a antiga alternância
  isolada de classe não representava uma troca real. Capturas rotuladas como
  escuras que ainda estavam claras foram descartadas e a matriz foi repetida.
- Não foram usadas credenciais nem acessadas conversas privadas. Autenticação
  real não é afirmada a partir dos testes de markup/mocks.
- O deploy injeta revisão de commit nos assets existentes. Produção só é
  considerada validada após CI, merge, Vercel READY e conferência do SHA público.

Resultados finais e evidências de produção são registrados ao encerrar o deploy
em `output/header-fit-closeout-20260831.md` do worktree desta tarefa e no relatório
local Kino Campus; esta seção não antecipa resultado de um deploy pendente.
