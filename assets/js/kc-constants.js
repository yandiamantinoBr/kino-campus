/*
  KinoCampus - Global Constants
*/
(function (global) {
  'use strict';

  // Labels para exibição (mantém consistência visual com os feeds)
  const MODULE_LABEL_MAP = Object.freeze({
    'moradia': 'Moradia',
    'eventos': 'Eventos',
    'oportunidades': 'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos',
    'caronas': 'Caronas',
    'compra-venda': 'Compra e Venda',
    'livros': 'Livros',
  });

  // Ícones (Font Awesome) por módulo — usado em badges (cards + product)
  const MODULE_ICON_MAP = Object.freeze({
    'moradia': 'fas fa-home',
    'eventos': 'fas fa-calendar-alt',
    'oportunidades': 'fas fa-briefcase',
    'achados-perdidos': 'fas fa-search',
    'caronas': 'fas fa-car',
    'compra-venda': 'fas fa-layer-group',
    'livros': 'fas fa-book',
  });

  // Labels “humanizados” por categoria/subcategoria (casos conhecidos do protótipo)
  const CATEGORY_LABELS = Object.freeze({
    'compra-venda': Object.freeze({
      'eletronicos': 'Eletrônicos',
      'moveis': 'Móveis',
      'vestuario': 'Vestuário',
      'livros': 'Livros',
      'outros': 'Outros',
    }),
    'achados-perdidos': Object.freeze({
      'perdidos': 'Perdido',
      'perdido': 'Perdido',
      'encontrados': 'Encontrado',
      'encontrado': 'Encontrado',
      'achado': 'Encontrado',
      'documentos': 'Documentos',
      'eletronicos': 'Eletrônicos',
      'outros': 'Outros',
    }),
    'caronas': Object.freeze({
      'ofereco': 'Ofereço Carona',
      'procuro': 'Procuro Carona',
      'ida': 'Ida',
      'volta': 'Volta',
      'urgente': 'Urgente',
      'campus': 'Campus',
      'centro': 'Centro',
    }),
    'oportunidades': Object.freeze({
      'estagio': 'Estágio',
      'estagios': 'Estágio',
      'emprego': 'Emprego',
      'empregos': 'Emprego',
      'freelancer': 'Freelancer',
      'monitoria': 'Monitoria',
      'monitorias': 'Monitoria',
      'voluntariado': 'Voluntariado',
      'voluntariados': 'Voluntariado',
      'bolsa': 'Bolsa',
      'vagas': 'Vagas',
      'bolsas': 'Bolsas',
    }),
    'eventos': Object.freeze({
      'eventos': 'Eventos',
      'sustentabilidade': 'Sustentabilidade',
      'cultural': 'Cultural',
      'academico': 'Acadêmico',
      'esportivo': 'Esportivo',
      'esportes': 'Esportivo',
      'workshop': 'Workshop',
      'palestra': 'Acadêmico',
      'feira': 'Sustentabilidade',
    }),
    'moradia': Object.freeze({
      'republica': 'República',
      'republicas': 'República',
      'quarto': 'Quarto',
      'quartos': 'Quarto',
      'dividir-quarto': 'Dividir Quarto',
      'apartamento': 'Apartamento',
      'apartamentos': 'Apartamento',
      'casa': 'Casa',
      'casas': 'Casa',
      'kitnet': 'Kitnet',
      'procurando': 'Procurando',
      'procuro': 'Procurando',
    }),
    'livros': Object.freeze({
      'exatas': 'Exatas',
      'engenharia': 'Engenharia',
      'calculo': 'Cálculo',
    }),
  });

  const SUBCATEGORY_LABELS = Object.freeze({
    'caronas': Object.freeze({
      'goiania-campus': 'Goiânia → Campus',
      'campus-centro': 'Campus → Centro',
      'samambaia-centro': 'Samambaia → Centro',
      'saida-agora': 'Saída Agora',
    }),
  });

  const OPPORTUNITY_AREA_DEFINITIONS = Object.freeze([
    Object.freeze({
      key: 'tecnologia',
      label: 'Tecnologia',
      icon: 'fas fa-laptop-code',
      emoji: '💻',
      aliases: Object.freeze([
        'tecnologia', 'tech', 'ti', 'software', 'sistemas', 'desenvolvimento',
        'desenvolvedor', 'desenvolvedora', 'dev', 'programacao', 'programação',
        'engenharia de software', 'dados', 'data', 'analytics', 'analise de dados',
        'análise de dados', 'frontend', 'front-end', 'backend', 'back-end',
        'full stack', 'fullstack', 'ux engineering', 'qa', 'react', 'node',
        'javascript', 'typescript', 'python'
      ]),
    }),
    Object.freeze({
      key: 'marketing',
      label: 'Marketing',
      icon: 'fas fa-bullhorn',
      emoji: '📣',
      aliases: Object.freeze([
        'marketing', 'growth', 'branding', 'midia', 'mídia', 'social media',
        'redes sociais', 'trafego', 'tráfego', 'seo', 'ads', 'copy', 'copywriting',
        'conteudo', 'conteúdo', 'publicidade', 'comunicacao', 'comunicação'
      ]),
    }),
    Object.freeze({
      key: 'design',
      label: 'Design',
      icon: 'fas fa-palette',
      emoji: '🎨',
      aliases: Object.freeze([
        'design', 'designer', 'ux', 'ui', 'produto visual', 'grafico', 'gráfico',
        'identidade visual', 'criacao visual', 'criação visual', 'ilustracao',
        'ilustração', 'direcao de arte', 'direção de arte'
      ]),
    }),
    Object.freeze({
      key: 'educacao',
      label: 'Educação',
      icon: 'fas fa-graduation-cap',
      emoji: '🎓',
      aliases: Object.freeze([
        'educacao', 'educação', 'ensino', 'pedagogia', 'monitoria', 'monitor',
        'tutoria', 'tutor', 'professor', 'professora', 'aulas', 'reforco',
        'reforço', 'escolar', 'licenciatura', 'didatica', 'didática', 'calculo',
        'cálculo'
      ]),
    }),
    Object.freeze({
      key: 'musica',
      label: 'M\u00fasica',
      icon: 'fas fa-music',
      emoji: '🎵',
      aliases: Object.freeze([
        'musica', 'm\u00fasica', 'musical', 'instrumento', 'instrumentos',
        'canto', 'cantor', 'cantora', 'producao musical', 'produ\u00e7\u00e3o musical',
        'banda', 'violao', 'viol\u00e3o', 'teclado', 'piano', 'guitarra'
      ]),
    }),
    Object.freeze({
      key: 'administrativo',
      label: 'Administrativo',
      icon: 'fas fa-clipboard-list',
      emoji: '📋',
      aliases: Object.freeze([
        'administrativo', 'administracao', 'administração', 'operacoes', 'operações',
        'secretaria', 'rh', 'recursos humanos', 'financeiro', 'financas', 'finanças',
        'backoffice', 'office', 'assistente administrativo'
      ]),
    }),
    Object.freeze({
      key: 'engenharia',
      label: 'Engenharia',
      icon: 'fas fa-drafting-compass',
      emoji: '📐',
      aliases: Object.freeze([
        'engenharia', 'engenheiro', 'engenheira', 'civil', 'mecanica', 'mecânica',
        'eletrica', 'elétrica', 'projetos', 'projeto tecnico', 'projeto técnico',
        'autocad', 'cad'
      ]),
    }),
    Object.freeze({
      key: 'saude',
      label: 'Saúde',
      icon: 'fas fa-heartbeat',
      emoji: '💚',
      aliases: Object.freeze([
        'saude', 'saúde', 'medicina', 'enfermagem', 'psicologia', 'farmacia',
        'farmácia', 'nutricao', 'nutrição', 'clinica', 'clínica'
      ]),
    }),
    Object.freeze({
      key: 'pesquisa',
      label: 'Pesquisa',
      icon: 'fas fa-microscope',
      emoji: '🔬',
      aliases: Object.freeze([
        'pesquisa', 'cientifica', 'científica', 'iniciacao cientifica',
        'iniciação científica', 'laboratorio', 'laboratório', 'academica',
        'acadêmica', 'bolsa pesquisa'
      ]),
    }),
  ]);

  const HOUSING_REGION_DEFINITIONS = Object.freeze([
    Object.freeze({
      key: 'campus-samambaia',
      label: 'Campus Samambaia',
      icon: 'fas fa-university',
      zoneKey: 'campus-samambaia',
      zoneLabel: 'Campus Samambaia',
      aliases: Object.freeze([
        'campus samambaia', 'samambaia', 'campus ii', 'campus 2', 'campus samambaia ufg'
      ]),
    }),
    Object.freeze({
      key: 'vila-itatiaia',
      label: 'Vila Itatiaia',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-samambaia',
      zoneLabel: 'Campus Samambaia',
      aliases: Object.freeze([
        'vila itatiaia', 'itatiaia'
      ]),
    }),
    Object.freeze({
      key: 'sao-judas-tadeu',
      label: 'São Judas Tadeu',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-samambaia',
      zoneLabel: 'Campus Samambaia',
      aliases: Object.freeze([
        'sao judas', 'são judas', 'sao judas tadeu'
      ]),
    }),
    Object.freeze({
      key: 'chacaras-california',
      label: 'Chácaras Califórnia',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-samambaia',
      zoneLabel: 'Campus Samambaia',
      aliases: Object.freeze([
        'chacaras california', 'chácaras califórnia', 'chacara california', 'california'
      ]),
    }),
    Object.freeze({
      key: 'jardim-pompeia',
      label: 'Jardim Pompéia',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-samambaia',
      zoneLabel: 'Campus Samambaia',
      aliases: Object.freeze([
        'jardim pompeia', 'jardim pompéia', 'pompeia', 'pompéia'
      ]),
    }),
    Object.freeze({
      key: 'campus-colemar',
      label: 'Campus Colemar',
      icon: 'fas fa-university',
      zoneKey: 'campus-colemar',
      zoneLabel: 'Campus Colemar',
      aliases: Object.freeze([
        'campus colemar', 'colemar', 'campus i', 'campus 1', 'colemar natal e silva'
      ]),
    }),
    Object.freeze({
      key: 'setor-universitario',
      label: 'Setor Universitário',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-colemar',
      zoneLabel: 'Campus Colemar',
      aliases: Object.freeze([
        'setor universitario', 'praça universitária', 'praca universitaria', 'universitario'
      ]),
    }),
    Object.freeze({
      key: 'setor-leste-universitario',
      label: 'Setor Leste Universitário',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-colemar',
      zoneLabel: 'Campus Colemar',
      aliases: Object.freeze([
        'setor leste universitario', 'setor leste', 'leste universitario'
      ]),
    }),
    Object.freeze({
      key: 'setor-leste-vila-nova',
      label: 'Setor Leste Vila Nova',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-colemar',
      zoneLabel: 'Campus Colemar',
      aliases: Object.freeze([
        'setor leste vila nova', 'leste vila nova', 'vila nova'
      ]),
    }),
    Object.freeze({
      key: 'centro',
      label: 'Centro',
      icon: 'fas fa-map-pin',
      zoneKey: 'campus-colemar',
      zoneLabel: 'Campus Colemar',
      aliases: Object.freeze([
        'centro', 'centro de goiania', 'centro de goiânia'
      ]),
    }),
  ]);

  const HOUSING_FEATURE_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'aceita-pets', label: 'Aceita pets', emoji: '🐾', aliases: Object.freeze(['aceita pets', 'pet friendly', 'pets', 'animais', 'aceita animal']) }),
    Object.freeze({ key: 'lgbtqiapn', label: 'LGBTQIAPN+', emoji: '🌈', aliases: Object.freeze(['lgbtqiapn+', 'lgbtqiapn', 'lgbt', 'ambiente lgbtqiapn+', 'acolhedor lgbt']) }),
    Object.freeze({ key: 'apenas-mulheres', label: 'Apenas mulheres', aliases: Object.freeze(['apenas mulheres', 'somente mulheres', 'republica feminina', 'república feminina', 'feminina']) }),
    Object.freeze({ key: 'apenas-homens', label: 'Apenas homens', aliases: Object.freeze(['apenas homens', 'somente homens', 'republica masculina', 'república masculina', 'masculina']) }),
    Object.freeze({ key: 'mobiliado', label: 'Mobiliado', aliases: Object.freeze(['mobiliado', 'mobilhado', 'com mobilia', 'com mobília', 'mobilia completa', 'mobília completa']) }),
    Object.freeze({ key: 'contas-inclusas', label: 'Contas inclusas', aliases: Object.freeze(['contas inclusas', 'com contas', 'agua inclusa', 'água inclusa', 'luz inclusa']) }),
    Object.freeze({ key: 'internet-inclusa', label: 'Internet inclusa', aliases: Object.freeze(['internet inclusa', 'wifi incluso', 'wi-fi incluso', 'wifi inclusa']) }),
    Object.freeze({ key: 'banheiro-privativo', label: 'Banheiro privativo', aliases: Object.freeze(['banheiro privativo', 'suite', 'suíte', 'banheiro individual']) }),
    Object.freeze({ key: 'vaga-de-garagem', label: 'Vaga de garagem', aliases: Object.freeze(['vaga de garagem', 'garagem', 'estacionamento']) }),
    Object.freeze({ key: 'ambiente-familiar', label: 'Ambiente familiar', aliases: Object.freeze(['ambiente familiar', 'familiar', 'casa de familia', 'casa de família']) }),
    Object.freeze({ key: 'nao-fumantes', label: 'Não fumantes', aliases: Object.freeze(['nao fumantes', 'não fumantes', 'sem fumar', 'nao fumar', 'não fumar']) }),
    Object.freeze({ key: 'proximo-ao-campus', label: 'Próximo ao campus', aliases: Object.freeze(['proximo ao campus', 'próximo ao campus', 'perto do campus', 'ao lado da ufg']) }),
  ]);

  const LOST_FOUND_LOCATION_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'biblioteca-central', label: 'Biblioteca Central', icon: 'fas fa-book', emoji: '📚', aliases: Object.freeze(['biblioteca central', 'biblioteca', 'bc', 'bibliotca central', 'biblioteca ufg']) }),
    Object.freeze({ key: 'restaurante-universitario', label: 'Restaurante Universitário', icon: 'fas fa-utensils', emoji: '🍽️', aliases: Object.freeze(['restaurante universitario', 'restaurante universitário', 'ru', 'r.u.', 'restaurante da ufg']) }),
    Object.freeze({ key: 'estacionamento', label: 'Estacionamento', icon: 'fas fa-parking', emoji: '🅿️', aliases: Object.freeze(['estacionamento', 'parking', 'vaga', 'garagem']) }),
    Object.freeze({ key: 'salas-de-aula', label: 'Salas de Aula', icon: 'fas fa-door-open', emoji: '🚪', aliases: Object.freeze(['salas de aula', 'sala de aula', 'salas', 'sala', 'sala de aula bloco']) }),
    Object.freeze({ key: 'blocos-e-laboratorios', label: 'Blocos e Laboratórios', icon: 'fas fa-flask', emoji: '🧪', aliases: Object.freeze(['blocos e laboratorios', 'blocos e laboratórios', 'blocos', 'laboratorios', 'laboratórios', 'labs', 'laboratorio']) }),
    Object.freeze({ key: 'centro-de-aulas', label: 'Centro de Aulas', icon: 'fas fa-school', emoji: '🏫', aliases: Object.freeze(['centro de aulas', 'centro aulas', 'ca', 'centro de aula']) }),
    Object.freeze({ key: 'praca-universitaria', label: 'Praça Universitária', icon: 'fas fa-landmark', emoji: '🏛️', aliases: Object.freeze(['praca universitaria', 'praça universitária', 'praca', 'praça universitária']) }),
    Object.freeze({ key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-tree', emoji: '🌳', aliases: Object.freeze(['campus samambaia', 'samambaia', 'campus ii', 'campus 2', 'campus 2 ufg']) }),
    Object.freeze({ key: 'campus-colemar', label: 'Campus Colemar', icon: 'fas fa-graduation-cap', emoji: '🎓', aliases: Object.freeze(['campus colemar', 'colemar', 'campus i', 'campus 1', 'colemar natal e silva']) }),
  ]);

  global.KC_CONSTANTS = Object.freeze({
    MODULE_LABEL_MAP,
    MODULE_ICON_MAP,
    CATEGORY_LABELS,
    SUBCATEGORY_LABELS,
    OPPORTUNITY_AREA_DEFINITIONS,
    HOUSING_REGION_DEFINITIONS,
    HOUSING_FEATURE_DEFINITIONS,
    LOST_FOUND_LOCATION_DEFINITIONS
  });
})(typeof window !== 'undefined' ? window : this);
