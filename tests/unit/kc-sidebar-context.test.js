describe('kc-sidebar-context', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <button type="button" data-kc-context-open="eventos">Abrir contexto</button>
      <button type="button" class="kc-module-heading kc-module-heading--home-context" data-kc-context-open="eventos" aria-label="Abrir informações sobre Eventos" aria-haspopup="dialog">
        <span class="kc-module-heading__label"><i class="fas fa-circle-info"></i><span>Sobre Eventos</span></span>
        <span class="kc-context-info-btn" aria-hidden="true"><i class="fas fa-circle-info"></i></span>
      </button>
      <aside>
        <div data-kc-context-section="eventos">
          <div class="kc-sidebar-section-head kc-sidebar-section-head--accordion">
            <h3><i class="fas fa-circle-info"></i> Eventos com contexto</h3>
            <button type="button" data-kc-sidebar-toggle="true">Alternar</button>
          </div>
          <div class="kc-sidebar-section__body">
            <p class="kc-sidebar-help">Informação útil do módulo.</p>
            <details class="kc-sidebar-context"><summary>Critérios</summary><p>Conteúdo detalhado.</p></details>
          </div>
        </div>
        <div data-kc-context-section="home">
          <button type="button" class="kc-module-heading kc-module-heading--home-context" data-kc-context-open="home" aria-label="Abrir informações sobre o KinoCampus" aria-haspopup="dialog">
            <span class="kc-module-heading__label"><i class="fas fa-circle-info" aria-hidden="true"></i><span>Sobre o KinoCampus</span></span>
            <span class="kc-context-info-btn" aria-hidden="true"><i class="fas fa-circle-info" aria-hidden="true"></i></span>
          </button>
          <p class="kc-sidebar-help">A comunidade UFG em um só lugar.</p>
          <details class="kc-sidebar-context"><summary>Ver contexto</summary><p>Detalhe home.</p></details>
        </div>
      </aside>`;
    jest.resetModules();
    require('../../assets/js/features/kc-sidebar-context.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  test('abre de forma compacta e fecha com Escape restaurando o foco', () => {
    const trigger = document.querySelector('[data-kc-context-open="eventos"]');
    trigger.focus();
    trigger.click();

    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(modal.querySelector('#kcSidebarContextTitle').textContent).toContain('Eventos com contexto');
    expect(modal.querySelector('[data-kc-context-modal-body]').textContent).toContain('Informação útil do módulo.');
    expect(modal.querySelector('[data-kc-context-modal-body] h3')).toBeNull();
    expect(modal.querySelector('[data-kc-context-modal-body] [data-kc-sidebar-toggle]')).toBeNull();
    expect(modal.querySelector('details').open).toBe(false);
    expect(document.activeElement).toBe(modal.querySelector('.kc-sidebar-context-modal__close'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(trigger);
  });

  test('abre pelo cabecalho contextual unificado (mesmo padrao de modulo)', () => {
    const heading = document.querySelector('[data-kc-context-section="eventos"] .kc-module-heading--home-context')
      || document.querySelector('.kc-module-heading--home-context');
    heading.click();

    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getAttribute('aria-hidden')).toBe('true');
  });

  test('abre por teclado quando o cabecalho contextual esta focado', () => {
    const heading = document.querySelector('[data-kc-context-open="eventos"].kc-module-heading--home-context');
    heading.focus();
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  test('home reusa kc-module-heading e resolve o titulo Sobre o KinoCampus', () => {
    const homeOpeners = document.querySelectorAll('[data-kc-context-open="home"]');
    expect(homeOpeners).toHaveLength(1);

    const heading = homeOpeners[0];
    expect(heading.classList.contains('kc-module-heading')).toBe(true);
    expect(heading.querySelector('.kc-module-heading__label > span').textContent).toBe('Sobre o KinoCampus');
    expect(heading.querySelector('span.kc-context-info-btn')).not.toBeNull();
    expect(heading.querySelector('button.kc-context-info-btn')).toBeNull();

    heading.click();
    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(modal.querySelector('#kcSidebarContextTitle').textContent).toContain('Sobre o KinoCampus');
    expect(modal.querySelector('[data-kc-context-modal-body]').textContent).toContain('A comunidade UFG em um só lugar.');
    expect(modal.querySelector('[data-kc-context-modal-body] .kc-module-heading')).toBeNull();
    expect(modal.querySelector('details').open).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(heading);
  });
});
