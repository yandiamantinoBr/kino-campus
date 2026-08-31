/**
 * @file product.render.test.js
 * @description Static contract tests for product.render.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.render.js');
const PAGE = path.resolve(__dirname, '../../_product.html');
const LIFECYCLE_SRC = path.resolve(__dirname, '../../assets/js/shared/kc-post-lifecycle.shared.js');
const lifecycle = require(LIFECYCLE_SRC);
const lifecycleSource = fs.readFileSync(LIFECYCLE_SRC, 'utf8');

function extractDeadlinePaths(content) {
  const match = String(content).match(/var DEADLINE_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  if (!match) throw new Error('DEADLINE_PATHS_NOT_FOUND');
  return Array.from(match[1].matchAll(/'([^']+)'/g), (entry) => entry[1]);
}

const DEADLINE_ALIASES = extractDeadlinePaths(lifecycleSource);
const DEADLINE_CASES = DEADLINE_ALIASES.flatMap((alias) => [
  { alias, placement: 'root' },
  { alias, placement: 'metadata' },
]);
const TECHNICAL_EXPIRY_ALIASES = [
  'activeUntil', 'active_until', 'expiresAt', 'expires_at', 'validUntil', 'valid_until',
  'validThrough', 'data_encerramento', 'expirationDate', 'expiration_date',
  'dates.activeUntil', 'dates.active_until', 'dates.expiresAt', 'dates.expires_at',
  'dates.validUntil', 'dates.valid_until',
];
const TECHNICAL_EXPIRY_CASES = TECHNICAL_EXPIRY_ALIASES.flatMap((alias) => [
  { alias, placement: 'root' },
  { alias, placement: 'metadata' },
]);
const SEMANA_FILOSOFIA_FIXTURE = {
  id: 'ce24a542-294c-4048-b0ea-2f2b4a435fe2',
  title: 'XXX Semana de Filosofia da FAFIL/UFG: inscrições para ouvintes',
  module: 'eventos',
  expires_at: '2026-08-15T02:59:59.999+00:00',
  metadata: {
    applicationPurpose: 'listener_registration',
    application_episode: 'listener_registration',
    application_episodes: [
      { deadline: '2026-07-15', purpose: 'submission', status: 'closed' },
      { deadline: null, purpose: 'listener_registration', status: 'open' },
    ],
    deadline_date: null,
    dates: {
      applicationDeadline: null,
      applicationPurpose: 'listener_registration',
      applicationStatus: 'open',
      eventEndsAt: '2026-08-14',
      eventStartsAt: '2026-08-11',
      eventStatus: 'ongoing',
      submissionDeadline: '2026-07-15',
      submissionStatus: 'closed',
    },
  },
};
const PROFMAT_FIXTURE = {
  id: 'd7e177a2-b48e-441f-adb3-ab4b4c7a17df',
  title: 'IV Workshop Online do PROFMAT nos dias 17, 18 e 19 de setembro de 2026',
  module: 'eventos',
  expires_at: '2026-09-20T02:59:59.999+00:00',
  metadata: {
    applicationPurpose: 'registration',
    application_episodes: [
      { deadline: '2026-08-09', purpose: 'submission', status: 'closed' },
      { deadline: '2026-09-15', purpose: 'registration', status: 'open' },
    ],
    deadline_date: '2026-09-15',
    dates: {
      applicationDeadline: '2026-09-15',
      applicationPurpose: 'registration',
      applicationStatus: 'open',
      submissionDeadline: '2026-08-09',
      submissionStatus: 'closed',
    },
  },
};
const SIPACV_FIXTURE = {
  id: '3d500db4-bb75-4f09-ac0b-a9d0ec6123a4',
  title: 'IX SIPACV — Trans-borde: 13 a 16/10 na UFG',
  module: 'eventos',
  expires_at: '2026-10-17T02:59:59.999+00:00',
  metadata: {
    applicationPurpose: 'submission',
    application_episodes: [
      { deadline: '2026-08-20', purpose: 'submission', status: 'open' },
      { deadline: '2026-10-10', purpose: 'listener_registration', status: 'scheduled' },
    ],
    deadline_date: '2026-08-20',
    dates: {
      applicationDeadline: '2026-08-20',
      applicationPurpose: 'submission',
      applicationStatus: 'open',
      listenerRegistrationDeadline: '2026-10-10',
      listenerRegistrationStatus: 'scheduled',
      submissionDeadline: '2026-08-20',
      submissionStatus: 'open',
    },
  },
};
let source;
let page;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
  page = fs.readFileSync(PAGE, 'utf8');
});

function renderDeadlinePresentation(post) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="kc-product-details"></div>
    <div id="badges"></div>
    <section id="specsBlock"><div id="specsGrid"></div></section>
  </body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/_product.html',
  });

  dom.window.KCPostLifecycle = lifecycle;
  dom.window.eval(source);
  dom.window._KCProduct.render.setBadges(post);
  dom.window._KCProduct.render.setSpecs(post);

  const result = {
    badges: dom.window.document.getElementById('badges').textContent,
    specs: dom.window.document.getElementById('specsGrid').textContent,
    badgesHtml: dom.window.document.getElementById('badges').innerHTML,
    specsHtml: dom.window.document.getElementById('specsGrid').innerHTML,
  };
  dom.window.close();
  return result;
}

describe('source-bound self-paced availability presentation', () => {
  function course(checked = Date.now() - 1000) {
    return {
      module: 'oportunidades', modulo: 'oportunidades', categoria: 'cursos-capacitacoes',
      expires_at: new Date(checked + 259200000).toISOString(),
      metadata: {
        deadline_date: '',
        validity: {
          contract: 'cadu-self-paced-course-v1', mode: 'no_final_deadline_informed',
          sourceRegistryId: 'web.ufg.iptsp', sourceUrl: 'https://iptsp.ufg.br/n/203499',
          courseKey: 'leptospirosetdtp:1365',
          evidenceDigest: '5e6c4dc953a90ff02f664d89a59bb75655a827d08f3663bc02fe2ab3f19ee223',
          checkedAt: new Date(checked).toISOString(), nextCheckAt: new Date(checked + 86400000).toISOString(),
          verificationExpiresAt: new Date(checked + 259200000).toISOString(),
        },
      },
    };
  }
  test('labels the missing final deadline without promoting technical expiry to a deadline', () => {
    const result = renderDeadlinePresentation(course());
    expect(result.badges).toContain('Sem prazo final informado');
    expect(result.badges).not.toMatch(/Prazo: \d/);
    expect(result.specs).toContain('Conferida em');
    expect(result.specs).toContain('sujeita a vagas e às regras do curso');
    expect(result.specs).not.toMatch(/permanente|para sempre|indefinidamente/);
  });
  test('past recheck time is visible and is not a guarantee of current availability', () => {
    const result = renderDeadlinePresentation(course(Date.now() - 25 * 3600000));
    expect(result.specs).toContain('nova conferência necessária');
  });
  test('unverified, wrong-course and malformed metadata do not gain the label', () => {
    for (const patch of [
      { contract: 'other' }, { courseKey: 'another-course' }, { checkedAt: 'invalid' },
      { evidenceDigest: 'a'.repeat(64) }, { verificationExpiresAt: '2099-01-01T00:00:00.000Z' },
    ]) {
      const post = course(); Object.assign(post.metadata.validity, patch);
      expect(renderDeadlinePresentation(post).badges).not.toContain('Sem prazo final informado');
    }
    expect(renderDeadlinePresentation({ module: 'oportunidades', metadata: {} }).badges).not.toContain('Sem prazo final informado');
    const wrongModule = course(); wrongModule.modulo = wrongModule.module = 'eventos';
    expect(renderDeadlinePresentation(wrongModule).badges).not.toContain('Sem prazo final informado');
  });
  test('an actual declared deadline still takes priority in legacy display', () => {
    const post = course(); post.metadata.deadline_date = '2027-08-01';
    const result = renderDeadlinePresentation(post);
    expect(result.badges).toContain('Prazo:');
    expect(result.badges).not.toContain('Sem prazo final informado');
  });
});

function renderGallery(post) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="kc-gallery-main">
      <img id="mainImage" style="display:none;" />
      <div id="emojiCover">✨</div>
    </div>
    <div id="thumbnails" style="display:none;"></div>
  </body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/_product.html',
  });

  dom.window.eval(source);
  dom.window._KCProduct.render.setGallery(post);

  const result = {
    mainSrc: dom.window.document.getElementById('mainImage').getAttribute('src'),
    mainDisplay: dom.window.document.getElementById('mainImage').style.display,
    emojiDisplay: dom.window.document.getElementById('emojiCover').style.display,
    thumbsDisplay: dom.window.document.getElementById('thumbnails').style.display,
    thumbnails: Array.from(dom.window.document.querySelectorAll('#thumbnails .kc-thumbnail')).map((img) => ({
      src: img.getAttribute('data-full-src'),
      active: img.classList.contains('active'),
    })),
    clickThumbnail: function (index) {
      const thumbs = dom.window.document.querySelectorAll('#thumbnails .kc-thumbnail');
      if (thumbs[index]) thumbs[index].click();
      return dom.window.document.getElementById('mainImage').getAttribute('src');
    },
    thumbnailActive: function (index) {
      const thumbs = dom.window.document.querySelectorAll('#thumbnails .kc-thumbnail');
      return !!(thumbs[index] && thumbs[index].classList.contains('active'));
    },
    close: function () { dom.window.close(); },
  };

  return result;
}

function renderBreadcrumb(post) {
  const dom = new JSDOM('<!doctype html><html><body><div id="breadcrumb"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'http://localhost/_product.html',
  });

  dom.window.eval(source);
  dom.window._KCProduct.render.setBreadcrumb(post);
  const breadcrumb = dom.window.document.getElementById('breadcrumb');
  const result = {
    html: breadcrumb.innerHTML,
    segments: breadcrumb.querySelectorAll(':scope > .kc-breadcrumb-segment').length,
    directChevrons: breadcrumb.querySelectorAll(':scope > .fa-chevron-right').length,
    images: breadcrumb.querySelectorAll('img').length,
    current: breadcrumb.querySelector('[aria-current="page"]')?.textContent || '',
  };
  dom.window.close();
  return result;
}

function setPath(target, pathValue, value) {
  const parts = String(pathValue).split('.');
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }
    current[part] = current[part] && typeof current[part] === 'object' ? current[part] : {};
    current = current[part];
  });
}

function postWithCandidate(alias, placement, value = '2026-08-20') {
  const post = {
    modulo: 'oportunidades',
    metadata: {},
    expires_at: '2099-12-31T23:59:59.000Z',
  };
  setPath(placement === 'root' ? post : post.metadata, alias, value);
  return post;
}

describe('product.render.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE sem imports', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
    expect(source).toContain("'use strict';");
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });

  test('registra window._KCProduct.render', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
    expect(source).toContain('window._KCProduct.render = Object.freeze({');
  });

  test('pagina usa o cache-buster atualizado do renderizador', () => {
    const lifecycleTag = 'assets/js/shared/kc-post-lifecycle.shared.js?v=8.6.1';
    const renderTag = 'assets/js/controllers/public/product.render.js?v=8.6.7';
    expect(page.split(lifecycleTag)).toHaveLength(2);
    expect(page.split(renderTag)).toHaveLength(2);
    expect(page.indexOf(lifecycleTag)).toBeLessThan(page.indexOf(renderTag));
  });
});

describe('product.render.js - breadcrumb responsivo', () => {
  test('mantem cada separador junto ao destino e identifica a pagina atual', () => {
    const rendered = renderBreadcrumb({
      modulo: 'oportunidades',
      _kcModulePage: 'oportunidades.html',
      categoria: 'Processos seletivos',
      titulo: 'PPGACV/UFG oferece 28 vagas para mestrado e doutorado',
    });

    expect(rendered.segments).toBe(4);
    expect(rendered.directChevrons).toBe(0);
    expect(rendered.current).toBe('PPGACV/UFG oferece 28 vagas para mestrado e doutorado');
    expect(rendered.html).toContain('href="oportunidades.html"');
    expect(rendered.html).toContain('aria-hidden="true"');
  });

  test('preserva escape do titulo dentro do segmento atual', () => {
    const rendered = renderBreadcrumb({ titulo: '<img src=x onerror=alert(1)>' });

    expect(rendered.current).toBe('<img src=x onerror=alert(1)>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.images).toBe(0);
  });
});

describe('product.render.js - galeria acessivel', () => {
  test('imagem principal e miniaturas recebem alt com titulo da publicacao', () => {
    expect(source).toContain("var title = String(post.titulo || post.title || 'publicação').trim() || 'publicação';");
    expect(source).toContain("var imageAlt = 'Imagem da publicação: ' + title;");
    expect(source).toContain('mainImg.alt = imageAlt;');
    expect(source).toContain("img.alt = 'Miniatura ' + (idx + 1) + ' de ' + title;");
    expect(source).toContain('mainImg.alt = img.alt;');
  });

  test('capa permanece como primeira miniatura ativa da galeria', () => {
    const gallery = renderGallery({
      titulo: 'Anúncio com capa',
      imagens: [
        'https://cdn.example/cover.jpg',
        'https://cdn.example/second.jpg',
        'https://cdn.example/third.jpg',
      ],
    });

    expect(gallery.mainSrc).toBe('https://cdn.example/cover.jpg');
    expect(gallery.mainDisplay).toBe('block');
    expect(gallery.emojiDisplay).toBe('none');
    expect(gallery.thumbsDisplay).toBe('grid');
    expect(gallery.thumbnails).toHaveLength(3);
    expect(gallery.thumbnails[0]).toEqual({ src: 'https://cdn.example/cover.jpg', active: true });
    expect(gallery.thumbnails[1]).toEqual({ src: 'https://cdn.example/second.jpg', active: false });
    expect(gallery.clickThumbnail(1)).toBe('https://cdn.example/second.jpg');
    expect(gallery.thumbnailActive(1)).toBe(true);
    expect(gallery.thumbnailActive(0)).toBe(false);
    gallery.close();
  });

  test('galeria com uma unica imagem nao abre faixa redundante de miniaturas', () => {
    const gallery = renderGallery({
      titulo: 'Anúncio com uma imagem',
      imagens: ['https://cdn.example/cover.jpg'],
    });

    expect(gallery.mainSrc).toBe('https://cdn.example/cover.jpg');
    expect(gallery.thumbnails).toHaveLength(1);
    expect(gallery.thumbnails[0].src).toBe('https://cdn.example/cover.jpg');
    expect(gallery.thumbsDisplay).toBe('none');
    gallery.close();
  });
});

describe('product.render.js - semantica de prazo', () => {
  test('espelha exatamente a ordem DEADLINE_PATHS do lifecycle canonico', () => {
    expect(extractDeadlinePaths(source)).toEqual(DEADLINE_ALIASES);
  });

  test.each(DEADLINE_CASES)('reconhece $alias em $placement', ({ alias, placement }) => {
    const rendered = renderDeadlinePresentation(postWithCandidate(alias, placement));

    expect(rendered.badges).toContain('Prazo: 20/08/2026');
    expect(rendered.specs).toContain('Prazo20/08/2026');
    expect(rendered.badges).not.toContain('2099-12-31');
    expect(rendered.specs).not.toContain('2099-12-31');
  });

  test.each(TECHNICAL_EXPIRY_CASES)('nao apresenta expiry tecnico $alias em $placement', ({ alias, placement }) => {
    const rendered = renderDeadlinePresentation(postWithCandidate(alias, placement, '2099-12-31'));

    expect(rendered.badges).not.toContain('Prazo');
    expect(rendered.specs).not.toContain('Prazo');
    expect(rendered.badges).not.toContain('2099-12-31');
    expect(rendered.specs).not.toContain('2099-12-31');
  });

  test('evento sem prazo declarado nao apresenta expires_at como Prazo', () => {
    const rendered = renderDeadlinePresentation({
      modulo: 'eventos',
      metadata: { data_evento: '2026-09-17' },
      expires_at: '2026-09-20T03:00:00.000Z',
    });

    expect(rendered.badges).not.toContain('Prazo');
    expect(rendered.specs).not.toContain('Prazo');
    expect(rendered.specs).toContain('Data do evento17/09/2026');
  });

  test('fixture literal Semana de Filosofia nao reaproveita submissao encerrada como prazo de ouvintes', () => {
    const rendered = renderDeadlinePresentation(SEMANA_FILOSOFIA_FIXTURE);

    expect(rendered.badges).not.toContain('Prazo');
    expect(rendered.specs).not.toContain('Prazo');
    expect(rendered.badges).not.toContain('2026-07-15');
    expect(rendered.specs).not.toContain('2026-07-15');
    expect(rendered.badges).not.toContain('2026-08-15');
  });

  test.each([
    ['PROFMAT', PROFMAT_FIXTURE, '15/09/2026', '2026-08-09'],
    ['SIPACV', SIPACV_FIXTURE, '20/08/2026', '2026-10-10'],
  ])('fixture literal %s apresenta somente o prazo da fase ativa', (_name, fixture, expected, unrelated) => {
    const rendered = renderDeadlinePresentation(fixture);

    expect(rendered.badges).toContain(`Prazo: ${expected}`);
    expect(rendered.specs).toContain(`Prazo${expected}`);
    expect(rendered.badges).not.toContain(unrelated);
    expect(rendered.specs).not.toContain(unrelated);
  });

  test.each([
    ['registration', false],
    ['listener_registration', false],
    ['candidacy', false],
    ['enrollment', false],
    ['submission', true],
  ])('submissionDeadline com fase %s e aceito=%s', (applicationPurpose, accepted) => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      metadata: {
        applicationPurpose,
        dates: { applicationPurpose, submissionDeadline: '2026-08-20' },
      },
    });

    expect(rendered.badges.includes('Prazo: 20/08/2026')).toBe(accepted);
    expect(rendered.specs.includes('Prazo20/08/2026')).toBe(accepted);
  });

  test('submissionDeadline preserva fallback legado quando nenhuma fase e identificavel', () => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      metadata: { dates: { submissionDeadline: '2026-08-20' } },
    });

    expect(rendered.badges).toContain('Prazo: 20/08/2026');
    expect(rendered.specs).toContain('Prazo20/08/2026');
  });

  test('alias especifico de listener e aceito somente na fase listener_registration', () => {
    const listener = renderDeadlinePresentation({
      module: 'eventos',
      metadata: {
        applicationPurpose: 'listener_registration',
        dates: {
          applicationPurpose: 'listener_registration',
          listenerRegistrationDeadline: '2026-10-10',
          submissionDeadline: '2026-08-20',
        },
      },
    });
    const submission = renderDeadlinePresentation({
      module: 'eventos',
      metadata: {
        applicationPurpose: 'submission',
        dates: {
          applicationPurpose: 'submission',
          listenerRegistrationDeadline: '2026-10-10',
        },
      },
    });

    expect(listener.badges).toContain('Prazo: 10/10/2026');
    expect(listener.badges).not.toContain('2026-08-20');
    expect(submission.badges).not.toContain('Prazo');
  });

  test('episodio open identifica a fase mesmo sem applicationPurpose', () => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      metadata: {
        application_episodes: [
          { deadline: '2026-07-15', purpose: 'submission', status: 'closed' },
          { deadline: '2026-09-15', purpose: 'registration', status: 'open' },
        ],
        dates: { submissionDeadline: '2026-07-15' },
      },
    });

    expect(rendered.badges).toContain('Prazo: 15/09/2026');
    expect(rendered.badges).not.toContain('2026-07-15');
  });

  test('fases explicitas conflitantes falham fechadas sem escolher prazo', () => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      applicationPurpose: 'registration',
      metadata: {
        dates: {
          applicationPurpose: 'submission',
          applicationDeadline: '2026-09-15',
          submissionDeadline: '2026-08-20',
        },
      },
    });

    expect(rendered.badges).not.toContain('Prazo');
    expect(rendered.specs).not.toContain('Prazo');
  });

  test.each(['unknown', 'sale', 'expires', '<img src=x onerror=alert(1)>'])('finalidade nao canonica %s falha fechada', (applicationPurpose) => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      metadata: {
        applicationPurpose,
        dates: {
          applicationDeadline: '2026-09-15',
          submissionDeadline: '2026-08-20',
        },
      },
    });

    expect(rendered.badges).not.toContain('Prazo');
    expect(rendered.specs).not.toContain('Prazo');
    expect(rendered.badgesHtml).not.toMatch(/<img|onerror|alert\(/i);
    expect(rendered.specsHtml).not.toMatch(/<img|onerror|alert\(/i);
  });

  test('raiz vence metadata para o mesmo alias, como no lifecycle', () => {
    const rendered = renderDeadlinePresentation({
      modulo: 'oportunidades',
      applicationDeadline: '2026-08-20',
      metadata: { applicationDeadline: '2026-08-21' },
    });

    expect(rendered.badges).toContain('Prazo: 20/08/2026');
    expect(rendered.badges).not.toContain('2026-08-21');
  });

  test('ordem de aliases precede localizacao raiz ou metadata', () => {
    const rendered = renderDeadlinePresentation({
      modulo: 'oportunidades',
      application_deadline: '2026-08-21',
      metadata: { applicationDeadline: '2026-08-20' },
    });

    expect(rendered.badges).toContain('Prazo: 20/08/2026');
    expect(rendered.badges).not.toContain('2026-08-21');
  });

  test('raiz invalida e ignorada antes do metadata valido do mesmo alias', () => {
    const rendered = renderDeadlinePresentation({
      modulo: 'oportunidades',
      applicationDeadline: '31/02/2026',
      metadata: {
        applicationDeadline: '2026-08-19',
        application_deadline: '20/08/2026',
      },
    });

    expect(rendered.badges).toContain('Prazo: 19/08/2026');
    expect(rendered.badges).not.toContain('2026-08-20');
  });

  test('fase explicita tambem tenta metadata do mesmo alias apos raiz invalida', () => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      applicationPurpose: 'listener_registration',
      listenerRegistrationDeadline: 'nao-e-data',
      metadata: {
        applicationPurpose: 'listener_registration',
        listenerRegistrationDeadline: '2026-10-10',
        dates: { submissionDeadline: '2026-08-20' },
      },
    });

    expect(rendered.badges).toContain('Prazo: 10/10/2026');
    expect(rendered.badges).not.toContain('2026-08-20');
  });

  test.each([
    ['objeto', {}],
    ['array', ['2026-08-20']],
    ['booleano', true],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['numero curto', 42],
    ['numero fracionario', 1790000000.5],
    ['data invalida', new Date('invalid')],
  ])('tipo invalido %s nao produz prazo', (_label, value) => {
    const rendered = renderDeadlinePresentation(postWithCandidate('applicationDeadline', 'root', value));

    expect(rendered.badges).not.toContain('Prazo');
    expect(rendered.specs).not.toContain('Prazo');
  });

  test('candidato malicioso nao injeta HTML e nao impede o proximo prazo valido', () => {
    const rendered = renderDeadlinePresentation({
      modulo: 'oportunidades',
      metadata: {
        applicationDeadline: '2026-08-20\"><img src=x onerror=alert(1)>',
        application_deadline: '2026-08-21',
      },
    });

    expect(rendered.badges).toContain('Prazo: 21/08/2026');
    expect(rendered.specs).toContain('Prazo21/08/2026');
    expect(rendered.badgesHtml).not.toMatch(/<img|onerror|alert\(/i);
    expect(rendered.specsHtml).not.toMatch(/<img|onerror|alert\(/i);
  });
});
