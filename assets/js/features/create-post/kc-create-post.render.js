/**
 * @file kc-create-post.render.js
 * @description Sub-módulo de render/modal para kc-create-post.js.
 *   Extraído de kc-create-post.js (v11.31.7).
 *   Registra: window._KCCreatePost.render
 *
 *   Contém:
 *   - _kcFormatDescriptionField  — formatação markdown no textarea
 *   - _kcUpdateDescPreview       — preview em tempo real da descrição
 *   - kcCreateSustainSectionHtml — seção sustentabilidade
 *   - kcCreateVisibilitySectionHtml — seção visibilidade
 *   - kcEnsureCreateModal        — bootstrap do DOM do modal
 *   - kcRenderCreateModal        — render dinâmico do conteúdo do modal
 */

(function () {
  'use strict';

  window._KCCreatePost = window._KCCreatePost || {};

  // ── Estado compartilhado ──────────────────────────────────────────────────
  function _getState() {
    return window._KCCreatePost && window._KCCreatePost._state;
  }

  // ── Constantes de schema ──────────────────────────────────────────────────
  function _getModalId() {
    var s = window._KCCreatePost && window._KCCreatePost.schema;
    return (s && s.modalId) || 'kcCreatePostModalOverlay';
  }

  function _getModules() {
    var s = window._KCCreatePost && window._KCCreatePost.schema;
    return (s && s.modules) || {};
  }

  function _getVisibilityOptions() {
    var s = window._KCCreatePost && window._KCCreatePost.schema;
    return (s && s.visibilityOptions) || [];
  }

  // ── Helper de escape ──────────────────────────────────────────────────────
  function _esc(str) {
    return (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
      ? window.KCUtils.escapeHtml(str)
      : String(str == null ? '' : str);
  }

  // ── Description formatting helpers ────────────────────────────────────────

  /**
   * Aplica formatação markdown no textarea de descrição.
   * Reutiliza a mesma lógica do toolbar de comentários.
   */
  function _kcFormatDescriptionField(textarea, format) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const hasSelection = !!selectedText;

    const wrapSelection = function (before, after, fallbackText) {
      const baseText = hasSelection ? selectedText : (fallbackText || 'texto');
      const formatted = `${before}${baseText}${after}`;
      textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
      textarea.focus();
      const cursorEnd = start + formatted.length;
      textarea.selectionStart = cursorEnd;
      textarea.selectionEnd = cursorEnd;
    };

    const insertBlock = function (blockText) {
      const prefix = (start > 0 && textarea.value[start - 1] !== '\n') ? '\n' : '';
      const suffix = (end < textarea.value.length && textarea.value[end] !== '\n') ? '\n' : '';
      const formatted = `${prefix}${blockText}${suffix}`;
      textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
      textarea.focus();
      const cursorEnd = start + formatted.length;
      textarea.selectionStart = cursorEnd;
      textarea.selectionEnd = cursorEnd;
    };

    switch (format) {
      case 'bold':         wrapSelection('**', '**', 'negrito'); break;
      case 'italic':       wrapSelection('*', '*', 'itálico'); break;
      case 'underline':    wrapSelection('__', '__', 'sublinhado'); break;
      case 'strikethrough': wrapSelection('~~', '~~', 'tachado'); break;
      case 'inlinecode':   wrapSelection('`', '`', 'código'); break;
      case 'quote':        insertBlock(`> ${hasSelection ? selectedText : 'citação'}`); break;
      case 'bullet':       insertBlock(`- ${hasSelection ? selectedText : 'item da lista'}`); break;
      case 'link': {
        const label = hasSelection ? selectedText : 'texto do link';
        const formatted = `[${label}](https://)`;
        textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
        const cursorStart = start + formatted.length - 1;
        textarea.focus();
        textarea.selectionStart = cursorStart;
        textarea.selectionEnd = cursorStart;
        break;
      }
      default: return;
    }

    _kcUpdateDescPreview(textarea);
    // Trigger input event so value is captured
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Atualiza a pré-visualização da descrição com markdown renderizado.
   */
  function _kcUpdateDescPreview(textarea) {
    const preview = document.getElementById('kcDescPreview');
    if (!preview) return;
    const value = String(textarea.value || '').trim();
    if (!value) {
      preview.style.display = 'none';
      preview.innerHTML = '';
      return;
    }
    const renderMd = (window.KCUtils && typeof window.KCUtils.renderMarkdownInline === 'function')
      ? window.KCUtils.renderMarkdownInline
      : _esc;
    preview.style.display = 'block';
    preview.innerHTML = renderMd(value);
  }

  // ── Section HTML builders ─────────────────────────────────────────────────

  function kcCreateSustainSectionHtml() {
    const state = _getState();
    const checked = (state && state.values && (state.values.sustentavel === true || state.values.sustentavel === 'true')) ? 'checked' : '';
    return `
      <label class="kc-check" for="kcField_sustentavel">
        <input id="kcField_sustentavel" name="sustentavel" type="checkbox" ${checked} />
        <span>Esta publicação contribui para a sustentabilidade</span>
      </label>
    `;
  }

  function kcCreateVisibilitySectionHtml() {
    const state = _getState();
    const selected = kcNormalizePostVisibilityValue(
      state && state.values && state.values.visibility,
      state && state.editMode ? 'public' : 'community'
    );
    const optionsHtml = _getVisibilityOptions().map((option) => {
      const active = selected === option.value;
      return `
        <label class="kc-create-visibility-option${active ? ' is-active' : ''}">
          <input type="radio" name="visibility" value="${_esc(option.value)}" ${active ? 'checked' : ''} />
          <span class="kc-create-visibility-option__label">${_esc(option.label)}</span>
          <small>${_esc(option.hint)}</small>
        </label>
      `;
    }).join('');

    return `
      <div class="kc-create-group kc-create-group--visibility">
        <div class="kc-create-group__head kc-create-group__head--row">
          <span>Visibilidade</span>
          <small>Defina quem pode abrir este anúncio.</small>
        </div>
        <div class="kc-create-visibility-toggle">${optionsHtml}</div>
      </div>
    `;
  }

  // ── Tags adicionais geridas pelo usuário ─────────────────────────────────

  function kcGetUserTagsApi() {
    const api = window.KCPostUserTags;
    return api && typeof api.normalize === 'function' && typeof api.validate === 'function' ? api : null;
  }

  function kcNormalizeUserTags(value) {
    const api = kcGetUserTagsApi();
    return api ? api.normalize(value).tags : [];
  }

  function kcSerializeUserTags(value) {
    const api = kcGetUserTagsApi();
    return api && typeof api.serialize === 'function' ? api.serialize(value) : '[]';
  }

  function kcUserTagKey(value) {
    const api = kcGetUserTagsApi();
    return api && typeof api.tagKey === 'function' ? api.tagKey(value) : String(value || '');
  }

  function kcRenderUserTagsField(field, value) {
    const tags = kcNormalizeUserTags(value);
    const limit = Number(field.maxItems) || 6;
    const selectedHtml = tags.length
      ? tags.map((tag) => `
        <button class="kc-field-chip" type="button" data-kc-user-tag-remove="${_esc(kcUserTagKey(tag))}" aria-label="Remover ${_esc(tag)}">
          <span>${_esc(tag)}</span>
          <i class="fas fa-times"></i>
        </button>
      `).join('')
      : '<span class="kc-field-chip__empty">Nenhuma tag adicional.</span>';
    const fieldId = 'kcField_' + field.name;
    const hint = field.hint || ('Adicione até ' + limit + ' tags adicionais para facilitar a descoberta desta publicação.');

    return `
      <div class="kc-field kc-field--user-tags" data-kc-user-tags-field="true" data-kc-user-tags-limit="${_esc(limit)}">
        <label for="${_esc(fieldId)}">${_esc(field.label)}</label>
        <input type="hidden" name="${_esc(field.name)}" value="${_esc(kcSerializeUserTags(tags))}" data-kc-user-tags-value="true" />
        <div class="kc-field-chip-row" data-kc-user-tags-selected="true">${selectedHtml}</div>
        <div class="kc-field-inline">
          <input id="${_esc(fieldId)}" type="text" maxlength="${_esc(field.maxLength || 60)}" placeholder="${_esc(field.placeholder || '')}" data-kc-user-tags-input="true" aria-describedby="${_esc(fieldId)}Hint" />
          <button class="kc-field-inline__action" type="button" data-kc-user-tag-add="true">Adicionar</button>
        </div>
        <small id="${_esc(fieldId)}Hint" class="kc-field-hint">${_esc(hint)} (${tags.length}/${limit})</small>
      </div>
    `;
  }

  function kcShowUserTagValidation(message) {
    if (typeof window.showToast === 'function') window.showToast(message, 'warn', 3200);
  }

  function kcAppendUserTagFromInput(input) {
    if (!input) return;
    const api = kcGetUserTagsApi();
    const state = _getState();
    const field = input.closest('[data-kc-user-tags-field]');
    if (!api || !state || !field) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    const hidden = field.querySelector('[data-kc-user-tags-value]');
    const current = hidden && typeof api.parseSerialized === 'function'
      ? api.parseSerialized(hidden.value)
      : kcNormalizeUserTags(state.values && state.values.userTags);
    const additions = typeof api.parseText === 'function' ? api.parseText(raw) : [raw];
    const limit = Number(field.getAttribute('data-kc-user-tags-limit')) || api.STANDARD_LIMIT || 6;
    const checked = api.validate(current.concat(additions), { limit: limit });
    if (!checked.ok) {
      const firstError = checked.errors && checked.errors[0];
      kcShowUserTagValidation((firstError && firstError.message) || 'Não foi possível adicionar esta tag.');
      input.focus();
      return;
    }
    state.values = state.values || {};
    state.values.userTags = checked.tags;
    input.value = '';
    kcRenderCreateModal();
    window.requestAnimationFrame(() => {
      const nextInput = document.querySelector('[data-kc-user-tags-input]');
      const nextField = nextInput && nextInput.closest ? nextInput.closest('[data-kc-user-tags-field]') : null;
      if (nextField && typeof nextField.scrollIntoView === 'function') {
        nextField.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      if (nextInput) {
        try { nextInput.focus({ preventScroll: true }); } catch (_) { nextInput.focus(); }
      }
    });
  }

  function kcRemoveUserTag(button) {
    const api = kcGetUserTagsApi();
    const state = _getState();
    const field = button && button.closest('[data-kc-user-tags-field]');
    if (!api || !state || !field) return;
    const hidden = field.querySelector('[data-kc-user-tags-value]');
    const current = hidden && typeof api.parseSerialized === 'function'
      ? api.parseSerialized(hidden.value)
      : kcNormalizeUserTags(state.values && state.values.userTags);
    const removeKey = button.getAttribute('data-kc-user-tag-remove') || '';
    state.values = state.values || {};
    state.values.userTags = current.filter((tag) => kcUserTagKey(tag) !== removeKey);
    kcRenderCreateModal();
  }

  // ── Modal DOM setup ───────────────────────────────────────────────────────

  function kcEnsureCreateModal() {
    if (document.getElementById(_getModalId())) return;

    const overlay = document.createElement('div');
    overlay.id = _getModalId();
    overlay.className = 'kc-modal-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="kc-create-modal" role="dialog" aria-modal="true" aria-labelledby="kcCreateModalTitle">
        <div class="kc-create-modal__header">
          <h2 id="kcCreateModalTitle"><i class="fas fa-plus-circle"></i> Nova Publicação</h2>
          <button type="button" class="kc-create-modal__close" aria-label="Fechar"><i class="fas fa-times"></i></button>
        </div>
        <div class="kc-create-modal__body">
          <div class="kc-create-step">
            <label class="kc-create-label">O que você vai publicar?</label>
            <div class="kc-create-grid" id="kcCreateModuleGrid"></div>
          </div>

          <form id="kcCreatePostForm" class="kc-create-form" novalidate>
            <div id="kcCreateDynamic"></div>
          </form>
        </div>
        <div class="kc-create-modal__footer">
          <button type="submit" form="kcCreatePostForm" class="kc-create-submit" disabled>Publicar Agora</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Click fora fecha — com confirmação se houver dados preenchidos
    function kcMaybeCloseCreatePostModal() {
      const st = _getState();
      if (!st) return;
      const hasTitulo = String(st.values && st.values.titulo || '').trim().length > 0;
      const hasDescricao = String(st.values && st.values.descricao || '').trim().length > 0;
      const hasImages = !!(st.images && st.images.length > 0);
      if (st.moduleKey && (hasTitulo || hasDescricao || hasImages)) {
        if (!window.confirm('Descartar publicação? As informações preenchidas serão perdidas.')) return;
      }
      kcCloseCreatePostModal();
    }

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) kcMaybeCloseCreatePostModal();
    });

    const closeBtn = overlay.querySelector('.kc-create-modal__close');
    if (closeBtn) closeBtn.addEventListener('click', kcMaybeCloseCreatePostModal);

    // Delegation: módulo / tags
    overlay.addEventListener('click', (e) => {
      const moduleBtn = e.target.closest('[data-kc-module]');
      if (moduleBtn) {
        kcCaptureCreateValues();
        const st = _getState();
        if (!st) return;
        st.moduleKey = moduleBtn.getAttribute('data-kc-module');
        st.selections = {};
        st.values = {};
        st.images = [];
        st.coverImageId = null;
        kcRenderCreateModal();
        return;
      }

      const chip = e.target.closest('[data-kc-chip]');
      if (chip) {
        kcCaptureCreateValues();
        const st = _getState();
        if (!st) return;
        const groupId = chip.getAttribute('data-kc-group');
        const key = chip.getAttribute('data-kc-chip');
        st.selections[groupId] = key;
        // auto-sugestão: Sustentabilidade -> marca "sustentável" por padrão
        if (groupId === 'topico' && key === 'sustentabilidade') st.values.sustentavel = true;
        kcRenderCreateModal();
        return;
      }

      const areaSuggestion = e.target.closest('[data-kc-area-suggestion]');
      if (areaSuggestion) {
        const value = areaSuggestion.getAttribute('data-kc-area-suggestion') || '';
        const st = _getState();
        if (st) st.values.areaAtuacao = value;
        const areaInput = overlay.querySelector('input[name="areaAtuacao"]');
        if (areaInput) areaInput.value = value;
        return;
      }

      const housingRegionSuggestion = e.target.closest('[data-kc-housing-region-suggestion]');
      if (housingRegionSuggestion) {
        const value = housingRegionSuggestion.getAttribute('data-kc-housing-region-suggestion') || '';
        const fieldContainer = housingRegionSuggestion.closest('.kc-field--housing-region');
        const regionInput = fieldContainer
          ? fieldContainer.querySelector('[data-kc-housing-region-input]')
          : overlay.querySelector('input[name="regiao"]');
        if (regionInput) {
          regionInput.value = value;
          const fieldName = regionInput.getAttribute('name') || 'regiao';
          const st = _getState();
          if (st) st.values[fieldName] = value;
          kcSyncHousingRegionInput(regionInput);
        }
        return;
      }

      const showMorePills = e.target.closest('[data-kc-show-more-pills]');
      if (showMorePills) {
        const field = showMorePills.closest('.kc-field--housing-region');
        if (field) {
          const extra = field.querySelector('.kc-field-pill-row--extra');
          const allShowMore = field.querySelectorAll('[data-kc-show-more-pills]');
          if (extra && extra.style.display === 'none') {
            extra.style.display = '';
            if (allShowMore[0]) { allShowMore[0].innerHTML = 'Ver menos <i class="fas fa-chevron-up"></i>'; }
          } else if (extra) {
            extra.style.display = 'none';
            if (allShowMore[0]) { allShowMore[0].innerHTML = 'Ver mais <i class="fas fa-chevron-down"></i>'; }
          }
        }
        return;
      }

      const lostFoundLocationSuggestion = e.target.closest('[data-kc-lostfound-location-suggestion]');
      if (lostFoundLocationSuggestion) {
        const value = lostFoundLocationSuggestion.getAttribute('data-kc-lostfound-location-suggestion') || '';
        const st = _getState();
        if (st) st.values.localizacao = value;
        const locationInput = overlay.querySelector('input[name="localizacao"]');
        if (locationInput) {
          locationInput.value = value;
          kcSyncLostFoundLocationInput(locationInput);
        }
        return;
      }

      const removeUserTag = e.target.closest('[data-kc-user-tag-remove]');
      if (removeUserTag) {
        kcRemoveUserTag(removeUserTag);
        return;
      }

      const addUserTag = e.target.closest('[data-kc-user-tag-add]');
      if (addUserTag) {
        const field = addUserTag.closest('[data-kc-user-tags-field]');
        const input = field ? field.querySelector('[data-kc-user-tags-input]') : null;
        kcAppendUserTagFromInput(input);
        return;
      }

      const housingFeatureSuggestion = e.target.closest('[data-kc-housing-feature-suggestion]');
      if (housingFeatureSuggestion) {
        const field = kcGetHousingFeatureFieldContext(housingFeatureSuggestion);
        const hidden = field ? field.querySelector('[data-kc-housing-features-value]') : null;
        const current = kcParseStringArrayValue(hidden ? hidden.value : '');
        const nextValue = housingFeatureSuggestion.getAttribute('data-kc-housing-feature-suggestion') || '';
        const resolvedEntry = kcResolveHousingFeatureEntries(current).find((entry) => entry.label === nextValue);
        const nextList = resolvedEntry
          ? kcResolveHousingFeatureEntries(current).filter((entry) => entry.key !== resolvedEntry.key).map((entry) => entry.label)
          : current.concat(nextValue);
        kcSyncHousingFeatureField(field, nextList);
        return;
      }

      const removeHousingFeature = e.target.closest('[data-kc-housing-feature-remove]');
      if (removeHousingFeature) {
        const field = kcGetHousingFeatureFieldContext(removeHousingFeature);
        const hidden = field ? field.querySelector('[data-kc-housing-features-value]') : null;
        const current = kcResolveHousingFeatureEntries(hidden ? hidden.value : '');
        const removeKey = removeHousingFeature.getAttribute('data-kc-housing-feature-remove') || '';
        kcSyncHousingFeatureField(field, current.filter((entry) => entry.key !== removeKey).map((entry) => entry.label));
        return;
      }

      const addHousingFeature = e.target.closest('[data-kc-housing-feature-add]');
      if (addHousingFeature) {
        const field = kcGetHousingFeatureFieldContext(addHousingFeature);
        const input = field ? field.querySelector('[data-kc-housing-features-input="true"]') : null;
        kcAppendHousingFeatureFromInput(input);
        return;
      }

      const imgActionBtn = e.target.closest('[data-kc-img-action]');
      if (imgActionBtn) {
        const action = imgActionBtn.getAttribute('data-kc-img-action');
        const id = imgActionBtn.getAttribute('data-kc-img-id');
        if (action === 'remove') kcRemoveCreateImageById(id);
        if (action === 'cover') kcSetCreateCoverImageById(id);
        return;
      }

      const openImagesBtn = e.target.closest('[data-kc-open-images]');
      if (openImagesBtn) {
        const input = overlay.querySelector('#kcImagesInput');
        if (input && !input.disabled) input.click();
        return;
      }
    });

    // Form: input binding
    const form = overlay.querySelector('#kcCreatePostForm');
    if (form) {
      form.addEventListener('input', () => kcCaptureCreateValues());
      form.addEventListener('change', (e) => {
        kcCaptureCreateValues();
        const target = e && e.target;
        if (target && target.name === 'visibility') kcRenderCreateModal();
      });
      form.addEventListener('keydown', (e) => {
        const target = e.target;
        if (!target || !target.matches) return;
        if (target.matches('[data-kc-user-tags-input]') && (e.key === 'Enter' || e.key === ',')) {
          e.preventDefault();
          kcAppendUserTagFromInput(target);
          return;
        }
        if (target.matches('[data-kc-housing-features-input="true"]') && (e.key === 'Enter' || e.key === ',')) {
          e.preventDefault();
          kcAppendHousingFeatureFromInput(target);
          kcCaptureCreateValues();
        }
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        kcHandleCreateSubmit();
      });
    }

    // Description formatting toolbar delegation
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-kc-desc-format]');
      if (!btn) return;
      e.preventDefault();
      const format = btn.getAttribute('data-kc-desc-format');
      const textarea = overlay.querySelector('#kcField_descricao');
      if (!textarea || !format) return;
      _kcFormatDescriptionField(textarea, format);
    });

    // Description preview on input
    overlay.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'kcField_descricao') {
        _kcUpdateDescPreview(e.target);
      }
    });

    // Imagens: input/drag&drop
    overlay.addEventListener('change', async (e) => {
      const target = e.target;
      if (!target) return;
      if (target.matches && target.matches('[data-kc-opportunity-area-input]')) {
        const resolved = kcResolveOpportunityAreaValue(target.value);
        if (resolved && resolved.label) {
          target.value = resolved.label;
          const st = _getState();
          if (st) st.values[target.name] = resolved.label;
        }
        return;
      }
      if (target.matches && target.matches('[data-kc-housing-region-input]')) {
        kcSyncHousingRegionInput(target);
        return;
      }
      if (target.matches && target.matches('[data-kc-lostfound-location-input]')) {
        kcSyncLostFoundLocationInput(target);
        return;
      }
      if (target.id !== 'kcImagesInput') return;
      const files = target.files;
      if (files && files.length) await kcAddImagesFromFiles(files);
      // permite selecionar o mesmo arquivo novamente
      try { target.value = ''; } catch { }
    });

    overlay.addEventListener('dragover', (e) => {
      const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
      if (!dz) return;
      e.preventDefault();
      dz.classList.add('is-dragover');
    });

    overlay.addEventListener('dragleave', (e) => {
      const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
      if (!dz) return;
      dz.classList.remove('is-dragover');
    });

    overlay.addEventListener('drop', async (e) => {
      const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
      if (!dz) return;
      e.preventDefault();
      dz.classList.remove('is-dragover');
      const files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length) await kcAddImagesFromFiles(files);
    });

    // ESC fecha
    document.addEventListener('keydown', (e) => {
      const st = _getState();
      if (e.key === 'Escape' && st && st.open) kcCloseCreatePostModal();
    });
  }

  // ── Modal dynamic render ──────────────────────────────────────────────────

  function kcRenderCreateModal() {
    const overlay = document.getElementById(_getModalId());
    if (!overlay) return;
    if (!kcHasCreateSchemaLoaded()) return;

    const kcCreateState = _getState();
    if (!kcCreateState) return;

    const KC_CREATE_SCHEMA = _getModules();

    const grid = overlay.querySelector('#kcCreateModuleGrid');
    const dynamic = overlay.querySelector('#kcCreateDynamic');
    const submitBtn = overlay.querySelector('.kc-create-submit');

    // Modo edição: ajusta título e botão, oculta seleção de módulo
    const titleEl = overlay.querySelector('#kcCreateModalTitle');
    const stepEl = overlay.querySelector('.kc-create-step');
    if (kcCreateState.editMode) {
      if (titleEl) titleEl.innerHTML = '<i class="fas fa-pen-to-square"></i> Alterar Publicação';
      if (stepEl) stepEl.style.display = 'none';
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus-circle"></i> Nova Publicação';
      if (stepEl) stepEl.style.display = '';
    }

    // módulo grid (oculto no modo edição)
    if (grid) {
      if (kcCreateState.editMode) {
        grid.innerHTML = '';
      } else {
        grid.innerHTML = '';
        Object.keys(KC_CREATE_SCHEMA).forEach((key) => {
          const schema = KC_CREATE_SCHEMA[key];
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'kc-create-cat-btn' + (kcCreateState.moduleKey === key ? ' active' : '');
          btn.setAttribute('data-kc-module', key);
          btn.innerHTML = `
            <i class="${schema.icon}"></i>
            <span>${_esc(schema.label.replace(' na UFG', ''))}</span>
          `;
          grid.appendChild(btn);
        });
      }
    }

    const schema = kcGetSchema(kcCreateState.moduleKey);
    const modalCard = overlay.querySelector('.kc-create-modal');
    if (modalCard) modalCard.classList.toggle('kc-create-modal--form-active', !!schema);

    // Conteúdo dinâmico
    if (!schema) {
      if (dynamic) {
        dynamic.innerHTML = '<div class="kc-create-hint">Escolha um módulo acima para liberar o formulário.</div>';
      }
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // Tag groups + fields
    const parts = [];

    // Tags/subtópicos
    if (schema.tagGroups && schema.tagGroups.length) {
      schema.tagGroups.forEach((g) => {
        const selectedKey = kcCreateState.selections[g.id] || '';
        parts.push(`<div class="kc-create-group"><div class="kc-create-group__head"><span>${_esc(g.label)}${g.required ? ' *' : ''}</span></div><div class="kc-chip-row">`);
        g.options.forEach((opt) => {
          const active = selectedKey === opt.key ? ' active' : '';
          const emoji = opt.emoji ? `<span class="kc-chip__emoji" aria-hidden="true">${_esc(opt.emoji)}</span>` : '';
          parts.push(`<button type="button" class="kc-chip${active}" data-kc-group="${_esc(g.id)}" data-kc-chip="${_esc(opt.key)}">${emoji}<span>${_esc(opt.label)}</span></button>`);
        });
        parts.push('</div></div>');
      });
    }

    // Fields
    // Detecta se o usuário atual é admin operator (KC_ADMIN_OPERATOR_USER_IDS
    // ou profile.is_admin=true). Quando admin, a descrição aceita 5000 chars
    // em vez de 2000 (override aplicado em kc-create-post.fields.js).
    const isAdminOperator = !!(window._KCCreatePost && window._KCCreatePost.fields
      && typeof window._KCCreatePost.fields.isCurrentUserAdminOperator === 'function'
      && window._KCCreatePost.fields.isCurrentUserAdminOperator());
    const fields = kcBuildFieldsForModule(kcCreateState.moduleKey, kcCreateState.selections, kcCreateState.values, { isAdmin: isAdminOperator });
    parts.push('<div class="kc-create-fields">');
    fields.forEach((f) => {
      const val = kcCreateState.values[f.name];
      const required = f.required ? 'required' : '';
      const label = _esc(f.label);
      const id = 'kcField_' + f.name;
      if (f.type === 'textarea') {
        const maxlength = (f.maxLength != null) ? `maxlength="${_esc(f.maxLength)}"` : '';
        const isDesc = f.name === 'descricao';
        const toolbar = isDesc ? `
            <div class="kc-editor-toolbar kc-desc-toolbar">
              <button type="button" data-kc-desc-format="bold" title="Negrito"><i class="fas fa-bold"></i></button>
              <button type="button" data-kc-desc-format="italic" title="Itálico"><i class="fas fa-italic"></i></button>
              <button type="button" data-kc-desc-format="underline" title="Sublinhado"><i class="fas fa-underline"></i></button>
              <button type="button" data-kc-desc-format="strikethrough" title="Tachado"><i class="fas fa-strikethrough"></i></button>
              <button type="button" data-kc-desc-format="inlinecode" title="Código"><i class="fas fa-code"></i></button>
              <button type="button" data-kc-desc-format="quote" title="Citação"><i class="fas fa-quote-right"></i></button>
              <button type="button" data-kc-desc-format="bullet" title="Lista"><i class="fas fa-list-ul"></i></button>
              <button type="button" data-kc-desc-format="link" title="Link"><i class="fas fa-link"></i></button>
            </div>
            <div class="kc-desc-preview" id="kcDescPreview" style="display:none;"></div>` : '';
        parts.push(`
          <div class="kc-field${isDesc ? ' kc-field--with-toolbar' : ''}">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>${toolbar}
            <textarea id="${id}" name="${_esc(f.name)}" rows="${f.rows || 4}" placeholder="${_esc(f.placeholder || '')}" ${required} ${maxlength}>${_esc(val || '')}</textarea>
            ${isDesc ? '<small class="kc-field-hint">Use **negrito**, *itálico*, ~~tachado~~, `código`, > citação, - lista</small>' : ''}
          </div>
        `);
      } else if (f.type === 'opportunity-area') {
        const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
          <button type="button" class="kc-field-pill" data-kc-area-suggestion="${_esc(opt.label)}">
            <i class="${_esc(opt.icon || 'fas fa-briefcase')}"></i>
            <span>${_esc(opt.label)}</span>
          </button>
        `).join('');
        const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
          <option value="${_esc(opt.label)}"></option>
        `).join('');
        parts.push(`
          <div class="kc-field kc-field--opportunity-area">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>
            <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="kcOpportunityAreaOptions" data-kc-opportunity-area-input="true" ${required} />
            <datalist id="kcOpportunityAreaOptions">${listItems}</datalist>
            <div class="kc-field-pill-row">${suggestions}</div>
            <small class="kc-field-hint">Escolha uma sugestão ou digite outra área.</small>
          </div>
        `);
      } else if (f.type === 'housing-region') {
        const listId = id + 'Options';
        const allOpts = Array.isArray(f.options) ? f.options : [];
        const PILL_LIMIT = 10;
        const visibleOpts = allOpts.slice(0, PILL_LIMIT);
        const hiddenOpts = allOpts.slice(PILL_LIMIT);
        const makePill = (opt) => `<button type="button" class="kc-field-pill" data-kc-housing-region-suggestion="${_esc(opt.label)}"><i class="${_esc(opt.icon || 'fas fa-map-pin')}"></i><span>${_esc(opt.label)}</span></button>`;
        const visiblePills = visibleOpts.map(makePill).join('');
        const hiddenPills = hiddenOpts.length ? `<div class="kc-field-pill-row kc-field-pill-row--extra" style="display:none">${hiddenOpts.map(makePill).join('')}</div><button type="button" class="kc-field-show-more" data-kc-show-more-pills="true" style="display:none">Ver menos <i class="fas fa-chevron-up"></i></button>` : '';
        const showMoreBtn = hiddenOpts.length ? `<button type="button" class="kc-field-show-more" data-kc-show-more-pills="true">Ver mais <i class="fas fa-chevron-down"></i></button>` : '';
        const listItems = allOpts.map((opt) => `<option value="${_esc(opt.label)}"></option>`).join('');
        parts.push(`
          <div class="kc-field kc-field--housing-region">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>
            <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="${listId}" data-kc-housing-region-input="true" ${required} />
            <datalist id="${listId}">${listItems}</datalist>
            <div class="kc-field-pill-row">${visiblePills}</div>
            ${showMoreBtn}${hiddenPills}
            <small class="kc-field-hint">${f.hint ? _esc(f.hint) : 'Escolha uma sugestão ou digite outra região.'}</small>
          </div>
        `);
      } else if (f.type === 'achados-location') {
        const listId = id + 'Options';
        const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
          <button type="button" class="kc-field-pill" data-kc-lostfound-location-suggestion="${_esc(opt.label)}">
            <i class="${_esc(opt.icon || 'fas fa-map-marker-alt')}"></i>
            <span>${_esc(opt.label)}</span>
          </button>
        `).join('');
        const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
          <option value="${_esc(opt.label)}"></option>
        `).join('');
        parts.push(`
          <div class="kc-field kc-field--lostfound-location">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>
            <input id="${id}" name="${_esc(f.name)}" type="text" placeholder="${_esc(f.placeholder || '')}" value="${_esc(val || '')}" list="${listId}" data-kc-lostfound-location-input="true" ${required} />
            <datalist id="${listId}">${listItems}</datalist>
            <div class="kc-field-pill-row">${suggestions}</div>
            <small class="kc-field-hint">Escolha um local comum ou digite outro ponto de referência.</small>
          </div>
        `);
      } else if (f.type === 'user-tags') {
        parts.push(kcRenderUserTagsField(f, val));
      } else if (f.type === 'housing-features') {
        const listId = id + 'Options';
        const selectedEntries = kcResolveHousingFeatureEntries(val);
        const selectedLabels = selectedEntries.map((entry) => entry.label);
        const selectedHtml = selectedEntries.length
          ? selectedEntries.map((entry) => `
            <button class="kc-field-chip" type="button" data-kc-housing-feature-remove="${_esc(entry.key)}" aria-label="Remover ${_esc(entry.label)}">
              ${entry.emoji ? `<span class="kc-field-chip__emoji">${_esc(entry.emoji)}</span>` : ''}
              <span>${_esc(entry.label)}</span>
              <i class="fas fa-times"></i>
            </button>
          `).join('')
          : '<span class="kc-field-chip__empty">Nenhuma característica selecionada.</span>';
        const selectedKeys = new Set(selectedEntries.map((entry) => entry.key));
          const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
            <button type="button" class="kc-field-pill${selectedKeys.has(String(opt.key || '').trim()) ? ' is-active' : ''}" data-kc-housing-feature-suggestion="${_esc(opt.label)}" data-kc-housing-feature-key="${_esc(opt.key || '')}" aria-pressed="${selectedKeys.has(String(opt.key || '').trim()) ? 'true' : 'false'}">
              ${opt.emoji ? `<span class="kc-field-pill__emoji">${_esc(opt.emoji)}</span>` : ''}
              <span>${_esc(opt.label)}</span>
            </button>
          `).join('');
        const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
          <option value="${_esc(opt.label)}"></option>
        `).join('');
        parts.push(`
          <div class="kc-field kc-field--housing-features" data-kc-housing-features-field="true">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>
            <input type="hidden" name="${_esc(f.name)}" value="${_esc(kcSerializeHousingFeatureValues(selectedLabels))}" data-kc-housing-features-value="true" />
            <div class="kc-field-chip-row" data-kc-housing-features-selected="true">${selectedHtml}</div>
            <div class="kc-field-inline">
              <input id="${id}" type="text" placeholder="${_esc(f.placeholder || '')}" list="${listId}" data-kc-housing-features-input="true" />
              <button class="kc-field-inline__action" type="button" data-kc-housing-feature-add="true">Adicionar</button>
            </div>
            <datalist id="${listId}">${listItems}</datalist>
            <div class="kc-field-pill-row">${suggestions}</div>
            <small class="kc-field-hint">${f.hint ? _esc(f.hint) : 'Escolha sugestões ou adicione outros marcadores para o ambiente.'}</small>
          </div>
        `);
      } else if (f.type === 'select') {
        const opts = (f.options || []).map(o => {
          const isSel = String(val || '') === String(o);
          return `<option value="${_esc(o)}" ${isSel ? 'selected' : ''}>${_esc(o)}</option>`;
        }).join('');
        parts.push(`
          <div class="kc-field">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>
            <select id="${id}" name="${_esc(f.name)}" ${required}>
              <option value="" ${!val ? 'selected' : ''} disabled>Selecione...</option>
              ${opts}
            </select>
          </div>
        `);
      } else if (f.type === 'checkbox') {
        const checked = val === true || val === 'true' ? 'checked' : '';
        parts.push(`
          <label class="kc-check" for="${id}">
            <input id="${id}" name="${_esc(f.name)}" type="checkbox" ${checked} />
            <span>${label}</span>
          </label>
        `);
      } else if (f.type === 'notice') {
        const icon = f.icon ? `<i class="${_esc(f.icon)}"></i> ` : '';
        parts.push(`<div class="kc-field-notice">${icon}${f.text || ''}</div>`);
      } else {
        const type = _esc(f.type);
        const placeholder = _esc(f.placeholder || '');
        const valueAttr = (val != null && f.type !== 'file') ? `value="${_esc(val)}"` : '';
        const min = (f.min != null) ? `min="${_esc(f.min)}"` : '';
        const max = (f.max != null) ? `max="${_esc(f.max)}"` : '';
        const maxlength = (f.maxLength != null) ? `maxlength="${_esc(f.maxLength)}"` : '';
        const step = (f.step != null) ? `step="${_esc(f.step)}"` : '';
        const inputmode = f.inputmode ? `inputmode="${_esc(f.inputmode)}"` : '';
        const pattern = f.pattern ? `pattern="${_esc(f.pattern)}"` : '';
        const hintHtml = f.hint ? `<small class="kc-field-hint">${_esc(f.hint)}</small>` : '';
        parts.push(`
          <div class="kc-field">
            <label for="${id}">${label}${f.required ? ' *' : ''}</label>
            <input id="${id}" name="${_esc(f.name)}" type="${type}" placeholder="${placeholder}" ${valueAttr} ${required} ${min} ${max} ${maxlength} ${step} ${inputmode} ${pattern} />
            ${hintHtml}
          </div>
        `);
      }
    });
    parts.push('</div>');

    parts.push(kcCreateVisibilitySectionHtml());

    // Imagens (capa + até 4)
    parts.push(kcCreateImagesSectionHtml());
    // Sustentabilidade
    parts.push(kcCreateSustainSectionHtml());

    const renderedFieldsHtml = parts.join('')
      .replace(/Marcadores do ambiente/g, 'Características do ambiente')
      .replace(/Nenhum marcador selecionado\./g, 'Nenhuma característica selecionada.')
      .replace(/outros marcadores para o ambiente/g, 'outras características do ambiente');
    if (dynamic) dynamic.innerHTML = renderedFieldsHtml;

    if (window._KCCreatePost && window._KCCreatePost.media && typeof window._KCCreatePost.media.initDrag === 'function') {
      window._KCCreatePost.media.initDrag(dynamic.querySelector('.kc-img-grid'));
    }

    // Texto do botão de submit (edição vs criação)
    if (submitBtn) {
      submitBtn.textContent = kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora';
      // P0-A fix: botão sempre habilitado; kcHandleCreateSubmit valida e exibe toast
      submitBtn.disabled = false;
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window._KCCreatePost.render = {
    formatDescriptionField: _kcFormatDescriptionField,
    updateDescPreview: _kcUpdateDescPreview,
    createSustainSectionHtml: kcCreateSustainSectionHtml,
    createVisibilitySectionHtml: kcCreateVisibilitySectionHtml,
    ensureCreateModal: kcEnsureCreateModal,
    renderCreateModal: kcRenderCreateModal,
  };
})();
