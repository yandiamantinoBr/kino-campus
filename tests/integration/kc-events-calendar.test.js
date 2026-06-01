/*
  kc-events-calendar.js — Contratos do componente compartilhado do Calendário (v76.2)

  Cobre:
   - Contrato estático da fonte (namespace, API, dados, cache SWR, Supabase, i18n)
   - Runtime em jsdom: mount injeta markup + modal, idempotência, rail, sem lançar
   - Integração HTML: eventos.html e index.html carregam o módulo e têm o mount

  Estes contratos migraram de eventos.controller.test.js quando o calendário foi
  extraído para a FONTE ÚNICA assets/js/features/kc-events-calendar.js, garantindo
  que o mesmo calendário apareça sincronizado em /eventos.html e /index.html.
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..', '..');
const MODULE_PATH  = path.join(ROOT, 'assets', 'js', 'features', 'kc-events-calendar.js');
const EVENTOS_HTML = path.join(ROOT, 'eventos.html');
const INDEX_HTML   = path.join(ROOT, 'index.html');

function loadModule() {
  const code = fs.readFileSync(MODULE_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

// ── 1. Contrato estático da fonte ────────────────────────────────────────────

describe('kc-events-calendar — contrato estático (fonte)', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');

  test('arquivo existe', () => {
    expect(fs.existsSync(MODULE_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    expect(source).toMatch(/['"]use strict['"]/u);
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test('registra namespace window.KCEventsCalendar', () => {
    expect(source).toContain('window.KCEventsCalendar');
  });

  const PUBLIC_API = ['mount', 'init', 'refresh', 'open', 'close', 'destroy', 'isReady'];
  PUBLIC_API.forEach((fn) => {
    test('expõe API pública: ' + fn, () => {
      expect(source).toContain(fn + ':');
    });
  });

  // Dados / categorias
  ['sustentabilidade', 'academicos', 'culturais', 'esportivos', 'workshops', 'festas'].forEach((cat) => {
    test('categoria presente: ' + cat, () => {
      expect(source).toContain(cat);
    });
  });

  test('define array de meses em pt-BR', () => {
    expect(source).toContain('Janeiro');
    expect(source).toContain('Dezembro');
  });

  test('define STORAGE_KEY do calendário', () => {
    expect(source).toContain('STORAGE_KEY');
    expect(source).toContain('kc_events_calendar_month');
  });

  // Cache SWR
  test('define SECTION_CACHE_KEY do calendário (v2 invalida cache pré-filtro de status)', () => {
    expect(source).toContain('SECTION_CACHE_KEY');
    expect(source).toContain("'eventos:calendar:v2'");
  });

  test('define SECTION_CACHE_MAX_AGE_MS (TTL)', () => {
    expect(source).toContain('SECTION_CACHE_MAX_AGE_MS');
  });

  test('usa getSessionStore + restore/persist de cache', () => {
    expect(source).toContain('getSessionStore');
    expect(source).toContain('restoreCachedEvents');
    expect(source).toContain('store.get(');
    expect(source).toContain('persistCachedEvents');
    expect(source).toContain('store.set(');
  });

  // Supabase
  test('usa KCSupabase.getClient()', () => {
    expect(source).toContain('getClient()');
  });

  test('consulta tabela posts com module eventos', () => {
    expect(source).toContain("'posts'");
    expect(source).toContain("'eventos'");
  });

  test('filtra por status visível e exclui posts demo (legacy_id) — bug deleted/hidden', () => {
    expect(source).toContain(".in('status', ['published', 'closed'])");
    expect(source).toContain(".is('legacy_id', null)");
  });

  test('revalida ao vivo via KCPostFreshness + visibilitychange/focus/pageshow', () => {
    expect(source).toContain('KCPostFreshness');
    expect(source).toContain('subscribe(handleFreshness)');
    expect(source).toContain("addEventListener('visibilitychange'");
    expect(source).toContain("addEventListener('focus'");
    expect(source).toContain("addEventListener('pageshow'");
  });

  test('possui botão "Hoje" e navegação para o período atual', () => {
    expect(source).toContain('data-kc-cal-today');
    expect(source).toContain('navigateToToday');
    expect(source).toContain('isViewingToday');
  });

  test('modal expandido tem focus trap + retorno de foco (a11y)', () => {
    expect(source).toContain('trapModalFocus');
    expect(source).toContain('_modalReturnFocus');
  });

  test('normaliza a chave de categoria (singular/acentos → chave oficial)', () => {
    expect(source).toContain('normalizeCategoryKey');
  });

  // Scroll-lock iOS no modal expandido
  test('usa KCOverlayLock.lock/unlock no modal calendário (iOS)', () => {
    expect(source).toContain("KCOverlayLock.lock('eventos-cal-modal')");
    expect(source).toContain("KCOverlayLock.unlock('eventos-cal-modal')");
  });

  // Hooks de DOM / dataset
  test('usa dataset attr data-kc-cal-grid (sidebar + modal)', () => {
    expect(source).toContain('data-kc-cal-grid');
    expect(source).toContain('data-kc-cal-grid-modal');
  });

  test('auto-monta via [data-kc-cal-mount]', () => {
    expect(source).toContain('data-kc-cal-mount');
  });

  // Markup âncora (templates)
  ['kc-sidebar-section--cal', 'kc-cal-view-tabs', 'data-kc-cal-expand', 'kc-cal-legend', 'kc-cal-modal', 'data-kc-cal-month'].forEach((sel) => {
    test('template contém: ' + sel, () => {
      expect(source).toContain(sel);
    });
  });

  test('reaplica i18n em markup injetado (KCi18n)', () => {
    expect(source).toContain('KCi18n');
    expect(source).toContain('applyAriaLabels');
  });

  test('auto-inicializa via DOMContentLoaded', () => {
    expect(source).toContain("addEventListener('DOMContentLoaded', autoMount)");
  });

  test('detalhe do dia linka para product.html?id=', () => {
    expect(source).toContain('product.html?id=');
  });

  test('suporta eventos de vários dias (início + término)', () => {
    expect(source).toContain('getEventStartDate');
    expect(source).toContain('getEventEndDate');
    expect(source).toContain('data_fim_evento');
  });

  test('eventsForDate cobre o intervalo [início, término]', () => {
    expect(source).toContain('start <= dateStr && dateStr <= end');
  });

  test('não posiciona eventos sem data (getEventStartDate sem fallback para created_at)', () => {
    const idx = source.indexOf('function getEventStartDate');
    expect(idx).toBeGreaterThan(-1);
    const slice = source.slice(idx, idx + 520);
    // O comentário cita "created_at", mas não pode existir acesso real de fallback.
    expect(slice).not.toContain('post.created_at');
    expect(slice).not.toContain('source.created_at');
    expect(slice).toContain('return null;');
  });
});

// ── 2. Runtime (jsdom) ───────────────────────────────────────────────────────

describe('kc-events-calendar — runtime (jsdom)', () => {
  beforeEach(() => {
    delete window.KCEventsCalendar;
    delete window.KCSupabase;
    delete window.KCSessionStore;
    delete window.KCOverlayLock;
    delete window.KCi18n;
    document.body.innerHTML = '';
    try { localStorage.clear(); } catch (_) { /* noop */ }
  });

  test('não lança ao carregar sem dependências opcionais', () => {
    expect(() => loadModule()).not.toThrow();
  });

  test('expõe window.KCEventsCalendar com API funcional', () => {
    loadModule();
    expect(window.KCEventsCalendar).toBeDefined();
    ['mount', 'init', 'refresh', 'open', 'close', 'isReady'].forEach((fn) => {
      expect(typeof window.KCEventsCalendar[fn]).toBe('function');
    });
  });

  test('mount injeta o markup da seção e o modal no body', () => {
    loadModule();
    const el = document.createElement('div');
    el.setAttribute('data-kc-cal-mount', '');
    document.body.appendChild(el);

    window.KCEventsCalendar.mount(el);

    expect(el.getAttribute('data-kc-cal-mounted')).toBe('1');
    expect(el.className).toContain('kc-sidebar-section--cal');
    expect(el.innerHTML).toContain('data-kc-cal-grid');
    expect(el.innerHTML).toContain('kc-cal-view-tabs');
    expect(document.getElementById('kcCalModal')).not.toBeNull();
  });

  test('data-kc-cal-rail vira data-kc-eventos-section (integração com rail mobile)', () => {
    loadModule();
    const el = document.createElement('div');
    el.setAttribute('data-kc-cal-mount', '');
    el.setAttribute('data-kc-cal-rail', 'calendario');
    document.body.appendChild(el);

    window.KCEventsCalendar.mount(el);

    expect(el.getAttribute('data-kc-eventos-section')).toBe('calendario');
  });

  test('mount é idempotente (não duplica o modal)', () => {
    loadModule();
    const el = document.createElement('div');
    el.setAttribute('data-kc-cal-mount', '');
    document.body.appendChild(el);

    window.KCEventsCalendar.mount(el);
    window.KCEventsCalendar.mount(el);

    expect(document.querySelectorAll('#kcCalModal').length).toBe(1);
  });
});

