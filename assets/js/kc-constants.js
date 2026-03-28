/*
  KinoCampus - Global Constants
*/
(function () {
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

  const CARONAS_LOCATION_DEFINITIONS = Object.freeze([
    // Câmpus Samambaia e arredores
    Object.freeze({ key: 'campus-samambaia', label: 'Câmpus Samambaia (Câmpus II)', icon: 'fas fa-university', zoneKey: 'campus-samambaia', zoneLabel: 'Câmpus Samambaia', isCampus: true, aliases: Object.freeze(['campus samambaia','samambaia','campus ii','campus 2','câmpus samambaia','ufg samambaia']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'vila-itatiaia', label: 'Vila Itatiaia', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia', zoneLabel: 'Câmpus Samambaia', isCampus: false, aliases: Object.freeze(['itatiaia','vila itatiaia']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'sao-judas-tadeu', label: 'São Judas Tadeu', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia', zoneLabel: 'Câmpus Samambaia', isCampus: false, aliases: Object.freeze(['são judas tadeu','são judas','judas tadeu','sao judas']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'chacaras-california', label: 'Chácaras Califórnia', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia', zoneLabel: 'Câmpus Samambaia', isCampus: false, aliases: Object.freeze(['chácaras califórnia','chacaras california','califórnia','california']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'jardim-pompeia', label: 'Jardim Pompéia', icon: 'fas fa-map-pin', zoneKey: 'campus-samambaia', zoneLabel: 'Câmpus Samambaia', isCampus: false, aliases: Object.freeze(['jardim pompéia','jardim pompeia','pompéia','pompeia']), abbreviations: Object.freeze([]) }),
    // Câmpus Colemar e arredores
    Object.freeze({ key: 'campus-colemar', label: 'Câmpus Colemar Natal e Silva', icon: 'fas fa-university', zoneKey: 'campus-colemar', zoneLabel: 'Câmpus Colemar', isCampus: true, aliases: Object.freeze(['campus colemar','colemar','campus i','campus 1','câmpus colemar','praça universitária','praca universitaria']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-universitario', label: 'Setor Universitário', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar', zoneLabel: 'Câmpus Colemar', isCampus: false, aliases: Object.freeze(['setor universitário','setor universitario','universitário','universitario']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'praca-universitaria', label: 'Praça Universitária', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar', zoneLabel: 'Câmpus Colemar', isCampus: false, aliases: Object.freeze(['praça universitária','praca universitaria','praça universitaria','praca universitária']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-leste-universitario', label: 'Setor Leste Universitário', icon: 'fas fa-map-pin', zoneKey: 'campus-colemar', zoneLabel: 'Câmpus Colemar', isCampus: false, aliases: Object.freeze(['setor leste universitário','setor leste universitario','leste universitário','leste universitario']), abbreviations: Object.freeze([]) }),
    // Outros câmpus
    Object.freeze({ key: 'campus-aparecida', label: 'Câmpus Aparecida de Goiânia (FCT)', icon: 'fas fa-university', zoneKey: 'campus-aparecida', zoneLabel: 'Câmpus Aparecida', isCampus: true, aliases: Object.freeze(['campus aparecida','aparecida','fct','câmpus aparecida','aparecida de goiânia','aparecida de goiania']), abbreviations: Object.freeze(['FCT']) }),
    Object.freeze({ key: 'campus-goias', label: 'Câmpus Goiás (Cidade de Goiás)', icon: 'fas fa-university', zoneKey: 'campus-goias', zoneLabel: 'Câmpus Goiás', isCampus: true, aliases: Object.freeze(['campus goiás','campus goias','cidade de goiás','cidade de goias','goiás velho','goias velho']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'campus-cidade-ocidental', label: 'Câmpus Cidade Ocidental', icon: 'fas fa-university', zoneKey: 'campus-cidade-ocidental', zoneLabel: 'Câmpus Cidade Ocidental', isCampus: true, aliases: Object.freeze(['campus cidade ocidental','cidade ocidental']), abbreviations: Object.freeze([]) }),
    // Unidades UFG
    Object.freeze({ key: 'fo-odontologia', label: 'Faculdade de Odontologia (FO)', icon: 'fas fa-tooth', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['faculdade de odontologia','odontologia','odonto','fo']), abbreviations: Object.freeze(['FO']) }),
    Object.freeze({ key: 'evz-veterinaria', label: 'Escola de Veterinária e Zootecnia (EVZ)', icon: 'fas fa-paw', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['escola de veterinária','veterinária','veterinaria','zootecnia','evz','escola de veterinaria e zootecnia']), abbreviations: Object.freeze(['EVZ']) }),
    Object.freeze({ key: 'icb-biologicas', label: 'Instituto de Ciências Biológicas (ICB)', icon: 'fas fa-dna', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['instituto de ciências biológicas','ciências biológicas','biológicas','biologicas','icb']), abbreviations: Object.freeze(['ICB']) }),
    Object.freeze({ key: 'if-fisica', label: 'Instituto de Física (IF)', icon: 'fas fa-atom', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['instituto de física','instituto de fisica','física','fisica','if ufg']), abbreviations: Object.freeze(['IF']) }),
    Object.freeze({ key: 'inf-informatica', label: 'Instituto de Informática (INF)', icon: 'fas fa-laptop-code', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['instituto de informática','instituto de informatica','informática','informatica','inf','computação','computacao']), abbreviations: Object.freeze(['INF']) }),
    Object.freeze({ key: 'fe-educacao', label: 'Faculdade de Educação (FE)', icon: 'fas fa-chalkboard-teacher', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['faculdade de educação','faculdade de educacao','educação','educacao','fe ufg']), abbreviations: Object.freeze(['FE']) }),
    Object.freeze({ key: 'hc-clinicas', label: 'Hospital das Clínicas (HC)', icon: 'fas fa-hospital', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['hospital das clínicas','hospital das clinicas','hc','hc ufg','hospital ufg']), abbreviations: Object.freeze(['HC']) }),
    Object.freeze({ key: 'fen-engenharia', label: 'Escola de Engenharia (EMC/EEC/EECA)', icon: 'fas fa-cogs', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['escola de engenharia','engenharia','emc','eec','eeca','engenharia civil','engenharia elétrica','engenharia mecânica']), abbreviations: Object.freeze(['EMC','EEC','EECA']) }),
    Object.freeze({ key: 'iq-quimica', label: 'Instituto de Química (IQ)', icon: 'fas fa-flask', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['instituto de química','instituto de quimica','química','quimica','iq']), abbreviations: Object.freeze(['IQ']) }),
    Object.freeze({ key: 'imc-matematica', label: 'Instituto de Matemática e Estatística (IME)', icon: 'fas fa-square-root-alt', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['instituto de matemática','matemática','matematica','estatística','estatistica','ime']), abbreviations: Object.freeze(['IME']) }),
    Object.freeze({ key: 'fav-artes', label: 'Faculdade de Artes Visuais (FAV)', icon: 'fas fa-palette', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['faculdade de artes visuais','artes visuais','artes','fav']), abbreviations: Object.freeze(['FAV']) }),
    Object.freeze({ key: 'fl-letras', label: 'Faculdade de Letras (FL)', icon: 'fas fa-book', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['faculdade de letras','letras','fl ufg']), abbreviations: Object.freeze(['FL']) }),
    Object.freeze({ key: 'fd-direito', label: 'Faculdade de Direito (FD)', icon: 'fas fa-balance-scale', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['faculdade de direito','direito','fd ufg']), abbreviations: Object.freeze(['FD']) }),
    Object.freeze({ key: 'face-economia', label: 'Faculdade de Administração, Ciências Contábeis e Econômicas (FACE)', icon: 'fas fa-chart-line', zoneKey: 'unidades-ufg', zoneLabel: 'Unidades UFG', isCampus: true, aliases: Object.freeze(['face','administração','administracao','ciências contábeis','contábeis','economia','econômicas']), abbreviations: Object.freeze(['FACE']) }),
    // Zona Central
    Object.freeze({ key: 'centro', label: 'Centro / Setor Central', icon: 'fas fa-building', zoneKey: 'zona-central', zoneLabel: 'Zona Central', isCampus: false, aliases: Object.freeze(['centro','setor central','centro de goiânia','centro de goiania']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-campinas', label: 'Setor Campinas', icon: 'fas fa-map-pin', zoneKey: 'zona-central', zoneLabel: 'Zona Central', isCampus: false, aliases: Object.freeze(['setor campinas','campinas']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-oeste', label: 'Setor Oeste', icon: 'fas fa-map-pin', zoneKey: 'zona-central', zoneLabel: 'Zona Central', isCampus: false, aliases: Object.freeze(['setor oeste','oeste']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-aeroporto', label: 'Setor Aeroporto', icon: 'fas fa-plane', zoneKey: 'zona-central', zoneLabel: 'Zona Central', isCampus: false, aliases: Object.freeze(['setor aeroporto','aeroporto','aeroporto de goiânia','aeroporto santa genoveva']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-coimbra', label: 'Setor Coimbra', icon: 'fas fa-map-pin', zoneKey: 'zona-central', zoneLabel: 'Zona Central', isCampus: false, aliases: Object.freeze(['setor coimbra','coimbra']), abbreviations: Object.freeze([]) }),
    // Zona Sul
    Object.freeze({ key: 'setor-bueno', label: 'Setor Bueno', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['setor bueno','bueno','bairro bueno']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-marista', label: 'Setor Marista', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['setor marista','marista']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'jardim-goias', label: 'Jardim Goiás', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['jardim goiás','jardim goias','jd goiás','jd goias']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-nova-suica', label: 'Setor Nova Suíça', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['setor nova suíça','setor nova suica','nova suíça','nova suica']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'jardim-america', label: 'Jardim América', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['jardim américa','jardim america','jd américa','jd america']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-pedro-ludovico', label: 'Setor Pedro Ludovico', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['setor pedro ludovico','pedro ludovico']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'parque-amazonia', label: 'Parque Amazônia', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['parque amazônia','parque amazonia','amazônia','amazonia']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-sul', label: 'Setor Sul', icon: 'fas fa-map-pin', zoneKey: 'zona-sul', zoneLabel: 'Zona Sul', isCampus: false, aliases: Object.freeze(['setor sul','sul']), abbreviations: Object.freeze([]) }),
    // Zona Norte
    Object.freeze({ key: 'setor-norte-ferroviario', label: 'Setor Norte Ferroviário', icon: 'fas fa-map-pin', zoneKey: 'zona-norte', zoneLabel: 'Zona Norte', isCampus: false, aliases: Object.freeze(['setor norte ferroviário','setor norte ferroviario','norte ferroviário','norte ferroviario']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'goiania-2', label: 'Goiânia 2', icon: 'fas fa-map-pin', zoneKey: 'zona-norte', zoneLabel: 'Zona Norte', isCampus: false, aliases: Object.freeze(['goiânia 2','goiania 2','goiânia dois']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'jardim-guanabara', label: 'Jardim Guanabara', icon: 'fas fa-map-pin', zoneKey: 'zona-norte', zoneLabel: 'Zona Norte', isCampus: false, aliases: Object.freeze(['jardim guanabara','guanabara','jd guanabara']), abbreviations: Object.freeze([]) }),
    // Zona Leste
    Object.freeze({ key: 'setor-leste-vila-nova', label: 'Setor Leste Vila Nova', icon: 'fas fa-map-pin', zoneKey: 'zona-leste', zoneLabel: 'Zona Leste', isCampus: false, aliases: Object.freeze(['setor leste vila nova','leste vila nova','vila nova']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'vila-mutirao', label: 'Vila Mutirão', icon: 'fas fa-map-pin', zoneKey: 'zona-leste', zoneLabel: 'Zona Leste', isCampus: false, aliases: Object.freeze(['vila mutirão','vila mutirao','mutirão','mutirao']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'jardim-novo-mundo', label: 'Jardim Novo Mundo', icon: 'fas fa-map-pin', zoneKey: 'zona-leste', zoneLabel: 'Zona Leste', isCampus: false, aliases: Object.freeze(['jardim novo mundo','novo mundo','jd novo mundo']), abbreviations: Object.freeze([]) }),
    // Zona Oeste
    Object.freeze({ key: 'setor-bela-vista', label: 'Setor Bela Vista', icon: 'fas fa-map-pin', zoneKey: 'zona-oeste', zoneLabel: 'Zona Oeste', isCampus: false, aliases: Object.freeze(['setor bela vista','bela vista']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'cidade-jardim', label: 'Cidade Jardim', icon: 'fas fa-map-pin', zoneKey: 'zona-oeste', zoneLabel: 'Zona Oeste', isCampus: false, aliases: Object.freeze(['cidade jardim']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'setor-gentil-meireles', label: 'Setor Gentil Meireles', icon: 'fas fa-map-pin', zoneKey: 'zona-oeste', zoneLabel: 'Zona Oeste', isCampus: false, aliases: Object.freeze(['setor gentil meireles','gentil meireles']), abbreviations: Object.freeze([]) }),
    // Terminais
    Object.freeze({ key: 'terminal-bandeiras', label: 'Terminal Bandeiras', icon: 'fas fa-bus', zoneKey: 'terminais', zoneLabel: 'Terminais', isCampus: false, aliases: Object.freeze(['terminal bandeiras','bandeiras','t. bandeiras']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'terminal-prainha', label: 'Terminal Prainha', icon: 'fas fa-bus', zoneKey: 'terminais', zoneLabel: 'Terminais', isCampus: false, aliases: Object.freeze(['terminal prainha','prainha','t. prainha']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'terminal-isidoria', label: 'Terminal Isidória', icon: 'fas fa-bus', zoneKey: 'terminais', zoneLabel: 'Terminais', isCampus: false, aliases: Object.freeze(['terminal isidória','terminal isidoria','isidória','isidoria','t. isidória']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'terminal-padre-pelagio', label: 'Terminal Padre Pelágio', icon: 'fas fa-bus', zoneKey: 'terminais', zoneLabel: 'Terminais', isCampus: false, aliases: Object.freeze(['terminal padre pelágio','terminal padre pelagio','padre pelágio','padre pelagio','t. padre pelágio']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'terminal-recanto-do-bosque', label: 'Terminal Recanto do Bosque', icon: 'fas fa-bus', zoneKey: 'terminais', zoneLabel: 'Terminais', isCampus: false, aliases: Object.freeze(['terminal recanto do bosque','recanto do bosque','t. recanto']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'rodoviaria-goiania', label: 'Rodoviária de Goiânia', icon: 'fas fa-bus-alt', zoneKey: 'terminais', zoneLabel: 'Terminais', isCampus: false, aliases: Object.freeze(['rodoviária de goiânia','rodoviária','rodoviaria','rodoviaria de goiania','terminal rodoviário']), abbreviations: Object.freeze([]) }),
    // Aparecida de Goiânia
    Object.freeze({ key: 'aparecida-centro', label: 'Centro de Aparecida', icon: 'fas fa-map-pin', zoneKey: 'aparecida-goiania', zoneLabel: 'Aparecida de Goiânia', isCampus: false, aliases: Object.freeze(['centro de aparecida','aparecida centro','centro aparecida']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'cidade-livre', label: 'Cidade Livre', icon: 'fas fa-map-pin', zoneKey: 'aparecida-goiania', zoneLabel: 'Aparecida de Goiânia', isCampus: false, aliases: Object.freeze(['cidade livre']), abbreviations: Object.freeze([]) }),
    Object.freeze({ key: 'garavelo', label: 'Garavelo', icon: 'fas fa-map-pin', zoneKey: 'aparecida-goiania', zoneLabel: 'Aparecida de Goiânia', isCampus: false, aliases: Object.freeze(['garavelo','garavelo park']), abbreviations: Object.freeze([]) }),
  ]);

// Avatar padrão: círculo laranja com ícone de usuário branco (mesmo visual do header)
const DEFAULT_AVATAR_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23ff7c00'/%3E%3Cstop offset='1' stop-color='%23ff6b00'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='50' fill='url(%23g)'/%3E%3Ccircle cx='50' cy='38' r='14' fill='white' opacity='0.92'/%3E%3Cellipse cx='50' cy='72' rx='22' ry='16' fill='white' opacity='0.92'/%3E%3C/svg%3E";

window.KC_CONSTANTS = Object.freeze({
  MODULE_LABEL_MAP,
  MODULE_ICON_MAP,
  CATEGORY_LABELS,
  SUBCATEGORY_LABELS,
  OPPORTUNITY_AREA_DEFINITIONS,
  HOUSING_REGION_DEFINITIONS,
  HOUSING_FEATURE_DEFINITIONS,
  LOST_FOUND_LOCATION_DEFINITIONS,
  CARONAS_LOCATION_DEFINITIONS,
  DEFAULT_AVATAR_SVG
});

})();
