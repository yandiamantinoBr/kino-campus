'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      return Function(`"use strict"; return (${source.slice(start, index + 1)});`)();
    }
  }
  throw new Error(`function ${name} is incomplete`);
}

describe('Cadu proxy security boundary', () => {
  const auth = read('server/cadu-auth.mjs');
  const feed = read('api/cadu/feed.js');
  const classifyCaduFeedPath = extractFunction(feed, 'classifyCaduFeedPath');

  test('admin session tokens are accepted only through Authorization headers', () => {
    expect(auth).toContain("match(/^Bearer\\s+(.+)$/i)");
    expect(auth).not.toContain('req.query.kc_admin_token');
    expect(auth).not.toContain('const queryToken');
  });

  test('feed proxy cannot escape into the retired admin namespace', () => {
    expect(classifyCaduFeedPath('admin')).toBe('retired_admin');
    expect(classifyCaduFeedPath('admin/redeploy')).toBe('retired_admin');
    expect(feed).toContain("error: 'cadu_admin_capability_retired'");
    expect(feed).toContain('res.status(410)');
    expect(feed).not.toContain("ns = 'admin'");
    expect(feed).not.toContain('/api/${ns}');
  });

  test('feed proxy accepts only list, chunk, and chunk ask route shapes', () => {
    expect(classifyCaduFeedPath('')).toBe('list');
    expect(classifyCaduFeedPath('a7b8c9d0-1234')).toBe('chunk');
    expect(classifyCaduFeedPath('a7b8c9d0-1234/ask')).toBe('ask');
    expect(classifyCaduFeedPath('../admin/redeploy')).toBeNull();
    expect(classifyCaduFeedPath('chunk/../admin')).toBeNull();
    expect(classifyCaduFeedPath('chunk%2F..%2Fadmin')).toBeNull();
    expect(classifyCaduFeedPath('chunk/delete')).toBeNull();
    expect(feed).toContain("error: 'invalid_cadu_feed_path'");
    expect(feed).toContain("error: 'method_not_allowed_for_cadu_feed_path'");
    expect(feed).toContain("/api/feed${subPath ? '/' + subPath : ''}");
  });

  test('feed ask uses the long bounded timeout without slowing read-only listing', () => {
    expect(feed).toContain('maxDuration: 300');
    expect(feed).toContain("AbortSignal.timeout(routeKind === 'ask' ? 285000 : 30000)");
  });
});
