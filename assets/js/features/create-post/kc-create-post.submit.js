/**
 * @file kc-create-post.submit.js
 * @description Sub-módulo do pipeline de submit/edição do formulário de criação de publicações (v11.31.6).
 * Extraído de kc-create-post.js. Registra window._KCCreatePost.submit.
 *
 * Dependências em runtime (todas globais, já carregadas antes deste script):
 *   - window._KCCreatePost           — namespace + estado (_state) criado por kc-create-post.js
 *   - window._KCCreatePost.resolvers — resolvers de domínio (kc-create-post.resolvers.js)
 *   - window._KCCreatePost.fields    — geração de campos (kc-create-post.fields.js)
 *   - window.KCAPI                   — cliente da API
 *   - window.KCActions               — actions legado
 *   - window.KCSupabase              — cliente Supabase direto
 *   - window.showToast               — utilitário de notificações
 *   - window.kcModulePage            — mapeamento módulo → página (kc-core.js)
 *   - window.kcCreateUserPost        — criação local/offline (kc-core.js)
 *   - window.isProductionRuntime     — guard de produção (kc-create-post.js)
 *   - window.kcCaptureCreateValues   — captura valores do formulário DOM
 *   - window.kcGetSchema             — acesso ao schema do módulo
 *   - window.kcGetActiveCreateFieldNames / kcReadActiveCreate* — filtros de campo ativo
 *   - window.kcNormalize* / kcResolve* — stubs de resolvers no core
 *   - window.kcGetOrderedCreateImages — lista de imagens ordenadas (media stub)
 *   - window.kcCloseCreatePostModal   — fechamento do modal
 *   - window.kcNormalizeMoneyInput    — normalização de moeda
 *   - window.kcNormalizePostVisibilityValue — normalização de visibilidade
 *   - window.kcParseBRLNumber         — parse de valor BRL
 *   - window.kcTagLabel               — rótulo de tag do schema
 *
 * Carregado após kc-create-post.fields.js em todos os HTMLs que usam o modal de criação.
 * Execução: IIFE imediata → window._KCCreatePost.submit disponível antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCCreatePost = window._KCCreatePost || {};

  // ── Acesso defensivo ao estado compartilhado ──────────────────────────────
  function _getState() {
    return window._KCCreatePost && window._KCCreatePost._state;
  }

  // ── Pipeline de submit/edição ─────────────────────────────────────────────
  async function handleCreateSubmit() {
    const kcCreateState = _getState();
    if (!kcCreateState) return;
    if (kcCreateState.submitting === true) return;

    kcCaptureCreateValues();
    const form = document.getElementById('kcCreatePostForm');
    const submitBtn = form ? form.querySelector('.kc-create-submit') : null;
    const originalSubmitText = submitBtn ? submitBtn.textContent : '';

    kcCreateState.submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = kcCreateState.editMode ? 'Salvando...' : 'Publicando...';
    }

    try {
      const schema = kcGetSchema(kcCreateState.moduleKey);
      if (!schema) {
        showToast('Selecione um módulo para publicar.', 'warn', 2200);
        return;
      }

      // valida tags obrigatórias
      const missing = (schema.tagGroups || []).filter(g => g.required && !kcCreateState.selections[g.id]);
      if (missing.length) {
        showToast('Selecione: ' + missing.map(m => m.label).join(', '), 'warn', 2600);
        return;
      }

      if (form) {
        const titleInput = form.querySelector('input[name="titulo"]');
        const descInput = form.querySelector('textarea[name="descricao"]');

        if (titleInput && typeof titleInput.setCustomValidity === 'function') {
          titleInput.setCustomValidity(String(titleInput.value || '').trim() ? '' : 'Informe um título válido.');
        }
        if (descInput && typeof descInput.setCustomValidity === 'function') {
          const normalizedDesc = String(descInput.value || '').trim();
          if (!normalizedDesc) {
            descInput.setCustomValidity('Informe uma descrição válida.');
          } else if (normalizedDesc.length > 2000) {
            descInput.setCustomValidity('A descrição deve ter no máximo 2000 caracteres.');
          } else {
            descInput.setCustomValidity('');
          }
        }

        const moneyFields = ['preco', 'orcamento', 'recompensa', 'contribuicao', 'remuneracao'];
        moneyFields.forEach((name) => {
          const input = form.querySelector(`input[name="${name}"]`);
          if (!input || typeof input.setCustomValidity !== 'function') return;

          const raw = String(kcCreateState.values[name] || '').trim();
          if (!raw) {
            input.setCustomValidity('');
            return;
          }

          const normalized = kcNormalizeMoneyInput(raw);
          if (normalized == null) {
            input.setCustomValidity('Informe um valor numérico válido (ex.: 10,00).');
            return;
          }

          input.setCustomValidity('');
          input.value = normalized;
          kcCreateState.values[name] = normalized;
        });

        if (!form.checkValidity()) {
          form.reportValidity();
          showToast('Revise os campos destacados e tente novamente.', 'warn', 2600);
          return;
        }
      }

      const title = String(kcCreateState.values.titulo || '').trim();
      const desc = String(kcCreateState.values.descricao || '').trim();
      if (!title || !desc) {
        // Fallback defensivo para payload em caso de DOM inconsistente.
        showToast('Revise os campos destacados e tente novamente.', 'warn', 2600);
        return;
      }
      const activeFieldNames = kcGetActiveCreateFieldNames(
        kcCreateState.moduleKey,
        kcCreateState.selections,
        kcCreateState.values
      );
      const activeLocation = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'localizacao', '');
      const activeAreaAtuacao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'areaAtuacao', '');
      const activeRegiao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'regiao', '');
      const activeMoradiaFeatures = kcReadActiveCreateArrayValue(activeFieldNames, kcCreateState.values, 'marcadoresMoradia');
      const activeCaronasFeatures = kcReadActiveCreateArrayValue(activeFieldNames, kcCreateState.values, 'marcadoresCarona');
      const activeOrigem = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'origem', '');
      const activeDestino = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'destino', '');
      const activeHorario = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'horario', '');
      const activeContribuicao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'contribuicao', '');
      const activeVagas = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'vagas', '');
      const activePrecoInput = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'preco', '');
      const activeOrcamento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'orcamento', '');
      const activeRecompensa = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'recompensa', '');
      const activeRemuneracao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'remuneracao', '');
      const activeContato = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'contato', '');
      const activeDetalhes = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'detalhes', '');
      const activeEntrega = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'entrega', '');
      const activeCondicao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'condicao', '');
      const activeDataEvento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'data', '');
      const activeDataFimEvento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'data_fim', '');
      const activeHoraEvento = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'hora', '');
      const activeLink = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'link', '');
      const activeModalidadeTrabalho = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'modalidadeTrabalho', '');
      const activeRegimeContratacao = kcReadActiveCreateStringValue(activeFieldNames, kcCreateState.values, 'regimeContratacao', '');
      const activeVisibility = kcReadActiveCreateValue(activeFieldNames, kcCreateState.values, 'visibility', kcCreateState.editMode ? 'public' : 'community');
      const activeLinkAsCta = kcReadActiveCreateBooleanValue(activeFieldNames, kcCreateState.values, 'link_as_cta', false);
      const activeGratuito = kcReadActiveCreateBooleanValue(activeFieldNames, kcCreateState.values, 'gratuito', false);
      const activeSustentavel = kcReadActiveCreateBooleanValue(activeFieldNames, kcCreateState.values, 'sustentavel', false);

      // Eventos: a data de término não pode ser anterior à data de início.
      if (kcCreateState.moduleKey === 'eventos' && activeDataEvento && activeDataFimEvento && activeDataFimEvento < activeDataEvento) {
        showToast('A data de término não pode ser anterior à data de início.', 'warn', 2800);
        return;
      }

      const categoryGroupId = schema.categoryGroupId;
      const rawCatKey = categoryGroupId ? kcCreateState.selections[categoryGroupId] : '';
      const isOpportunity = kcCreateState.moduleKey === 'oportunidades';
      const isMoradia = kcCreateState.moduleKey === 'moradia';
      const isAchados = kcCreateState.moduleKey === 'achados-perdidos';
      const isCaronas = kcCreateState.moduleKey === 'caronas';
      const catKey = isOpportunity
        ? kcNormalizeOpportunityTypeKey(rawCatKey)
        : (isMoradia ? kcNormalizeHousingTypeKey(rawCatKey) : rawCatKey);
      const catLabel = rawCatKey ? kcTagLabel(schema, categoryGroupId, rawCatKey) : '';

      // subcategoria: tenta usar 2º grupo (quando existir)
      const otherGroups = (schema.tagGroups || []).filter(g => g.id !== categoryGroupId);
      const subKey = otherGroups.length ? kcCreateState.selections[otherGroups[0].id] : '';
      const subLabel = subKey ? kcTagLabel(schema, otherGroups[0].id, subKey) : '';

      // V8.1.2.4.5: Compra e Venda usa tabs por *categoria* (eletronicos, livros...),
      // mas o 2º grupo do formulário é 'ação' (vendo/compro...).
      // - Persistimos a ação em subcategoria/subcategoriaKey (UI)
      // - Persistimos o filtro de sub-módulo em metadata.subcategory (key da categoria)
      const isCompraVenda = kcCreateState.moduleKey === 'compra-venda';
      const actionKey = isCompraVenda ? (subKey || '') : '';
      const actionLabel = isCompraVenda ? (subLabel || '') : '';
      let filterSubKey = isCompraVenda ? (catKey || '') : (subKey || '');
      let filterSubLabel = isCompraVenda ? (catLabel || '') : (subLabel || '');
      let finalSubKey = isCompraVenda ? (actionKey || '') : (subKey || '');
      let finalSubLabel = isCompraVenda ? (actionLabel || '') : (subLabel || '');

      const opportunityArea = isOpportunity
        ? kcResolveOpportunityAreaValue(
          activeAreaAtuacao || subLabel || subKey || '',
          `${title} ${desc} ${activeLocation}`
        )
        : { key: '', label: '', icon: '' };
      if (isOpportunity) {
        finalSubKey = opportunityArea.key || '';
        finalSubLabel = opportunityArea.label || '';
        filterSubKey = opportunityArea.key || '';
        filterSubLabel = opportunityArea.label || '';
        if (opportunityArea.label) kcCreateState.values.areaAtuacao = opportunityArea.label;
        if (opportunityArea.key && opportunityArea.label) {
          const history = Array.isArray(window.__KC_OPPORTUNITY_AREA_HISTORY)
            ? window.__KC_OPPORTUNITY_AREA_HISTORY.slice()
            : [];
          history.unshift({
            key: opportunityArea.key,
            label: opportunityArea.label,
            icon: opportunityArea.icon || 'fas fa-briefcase',
          });
          window.__KC_OPPORTUNITY_AREA_HISTORY = history;
        }
      }

      const housingRegion = isMoradia
        ? kcResolveHousingRegionValue(
          activeRegiao || activeLocation || '',
          `${title} ${desc} ${activeLocation}`
        )
        : { key: '', label: '', icon: '', zoneKey: '', zoneLabel: '' };
      const housingFeatures = isMoradia
        ? kcResolveHousingFeatureValues(activeMoradiaFeatures)
        : [];
      const lostFoundLocation = isAchados
        ? kcResolveLostFoundLocationValue(
          activeLocation || '',
          `${title} ${desc} ${activeLocation}`
        )
        : { key: '', label: '', icon: '', emoji: '' };
      if (isMoradia) {
        if (housingRegion.label) kcCreateState.values.regiao = housingRegion.label;
        if (housingRegion.key && housingRegion.label) {
          const history = Array.isArray(window.__KC_HOUSING_REGION_HISTORY)
            ? window.__KC_HOUSING_REGION_HISTORY.slice()
            : [];
          history.unshift({
            key: housingRegion.key,
            label: housingRegion.label,
            icon: housingRegion.icon || 'fas fa-map-pin',
            zoneKey: housingRegion.zoneKey || '',
            zoneLabel: housingRegion.zoneLabel || '',
          });
          window.__KC_HOUSING_REGION_HISTORY = history;
        }
        if (housingFeatures.length) {
          const history = Array.isArray(window.__KC_HOUSING_FEATURE_HISTORY)
            ? window.__KC_HOUSING_FEATURE_HISTORY.slice()
            : [];
          housingFeatures.forEach((feature) => {
            history.unshift({
              key: feature.key,
              label: feature.label,
              emoji: feature.emoji || '',
            });
          });
          window.__KC_HOUSING_FEATURE_HISTORY = history;
          kcCreateState.values.marcadoresMoradia = housingFeatures.map((feature) => feature.label);
        }
      }
      if (isAchados) {
        if (lostFoundLocation.label) kcCreateState.values.localizacao = lostFoundLocation.label;
        if (lostFoundLocation.key && lostFoundLocation.label) {
          const history = Array.isArray(window.__KC_LOST_FOUND_LOCATION_HISTORY)
            ? window.__KC_LOST_FOUND_LOCATION_HISTORY.slice()
            : [];
          history.unshift({
            key: lostFoundLocation.key,
            label: lostFoundLocation.label,
            icon: lostFoundLocation.icon || 'fas fa-map-marker-alt',
            emoji: lostFoundLocation.emoji || '📍',
          });
          window.__KC_LOST_FOUND_LOCATION_HISTORY = history;
        }
      }
      const persistedLocation = isAchados ? (lostFoundLocation.label || activeLocation) : activeLocation;

      // Caronas: origem, destino, features
      const caronasOrigem = isCaronas ? activeOrigem : '';
      const caronasDestino = isCaronas ? activeDestino : '';
      const caronasHorario = isCaronas ? activeHorario : '';
      const caronasContribuicao = isCaronas ? activeContribuicao : '';
      const caronasVagas = isCaronas ? activeVagas : '';
      const caronasFeatures = isCaronas
        ? kcResolveHousingFeatureValues(activeCaronasFeatures)
        : [];

      const tagMap = new Map();
      Object.entries(kcCreateState.selections).forEach(([gid, key]) => {
        if (!key) return;
        const normalizedKey = (isOpportunity && gid === categoryGroupId)
          ? kcNormalizeOpportunityTypeKey(key)
          : ((isMoradia && gid === categoryGroupId) ? kcNormalizeHousingTypeKey(key) : key);
        const labelForTag = kcTagLabel(schema, gid, key);
        if (normalizedKey && !tagMap.has(normalizedKey)) tagMap.set(normalizedKey, labelForTag || normalizedKey);
      });

      // preço (quando existe)
      let preco = null;
      let precoTexto = null;
      if (kcCreateState.moduleKey === 'eventos' && activeGratuito) {
        preco = 0;
      } else {
        const n = kcParseBRLNumber(activePrecoInput);
        if (n != null) preco = n;
      }

      if (kcCreateState.moduleKey === 'achados-perdidos' && kcCreateState.selections.status === 'perdidos') {
        const r = activeRecompensa;
        if (r) precoTexto = 'Recompensa: R$ ' + r;
      }

      if (isMoradia && kcNormalizeHousingTypeKey(rawCatKey) === 'procurando') {
        const budgetValue = kcParseBRLNumber(activeOrcamento);
        if (budgetValue != null) preco = budgetValue;
        const budgetText = activeOrcamento;
        if (budgetText) precoTexto = 'Até R$ ' + budgetText + '/mês';
      }

      const opportunityTypeKey = isOpportunity ? kcNormalizeOpportunityTypeKey(rawCatKey) : '';
      const opportunityUsesRegime = opportunityTypeKey === 'emprego';
      const opportunityWorkMode = isOpportunity
        ? kcResolveOpportunityWorkMode(activeModalidadeTrabalho || '')
        : { key: '', label: '' };
      const opportunityRegime = (isOpportunity && opportunityUsesRegime)
        ? kcResolveOpportunityRegime(activeRegimeContratacao || '')
        : { key: '', label: '' };

      if (isOpportunity) {
        const remunValue = kcParseBRLNumber(activeRemuneracao);
        if (remunValue != null) preco = remunValue;

        const remunText = activeRemuneracao;
        if (remunText) {
          const suffix = opportunityTypeKey === 'freelancer' ? '/projeto' : '/mês';
          precoTexto = 'R$ ' + remunText + suffix;
        }

        if (opportunityArea.key && !tagMap.has(opportunityArea.key)) {
          tagMap.set(opportunityArea.key, opportunityArea.label || opportunityArea.key);
        }
        if (opportunityWorkMode.key) {
          if (!tagMap.has(opportunityWorkMode.key)) tagMap.set(opportunityWorkMode.key, opportunityWorkMode.label || opportunityWorkMode.key);
          if (opportunityWorkMode.key === 'hibrido') {
            if (!tagMap.has('remoto')) tagMap.set('remoto', 'Remoto');
            if (!tagMap.has('presencial')) tagMap.set('presencial', 'Presencial');
          }
        }
        if (opportunityRegime.key && !tagMap.has(opportunityRegime.key)) {
          tagMap.set(opportunityRegime.key, opportunityRegime.label || opportunityRegime.key);
        }
      }

      if (isMoradia) {
        if (housingRegion.key && !tagMap.has(housingRegion.key)) {
          tagMap.set(housingRegion.key, housingRegion.label || housingRegion.key);
        }
        if (housingRegion.zoneKey && !tagMap.has(housingRegion.zoneKey)) {
          tagMap.set(housingRegion.zoneKey, housingRegion.zoneLabel || housingRegion.zoneKey);
        }
        housingFeatures.forEach((feature) => {
          if (!feature || !feature.key) return;
          if (!tagMap.has(feature.key)) tagMap.set(feature.key, feature.label || feature.key);
        });
      }
      if (isAchados && lostFoundLocation.key) {
        if (!tagMap.has(lostFoundLocation.key)) tagMap.set(lostFoundLocation.key, lostFoundLocation.label || lostFoundLocation.key);
      }
      if (isCaronas) {
        if (caronasOrigem && !tagMap.has(caronasOrigem.toLowerCase().replace(/\s+/g, '-'))) {
          tagMap.set(caronasOrigem.toLowerCase().replace(/\s+/g, '-'), caronasOrigem);
        }
        if (caronasDestino && !tagMap.has(caronasDestino.toLowerCase().replace(/\s+/g, '-'))) {
          tagMap.set(caronasDestino.toLowerCase().replace(/\s+/g, '-'), caronasDestino);
        }
        caronasFeatures.forEach((feature) => {
          if (feature && feature.key && !tagMap.has(feature.key)) tagMap.set(feature.key, feature.label || feature.key);
        });
      }

      const tagKeys = Array.from(tagMap.keys()).filter(Boolean);
      const tagLabels = Array.from(tagMap.values()).filter(Boolean);

      const imagens = kcGetOrderedCreateImages();

      // Payload do formulário (contrato legado) - o driver decide como persistir.
      // IMPORTANTE: categoria/subcategoria devem ser persistidos como *keys* para
      // permitir filtros por sub-módulo (ex: Eletrônicos) sem depender de acentos.
      const payload = {
        modulo: kcCreateState.moduleKey,
        moduloLabel: schema.label,

        // categoria/subcategoria (compat: mantém label e key)
        categoria: catKey || (catLabel || ''),
        categoriaLabel: catLabel || '',
        categoriaKey: catKey || '',

        // subcategoria (UI): em compra-venda, isso representa a *ação* (vendo/compro)
        subcategoria: finalSubKey || (finalSubLabel || ''),
        subcategoriaLabel: finalSubLabel || '',
        subcategoriaKey: finalSubKey || '',

        // tags (UI)
        tags: tagLabels,
        tagKeys,

        // conteúdo
        titulo: title,
        descricao: desc,
        preco,
        precoTexto,
        condicao: activeCondicao,
        localizacao: persistedLocation,
        location: persistedLocation,
        lostFoundLocationKey: isAchados ? (lostFoundLocation.key || '') : '',
        lostFoundLocationLabel: isAchados ? (lostFoundLocation.label || '') : '',
        lostFoundLocationIcon: isAchados ? (lostFoundLocation.icon || '') : '',
        regiao: isMoradia ? (housingRegion.label || '') : '',
        regionLabel: isMoradia ? (housingRegion.label || '') : '',
        regionKey: isMoradia ? (housingRegion.key || '') : '',
        area: isOpportunity ? (opportunityArea.label || '') : '',
        areaKey: isOpportunity ? (opportunityArea.key || '') : '',
        modalidadeTrabalho: isOpportunity ? (opportunityWorkMode.label || '') : '',
        regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        housingFeatureLabels: isMoradia ? housingFeatures.map((feature) => feature.label) : [],
        housingFeatureKeys: isMoradia ? housingFeatures.map((feature) => feature.key) : [],
        origem: isCaronas ? caronasOrigem : '',
        destino: isCaronas ? caronasDestino : '',
        horario: isCaronas ? caronasHorario : '',
        contribuicao: isCaronas ? caronasContribuicao : '',
        vagas: isCaronas ? caronasVagas : '',
        caronasFeatureLabels: isCaronas ? caronasFeatures.map((f) => f.label) : [],
        caronasFeatureKeys: isCaronas ? caronasFeatures.map((f) => f.key) : [],
        contato: activeContato,
        remuneracao: activeRemuneracao,
        visibility: kcNormalizePostVisibilityValue(activeVisibility, kcCreateState.editMode ? 'public' : 'community'),

        // flags
        verificado: false,
        emoji: schema.emoji,
        imagens,
        sustentavel: activeSustentavel,

        // metadata (modo local e Supabase): usado para filtros JSONB
        metadata: {
          // subcategory (filtro): chave esperada pelos controllers (.eq('metadata->>subcategory', ...))
          subcategory: filterSubKey || '',
          subcategoryLabel: filterSubLabel || '',

          // categoria principal (UI + filtros)
          categoria: catLabel || '',
          categoriaKey: catKey || '',

          // ação/subcategoria (UI)
          subcategoria: finalSubLabel || '',
          subcategoriaKey: finalSubKey || '',

          // compra-venda: guardar ação explicitamente (útil para futuras buscas e edição)
          actionKey: actionKey || '',
          actionLabel: actionLabel || '',
          regionKey: isMoradia ? (housingRegion.key || '') : '',
          regionLabel: isMoradia ? (housingRegion.label || '') : '',
          regionZoneKey: isMoradia ? (housingRegion.zoneKey || '') : '',
          regionZoneLabel: isMoradia ? (housingRegion.zoneLabel || '') : '',
          regiao: isMoradia ? (housingRegion.label || '') : '',
          regiaoLabel: isMoradia ? (housingRegion.label || '') : '',
          housingTypeKey: isMoradia ? (catKey || '') : '',
          housingTypeLabel: isMoradia ? (catLabel || '') : '',
          housingFeatureKeys: isMoradia ? housingFeatures.map((feature) => feature.key) : [],
          housingFeatureLabels: isMoradia ? housingFeatures.map((feature) => feature.label) : [],
          marcadoresMoradia: isMoradia ? housingFeatures.map((feature) => feature.label) : [],
          lostFoundLocationKey: isAchados ? (lostFoundLocation.key || '') : '',
          lostFoundLocationLabel: isAchados ? (lostFoundLocation.label || '') : '',
          lostFoundLocationIcon: isAchados ? (lostFoundLocation.icon || '') : '',
          lostFoundLocationEmoji: isAchados ? (lostFoundLocation.emoji || '') : '',
          localizacao: persistedLocation,
          location: persistedLocation,
          detalhes: activeDetalhes,
          orcamento: activeOrcamento,
          area: isOpportunity ? (opportunityArea.label || '') : '',
          areaLabel: isOpportunity ? (opportunityArea.label || '') : '',
          areaKey: isOpportunity ? (opportunityArea.key || '') : '',
          workMode: isOpportunity ? (opportunityWorkMode.key || '') : '',
          workModeLabel: isOpportunity ? (opportunityWorkMode.label || '') : '',
          employmentType: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.key || '') : '',
          employmentTypeLabel: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
          regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
          contato: activeContato,
          remuneracao: activeRemuneracao,
          modalidadeTrabalho: activeModalidadeTrabalho,
          recompensa: activeRecompensa,
          entrega: activeEntrega,
          // eventos: data, hora, link e gratuito
          data_evento: (kcCreateState.moduleKey === 'eventos') ? activeDataEvento : '',
          data_fim_evento: (kcCreateState.moduleKey === 'eventos') ? activeDataFimEvento : '',
          hora_evento: (kcCreateState.moduleKey === 'eventos') ? activeHoraEvento : '',
          link: (kcCreateState.moduleKey === 'eventos' || kcCreateState.moduleKey === 'oportunidades') ? activeLink : '',
          link_as_cta: activeLinkAsCta,
          gratuito: (kcCreateState.moduleKey === 'eventos') ? activeGratuito : false,
          // caronas
          origem: isCaronas ? caronasOrigem : '',
          destino: isCaronas ? caronasDestino : '',
          horario: isCaronas ? caronasHorario : '',
          contribuicao: isCaronas ? caronasContribuicao : '',
          vagas: isCaronas ? caronasVagas : '',
          caronasFeatureKeys: isCaronas ? caronasFeatures.map((f) => f.key) : [],
          caronasFeatureLabels: isCaronas ? caronasFeatures.map((f) => f.label) : [],
          marcadoresCarona: isCaronas ? caronasFeatures.map((f) => f.label) : [],
          visibility: kcNormalizePostVisibilityValue(activeVisibility, kcCreateState.editMode ? 'public' : 'community'),
        },
      };

      // ── MODO EDIÇÃO ──────────────────────────────────────────────────────────
      if (kcCreateState.editMode && kcCreateState.editPostId) {
        if (submitBtn) submitBtn.textContent = 'Salvando...';
        showToast('Salvando alterações...', 'info', 1600);

        let editRes = null;
        try {
          if (KCAPI && typeof KCAPI.updatePost === 'function') {
            editRes = await KCAPI.updatePost(kcCreateState.editPostId, payload);
          } else {
            editRes = { ok: false, error: { message: 'Edição não suportada neste ambiente.' } };
          }
        } catch (err) {
          editRes = { ok: false, error: { message: (err && err.message) ? String(err.message) : 'Erro inesperado ao salvar.' } };
        }

        if (editRes && editRes.ok) {
          showToast('Publicação atualizada com sucesso!', 'success', 2200);
          const editCb = kcCreateState.editCallback;
          const editedData = editRes.data;
          kcCloseCreatePostModal(); // também zera editMode / editCallback
          if (typeof editCb === 'function') editCb(editedData);
          return;
        }

        const editErrMsg = (editRes && editRes.error && editRes.error.message)
          ? String(editRes.error.message)
          : 'Não foi possível atualizar a publicação.';
        showToast(editErrMsg, 'error', 2800);
        return;
      }
      // ── FIM MODO EDIÇÃO ───────────────────────────────────────────────────────

      const hasApiCreatePost = !!((window.KCActions && typeof window.KCActions.createPost === 'function') || (KCAPI && typeof KCAPI.createPost === 'function'));
      const useSupabase = !!(KCAPI && KCAPI.activeDriver === 'supabase' && hasApiCreatePost);
      const blockLocalCriticalPersistence = isProductionRuntime() && !useSupabase;
      let post = null;
      let createError = null;

      const apiCreateFn = (window.KCActions && typeof window.KCActions.createPost === 'function') ? window.KCActions.createPost : (KCAPI ? KCAPI.createPost : null);

      if (useSupabase) {
        // Exige autenticação no driver Supabase (RLS)
        let user = null;
        try {
          if (typeof KCAPI.getCurrentUser === 'function') user = await KCAPI.getCurrentUser();
        } catch (_) { }

        if (!user) {
          showToast('Faça login para publicar.', 'warn', 2600);
          // V8.1.3.2.1: não abre o modal automaticamente; direciona o usuário ao botão de Login/Cadastro.
          try {
            const btn = document.querySelector('a.btn-login') || document.querySelector('a[href="#login"]');
            if (btn) {
              btn.classList.add('kc-attention');
              try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
              try { btn.focus(); } catch (_) { }
              setTimeout(() => btn.classList.remove('kc-attention'), 900);
            }
          } catch (_) { }
          return;
        }

        // ── Verificação de publicação duplicada ──────────────────────────────
        try {
          if (KCAPI && typeof KCAPI.checkDuplicatePost === 'function') {
            const dupCheck = await KCAPI.checkDuplicatePost(
              user.id,
              payload.modulo || null,
              payload.titulo || ''
            );
            if (dupCheck && dupCheck.candidates && dupCheck.candidates.length > 0) {
              const top = dupCheck.candidates[0];
              const topTitle = top.title || top.titulo || 'Sem título';
              const statusLabel = top.status === 'hidden' ? 'desabilitado' : (top.status === 'expired' ? 'expirado' : 'ativo');
              const confirmed = window.confirm(
                'Atenção: você já tem um anúncio muito parecido com este!\n\n' +
                '"' + topTitle + '" (' + statusLabel + ')\n\n' +
                'Publicar de novo pode levar à desativação do anúncio pela moderação.\n' +
                'Deseja continuar mesmo assim?'
              );
              if (!confirmed) return;
            }
          }
        } catch (_) { /* verificação de duplicata não bloqueia o envio */ }

        showToast('Publicando...', 'info', 1600);
        try {
          post = await apiCreateFn(payload);
          // Verificação explícita de _kcError antes de qualquer outra coisa
          if (post && post._kcError) {
            const limitMsg = post.message || 'Não foi possível publicar. Limite de publicações ativas atingido.';
            showToast(limitMsg, 'error', 5000);
            return;
          }
          // v9.3.2: post criado mas em análise pela moderação automática
          if (post && post._kcPending) {
            showToast(post._kcPendingReason || 'Publicação enviada para análise da moderação.', 'warn', 6000);
            // continua normalmente — post existe, autor pode ver, redirecionamento ocorre abaixo
          }
          if (post && post.ok === false && post.error) {
            createError = post.error;
            post = null;
          }
        } catch (err) {
          console.error('[KinoCampus] Exceção ao criar publicação (supabase):', {
            payload,
            error: err,
          });
          createError = {
            code: 'CREATE_POST_EXCEPTION',
            message: (err && err.message) ? String(err.message) : 'Erro inesperado ao publicar.',
          };
          post = null;
        }

        if (!post) {
          console.error('[KinoCampus] Falha ao criar publicação (supabase) sem retorno de post.', {
            payload,
            createError,
          });
          try {
            if (KCAPI && typeof KCAPI.getLastCreatePostError === 'function') {
              const createErr = KCAPI.getLastCreatePostError();
              console.error('[KinoCampus] createPost retornou null. Diagnóstico:', createErr);
            }
          } catch (_) { }
          const feedbackMessage = (createError && createError.message)
            ? String(createError.message)
            : 'Não foi possível publicar agora. Tente novamente.';
          showToast(feedbackMessage, 'error', 2800);
          return;
        }
      } else {
        if (blockLocalCriticalPersistence) {
          showToast('Publicação bloqueada: em produção, o driver Supabase é obrigatório.', 'error', 3200);
          return;
        }

        // Modo local/offline-first (default): só confirma sucesso após persistência efetiva.
        try {
          if (hasApiCreatePost) {
            post = await apiCreateFn(payload);
          } else {
            post = kcCreateUserPost(payload);
          }
          if (post && post._kcError) {
            const limitMsg = post.message || 'Não foi possível publicar. Limite de publicações ativas atingido.';
            showToast(limitMsg, 'error', 5000);
            return;
          }
          if (post && post.ok === false && post.error) {
            createError = post.error;
            post = null;
          }
        } catch (err) {
          console.error('[KinoCampus] Exceção no modo local ao criar publicação:', {
            payload,
            error: err,
          });
          createError = {
            code: 'LOCAL_CREATE_POST_EXCEPTION',
            message: (err && err.message) ? String(err.message) : 'Erro inesperado ao salvar publicação.',
          };
          post = null;
        }

        if (!post) {
          console.error('[KinoCampus] Falha ao criar publicação no modo local sem retorno de post.', {
            payload,
            createError,
          });
          const feedbackMessage = (createError && createError.message)
            ? String(createError.message)
            : 'Não foi possível salvar sua publicação no dispositivo.';
          showToast(feedbackMessage, 'error', 3200);
          return;
        }
      }

      showToast('Publicado com sucesso!', 'success', 2200);

      // Audit log: registra criação do post (fire-and-forget)
      try {
        const kcClient = KCSupabase && typeof KCSupabase.getClient === 'function'
          ? KCSupabase.getClient() : null;
        const postId = (post && (post.uuid || post.id || post.legacyId)) ? String(post.uuid || post.id || post.legacyId) : '';
        let actorId = null;
        try {
          if (KCAPI && typeof KCAPI.getCurrentUser === 'function') {
            const u = await KCAPI.getCurrentUser();
            if (u) actorId = u.id;
          }
        } catch (_) { }
        if (kcClient && actorId) {
          kcClient.from('audit_log').insert({
            action: 'post_created',
            entity_type: 'posts',
            entity_id: postId,
            actor_id: actorId,
          }).then(() => { }).catch(() => { });
        }
        // Incrementar uso de localizações de caronas (conhecidas) ou upsert de locais custom
        if (isCaronas && kcClient) {
          var resolvedOrigem = kcResolveCaronasLocationValue(caronasOrigem);
          var resolvedDestino = kcResolveCaronasLocationValue(caronasDestino);
          if (resolvedOrigem) {
            if (resolvedOrigem.isKnown && resolvedOrigem.key) {
              kcClient.rpc('kc_increment_location_usage', { p_key: resolvedOrigem.key }).then(function(){}).catch(function(){});
            } else if (caronasOrigem) {
              var customKey = 'custom-' + caronasOrigem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              kcClient.rpc('kc_upsert_custom_location', { p_key: customKey, p_label: caronasOrigem }).then(function(){}).catch(function(){});
            }
          }
          if (resolvedDestino) {
            if (resolvedDestino.isKnown && resolvedDestino.key) {
              kcClient.rpc('kc_increment_location_usage', { p_key: resolvedDestino.key }).then(function(){}).catch(function(){});
            } else if (caronasDestino) {
              var customKey2 = 'custom-' + caronasDestino.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              kcClient.rpc('kc_upsert_custom_location', { p_key: customKey2, p_label: caronasDestino }).then(function(){}).catch(function(){});
            }
          }
        }
      } catch (_) { }

      kcCloseCreatePostModal();

      // Redireciona para o módulo + hash do subtópico
      const base = schema.redirect || kcModulePage(kcCreateState.moduleKey);
      let targetUrl = base;
      if (kcCreateState.moduleKey === 'compra-venda' && catKey) {
        targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'filter=' + encodeURIComponent(catKey);
      } else if (catKey) {
        targetUrl += '#' + encodeURIComponent(catKey);
      }
      window.location.href = targetUrl;
    } catch (err) {
      console.error('[KinoCampus] Erro inesperado no submit de criação:', err);
      showToast('Não foi possível publicar agora. Tente novamente.', 'error', 2800);
    } finally {
      kcCreateState.submitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalSubmitText || (kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora');
      }
    }
  }

  window._KCCreatePost.submit = {
    handleCreateSubmit,
  };
})();
