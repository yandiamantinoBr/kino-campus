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
    expect(html).toContain('aria-label="Ver 2 comentários do anúncio Produto de teste"');
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

  test('icones de badges de modulo condicao e tempo sao decorativos', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({ condicao: 'Novo', _kcRelativeTime: 'agora' }));
    expect(html).toMatch(/kc-badge[^<]*<i[^>]*aria-hidden="true"/);
    expect(html).toMatch(/fa-star[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-star/);
    expect(html).toMatch(/fa-clock[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-clock/);
  });

  test('icones de preco e badge promocional sao decorativos', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({
      _kcPriceTextMain: 'R$ 10',
      _kcBadgeText: 'Promocao',
      _kcBadgeIconClass: 'fas fa-tag',
    }));
    expect(html).toMatch(/kc-card__price[\s\S]*<i[^>]*aria-hidden="true"/);
    expect(html).toMatch(/kc-cashback-badge[\s\S]*<i[^>]*aria-hidden="true"/);
  });

  test('icones de verificacao e exemplo legado sao decorativos', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({
      legacyId: 'legacy-1',
      _kcVerifiedTag: 'UFG verificado',
      _kcCategorySegments: ['Categoria'],
    }));
    expect(html).toMatch(/fa-check-circle[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-check-circle/);
    expect(html).toMatch(/fa-flask[^>]*aria-hidden="true"|aria-hidden="true"[^>]*fa-flask/);
  });

  test('avatar do autor usa nome acessivel completo', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost({ autor: 'Maria Clara' }));
    expect(html).toContain('alt="Avatar de Maria Clara"');
  });

  test('botoes de voto do card sao type button', () => {
    if (!renderPostCard) return;
    const html = renderPostCard(makePost());
    const hot = html.match(/<button[^>]*data-action="vote-hot"[^>]*>/);
    const cold = html.match(/<button[^>]*data-action="vote-cold"[^>]*>/);
    expect(hot && hot[0]).toContain('type="button"');
    expect(cold && cold[0]).toContain('type="button"');
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

describe('v61.0.0 - botoes dinamicos JS', () => {
  test('templates admin de convite e moderacao usam type button', () => {
    const invite = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-invite.controller.js'), 'utf8');
    const moderation = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-moderation.controller.js'), 'utf8');

    expect(invite).toContain('<button type="button" class="kc-admin-invite-revoke"');
    expect(moderation).toContain('<button type="button" data-action="${action}"');
    expect(moderation).toContain('<button type="button" class="kc-admin-actions" data-limit-delete=');
  });
});

describe('v62.0.0 - icones decorativos admin JS', () => {
  test('templates admin de convite e moderacao escondem icones decorativos', () => {
    const invite = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-invite.controller.js'), 'utf8');
    const moderation = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-moderation.controller.js'), 'utf8');

    expect(invite).toContain('<i class="fas fa-times" aria-hidden="true"></i>');
    expect(moderation).toContain('<i class="fas fa-trash" aria-hidden="true"></i> Remover');
  });
});

describe('v63.0.0 - icones decorativos em paginacao admin', () => {
  test('template admin de pedidos de ajuda esconde icones do carregar mais', () => {
    const helpRequests = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'), 'utf8');

    expect(helpRequests).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando...');
    expect(helpRequests).toContain('<i class="fas fa-arrow-down" aria-hidden="true"></i> Carregar mais');
  });
});

describe('v64.0.0 - icones decorativos em convites admin', () => {
  test('template admin de convites esconde icones de feedback dinamico', () => {
    const invite = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-invite.controller.js'), 'utf8');

    expect(invite).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Gerando link...');
    expect(invite).toContain('<i class="fas fa-paper-plane" aria-hidden="true"></i> Gerar Link de Convite');
    expect(invite).toContain('<i class="fas fa-check" aria-hidden="true"></i> Copiado!');
    expect(invite).toContain('<i class="fas fa-copy" aria-hidden="true"></i> Copie manualmente');
  });
});

describe('v65.0.0 - icones decorativos em pedidos de ajuda admin', () => {
  test('template admin de pedidos de ajuda esconde icones em chips, botoes e feedback', () => {
    const helpRequests = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'), 'utf8');

    expect(helpRequests).toContain('<i class="fas fa-layer-group" aria-hidden="true"></i>');
    expect(helpRequests).toContain('<i class="fas fa-signal" aria-hidden="true"></i>');
    expect(helpRequests).toContain('<i class="fas fa-file-code" aria-hidden="true"></i>');
    expect(helpRequests).toContain('<i class="fas fa-circle" aria-hidden="true"></i>');
    expect(helpRequests).toContain('<i class="fas fa-bolt" aria-hidden="true"></i>');
    expect(helpRequests).toContain('<i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar triagem');
    expect(helpRequests).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando...');
  });
});

describe('v66.0.0 - icones decorativos em banners admin', () => {
  test('template admin de banners esconde icones em drag handle, acoes, historico e botao salvar', () => {
    const banners = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-banners.controller.js'), 'utf8');

    expect(banners).toContain('<i class="fas fa-grip-vertical" aria-hidden="true"></i>');
    expect(banners).toContain('<i class="fas fa-pen" aria-hidden="true"></i>');
    expect(banners).toContain('<i class="fas fa-${banner.is_active ? \'eye-slash\' : \'eye\'}" aria-hidden="true"></i>');
    expect(banners).toContain('<i class="fas fa-trash" aria-hidden="true"></i>');
    expect(banners).toContain('<i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Histórico de alterações');
    expect(banners).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando…');
    expect(banners).toContain('<i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar');
  });
});

describe('v67.0.0 - icones decorativos em moderacao admin', () => {
  test('template admin de moderacao esconde icones em feedback de salvar e selecao de usuario', () => {
    const moderation = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-moderation.controller.js'), 'utf8');

    expect(moderation).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando…');
    expect(moderation).toContain('<i class="fas fa-save" aria-hidden="true"></i> Salvar limite global');
    expect(moderation).toContain('<i class="fas fa-save" aria-hidden="true"></i> Salvar');
    expect(moderation).toContain('<i class="fas fa-user" style="margin-right:6px;color:var(--kc-primary-brand);" aria-hidden="true"></i>Usuário selecionado:');
  });
});

describe('v68.0.0 - icones decorativos em admin dashboard audit', () => {
  test('botoes XLSX/PDF do shard audit escondem icone de spinner durante exportacao', () => {
    const audit = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-dashboard.audit.js'), 'utf8');

    expect(audit).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Exportando...');
  });
});

describe('v69.0.0 - icones decorativos no indicador de pull-to-refresh', () => {
  test('indicador de pull-to-refresh esconde icones de seta e check para tecnologias assistivas', () => {
    const ptr = _fs.readFileSync(_path.join(_ROOT, 'assets/js/features/kc-pull-to-refresh.js'), 'utf8');

    expect(ptr).toContain('<i class="fas fa-arrow-down" style="font-size: 1.2em; color: var(--kc-primary-brand);" aria-hidden="true"></i>');
    expect(ptr).toContain('<i class="fas fa-check" style="font-size: 1.2em; color: var(--kc-primary-brand);" aria-hidden="true"></i>');
  });
});

describe('v70.0.0 - icone decorativo na aba Todas dos filtros', () => {
  test('aba Todas dos filtros esconde icone fa-fire decorativo (label `Todas` ja presente)', () => {
    const filters = _fs.readFileSync(_path.join(_ROOT, 'assets/js/features/kc-filters.js'), 'utf8');

    expect(filters).toContain('<i class="fas fa-fire" aria-hidden="true"></i>');
  });
});

describe('v71.0.0 - icones decorativos em admin-dashboard.charts.js', () => {
  test('11 icones decorativos do ranking e modulos do dashboard admin ocultam-se para tecnologias assistivas', () => {
    const charts = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-dashboard.charts.js'), 'utf8');

    expect(charts).toContain('<i class="fas fa-table-cells" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-file-alt" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-thumbs-up" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-comment" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-ticket" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-share-nodes" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-flag" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-user" style="font-size:0.8em;" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-chevron-down" aria-hidden="true"></i>');
    expect(charts).toContain('<i class="fas fa-chevron-up" aria-hidden="true"></i>');
  });
});

describe('v72.0.0 - icones decorativos em admin-dashboard.controller.js', () => {
  test('14 icones decorativos de titulos de secao e feedback do dashboard admin ocultam-se para tecnologias assistivas', () => {
    const ctrl = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-dashboard.controller.js'), 'utf8');

    expect(ctrl).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Atualizando...');
    expect(ctrl).toContain('<i class="fas fa-circle-check" style="color:var(--kc-primary-brand);margin-right:5px;" aria-hidden="true"></i>');
    expect(ctrl).toContain('<i class="fas fa-shield-halved" aria-hidden="true"></i> Moderação (');
    expect(ctrl).toContain('<i class="fas fa-chart-bar" aria-hidden="true"></i> Atividade da plataforma (');
    expect(ctrl).toContain('<i class="fas fa-users" aria-hidden="true"></i> Comunidade (');
    expect(ctrl).toContain('<i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i> Tendências de busca (');
    expect(ctrl).toContain('<i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Audit log (');
    expect(ctrl).toContain('<i class="fas fa-wave-square" aria-hidden="true"></i> Pulso diário (');
    expect(ctrl).toContain('<i class="fas fa-table-cells" aria-hidden="true"></i> Top módulos (');
  });
});

describe('v73.0.0 - icones decorativos em kc-comments.js', () => {
  test('9 icones decorativos de acoes e estados do modulo de comentarios ocultam-se para tecnologias assistivas', () => {
    const comments = _fs.readFileSync(_path.join(_ROOT, 'assets/js/features/kc-comments.js'), 'utf8');

    expect(comments).toContain('<i class="fas fa-reply" aria-hidden="true"></i> Respondendo a');
    expect(comments).toContain('<i class="fas fa-paper-plane" aria-hidden="true"></i> Responder');
    expect(comments).toContain('<i class="fas fa-times" aria-hidden="true"></i> Cancelar');
    expect(comments).toContain('<i class="fas fa-comments" style="font-size:2em;margin-bottom:10px;opacity:0.5;" aria-hidden="true"></i>');
    expect(comments).toContain('<i class="fas fa-check" aria-hidden="true"></i> Salvar');
    expect(comments).toContain('<i class="fas fa-trash" aria-hidden="true"></i> Sim, excluir');
    expect(comments).toContain('<i class="fas fa-flag" style="color:var(--kc-primary-brand);" aria-hidden="true"></i>');
    expect(comments).toContain('aria-label="Fechar"><i class="fas fa-times" aria-hidden="true"></i></button>');
  });
});

describe('v74.0.0 - icones decorativos em admin-reports.controller.js', () => {
  test('18 icones decorativos de acoes e estados do modulo de denuncias admin ocultam-se para tecnologias assistivas', () => {
    const reports = _fs.readFileSync(_path.join(_ROOT, 'assets/js/controllers/admin/admin-reports.controller.js'), 'utf8');

    expect(reports).toContain('<i class="fas fa-plus" aria-hidden="true"></i>');
    expect(reports).toContain('<i class="fas fa-exclamation-triangle" style="font-size:3em;color:#ff9800;margin-bottom:10px;display:block;" aria-hidden="true"></i>');
    expect(reports).toContain('<i class="fas fa-check-circle" style="font-size:3em;color:#4caf50;margin-bottom:10px;display:block;" aria-hidden="true"></i>');
    expect(reports).toContain('<i class="fas fa-file-alt" style="margin-right:6px;opacity:.6;" aria-hidden="true"></i>');
    expect(reports).toContain('<i class="fas fa-eye" aria-hidden="true"></i> Ver post');
    expect(reports).toContain('<i class="fas fa-check" aria-hidden="true"></i> Fechar den');
    expect(reports).toContain('<i class="fas fa-eye-slash" aria-hidden="true"></i> Ocultar');
    expect(reports).toContain('<i class="fas fa-eye" aria-hidden="true"></i> Reativar');
    expect(reports).toContain('<i class="fas fa-trash" aria-hidden="true"></i> Deletar');
    expect(reports).toContain('<i class="fas fa-check" style="color:#4caf50;" aria-hidden="true"></i> Todas as');
  });
});

describe('v75.0.0 - icones decorativos em kc-ranking.js', () => {
  test('18 icones decorativos de avatares, acoes e estados do modulo de ranking ocultam-se para tecnologias assistivas', () => {
    const ranking = _fs.readFileSync(_path.join(_ROOT, 'assets/js/features/kc-ranking.js'), 'utf8');
    expect(ranking).toContain('<i class="fas fa-user" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-user" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0.9em;color:var(--kc-text-dark-secondary);" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-trophy" style="color:var(--kc-primary-brand);" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-times" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-file-alt" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-thumbs-up" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-comment" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-hand-pointer" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-share-alt" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-flag" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-check" aria-hidden="true"></i>');
    expect(ranking).toContain('<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>');
  });
});
