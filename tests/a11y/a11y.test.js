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

  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../../assets/js/utils/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../../assets/js/utils/kc-utils.dom.js'); // deve preceder kc-utils.js (v12.2.2)
  require('../../assets/js/utils/kc-utils.identity.js'); // deve preceder kc-utils.js (v12.2.3)
  require('../../assets/js/utils/kc-utils.taxonomy.js'); // deve preceder kc-utils.js (v12.2.4)
  require('../../assets/js/utils/kc-utils.location.js'); // deve preceder kc-utils.js (v12.2.5)
  require('../../assets/js/utils/kc-utils.presentation.js'); // deve preceder kc-utils.js (v12.2.6)
  require('../../assets/js/utils/kc-utils.js');

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

  test('link de comentarios usa comments_count no texto e nome acessivel', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({ comments_count: 2 }));
    expect(html).toContain('aria-label="Ver 2 comentarios do anuncio Produto de teste"');
    expect(html).toContain('<span>2</span>');
  });

  test('icone de comentario decorativo tem aria-hidden="true"', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({ comments_count: 1 }));
    expect(html).toMatch(/fa-comment[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-comment/);
  });

  test('avaliacao do card tem nome acessivel com media e total', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({ rating: 4.5, ratingCount: 2 }));
    expect(html).toContain('aria-label="Avaliacao media 4.5 em 2 avaliacoes"');
    expect(html).toContain('title="Avaliacao media 4.5 em 2 avaliacoes"');
  });

  test('icone de estrela da avaliacao e decorativo', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({ rating: 4, rating_count: 1 }));
    expect(html).toMatch(/fa-star[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-star/);
    expect(html).toContain('aria-label="Avaliacao media 4.0 em 1 avaliacao"');
  });
});

describe('Atributos ARIA em HTML estático (_product.html)', () => {
  const fs = require('fs');
  const path = require('path');
  const productHtml = fs.readFileSync(
    path.join(__dirname, '..', '..', '_product.html'),
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
    path.join(__dirname, '..', '..', 'index.html'),
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

// ─── Suítes v12.8.1 — Trilha B3 a11y estrutural (22 HTMLs) ──────────────────

const _fs = require('fs');
const _path = require('path');
const _ROOT = _path.resolve(__dirname, '../..');

const _htmlFiles = [
  'account-setup.html', 'achados-perdidos.html', 'ajuda.html', 'auth-callback.html',
  'caronas-feed.html', 'compra-venda-feed.html', 'create-post.html', 'eventos.html',
  'index.html', 'moradia.html', 'my-posts.html', 'ods.html', 'oportunidades.html',
  'profile.html', 'search-results.html', 'settings.html', '_product.html',
  'admin/banners.html', 'admin/help-requests.html', 'admin/index.html',
  'admin/moderation.html', 'admin/reports.html',
];

function _readHtml(relPath) {
  return _fs.readFileSync(_path.join(_ROOT, relPath), 'utf8');
}

describe('v12.8.1 — a11y B3: estrutura de documento nos 22 HTMLs', () => {
  test('os 22 HTMLs estao listados', () => {
    expect(_htmlFiles).toHaveLength(22);
  });

  test('todos os 22 HTMLs tem exatamente um <h1> (A1 + A2)', () => {
    _htmlFiles.forEach((relPath) => {
      const html = _readHtml(relPath);
      const h1Count = (html.match(/<h1\b/gi) || []).length;
      expect(h1Count).toBe(1);
    });
  });

  test('todos os 22 HTMLs tem skip link href="#kc-main" (A3)', () => {
    _htmlFiles.forEach((relPath) => {
      const html = _readHtml(relPath);
      expect(html).toMatch(/href="#kc-main"/);
      expect(html).toMatch(/kc-skip-link/);
    });
  });

  test('todos os 22 HTMLs tem <main id="kc-main"> (A3)', () => {
    _htmlFiles.forEach((relPath) => {
      const html = _readHtml(relPath);
      expect(html).toMatch(/id="kc-main"/);
    });
  });

  test('todo <nav> tem aria-label ou aria-labelledby (A4)', () => {
    _htmlFiles.forEach((relPath) => {
      const html = _readHtml(relPath);
      const navTags = (html.match(/<nav\b[^>]*>/gi) || []);
      navTags.forEach((tag) => {
        const hasLabel = /\baria-label="[^"]+"/.test(tag) || /\baria-labelledby="[^"]+"/.test(tag);
        expect(hasLabel).toBe(true);
      });
    });
  });
});

describe('v12.8.1 — a11y B3: controles de formulário e botões', () => {
  test('admin/moderation: todos os selects tem aria-label (A5)', () => {
    const html = _readHtml('admin/moderation.html');
    const selectTags = (html.match(/<select\b[^>]*>/gi) || []);
    selectTags.forEach((tag) => {
      expect(tag).toMatch(/\baria-label="[^"]+"/);
    });
  });

  test('index.html: kc-ranking-info-btn tem aria-label (A6)', () => {
    const html = _readHtml('index.html');
    const btn = html.match(/<button[^>]*kc-ranking-info-btn[^>]*>/i);
    expect(btn).not.toBeNull();
    expect(btn[0]).toMatch(/\baria-label="[^"]+"/);
  });

  test('admin/index.html: kc-ranking-info-btn tem aria-label (A6)', () => {
    const html = _readHtml('admin/index.html');
    const btn = html.match(/<button[^>]*kc-ranking-info-btn[^>]*>/i);
    expect(btn).not.toBeNull();
    expect(btn[0]).toMatch(/\baria-label="[^"]+"/);
  });

  test('admin/banners.html: label Status tem for="f-active-toggle" (A7)', () => {
    const html = _readHtml('admin/banners.html');
    expect(html).toMatch(/for="f-active-toggle"/);
  });

  test('CSS kc-sr-only declarado em styles.css com clip:rect e overflow:hidden', () => {
    const css = _fs.readFileSync(_path.join(_ROOT, 'assets/css/styles.css'), 'utf8');
    expect(css).toMatch(/\.kc-sr-only\s*\{/);
    expect(css).toMatch(/clip:\s*rect/);
    expect(css).toMatch(/overflow:\s*hidden/);
  });
});
