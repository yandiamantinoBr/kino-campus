/**
 * @file product.calendar.test.js
 * @description Static contract tests for product.calendar.js (v11.30.12)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.calendar.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.calendar.js - estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCProduct', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
  });

  test('registra window._KCProduct.calendar', () => {
    expect(source).toContain('window._KCProduct.calendar = {');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.calendar.js - utilitários locais', () => {
  test('define esc() delegando a window.KCUtils.escapeHtml', () => {
    expect(source).toContain('function esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
  });

  test('define posicionamento local do popover', () => {
    expect(source).toContain('function clearCalendarPopoverPosition(popover)');
    expect(source).toContain('function positionCalendarPopover(anchorBtn)');
    expect(source).toContain('function scheduleCalendarPopoverPosition(anchorBtn)');
    expect(source).toContain('function ensureCalendarPopoverViewportBinding()');
  });
});

describe('product.calendar.js - close/open/wire do popover', () => {
  test('define closeExternalPopover para fechar share/save antes da agenda', () => {
    expect(source).toContain('function closeExternalPopover(popoverId, backdropId, buttonId)');
    expect(source).toContain("closeExternalPopover('savePopover', 'saveBackdrop', 'saveButton')");
    expect(source).toContain("closeExternalPopover('sharePopover', 'shareBackdrop', 'shareButton')");
  });

  test('define open, close e wire do popover de calendário', () => {
    expect(source).toContain('function openCalendarPopover(btn)');
    expect(source).toContain('function closeCalendarPopover()');
    expect(source).toContain('function wireCalendarPopover()');
    expect(source).toContain("document.getElementById('calendarPopover')");
  });
});

describe('product.calendar.js - setEventCalendar', () => {
  test('define a função e limita o módulo a eventos', () => {
    expect(source).toContain('function setEventCalendar(post)');
    expect(source).toContain("moduleKey !== 'eventos'");
    expect(source).toContain("document.getElementById('kcEventCalendarWrap')");
  });

  test('gera links Google, Outlook e Apple/ICS', () => {
    expect(source).toContain('https://calendar.google.com/calendar/render?');
    expect(source).toContain('https://outlook.live.com/calendar/0/deeplink/compose?');
    expect(source).toContain('data:text/calendar;charset=utf8,');
    expect(source).toContain('BEGIN:VCALENDAR');
    expect(source).toContain('END:VCALENDAR');
  });

  test('renderiza o markup de agenda esperado', () => {
    expect(source).toContain('id="calendarButton"');
    expect(source).toContain('Marcar na Agenda');
    expect(source).toContain('id="calendarPopover"');
    expect(source).toContain('Adicionar ao calendário');
    expect(source).toContain('Google Agenda');
    expect(source).toContain('Apple Calendário');
    expect(source).toContain('Outlook');
    expect(source).toContain('id="calendarBackdrop"');
  });

  test('escapa URLs e filename no innerHTML', () => {
    expect(source).toContain('${esc(googleUrl)}');
    expect(source).toContain('${esc(icsHref)}');
    expect(source).toContain('${esc(icsFilename)}');
    expect(source).toContain('${esc(outlookUrl)}');
  });
});

describe('product.calendar.js - exports', () => {
  test('exporta closeCalendarPopover e setEventCalendar', () => {
    expect(source).toContain('closeCalendarPopover: closeCalendarPopover,');
    expect(source).toContain('setEventCalendar: setEventCalendar,');
  });
});
