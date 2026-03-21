/**
 * KinoCampus - Mobile Search Modal (V1.0.0)
 * Provides full-screen search on mobile devices
 * Integrates with existing kc-search.js for results
 */

(function () {
  'use strict';

  let modal = null;
  let modalInput = null;
  let modalResults = null;
  let isModalActive = false;

  function createSearchModal() {
    const container = document.createElement('div');
    container.className = 'kc-search-modal';
    container.id = 'kcSearchModal';

    container.innerHTML = `
      <div class="kc-search-modal__header">
        <button class="kc-search-modal__close" aria-label="Fechar busca">
          <i class="fas fa-arrow-left"></i>
        </button>
        <input
          type="search"
          class="kc-search-modal__input"
          id="kcSearchModalInput"
          placeholder="Busque por itens, eventos, vagas na UFG..."
          autocomplete="off"
          autocorrect="off"
        />
      </div>
      <div class="kc-search-modal__results" id="kcSearchModalResults"></div>
    `;

    document.body.appendChild(container);
    modal = container;
    modalInput = container.querySelector('#kcSearchModalInput');
    modalResults = container.querySelector('#kcSearchModalResults');

    // Close button
    container.querySelector('.kc-search-modal__close').addEventListener('click', closeModal);

    // Keyboard: Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalActive) {
        closeModal();
      }
    });

    // Input: delegate to existing search logic
    modalInput.addEventListener('input', handleSearchInput);
  }

  function handleSearchInput() {
    const query = modalInput.value.trim();
    if (!query) {
      modalResults.innerHTML = '';
      return;
    }

    // Use existing window.kcSearchQuery or kc-search.js logic
    if (typeof window.kcSearchQuery === 'function') {
      window.kcSearchQuery(query, modalResults);
    } else if (typeof window.performSearch === 'function') {
      window.performSearch(query, modalResults);
    }
  }

  function openModal() {
    if (!modal) createSearchModal();
    modal.classList.add('active');
    isModalActive = true;
    modalInput.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
    }
    isModalActive = false;
    document.body.style.overflow = '';
  }

  function initMobileSearchButton() {
    const searchBtn = document.getElementById('kcSearchMobileBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', openModal);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileSearchButton);
  } else {
    initMobileSearchButton();
  }

  // Expose globally for testing
  window.KCSearchModal = Object.freeze({
    open: openModal,
    close: closeModal,
  });
})();
