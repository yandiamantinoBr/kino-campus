# Mensagens visíveis no mobile — 2026-08-31

## Causa e decisão

O PR #892 (`1480a467de4cbab870786042aba8914471c1f2da`, 27/08) removeu o
FAB para não encobrir cards, formulários e ações fixas, mas manteve também o
ícone de cabeçalho oculto em até 768 px. Mensagens ficou somente dentro do menu.
Não era falha de autenticação ou de carregamento de Font Awesome.

A correção mantém a decisão de não cobrir conteúdo e expõe o ícone no
cabeçalho. Marca compacta até 480 px e login compacto até 360 px reservam
espaço sem retirar busca, tema ou autenticação. O alvo mobile mede 36 × 36 px,
possui nome acessível e foco visível. Desktop, admin e tokens globais da marca
não mudam. Menu e badges são preservados.

O listener `kc:chat:unread-changed` ficava depois de um retorno antecipado de
`getCurrentUser`. Agora é registrado antes dos retornos, uma vez por runtime,
acompanhando logout e novas sessões sem duplicação.

## Evidência local

- Base: `origin/main` `35381695eaddd3bdb087c4055967c860f03bc582`.
- A branch inicial `codex/chat` estava 29 commits atrás e continha uma alteração
  de consentimento já integrada por equivalência no PR #890. O hotfix foi feito
  em worktree isolado; depois da análise, o checkout principal voltou à `main`,
  preservando seus 29 arquivos não rastreados e o histórico antigo no backup.
- Sete validadores de repositório aprovados; TypeScript contracts/UMD aprovados.
- Jest: 337 suítes, 5.724 testes aprovados, sete pulados, três snapshots.
- E2E Chromium: 222/222; cross-browser: 15/15 (Chromium, Firefox, WebKit,
  Pixel 7 e iPhone 15).
- Regressão do contador: cinco novos casos falharam antes e passaram depois;
  suíte do dropdown 10/10. Contratos chat/marca + dropdown: 31/31.
- Matriz de cabeçalho: 320, 360, 390, 412, 480, 576, 768, 769 e 1280 px;
  temas claro/escuro; markup de visitante e de identidade autenticada.
- Navegação pública, feeds, busca, ajuda, criação e Mensagens cobertos. Revisão
  independente corrigiu a rota de criação do teste para `/create-post.html`,
  com status e título específicos para impedir falso positivo de fallback.
- Chromium/WebKit: seis capturas em 320/390/768 px, ícone clicável via
  `elementFromPoint`, largura do documento igual à viewport, navegação real até
  `mensagens.html` e zero exceções de página.
- Vision Assist (GPT-5.6-Luna, max): nas seis capturas, envelope legível, sem
  cortes, sobreposição ou colisões com os controles do cabeçalho.
- `npm audit`: zero vulnerabilidades após retry de `ECONNRESET` transitório.
- Artefato `dist` validado com revisão única: 32 HTMLs, 2.671 referências a
  assets e 14 entradas do precache. O deploy injeta seu SHA, sem bump manual.

## Limites

A identidade autenticada foi exercitada com markup e mocks locais, sem
credenciais reais nem envio/leitura de conversas privadas. Não foram alterados
banco, permissões, APIs de chat ou conteúdo publicado. A validação de produção
é registrada separadamente após CI, merge e confirmação do deploy.
