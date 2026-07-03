describe('kc-sidebar-context', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <button type="button" data-kc-context-open="eventos">Abrir contexto</button>
      <h3 class="kc-home-context-heading" data-kc-context-open="eventos" role="button" tabindex="0">
        <span class="kc-home-context-heading__label"><i class="fas fa-circle-info"></i> Sobre Eventos</span>
        <button type="button" data-kc-context-open="eventos" aria-label="Abrir detalhes"><i class="fas fa-circle-info"></i></button>
      </h3>
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

  test('abre pelo cabecalho contextual inteiro e pelo botao interno', () => {
    const heading = document.querySelector('.kc-home-context-heading');
    heading.click();

    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.getAttribute('aria-hidden')).toBe('true');

    heading.querySelector('button').click();
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  test('abre por teclado quando o cabecalho contextual esta focado', () => {
    const heading = document.querySelector('.kc-home-context-heading');
    heading.focus();
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const modal = document.getElementById('kcSidebarContextModal');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
});