// ── 2b. Runtime: eventos multi-dia (span) e exclusão de eventos sem data ──────

describe('kc-events-calendar — runtime: eventos multi-dia', () => {
  function fakeSupabase(events) {
    const chain = {
      select: function () { return chain; },
      eq: function () { return chain; },
      is: function () { return chain; },
      in: function () { return chain; },
      order: function () { return chain; },
      limit: function () { return Promise.resolve({ data: events, error: null }); },
    };
    return { getClient: function () { return { from: function () { return chain; } }; } };
  }

  beforeEach(() => {
    delete window.KCEventsCalendar;
    delete window.KCSupabase;
    delete window.KCSessionStore;
    delete window.KCi18n;
    delete window.KCOverlayLock;
    document.body.innerHTML = '';
    try { localStorage.clear(); } catch (_) { /* noop */ }
  });

  test('evento de vários dias ocupa todo o intervalo; evento sem data é ignorado', async () => {
    // Datas no mês corrente (independente da data real de execução).
    const now = new Date();
    const day = function (n) {
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');
    };
    window.KCSupabase = fakeSupabase([
      { id: 1, title: 'Exposição', category: 'culturais', metadata: { data_evento: day(10), data_fim_evento: day(12) }, created_at: day(1) },
      { id: 2, title: 'Sem data', category: 'academicos', metadata: {}, created_at: day(5) },
    ]);

    loadModule();
    const el = document.createElement('div');
    el.setAttribute('data-kc-cal-mount', '');
    document.body.appendChild(el);
    window.KCEventsCalendar.mount(el);

    // Deixa o fetch (Promise) resolver e re-renderizar o grid.
    await new Promise((r) => setTimeout(r, 0));

    const grid = document.querySelector('[data-kc-cal-grid]');
    const hasEvents = function (n) {
      const cell = grid.querySelector('[data-kc-cal-day="' + day(n) + '"]');
      return !!cell && /kc-cal-day--has-events/.test(cell.className);
    };

    // Evento de 10 a 12 → marca 10, 11 e 12, mas não o 13.
    expect(hasEvents(10)).toBe(true);
    expect(hasEvents(11)).toBe(true);
    expect(hasEvents(12)).toBe(true);
    expect(hasEvents(13)).toBe(false);
    // Evento sem data não é posicionado pelo created_at (dia 5 fica livre).
    expect(hasEvents(5)).toBe(false);
  });
});

