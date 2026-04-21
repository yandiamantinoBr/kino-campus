'use strict';

beforeAll(() => {
  global.window = global.window || global;
  window.KC_CONSTANTS = {
    DEFAULT_AVATAR_SVG: '<svg data-testid="avatar"></svg>',
    MODULE_LABEL_MAP: {
      moradia: 'Moradia',
      eventos: 'Eventos',
      oportunidades: 'Oportunidades',
      'achados-perdidos': 'Achados e Perdidos',
      'compra-venda': 'Compra e Venda',
      caronas: 'Caronas',
    },
    MODULE_ICON_MAP: {
      moradia: 'fas fa-home',
      eventos: 'fas fa-calendar-alt',
      oportunidades: 'fas fa-briefcase',
      'achados-perdidos': 'fas fa-search',
    },
    CATEGORY_LABELS: {
      moradia: { quarto: "Quarto" },
      eventos: { academico: 'Academico', cultural: 'Cultural', sustentabilidade: 'Sustentabilidade' },
      oportunidades: { vagas: "Vagas" },
      'achados-perdidos': { perdido: 'Perdido', encontrado: 'Encontrado' },
      caronas: { procuro: 'Procuro', ofereco: 'Ofereco' },
    },
    SUBCATEGORY_LABELS: {
      oportunidades: { tecnologia: "Tecnologia" },
    },
    HOUSING_REGION_DEFINITIONS: [
      { key: 'setor-norte', label: 'Setor Norte', icon: 'fas fa-map-pin', zoneKey: 'norte', zoneLabel: 'Zona Norte', aliases: ['norte', 'sn'] },
    ],
    HOUSING_FEATURE_DEFINITIONS: [
      { key: 'aceita-pets', label: 'Aceita Pets', icon: 'fas fa-paw', aliases: ['pets'] },
    ],
    LOST_FOUND_LOCATION_DEFINITIONS: [
      { key: 'biblioteca-central', label: 'Biblioteca Central', icon: 'fas fa-book', emoji: '\u{1F4DA}', aliases: ['biblioteca'] },
    ],
    CARONAS_LOCATION_DEFINITIONS: [
      { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-university', aliases: ['campus'], isCampus: true, abbreviations: ['CS'] },
    ],
    OPPORTUNITY_AREA_DEFINITIONS: [
      { key: 'tecnologia', label: 'Tecnologia', aliases: ['tech', 'ti'] },
    ],
  };
  require('../assets/js/kc-utils.string.js');
  require('../assets/js/kc-utils.format.js');
  require('../assets/js/kc-utils.dom.js');
  require('../assets/js/kc-utils.identity.js');
  require('../assets/js/kc-utils.taxonomy.js');
  require('../assets/js/kc-utils.location.js');
  require('../assets/js/kc-utils.presentation.js');
});

beforeEach(() => {
  window.KCAPI = undefined;
});

const pres = () => window._KCU.presentation;

describe('window._KCU.presentation ? contrato est?tico', () => {
  test('existe e ? frozen', () => {
    expect(pres()).toBeDefined();
    expect(Object.isFrozen(pres())).toBe(true);
  });

  test('tem exatamente 9 chaves', () => {
    const keys = Object.keys(pres()).sort();
    expect(keys).toEqual([
      'applyPresentationRules', 'cssEscape', 'getDisplayMarkerTags',
      'inferAchadosLocation', 'inferCaronasRoute', 'inferEventosCategory',
      'inferOportunidadesSubcategory', 'renderMarkerTags', 'renderPostCard',
    ]);
  });

  test('helpers internos n?o expostos', () => {
    expect(pres()._str).toBeUndefined();
    expect(pres()._fmt).toBeUndefined();
    expect(pres()._escapeHtml).toBeUndefined();
  });
});

describe('cssEscape', () => {
  test('escapa caracteres especiais de seletor CSS', () => {
    expect(pres().cssEscape('#card.item 1')).toBe('\\#card\\.item\\ 1');
  });

  test('preserva caracteres seguros', () => {
    expect(pres().cssEscape('kc-card_01')).toBe('kc-card_01');
  });
});

describe('inferCaronasRoute', () => {
  test('extrai origem e destino com seta unicode', () => {
    expect(pres().inferCaronasRoute('Carona campus samambaia \u2192 centro')).toEqual({
      from: 'Campus Samambaia',
      to: 'Centro',
    });
  });

  test('retorna vazio quando n?o encontra separador de rota', () => {
    expect(pres().inferCaronasRoute('Carona sem rota')).toEqual({ from: '', to: '' });
  });
});

describe('inferAchadosLocation', () => {
  test('resolve localiza??o por alias textual', () => {
    expect(pres().inferAchadosLocation('Perdi na biblioteca ontem')).toBe('Biblioteca Central');
  });

  test('mantem o texto original quando o resolver nao encontra match canonico', () => {
    expect(pres().inferAchadosLocation('Sem pista')).toBe('Sem pista');
  });
});

describe('inferOportunidadesSubcategory', () => {
  test('resolve ?rea de oportunidade por tags', () => {
    expect(pres().inferOportunidadesSubcategory('Vaga aberta', ['tech'])).toBe('Tecnologia');
  });
});

describe('inferEventosCategory', () => {
  test('preserva categoria expl?cita j? can?nica', () => {
    expect(pres().inferEventosCategory('cultural', ['musica'])).toBe('cultural');
  });

  test('infere sustentabilidade por tags de feira', () => {
    expect(pres().inferEventosCategory('', ['feira sustent?vel'])).toBe('sustentabilidade');
  });

  test('infere cultural por tags de arte', () => {
    expect(pres().inferEventosCategory('eventos', ['arte', 'musica'])).toBe('cultural');
  });

  test('infere acad?mico por workshop', () => {
    expect(pres().inferEventosCategory('eventos', ['workshop'])).toBe('academico');
  });
});

describe('applyPresentationRules ? shape b?sico', () => {
  test('retorna clone com metadados de moradia, regi?o e features', () => {
    const input = {
      id: 'm1',
      modulo: 'moradia',
      categoria: 'moradia',
      titulo: 'Quarto no setor norte',
      descricao: 'Aceita pets e fica no norte',
      tags: ['pets', 'norte'],
      created_at: '2026-04-20T12:00:00.000Z',
      metadata: {},
    };
    const output = pres().applyPresentationRules(input);
    expect(output).not.toBe(input);
    expect(output._kcCtaText).toBe('Ver Mais');
    expect(output._kcRelativeTime).toBeTruthy();
    expect(output.regionLabel).toBe('Setor Norte');
    expect(output.housingFeatureKeys).toContain('aceita-pets');
    expect(output._kcHousingInfo.typeKey).toBe('quarto');
    expect(output._kcCategorySegments).toEqual(expect.arrayContaining([
      'Moradia', 'Quarto', 'Setor Norte',
    ]));
  });

  test('aplica badge e localiza??o para achados e perdidos', () => {
    const output = pres().applyPresentationRules({
      modulo: 'achados-perdidos',
      categoria: 'perdido',
      descricao: 'Item perdido na biblioteca',
      tags: ['biblioteca'],
    });
    expect(output._kcBadgeText).toBe('Perdido');
    expect(output._kcHidePrice).toBe(true);
    expect(output.lostFoundLocationLabel).toBe('Biblioteca Central');
    expect(output.subcategoriaLabel).toBe('Biblioteca Central');
  });

  test('preenche subcategoria de oportunidades a partir da ?rea resolvida', () => {
    const output = pres().applyPresentationRules({
      modulo: 'oportunidades',
      categoria: 'vagas',
      tags: ['tech'],
      titulo: 'Est?gio de tecnologia',
    });
    expect(output.subcategoriaKey).toBe('tecnologia');
    expect(output.subcategoriaLabel).toBe('Tecnologia');
  });

  test('define categoria de eventos por infer?ncia de tags', () => {
    const output = pres().applyPresentationRules({
      modulo: 'eventos',
      tags: ['workshop'],
      titulo: 'Workshop acad?mico',
    });
    expect(output.categoriaKey).toBe('academico');
    expect(output._kcAuthorPrefix).toBe('Organizado por');
    expect(output._kcVerifiedTag).toBe('');
  });

  test('marca posts verificados com tag oficial em eventos', () => {
    const output = pres().applyPresentationRules({
      modulo: 'eventos',
      categoria: 'cultural',
      authorVerified: true,
    });
    expect(output._kcVerifiedTag).toBe('@oficial');
  });
});

describe('getDisplayMarkerTags', () => {
  test('retorna features de moradia com emoji', () => {
    const tags = pres().getDisplayMarkerTags({
      modulo: 'moradia',
      categoria: 'quarto',
      titulo: 'Quarto no setor norte',
      descricao: 'Aceita pets',
      tags: ['pets', 'norte'],
    });
    expect(tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'moradia:aceita-pets', label: 'Aceita Pets', emoji: '\u{1F43E}' }),
    ]));
  });

  test('retorna localiza??o para achados e perdidos', () => {
    const tags = pres().getDisplayMarkerTags({
      modulo: 'achados-perdidos',
      categoria: 'perdido',
      tags: ['biblioteca'],
    });
    expect(tags[0]).toEqual(expect.objectContaining({ key: 'achados:biblioteca-central', label: 'Biblioteca Central', emoji: '\u{1F4DA}' }));
  });

  test('respeita limite de retorno', () => {
    const tags = pres().getDisplayMarkerTags({
      modulo: 'moradia',
      categoria: 'quarto',
      titulo: 'Quarto no setor norte',
      descricao: 'Aceita pets',
      tags: ['pets', 'norte'],
    }, { limit: 1 });
    expect(tags).toHaveLength(1);
  });
});

