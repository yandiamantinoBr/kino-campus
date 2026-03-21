/**
 * KinoCampus - Search Modal Mobile (V2.0.0)
 *
 * No mobile, o input de busca vira um botão retangular que abre
 * um modal com blur (igual ao kc-create-modal).
 * O modal reutiliza o dropdown do kc-search.js redirecionando
 * os eventos para o #searchInput real via InputEvent sintético.
 */

(function () {
  'use strict';

  /* ─── Estado ─────────────────────────────────────────────── */
  let overlay   = null;
  let card      = null;
  let modalInput = null;
  let isOpen    = false;

  /* ─── Placeholder por página ─────────────────────────────── */
  function getPagePlaceholder() {
    const real = document.getElementById('searchInput');
    if (real && real.placeholder) return real.placeholder;
    return 'Busque por itens, eventos, vagas na UFG...';
  }

  /* ─── Criação do modal (uma única vez) ───────────────────── */
  function buildModal() {
    /* Overlay com blur — mesmo padrão do kc-create-modal */
    overlay = document.createElement('div');
    overlay.className  = 'kc-search-modal-overlay';
    overlay.id         = 'kcSearchModalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Busca');

    card = document.createElement('div');
    card.className = 'kc-search-modal-card';

    card.innerHTML = `
      <div class="kc-search-modal-card__header">
        <button class="kc-search-modal-card__close" aria-label="Fechar busca">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div class="kc-search-modal-card__bar">
          <i class="fas fa-search kc-search-modal-card__icon"></i>
          <input
            type="search"
            id="kcSearchModalInput"
            class="kc-search-modal-card__input"
            placeholder=""
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
          <button class="kc-search-modal-card__clear" aria-label="Limpar busca" style="display:none">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    modalInput = card.querySelector('#kcSearchModalInput');
    const clearBtn = card.querySelector('.kc-search-modal-card__clear');

    /* Fecha ao clicar no overlay (fora do card) */
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    card.querySelector('.kc-search-modal-card__close').addEventListener('click', closeModal);

    /* Escape fecha */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeModal();
    });

    /* Botão limpar */
    clearBtn.addEventListener('click', () => {
      modalInput.value = '';
      clearBtn.style.display = 'none';
      syncToRealInput('');
      modalInput.focus();
    });

    /* Quando o usuário digita no modal → sincroniza com #searchInput real */
    modalInput.addEventListener('input', () => {
      const q = modalInput.value;
      clearBtn.style.display = q ? 'flex' : 'none';
      syncToRealInput(q);
    });

    /* Confirmação via Enter → abre search-results.html */
    modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = modalInput.value.trim();
        if (q) {
          window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
        }
      }
    });
  }

  /**
   * Copia o valor para o #searchInput real e dispara um InputEvent
   * para que o kc-search.js (que escuta esse input) mostre o dropdown.
   * O dropdown já usa position:fixed e vai aparecer sobre o modal.
   */
  function syncToRealInput(value) {
    const real = document.getElementById('searchInput');
    if (!real) return;
    real.value = value;
    real.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ─── Abrir / fechar ─────────────────────────────────────── */
  function openModal() {
    if (!overlay) buildModal();

    /* Atualiza placeholder com o da página atual */
    if (modalInput) modalInput.placeholder = getPagePlaceholder();

    overlay.classList.add('active');
    document.body.classList.add('kc-modal-open');
    isOpen = true;

    /* Foco com pequeno delay para a animação CSS completar */
    requestAnimationFrame(() => {
      if (modalInput) modalInput.focus();
    });
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.classList.remove('kc-modal-open');
    isOpen = false;

    /* Limpa o input real para não deixar dropdown aberto */
    syncToRealInput('');
    if (modalInput) modalInput.value = '';
  }

  /* ─── Inicialização ──────────────────────────────────────── */
  function init() {
    const mobileBtn = document.getElementById('kcSearchMobileBtn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', openModal);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.KCSearchModal = Object.freeze({ open: openModal, close: closeModal });
})();
