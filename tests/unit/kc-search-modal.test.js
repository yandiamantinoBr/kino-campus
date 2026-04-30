describe('KCSearchModal', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<button id="kcSearchMobileBtn" type="button">Buscar</button><input id="searchInput" placeholder="Buscar no campus"><div id="kcSearchDropdown"></div>';
    window.KCOverlayLock = { lock: jest.fn(), unlock: jest.fn() };
    window.requestAnimationFrame = (callback) => callback();
  });

  afterEach(() => {
    if (window.KCSearchModal && typeof window.KCSearchModal.close === 'function') {
      window.KCSearchModal.close();
    }
    delete window.KCSearchModal;
    delete window.KCOverlayLock;
    document.body.innerHTML = '';
  });

  test('gera controles do modal como botoes de acao sem submit implicito', () => {
    require('../../assets/js/features/kc-search-modal.js');

    window.KCSearchModal.open();

    const closeButton = document.querySelector('.kc-search-modal-card__close');
    const clearButton = document.querySelector('.kc-search-modal-card__clear');

    expect(closeButton).not.toBeNull();
    expect(clearButton).not.toBeNull();
    expect(closeButton.getAttribute('type')).toBe('button');
    expect(clearButton.getAttribute('type')).toBe('button');
    expect(closeButton.getAttribute('aria-label')).toBe('Fechar busca');
    expect(clearButton.getAttribute('aria-label')).toBe('Limpar busca');
  });

  test('icones dos controles do modal sao decorativos', () => {
    require('../../assets/js/features/kc-search-modal.js');

    window.KCSearchModal.open();

    expect(document.querySelector('.kc-search-modal-card__close i').getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.kc-search-modal-card__clear i').getAttribute('aria-hidden')).toBe('true');
  });

  test('input de busca do modal tem nome acessivel explicito', () => {
    require('../../assets/js/features/kc-search-modal.js');

    window.KCSearchModal.open();

    const input = document.getElementById('kcSearchModalInput');

    expect(input).not.toBeNull();
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('aria-label')).toBe('Pesquisar');
  });

  test('icone de busca do modal e decorativo', () => {
    require('../../assets/js/features/kc-search-modal.js');

    window.KCSearchModal.open();

    expect(document.querySelector('.kc-search-modal-card__icon').getAttribute('aria-hidden')).toBe('true');
  });
});
