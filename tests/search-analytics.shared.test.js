const SearchAnalytics = require('../assets/js/search-analytics.shared.js');

function createStorage() {
  const bag = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
    },
    setItem(key, value) {
      bag[key] = String(value);
    },
    removeItem(key) {
      delete bag[key];
    }
  };
}

describe('KCSearchAnalytics', () => {
  test('normalizeTrackedTerm remove acentos e espacos redundantes', () => {
    expect(SearchAnalytics.normalizeTrackedTerm('  Árvore   Azul  ')).toBe('arvore azul');
  });

  test('ensureSessionId reaproveita sessao existente', () => {
    const storage = createStorage();
    const first = SearchAnalytics.ensureSessionId(storage, () => 'abc', () => 123);
    const second = SearchAnalytics.ensureSessionId(storage, () => 'xyz', () => 456);

    expect(first).toBe('abc123');
    expect(second).toBe('abc123');
  });

  test('queueSearchTerm faz dedupe por janela de tempo e markTermsFlushed limpa fila', () => {
    const storage = createStorage();
    const first = SearchAnalytics.queueSearchTerm(storage, 'samurai', { source: 'search-button' }, 1000, 5000);
    const duplicate = SearchAnalytics.queueSearchTerm(storage, '  samurai  ', { source: 'search-button' }, 1200, 5000);
    const later = SearchAnalytics.queueSearchTerm(storage, 'samurai', { source: 'search-button' }, 7000, 5000);

    expect(first).toBeTruthy();
    expect(duplicate).toBeNull();
    expect(later).toBeTruthy();
    expect(SearchAnalytics.readQueue(storage)).toHaveLength(2);

    const batch = SearchAnalytics.consumeQueuedTerms(storage, 1);
    expect(batch).toHaveLength(1);
    expect(batch[0].term).toBe('samurai');

    SearchAnalytics.markTermsFlushed(storage, batch, 8000);
    expect(SearchAnalytics.readQueue(storage)).toHaveLength(1);
    expect(SearchAnalytics.readRecentTerms(storage).samurai).toBe(8000);
  });
});