// ── 2c. Runtime: atualização ao vivo (frescor de posts) ──────────────────────

describe('kc-events-calendar — runtime: atualização ao vivo', () => {
  function countingSupabase(getEvents) {
    let calls = 0;
    function makeChain() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => { calls += 1; return Promise.resolve({ data: getEvents(), error: null }); },
      };
      return chain;
    }
    return {
      getCalls: () => calls,
      api: { getClient: () => ({ from: () => makeChain() }) },
    };
  }

  let captured;
  let counter;

  beforeEach(() => {
    delete window.KCEventsCalendar;
    delete window.KCSupabase;
    delete window.KCSessionStore;
    delete window.KCi18n;
    delete window.KCOverlayLock;
    delete window.KCPostFreshness;
    captured = null;
    document.body.innerHTML = '';
    try { localStorage.clear(); } catch (_) { /* noop */ }

    counter = countingSupabase(() => []);
    window.KCSupabase = counter.api;
    window.KCPostFreshness = { subscribe: (fn) => { captured = fn; return () => {}; } };
  });

  afterEach(() => {
    try { if (window.KCEventsCalendar) window.KCEventsCalendar.destroy(); } catch (_) { /* noop */ }
    delete window.KCPostFreshness;
  });

  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  test('assina KCPostFreshness e re-busca quando um evento muda (deletar/esconder)', async () => {
    loadModule();
    const el = document.createElement('div');
    el.setAttribute('data-kc-cal-mount', '');
    document.body.appendChild(el);
    window.KCEventsCalendar.mount(el);

    await tick(0);
    expect(typeof captured).toBe('function');   // assinou o frescor
    expect(counter.getCalls()).toBe(1);         // fetch inicial

    // Evento deletado/escondido → calendário re-busca (debounce ~150ms) e o filtro
    // de status no servidor garante que o post some.
    captured({ module: 'eventos', type: 'soft_deleted' });
    await tick(300);
    expect(counter.getCalls()).toBe(2);

    // Mudança de outro módulo não dispara re-busca.
    captured({ module: 'caronas', type: 'soft_deleted' });
    await tick(300);
    expect(counter.getCalls()).toBe(2);
  });
});

// ── 2d. Runtime: a11y do modal + botão Hoje + categoria ──────────────────────