describe('renderMarkerTags', () => {
  test('renderiza HTML com wrapper e spans', () => {
    const html = pres().renderMarkerTags([{ key: 'x', label: 'Biblioteca <Central>', emoji: '\u{1F4DA}' }]);
    expect(html).toContain('<div class="kc-card__tag-row">');
    expect(html).toContain('kc-card__tag-emoji');
    expect(html).toContain('Biblioteca &lt;Central&gt;');
  });

  test('retorna vazio quando a lista n?o tem labels v?lidos', () => {
    expect(pres().renderMarkerTags([{ key: "x" }])).toBe("");
  });
});

describe('renderPostCard', () => {
  test('renderiza article.kc-card com autor vindo da KCAPI', () => {
    window.KCAPI = {
      getAuthorById(id) {
        if (id !== 'author-1') return null;
        return { name: 'Maria Clara', avatar: 'https://example.com/avatar.png' };
      },
    };

    const html = pres().renderPostCard({
      id: 'post-1',
      authorId: 'author-1',
      modulo: 'moradia',
      categoria: 'moradia',
      titulo: 'Quarto no setor norte',
      descricao: '**Perto** da UFG e aceita pets',
      tags: ['pets', 'norte'],
      imagens: ['https://example.com/photo.jpg'],
      votos: 7,
      comentarios: 3,
      rating: 4.5,
      ratingCount: 2,
      created_at: '2026-04-20T12:00:00.000Z',
    });

    expect(html).toContain('<article class="kc-card');
    expect(html).toContain('Maria Clara');
    expect(html).toContain('<strong>Perto</strong>');
    expect(html).toContain('data-module="moradia"');
    expect(html).toContain('data-kc-housing-region="setor-norte"');
    expect(html).toContain('Aceita Pets');
  });

  test('usa avatar padr?o quando autor n?o existe', () => {
    const html = pres().renderPostCard({
      id: 'post-2',
      modulo: 'eventos',
      categoria: 'eventos',
      tags: ['workshop'],
      titulo: 'Workshop aberto',
      descricao: 'Conte?do livre',
      comentarios: 0,
      votos: 0,
    });
    expect(html).toContain('data-testid=&quot;avatar&quot;');
    expect(html).toContain('Ver Mais');
  });

  test('marca exemplos legados e badge contextual quando presente', () => {
    const html = pres().renderPostCard({
      id: 'post-3',
      modulo: 'achados-perdidos',
      categoria: 'perdido',
      titulo: 'Carteira perdida',
      descricao: 'Na biblioteca',
      tags: ['biblioteca'],
      legacyId: 'legacy-1',
      comentarios: 1,
      votos: 2,
    });
    expect(html).toContain('kc-card--example');
    expect(html).toContain('kc-cashback-badge');
    expect(html).toContain('Biblioteca Central');
  });
});
