# Kino Campus — pitch institucional interativo

Apresentação web responsiva para reuniões com a UFG. Um único roteiro editorial gera seis percursos:

| Duração | Expositivo | Interativo |
| --- | ---: | ---: |
| 5 minutos | 10 telas | 11 telas |
| 15 minutos | 17 telas | 20 telas |
| 30 minutos | 22 telas | 25 telas |

## Durante a apresentação

- Escolha duração e modalidade na tela inicial.
- Use `←`, `→`, `Page Up`, `Page Down`, barra de espaço, `Home` ou `End`.
- Use **Notas** para abrir o roteiro do apresentador.
- Use o menu no canto superior direito para saltar para qualquer tela.
- Use o botão de tela cheia para projetar sem distrações.
- Use **Projeção** para reforçar tipografia e contraste em telões e painéis 4K.
- Use **Versão para leitura** para abrir o material público, compartilhar o link ou salvar em PDF.

## Participação e controle pelo celular

No modo interativo, uma sessão é criada automaticamente. O botão com o código abre primeiro apenas o QR público:

- **Público:** abre votações, nuvens de palavras e acompanhamento dos slides, sem cadastro ou login.
- **Material:** abre uma versão responsiva e somente para leitura, sem notas nem ferramentas de comando.
- **Apresentador:** fica recolhido atrás de **Mostrar controle privado** e permite avançar ou voltar os slides.

O QR de controle só entra na interface depois da abertura explícita do painel privado. Ele contém um token e não deve ser compartilhado com a plateia. As respostas ficam associadas a um identificador aleatório salvo apenas no dispositivo do participante. A API modera termos básicos e limita o tamanho das respostas.

## Marca e links

A apresentação usa diretamente a marca vetorial oficial da cabana (`public/kino-campus-logo.svg`), recuperada do repositório do Kino Campus. Cards, demonstrações e módulos que sugerem ação apontam para publicações ou páginas reais do site; **Salvar** mantém estado local durante a apresentação.

A marca no cabeçalho reproduz o comportamento do site principal: 44 px no desktop, 38 px nas áreas compactas, inclinação inicial de −3° e retorno suave a 0° ao passar o mouse. Toda ocorrência da assinatura visual abre a página inicial oficial do KinoCampus.

## Conteúdo e posicionamento

O pitch apresenta o Kino Campus como uma camada independente de descoberta — não como substituto dos canais oficiais da UFG. Eventos e Oportunidades são o núcleo da proposta de parceria; os demais módulos mostram permanência, mobilidade, economia circular e pertencimento.

As notas do apresentador conectam a narrativa ao TCC, incluindo Cartões de Insight, Matriz Valor × Esforço, Figuras 3–16 e Apêndices B–K. A proposta de fechamento é um piloto de 90 dias com 3–5 unidades, pontos focais, critérios editoriais e avaliação antes de qualquer expansão.

## Desenvolvimento

```bash
npm run lint
npm run dev
npm run db:generate
```

A interface usa Vinext/React. Sessões e respostas ao vivo usam Cloudflare D1 com Drizzle e inicialização idempotente do schema.

## Integração com o site principal

O código desta aplicação também é versionado no repositório oficial `yandiamantinoBr/kino-campus`, em `apps/pitch-institucional/`. A página pública `apresentacao-institucional.html` funciona como endereço canônico no domínio do KinoCampus e incorpora a versão ao vivo. Ao alterar a experiência, mantenha o diretório do repositório oficial e a versão hospedada sincronizados.
