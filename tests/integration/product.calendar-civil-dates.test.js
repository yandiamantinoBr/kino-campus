/** Execute the real calendar renderer in separate time zones, not a mocked Date. */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.resolve(__dirname, '../../assets/js/controllers/public/product.calendar.js');
const fixturePath = path.resolve(__dirname, '../fixtures/calendar-inclusive-civil-dates.json');
const fixtures = require(fixturePath);
const childScript = `
  const fs = require('fs');
  const { JSDOM } = require(process.argv[1]);
  const source = fs.readFileSync(process.argv[2], 'utf8');
  const fixtures = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const output = fixtures.map(fixture => {
    const dom = new JSDOM('<div id="actions"><a id="primaryCta" href="https://example.org/official">Ver detalhes</a></div>', {runScripts:'outside-only', url:'https://www.kinocampus.com.br/'});
    dom.window.KCUtils = {escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')};
    dom.window.eval(source);
    const post = {module:'eventos', status:'published', title:fixture.title || 'Evento público', description:'Texto oficial preservado.', metadata:{...fixture.metadata}, ...fixture.post};
    const before = JSON.stringify(post);
    dom.window._KCProduct.calendar.setEventCalendar(post);
    const anchors = [...dom.window.document.querySelectorAll('#kcEventCalendarWrap a')];
    const google = anchors.find(a=>a.href.startsWith('https://calendar.google.com/'));
    const outlook = anchors.find(a=>a.href.startsWith('https://outlook.live.com/'));
    const apple = anchors.find(a=>a.href.startsWith('data:text/calendar'));
    const result = {id:fixture.id, postUnchanged:JSON.stringify(post)===before, cta:dom.window.document.getElementById('primaryCta').outerHTML, rendered:anchors.length>0, googleDates:google ? new URL(google.href).searchParams.get('dates') : null, outlookEnd:outlook ? new URL(outlook.href).searchParams.get('enddt') : null, ics:apple ? decodeURIComponent(apple.href.split(',').slice(1).join(',')) : null};
    dom.window.close();
    return result;
  });
  process.stdout.write(JSON.stringify(output));
`;

function renderInTimeZone(timeZone) {
  const result = spawnSync(process.execPath, ['-e', childScript, require.resolve('jsdom'), sourcePath, fixturePath], {
    env: { ...process.env, TZ: timeZone }, encoding: 'utf8', timeout: 30000,
  });
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

describe.each(['UTC', 'America/Sao_Paulo', 'America/New_York', 'Pacific/Kiritimati'])('civil calendar exports in %s', timeZone => {
  let rendered;
  beforeAll(() => { rendered = renderInTimeZone(timeZone); });

  test.each(fixtures)('$id', fixture => {
    const actual = rendered.find(item => item.id === fixture.id);
    expect(actual.postUnchanged).toBe(true);
    expect(actual.cta).toBe('<a id="primaryCta" href="https://example.org/official">Ver detalhes</a>');
    if (fixture.reject) {
      expect(actual.rendered).toBe(false);
      return;
    }
    expect(actual.rendered).toBe(true);
    expect(actual.googleDates).toBe(fixture.googleDates);
    expect(actual.outlookEnd).toBe(fixture.outlookEnd);
    expect(actual.ics).toContain(fixture.icsStart + '\r\n');
    expect(actual.ics).toContain(fixture.icsEnd + '\r\n');
    if (fixture.timed) expect(actual.ics).not.toContain(';VALUE=DATE');
  });
});
