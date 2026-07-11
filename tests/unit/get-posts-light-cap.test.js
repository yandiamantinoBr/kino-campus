/**
 * Guards for getPosts load-relief: limit hard cap + light mode flag.
 * Mirrors normalizeGetPostsParams contract in kc-supabase.posts.js.
 */

function normalizeGetPostsParams(params) {
  const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
  const pageRaw = (p.page != null) ? parseInt(String(p.page), 10) : 1;
  const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 50;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limitUncapped = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
  const limit = Math.min(limitUncapped, 50);
  const light = p.light === true || p.mode === 'light' || p.catalog === true;
  return { page, limit, light: !!light };
}

describe('getPosts load relief params', () => {
  test('caps limit at 50 even when caller asks for 100', () => {
    expect(normalizeGetPostsParams({ limit: 100 }).limit).toBe(50);
  });

  test('keeps small limits intact', () => {
    expect(normalizeGetPostsParams({ limit: 12 }).limit).toBe(12);
  });

  test('defaults limit to 50', () => {
    expect(normalizeGetPostsParams({}).limit).toBe(50);
  });

  test('enables light mode via light/catalog/mode flags', () => {
    expect(normalizeGetPostsParams({ light: true }).light).toBe(true);
    expect(normalizeGetPostsParams({ catalog: true }).light).toBe(true);
    expect(normalizeGetPostsParams({ mode: 'light' }).light).toBe(true);
    expect(normalizeGetPostsParams({}).light).toBe(false);
  });
});