describe('kc-events-calendar — runtime: UX/a11y (modal, Hoje, categoria)', () => {
  function fakeSupabase(events) {
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain, in: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: events, error: null }),
    };
    return { getClient: () => ({ from: () => chain }) };
  }

  function mountCalendar() {
    const el = document.createElement('div');
    el.setAttribute('data-kc-cal-mount', '');
    document.body.appendChild(el);
    window.KCEventsCalendar.mount(el);
    return el;
  }

  beforeEach(() => {
    delete window.KCEventsCalendar;
    delete window.KCSupabase;
    delete window.KCSessionStore;
    delete window.KCi18n;
    delete window.KCOverlayLock;
    delete window.KCPostFreshness;
    document.body.innerHTML = '';
    try { localStorage.clear(); } catch (_) { /* noop */ }
  });

  afterEach(() => {
    try { if (window.KCEventsCalendar) window.KCEventsCalendar.destroy(); } catch (_) { /* noop */ }
  });

  test('modal: abrir move o foco para dentro; fechar devolve ao gatilho', () => {
    loadModule();
    const el = mountCalendar();

    const expandBtn = el.querySelector('[data-kc-cal-expand]');
    expandBtn.focus();
    expect(document.activeElement).toBe(expandBtn);

    window.KCEventsCalendar.open();
    const closeBtn = document.querySelector('[data-kc-cal-modal-close]');
    expect(document.activeElement).toBe(closeBtn);

    window.KCEventsCalendar.close();
    expect(document.activeElement).toBe(expandBtn);
  });

  test('botão "Hoje": oculto no período atual, aparece ao navegar e volta para hoje', () => {
    loadModule();
    const el = mountCalendar();

    const todayBtn = el.querySelector('[data-kc-cal-today]');
    expect(todayBtn).not.toBeNull();
    expect(todayBtn.hidden).toBe(true); // começa no mês atual

    el.querySelector('[data-kc-cal-next]').click(); // navega para o próximo mês
    expect(todayBtn.hidden).toBe(false);

    todayBtn.click(); // volta para hoje
    expect(todayBtn.hidden).toBe(true);
  });

  test('categoria "academico" (singular) recebe a cor de academicos (dot não-cinza)', async () => {
    const now = new Date();
    const day = (n) => now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');
    window.KCSupabase = fakeSupabase([
      { id: 9, title: 'Aula inaugural', category: 'academico', metadata: { data_evento: day(15) }, created_at: day(1) },
    ]);

    loadModule();
    mountCalendar();
    await new Promise((r) => setTimeout(r, 0));

    const cell = document.querySelector('[data-kc-cal-day="' + day(15) + '"]');
    expect(cell).not.toBeNull();
    const dot = cell.querySelector('.kc-cal-event-dot');
    expect(dot).not.toBeNull();
    // academicos = #2196f3 (azul) — não o cinza fallback (#888) de categoria desconhecida.
    expect(dot.getAttribute('style')).toContain('#2196f3');
  });
});

// ── 3. Integração HTML (eventos.html + index.html) ───────────────────────────

describe('kc-events-calendar — integração HTML', () => {
  const eventosHtml = fs.readFileSync(EVENTOS_HTML, 'utf8');
  const indexHtml   = fs.readFileSync(INDEX_HTML, 'utf8');

  test('eventos.html carrega o módulo (com cache-buster)', () => {
    expect(eventosHtml).toContain('assets/js/features/kc-events-calendar.js');
    expect(eventosHtml).toMatch(/kc-events-calendar\.js\?v=/u);
  });

  test('eventos.html tem ponto de montagem com rail', () => {
    expect(eventosHtml).toContain('data-kc-cal-mount');
    expect(eventosHtml).toContain('data-kc-cal-rail="calendario"');
  });

  test('eventos.html NÃO tem mais o markup inline do calendário (evita duplicação)', () => {
    // O grid só deve existir como template no módulo, não embutido na página.
    expect(eventosHtml).not.toContain('data-kc-cal-grid');
  });

  test('index.html carrega o módulo (com cache-buster)', () => {
    expect(indexHtml).toContain('assets/js/features/kc-events-calendar.js');
    expect(indexHtml).toMatch(/kc-events-calendar\.js\?v=/u);
  });

  test('index.html tem ponto de montagem na sidebar', () => {
    expect(indexHtml).toContain('data-kc-cal-mount');
    expect(indexHtml).toContain('kc-sidebar-section--cal');
  });

  test('index.html: calendário posicionado após kc-community-impact-section', () => {
    const idxCommunity = indexHtml.indexOf('kc-community-impact-section');
    const idxCal       = indexHtml.indexOf('data-kc-cal-mount');
    expect(idxCommunity).toBeGreaterThan(-1);
    expect(idxCal).toBeGreaterThan(idxCommunity);
  });
});
