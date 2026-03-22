(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.KCODSContent = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TCC_SOURCE = 'G:/My Drive/Yan/Educacao/Cursos/Administracao/Bacharelado de Administracao - UFG/TCC - Kino Campus/Relato Tecnico - Kino Campus/TCC - Relato Tecnico - Kino Campus - Yan Diamantino - V.1.6.7.pdf';

  const GOALS = Object.freeze({
    '4': Object.freeze({
      goal: '4',
      title: 'Educação de Qualidade',
      subtitle: 'Aprendizagem contínua, acesso mais simples e circulação de conhecimento dentro da comunidade UFG.',
      icon: 'fas fa-graduation-cap',
      color: '#0f8b8d',
      accent: '#13c4c7',
      hero: 'O Kino Campus conecta livros, monitorias, oportunidades e eventos em um mesmo fluxo, reduzindo a dependência de grupos dispersos e ajudando o conhecimento a circular com mais contexto.',
      context: [
        'No relato técnico do Kino Campus, a plataforma nasce para reduzir ruído, perda de histórico e fragmentação informacional dos grupos informais usados pela comunidade.',
        'Na prática, isso fortalece o ODS 4 porque transforma ofertas acadêmicas e trocas entre estudantes em informação encontrável, filtrável e reaproveitável.',
        'Quando uma aluna encontra livro, monitoria, vaga ou evento pelo mesmo ambiente, a jornada de permanência e apoio acadêmico fica menos dispersa.'
      ],
      stats: [
        {
          value: '1 em 6',
          label: 'Países no rumo do ODS 4 até 2030',
          detail: 'Sem medidas adicionais, apenas um em cada seis países deve alcançar o objetivo, segundo a ONU em 2025.',
          sourceLabel: 'ONU - Goal 4 (2025)',
          sourceUrl: 'https://sdgs.un.org/goals/goal4'
        },
        {
          value: 'Rede viva',
          label: 'Conhecimento que fica acessível',
          detail: 'No Kino Campus, livros, aulas, monitorias e eventos deixam de depender só de memória de grupo e passam a ter contexto, busca e histórico.',
          sourceLabel: 'Relato Técnico Kino Campus',
          sourceUrl: TCC_SOURCE
        }
      ],
      modules: [
        {
          key: 'compra-venda',
          label: 'Livros e materiais',
          href: 'compra-venda-feed.html?filter=livros',
          icon: 'fas fa-book',
          body: 'A circulação de livros, apostilas e materiais reduz barreiras de entrada e aproveita melhor recursos já existentes na comunidade.'
        },
        {
          key: 'oportunidades',
          label: 'Monitorias e vagas',
          href: 'oportunidades.html#monitoria',
          icon: 'fas fa-chalkboard-teacher',
          body: 'Monitorias, aulas e vagas acadêmicas ficam mais visíveis e alcançam estudantes além dos círculos imediatos.'
        },
        {
          key: 'eventos',
          label: 'Eventos acadêmicos',
          href: 'eventos.html#academicos',
          icon: 'fas fa-calendar-alt',
          body: 'Palestras, oficinas e encontros ampliam a oferta de aprendizagem ao longo da vida e fortalecem a extensão universitária.'
        }
      ],
      highlights: [
        'A ONU define o ODS 4 como garantir educação inclusiva, equitativa e de qualidade e promover oportunidades de aprendizagem ao longo da vida para todos.',
        'No contexto UFG, o Kino Campus funciona como infraestrutura digital comunitária para dar persistência e buscabilidade às oportunidades de aprendizagem.'
      ],
      sources: [
        { label: 'ONU - Goal 4', url: 'https://sdgs.un.org/goals/goal4' },
        { label: 'ODS Brasil - Objetivo 4', url: 'https://odsbrasil.gov.br/objetivo/objetivo?n=4' },
        { label: 'Relato Técnico Kino Campus', url: TCC_SOURCE }
      ]
    }),
    '11': Object.freeze({
      goal: '11',
      title: 'Cidades e Comunidades Sustentáveis',
      subtitle: 'Mobilidade, moradia e participação mais organizadas para a vida universitária em Goiânia.',
      icon: 'fas fa-city',
      color: '#f4a261',
      accent: '#f77f00',
      hero: 'O Kino Campus aproxima pessoas, rotas, moradias e redes de apoio, ajudando a comunidade universitária a se orientar melhor no território e a usar melhor o que já existe.',
      context: [
        'O relato técnico posiciona a plataforma como resposta ao excesso de dispersão entre grupos, o que prejudica a localização de oportunidades confiáveis de moradia, caronas e apoio cotidiano.',
        'Isso conversa diretamente com o ODS 11 porque permanência estudantil também depende de deslocamento, pertencimento, acesso a moradia e canais de participação que funcionem de forma regular.',
        'Ao centralizar módulos de moradia, caronas e eventos, o Kino Campus transforma necessidades urbanas do cotidiano universitário em fluxos mais organizados e rastreáveis.'
      ],
      stats: [
        {
          value: '70%',
          label: 'População mundial em cidades até 2050',
          detail: 'A ONU projeta quase 70% da população vivendo em cidades em 2050, aumentando a pressão por infraestrutura e serviços.',
          sourceLabel: 'ONU - Goal 11 (2025)',
          sourceUrl: 'https://sdgs.un.org/goals/goal11'
        },
        {
          value: '14,0%',
          label: 'Municípios com instância participativa regular',
          detail: 'O portal ODS Brasil mostra 14,0% na proporção de municípios com estrutura regular e democrática de participação direta da sociedade civil no planejamento urbano.',
          sourceLabel: 'ODS Brasil - Indicador 11.3.2',
          sourceUrl: 'https://odsbrasil.gov.br/objetivo11/indicador1132'
        }
      ],
      modules: [
        {
          key: 'moradia',
          label: 'Moradia próxima e compatível',
          href: 'moradia.html',
          icon: 'fas fa-home',
          body: 'Encontrar república, quarto ou apartamento com contexto local reduz atrito de permanência e amplia a segurança na decisão.'
        },
        {
          key: 'caronas',
          label: 'Mobilidade compartilhada',
          href: 'caronas-feed.html',
          icon: 'fas fa-car',
          body: 'Caronas organizadas entre campus e bairros reduzem deslocamentos ineficientes e fortalecem redes de confiança.'
        },
        {
          key: 'eventos',
          label: 'Comunidade ativa',
          href: 'eventos.html',
          icon: 'fas fa-users',
          body: 'Eventos conectam pessoas aos espaços universitários e ajudam a comunidade a participar mais da vida local.'
        }
      ],
      highlights: [
        'O ODS 11 trata de cidades e assentamentos humanos mais inclusivos, seguros, resilientes e sustentáveis.',
        'Na rotina da UFG, o problema urbano aparece em escala cotidiana: achar moradia, dividir deslocamentos e participar da vida coletiva com menos fricção.'
      ],
      sources: [
        { label: 'ONU - Goal 11', url: 'https://sdgs.un.org/goals/goal11' },
        { label: 'ODS Brasil - Objetivo 11', url: 'https://odsbrasil.gov.br/objetivo/objetivo?n=11' },
        { label: 'ODS Brasil - Indicador 11.3.2', url: 'https://odsbrasil.gov.br/objetivo11/indicador1132' },
        { label: 'Relato Técnico Kino Campus', url: TCC_SOURCE }
      ]
    }),
    '12': Object.freeze({
      goal: '12',
      title: 'Consumo e Produção Responsáveis',
      subtitle: 'Reuso, extensão do ciclo de vida e troca local como prática cotidiana dentro do campus.',
      icon: 'fas fa-recycle',
      color: '#6a994e',
      accent: '#84cc16',
      hero: 'A economia circular é um dos eixos mais visíveis do Kino Campus: livros, eletrônicos, vestuário e itens diversos ganham novas rotas de uso dentro da própria comunidade.',
      context: [
        'O relato técnico descreve a plataforma como alternativa ao descarte prematuro e ao desperdício, criando uma vitrine universitária para reuso, troca e circulação local de recursos.',
        'Esse desenho se conecta fortemente ao ODS 12 porque promove escolhas mais responsáveis sem exigir uma estrutura complexa para quem publica ou procura um item.',
        'Quanto mais o fluxo de compra, venda e compartilhamento fica local e organizado, maior a chance de aproveitar o valor já embutido nos produtos.'
      ],
      stats: [
        {
          value: '530',
          label: 'Instrumentos de política mapeados',
          detail: 'A ONU registrou 530 instrumentos de política ligados a consumo e produção sustentáveis no ciclo reportado em 2025.',
          sourceLabel: 'ONU - Goal 12 (2025)',
          sourceUrl: 'https://sdgs.un.org/goals/goal12'
        },
        {
          value: '71 países',
          label: 'Participando do monitoramento global',
          detail: 'A atualização de 2025 aponta 71 países participando do monitoramento do alvo 12.1.',
          sourceLabel: 'ONU - Goal 12 (2025)',
          sourceUrl: 'https://sdgs.un.org/goals/goal12'
        }
      ],
      modules: [
        {
          key: 'compra-venda',
          label: 'Reuso de bens',
          href: 'compra-venda-feed.html',
          icon: 'fas fa-shopping-bag',
          body: 'O módulo reduz descarte, aproxima oferta e demanda local e alonga o ciclo de vida de livros, eletrônicos, móveis e roupas.'
        },
        {
          key: 'achados-perdidos',
          label: 'Recuperação de objetos',
          href: 'achados-perdidos.html',
          icon: 'fas fa-search',
          body: 'Quando um item perdido volta ao dono, a plataforma também evita recompras desnecessárias e desperdício.'
        },
        {
          key: 'eventos',
          label: 'Feiras e ações de troca',
          href: 'eventos.html?filter=sustentabilidade',
          icon: 'fas fa-leaf',
          body: 'Eventos de troca e sustentabilidade tornam o consumo responsável uma prática visível e coletiva.'
        }
      ],
      highlights: [
        'O ODS 12 pede padrões mais sustentáveis de consumo e produção, o que inclui reduzir resíduos e usar melhor os recursos.',
        'No Kino Campus, essa lógica vira experiência prática: antes de comprar algo novo, a comunidade pode procurar o que já está circulando na UFG.'
      ],
      sources: [
        { label: 'ONU - Goal 12', url: 'https://sdgs.un.org/goals/goal12' },
        { label: 'ODS Brasil - Objetivo 12', url: 'https://odsbrasil.gov.br/objetivo/objetivo?n=12' },
        { label: 'ODS Brasil - Indicador 12.1.1', url: 'https://odsbrasil.gov.br/objetivo12/indicador1211' },
        { label: 'Relato Técnico Kino Campus', url: TCC_SOURCE }
      ]
    }),
    '13': Object.freeze({
      goal: '13',
      title: 'Ação Contra a Mudança Global do Clima',
      subtitle: 'Menos deslocamentos vazios, menos descarte e mais escolhas informadas no cotidiano universitário.',
      icon: 'fas fa-cloud-sun-rain',
      color: '#457b9d',
      accent: '#2a9d8f',
      hero: 'O Kino Campus não resolve a crise climática sozinho, mas cria comportamentos de baixo carbono que podem ser repetidos todos os dias: compartilhar caronas, reutilizar bens e reduzir compras desnecessárias.',
      context: [
        'No TCC, a plataforma aparece como infraestrutura digital para circular recursos já existentes na comunidade e conectar demandas locais com mais eficiência.',
        'Esse desenho apoia o ODS 13 quando reduz deslocamentos redundantes, incentiva reuso e torna visível a conexão entre conveniência cotidiana e responsabilidade climática.',
        'Ao reunir consumo responsável, mobilidade compartilhada e comunicação de oportunidades, a plataforma cria microdecisões com efeito acumulado.'
      ],
      stats: [
        {
          value: '47,0%',
          label: 'Governos locais com estratégia de risco',
          detail: 'No indicador 13.1.3 do ODS Brasil, 47,0% dos governos locais reportados adotavam e implementavam estratégia local de redução de risco de desastres.',
          sourceLabel: 'ODS Brasil - Indicador 13.1.3',
          sourceUrl: 'https://odsbrasil.gov.br/objetivo13/indicador1313'
        },
        {
          value: '69%',
          label: 'Currículos sem menção a clima',
          detail: 'A atualização da ONU em 2025 aponta que 69% dos currículos analisados no 9º ano não faziam referência à mudança do clima.',
          sourceLabel: 'ONU - Goal 13 (2025)',
          sourceUrl: 'https://sdgs.un.org/goals/goal13'
        }
      ],
      modules: [
        {
          key: 'caronas',
          label: 'Caronas compartilhadas',
          href: 'caronas-feed.html',
          icon: 'fas fa-car-side',
          body: 'Agrupar deslocamentos ajuda a reduzir viagens vazias, custos e pressão por transporte individual no entorno do campus.'
        },
        {
          key: 'compra-venda',
          label: 'Extensão do ciclo de vida',
          href: 'compra-venda-feed.html',
          icon: 'fas fa-recycle',
          body: 'Reutilizar itens reduz a necessidade de produção nova e evita descarte prematuro de materiais ainda úteis.'
        },
        {
          key: 'eventos',
          label: 'Educação climática',
          href: 'eventos.html?filter=sustentabilidade',
          icon: 'fas fa-seedling',
          body: 'Eventos e campanhas fortalecem cultura climática dentro da universidade e transformam dados em ação local.'
        }
      ],
      highlights: [
        'A ONU reforça que cada fração de grau importa e que atrasos tornam os impactos mais caros e difíceis de reverter.',
        'No Kino Campus, a contribuição climática aparece nas rotinas: compartilhar, reutilizar, localizar melhor e reduzir desperdício.'
      ],
      sources: [
        { label: 'ONU - Goal 13', url: 'https://sdgs.un.org/goals/goal13' },
        { label: 'ODS Brasil - Objetivo 13', url: 'https://odsbrasil.gov.br/objetivo/objetivo?n=13' },
        { label: 'ODS Brasil - Indicador 13.1.3', url: 'https://odsbrasil.gov.br/objetivo13/indicador1313' },
        { label: 'Relato Técnico Kino Campus', url: TCC_SOURCE }
      ]
    })
  });

  function getGoal(goalId) {
    return GOALS[String(goalId || '').trim()] || null;
  }

  return {
    getGoal,
    goals: GOALS,
    tccSource: TCC_SOURCE
  };
}));
