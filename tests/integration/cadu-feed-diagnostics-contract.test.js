'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(ROOT, 'api/cadu/feed-diagnostics.js'), 'utf8');

describe('Cadu feed diagnostics proxy', () => {
  test('exige admin e executa apenas leitura shadow do feed', () => {
    expect(source).toContain('requireCaduAdmin');
    expect(source).toContain('Shadow.run(options)');
    expect(source).toContain("modules: ['eventos', 'oportunidades']");
    expect(source).toContain("statuses: ['published']");
    expect(source).toContain('repairLimit');
    expect(source).toContain('maxDuration: 60');
  });

  test('nao encaminha service_role nem aceita metodos de escrita', () => {
    expect(source).toContain("req.method !== 'GET'");
    expect(source).not.toMatch(/SERVICE_ROLE/i);
    expect(source).not.toMatch(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
    expect(source).not.toMatch(/from\(['"]posts['"]\)\.(insert|update|upsert|delete)/);
  });
});
