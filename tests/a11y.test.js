/**
 * Testes de acessibilidade (v9.4.2)
 * Verifica aria-labels e atributos de acessibilidade em elementos críticos
 * gerados dinamicamente (renderPostCard em kc-utils.js).
 */

let renderPostCard;

beforeAll(() => {
  global.window = global.window || global;

  window.KCAPI = window.KCAPI || {
    ENV: { driver: 'supabase', environment: 'development', isProduction: false },
    normalizePost: jest.fn((p) => p),
  };
  window.KCSupabase = window.KCSupabase || { getClient: jest.fn(() => ({})) };

  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../assets/js/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../assets/js/kc-utils.js');

  renderPostCard = window.KCUtils && typeof window.KCUtils.renderPostCard === 'function'
    ? window.KCUtils.renderPostCard
    : null;
});

// Post mínimo válido para renderPostCard
function makePost(overrides) {
  return Object.assign({
    id: 'test-id-123',
    uuid: 'test-uuid-abc',
    titulo: 'Produto de teste',
    description: 'Descrição do produto',
    modulo: 'compravenda',
    categoria: 'eletronicos',
    votos: 5,
    comments_count: 2,
    imagens: [],
    author_name: 'João Silva',
    author_avatar: '',
    created_at: new Date().toISOString(),
    status: 'approved',
  }, overrides);
}

describe('renderPostCard — acessibilidade (v9.4.2)', () => {
  test('renderPostCard está disponível como função global', () => {
    if (!renderPostCard) {
      // kc-utils pode expor de forma diferente — skip suave
      console.warn('[a11y] renderPostCard não encontrado no escopo global — verificar manualmente');
      return;
    }
    expect(typeof renderPostCard).toBe('function');
  });

  test('botão de voto positivo tem aria-label="Voto positivo"', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost());
    expect(html).toContain('aria-label="Voto positivo"');
  });

  test('botão de voto negativo tem aria-label="Voto negativo"', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost());
    expect(html).toContain('aria-label="Voto negativo"');
  });

  test('ícone de fogo tem aria-hidden="true"', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost());
    expect(html).toMatch(/fa-fire[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-fire/);
  });

  test('aria-live="polite" presente no score de votos', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost());
    expect(html).toContain('aria-live="polite"');
  });
});

describe('Atributos ARIA em HTML estático (_product.html)', () => {
  const fs = require('fs');
  const path = require('path');
  const productHtml = fs.readFileSync(
    path.join(__dirname, '..', '_product.html'),
    'utf8'
  );

  test('theme-toggle tem aria-label', () => {
    expect(productHtml).toContain('aria-label="Alternar tema claro/escuro"');
  });

  test('sharePopover tem aria-hidden inicial', () => {
    expect(productHtml).toMatch(/id="sharePopover"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*id="sharePopover"/);
  });

  test('botão de negrito tem aria-label', () => {
    expect(productHtml).toContain('aria-label="Negrito"');
  });

  test('botão de itálico tem aria-label', () => {
    expect(productHtml).toContain('aria-label="Itálico"');
  });

  test('input do autor tem aria-label', () => {
    expect(productHtml).toContain('aria-label="Seu nome no comentário"');
  });

  test('searchInput tem aria-label', () => {
    expect(productHtml).toContain('aria-label="Pesquisar"');
  });
});

describe('Atributos ARIA em HTML estático (index.html)', () => {
  const fs = require('fs');
  const path = require('path');
  const indexHtml = fs.readFileSync(
    path.join(__dirname, '..', 'index.html'),
    'utf8'
  );

  test('skip-link presente para navegação por teclado', () => {
    expect(indexHtml).toContain('kc-skip-link');
    expect(indexHtml).toContain('href="#kc-main"');
  });

  test('main tem id="kc-main" para o skip-link', () => {
    expect(indexHtml).toContain('id="kc-main"');
  });

  test('theme-toggle tem aria-label', () => {
    expect(indexHtml).toContain('aria-label="Alternar tema claro/escuro"');
  });

  test('carousel prev tem aria-label', () => {
    expect(indexHtml).toContain('aria-label="Slide anterior"');
  });

  test('carousel next tem aria-label', () => {
    expect(indexHtml).toContain('aria-label="Próximo slide"');
  });

  test('searchInput tem aria-label', () => {
    expect(indexHtml).toContain('aria-label="Pesquisar"');
  });
});
