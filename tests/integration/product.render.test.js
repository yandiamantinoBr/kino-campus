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
    const renderTag = 'assets/js/controllers/public/product.render.js?v=8.6.4';
    expect(page.split(lifecycleTag)).toHaveLength(2);
    expect(page.split(renderTag)).toHaveLength(2);
    expect(page.indexOf(lifecycleTag)).toBeLessThan(page.indexOf(renderTag));
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
});

describe('product.render.js - semantica de prazo', () => {
  test('espelha exatamente a ordem DEADLINE_PATHS do lifecycle canonico', () => {
    expect(extractDeadlinePaths(source)).toEqual(DEADLINE_ALIASES);
  });

  test.each(DEADLINE_CASES)('reconhece $alias em $placement', ({ alias, placement }) => {
    const rendered = renderDeadlinePresentation(postWithCandidate(alias, placement));

    expect(rendered.badges).toContain('Prazo: 2026-08-20');
    expect(rendered.specs).toContain('Prazo2026-08-20');
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
    ['PROFMAT', PROFMAT_FIXTURE, '2026-09-15', '2026-08-09'],
    ['SIPACV', SIPACV_FIXTURE, '2026-08-20', '2026-10-10'],
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

    expect(rendered.badges.includes('Prazo: 2026-08-20')).toBe(accepted);
    expect(rendered.specs.includes('Prazo2026-08-20')).toBe(accepted);
  });

  test('submissionDeadline preserva fallback legado quando nenhuma fase e identificavel', () => {
    const rendered = renderDeadlinePresentation({
      module: 'eventos',
      metadata: { dates: { submissionDeadline: '2026-08-20' } },
    });

    expect(rendered.badges).toContain('Prazo: 2026-08-20');
    expect(rendered.specs).toContain('Prazo2026-08-20');
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

    expect(listener.badges).toContain('Prazo: 2026-10-10');
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

    expect(rendered.badges).toContain('Prazo: 2026-09-15');
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

    expect(rendered.badges).toContain('Prazo: 2026-08-20');
    expect(rendered.badges).not.toContain('2026-08-21');
  });

  test('ordem de aliases precede localizacao raiz ou metadata', () => {
    const rendered = renderDeadlinePresentation({
      modulo: 'oportunidades',
      application_deadline: '2026-08-21',
      metadata: { applicationDeadline: '2026-08-20' },
    });

    expect(rendered.badges).toContain('Prazo: 2026-08-20');
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

    expect(rendered.badges).toContain('Prazo: 2026-08-19');
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

    expect(rendered.badges).toContain('Prazo: 2026-10-10');
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

    expect(rendered.badges).toContain('Prazo: 2026-08-21');
    expect(rendered.specs).toContain('Prazo2026-08-21');
    expect(rendered.badgesHtml).not.toMatch(/<img|onerror|alert\(/i);
    expect(rendered.specsHtml).not.toMatch(/<img|onerror|alert\(/i);
  });
});
