const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'features', 'kc-home-categories.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function loadHomeCategories() {
  delete window.KCHomeCategories;
  window.KCConsent = { hasConsent: jest.fn(() => false) };
  window.KCHomeCategoryUtils = {};
  // eslint-disable-next-line no-eval
  (0, eval)(source);
}

describe('kc-home-categories - consultas de contagem', () => {
  afterEach(() => {
    delete window.KCHomeCategories;
    delete window.KCHomeCategoryUtils;
    delete window.KCConsent;
    delete window.KCSupabase;
  });

  test('compartilha uma unica RPC entre leitores concorrentes', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: [] }));
    window.KCSupabase = { getClient: () => ({ rpc }) };
    loadHomeCategories();

    const results = await Promise.all([
      window.KCHomeCategories.getCategoryCounts(true),
      window.KCHomeCategories.getCategoryCounts(true),
      window.KCHomeCategories.getCategoryCounts(true),
    ]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('kc_home_category_post_counts');
    expect(results).toEqual([[], [], []]);
  });
});
