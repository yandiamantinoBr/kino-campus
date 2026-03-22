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
  let overlay          = null;
  let card             = null;
  let modalInput       = null;
  let isOpen           = false;
  let dropdownObserver = null;

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
          if (window.kcSearch && typeof window.kcSearch.navigateToResults === 'function') {
            window.kcSearch.navigateToResults(q, { source: 'mobile-modal-enter' });
          } else {
            window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
          }
        }
      }
    });
  }

  /**
   * Reposiciona o dropdown logo abaixo da barra de busca do modal.
   * Chamado pelo MutationObserver sempre que o dropdown fica ativo.
   */
  function repositionDropdown(dropdown) {
    if (!card) return;
    const bar = card.querySelector('.kc-search-modal-card__bar');
    if (!dropdown || !bar) return;
    const rect = bar.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    let w = Math.max(rect.width, 280);
    let l = rect.left;
    if (l + w > vw - 8) l = Math.max(8, vw - w - 8);
    if (l < 8) l = 8;
    if (w > vw - 16) w = vw - 16;
    dropdown.style.top    = `${rect.bottom + 6}px`;
    dropdown.style.left   = `${l}px`;
    dropdown.style.width  = `${w}px`;
    dropdown.style.zIndex = '10001'; /* acima do overlay (9999) e padrão (10000) */
  }

  /**
   * Observa a classe 'active' no dropdown e reposiciona sempre que ele aparecer
   * enquanto o modal estiver aberto. O kc-search.js debounce de 180 ms faz com
   * que um simples requestAnimationFrame dispare cedo demais; o Observer garante
   * que a reposição ocorra exatamente quando o dropdown se torna visível.
   */
  function startDropdownObserver() {
    if (dropdownObserver) return;
    const tryObserve = () => {
      const dropdown = document.getElementById('kcSearchDropdown') ||
                       document.querySelector('.kc-search-dropdown');
      if (!dropdown) { setTimeout(tryObserve, 100); return; }
      dropdownObserver = new MutationObserver(() => {
        if (isOpen && dropdown.classList.contains('active')) {
          repositionDropdown(dropdown);
        }
      });
      dropdownObserver.observe(dropdown, { attributes: true, attributeFilter: ['class'] });
    };
    tryObserve();
  }

  function stopDropdownObserver() {
    if (dropdownObserver) { dropdownObserver.disconnect(); dropdownObserver = null; }
  }

  /**
   * Copia o valor para o #searchInput real e dispara um InputEvent
   * para que o kc-search.js mostre o dropdown.
   * A reposição é tratada pelo MutationObserver (startDropdownObserver).
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

    /* Inicia observer para reposicionar dropdown quando ficar ativo */
    startDropdownObserver();

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

    stopDropdownObserver();

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
