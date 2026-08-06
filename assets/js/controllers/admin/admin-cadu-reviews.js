// Central de Revisões do Cadu.
//
// A fila genérica (Pipeline/Feed) é versionada no cadu-api. A fila do Mapa UFG
// mantém seu contrato CAS próprio e apenas é apresentada na mesma aba.
(function () {
  'use strict';

  var bridge = null;
  var initialized = false;
  var requestGeneration = 0;
  var requestController = null;
  var summaryRequestGeneration = 0;
  var institutionalPending = 0;
  var DEFAULT_PAGE_LIMIT = (
    typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 700px)').matches
  ) ? 10 : 25;
  var state = {
    items: [],
    providers: [],
    total: 0,
    limit: DEFAULT_PAGE_LIMIT,
    offset: 0,
    origin: '',
    reviewState: 'pending',
    search: '',
    loading: false,
    error: '',
    decisionDraft: null,
    resolvingId: '',
    auditLoaded: false,
    repassFilter: 'all',
    repassRunning: false
  };

  var ORIGINS = ['pipeline', 'feed', 'sites', 'openclaw'];
  var DECISION_LABELS = {
    approved: 'Aprovar editorialmente',
    rejected: 'Rejeitar',
    changes_requested: 'Pedir ajustes',
    deferred: 'Adiar',
    acknowledged: 'Reconhecer incidente'
  };
  var DECISION_ICONS = {
    approved: 'fa-check',
    rejected: 'fa-xmark',
    changes_requested: 'fa-pen-ruler',
    deferred: 'fa-clock',
    acknowledged: 'fa-check-double'
  };
  var STATE_LABELS = {
    pending: 'Pendente',
    approved: 'Aprovada',
    rejected: 'Rejeitada',
    changes_requested: 'Ajustes solicitados',
    deferred: 'Adiada',
    acknowledged: 'Reconhecida'
  };
  var ORIGIN_LABELS = {
    pipeline: 'Pipeline',
    feed: 'Feed Coletado',
    sites: 'Mapa UFG',
    openclaw: 'OpenClaw'
  };
  var ORIGIN_ICONS = {
    pipeline: 'fa-gears',
    feed: 'fa-stream',
    sites: 'fa-university',
    openclaw: 'fa-robot'
  };
  var ISSUE_LABELS = {
    application_deadline_mismatch: 'Prazo de inscrição divergente',
    application_status_claim_mismatch: 'Status de inscrição divergente',
    placeholder_description: 'Descrição incompleta',
    expired: 'Conteúdo expirado',
    opportunity_without_deadline: 'Oportunidade sem prazo',
    quality_review_required: 'Revisão de qualidade necessária',
    curator_review_required: 'Encaminhado pelo Curador',
    dedup_preview_state_changed: 'A plataforma mudou depois da simulação'
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHttpsUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
      return parsed.toString();
    } catch (_) {
      return '';
    }
  }

  function fmtDate(unix) {
    var value = Number(unix);
    var date;
    if (Number.isFinite(value) && value > 0) {
      date = new Date(value < 1e12 ? value * 1000 : value);
    } else if (typeof unix === 'string' && unix.trim()) {
      date = new Date(unix);
    } else {
      return 'data não informada';
    }
    if (isNaN(date.getTime())) return 'data não informada';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatScore(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : '';
  }

  function repassHintLabel(hint) {
    return ({
      publish_ready: 'pronto para publicação',
      review: 'manter em revisão',
      reject: 'abaixo do limite',
      unknown: 'indefinido'
    })[hint] || String(hint || '');
  }

  function scoreBadge(item) {
    var repass = item.repass;
    var base = item.metadata && typeof item.metadata === 'object'
      && typeof item.metadata.score === 'number'
      ? item.metadata.score
      : null;
    if (repass) {
      var deltaClass = '';
      var deltaText = '';
      if (repass.delta !== null) {
        if (repass.delta > 0.005) {
          deltaClass = ' is-up';
          deltaText = ' ▲ ' + Number(repass.delta).toFixed(2);
        } else if (repass.delta < -0.005) {
          deltaClass = ' is-down';
          deltaText = ' ▼ ' + Math.abs(Number(repass.delta)).toFixed(2);
        } else {
          deltaClass = ' is-flat';
          deltaText = ' =';
        }
      }
      return '<span class="kc-cadu-review-score' + deltaClass + '" title="Reanálise automática: ' + escapeHtml(repassHintLabel(repass.decision_hint)) + '">' +
        escapeHtml(formatScore(repass.score)) + escapeHtml(deltaText) + '</span>';
    }
    if (base !== null) {
      return '<span class="kc-cadu-review-score is-base" title="Nota original do Curador">' +
        escapeHtml(formatScore(base)) + '</span>';
    }
    return '';
  }

  function repassFilterPasses(item) {
    if (state.repassFilter === 'done') return Boolean(item.repass);
    if (state.repassFilter === 'pending') return !item.repass;
    return true;
  }

  function setStatus(message, error) {
    var target = $('#reviews-status');
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('is-error', Boolean(error));
    target.setAttribute('role', error ? 'alert' : 'status');
  }

  function providerPending(provider) {
    if (!provider || provider.id !== 'sites') return Number(provider && provider.pending) || 0;
    return institutionalPending;
  }

  function updateBadge() {
    var badge = $('#badge-reviews');
    if (!badge) return;
    var centralPending = state.providers.reduce(function (total, provider) {
      return provider.id === 'sites' ? total : total + (Number(provider.pending) || 0);
    }, 0);
    var total = centralPending + institutionalPending;
    badge.textContent = String(total);
    badge.title = total === 1 ? '1 revisão pendente' : total + ' revisões pendentes';
    badge.classList.toggle('is-warning', total > 0);
  }

  function renderProviders() {
    var target = $('#reviews-providers');
    if (!target) return;
    var providers = state.providers.length ? state.providers : ORIGINS.map(function (id) {
      return {
        id: id,
        label: ORIGIN_LABELS[id],
        description: 'Aguardando o serviço de revisões.',
        queue: id === 'sites' ? 'institutional' : 'central',
        pending: 0,
        resolved: 0
      };
    });
    target.innerHTML = providers.map(function (provider) {
      var pending = providerPending(provider);
      var active = state.origin === provider.id;
      return '<button type="button" class="kc-cadu-review-provider' + (active ? ' is-active' : '') + '" data-review-provider="' + escapeHtml(provider.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<span class="kc-cadu-review-provider__head"><strong><i class="fas ' + escapeHtml(ORIGIN_ICONS[provider.id] || 'fa-clipboard-check') + '" aria-hidden="true"></i> ' + escapeHtml(provider.label || ORIGIN_LABELS[provider.id]) + '</strong><i class="fas fa-chevron-right" aria-hidden="true"></i></span>' +
        '<p>' + escapeHtml(provider.description || '') + '</p>' +
        '<span class="kc-cadu-review-provider__counts"><span class="kc-cadu-review-provider__pending"><strong>' + escapeHtml(pending) + '</strong> pendentes</span><span><strong>' + escapeHtml(provider.resolved || 0) + '</strong> resolvidas</span></span>' +
        '</button>';
    }).join('');
    $all('[data-review-provider]', target).forEach(function (button) {
      button.addEventListener('click', function () {
        var origin = button.getAttribute('data-review-provider') || '';
        var previousOrigin = state.origin;
        state.origin = origin;
        state.offset = 0;
        var select = $('#reviews-origin');
        if (select) select.value = origin;
        renderProviders();
        if (previousOrigin !== origin) {
          invalidateAudit('Atualizando o histórico desta origem…');
        }
        if (origin === 'sites') {
          refresh();
          setTimeout(function () {
            var queue = $('#institutional-review-queue');
            if (queue) queue.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 120);
          return;
        }
        refresh();
      });
    });
    updateBadge();
  }

  function issueLabel(issue) {
    if (ISSUE_LABELS[issue]) return ISSUE_LABELS[issue];
    var partialMatch = String(issue || '').match(/^(\d+)_of_(\d+)_items_failed$/);
    if (partialMatch) {
      return 'Falha em ' + partialMatch[1] + ' de ' + partialMatch[2] + ' itens';
    }
    return String(issue || '').replace(/_/g, ' ');
  }

  function reviewLinks(item) {
    var links = [];
    var sourceUrl = safeHttpsUrl(item.source_url);
    var actionUrl = safeHttpsUrl(item.action_url);
    if (sourceUrl) {
      links.push('<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> Abrir fonte</a>');
    }
    if (actionUrl && actionUrl !== sourceUrl) {
      links.push('<a href="' + escapeHtml(actionUrl) + '" target="_blank" rel="noopener"><i class="fas fa-link" aria-hidden="true"></i> Abrir ação</a>');
    }
    if (item.run_id) {
      links.push('<button type="button" data-review-run="' + escapeHtml(item.run_id) + '"><i class="fas fa-gears" aria-hidden="true"></i> Abrir run ' + escapeHtml(item.run_id.slice(0, 8)) + '</button>');
    }
    links.push('<button type="button" data-review-chat="' + escapeHtml(item.id) + '"><i class="fas fa-robot" aria-hidden="true"></i> Usar no chat</button>');
    return links.join('');
  }

  function resolutionEditor(item) {
    if (!state.decisionDraft || state.decisionDraft.id !== item.id) return '';
    var decision = state.decisionDraft.decision;
    var label = DECISION_LABELS[decision] || decision;
    var noteRequired = decision === 'rejected' || decision === 'changes_requested';
    return '<form class="kc-cadu-review-resolution" data-review-resolution="' + escapeHtml(item.id) + '">' +
      '<label>Observação' + (noteRequired ? ' (necessária)' : ' (opcional)') +
      '<textarea maxlength="1000" data-review-note placeholder="' + (decision === 'changes_requested' ? 'Descreva objetivamente o que precisa ser corrigido.' : 'Registre o motivo ou evidência da decisão.') + '"></textarea></label>' +
      '<button type="button" class="kc-btn-secondary" data-review-cancel>Cancelar</button>' +
      '<button type="submit" class="kc-btn-primary"><i class="fas ' + escapeHtml(DECISION_ICONS[decision] || 'fa-check') + '" aria-hidden="true"></i> Confirmar: ' + escapeHtml(label) + '</button>' +
      '</form>';
  }

  function reviewActions(item) {
    if (item.state !== 'pending') {
      return '<span class="kc-cadu-review-item__resolved"><i class="fas fa-check-circle" aria-hidden="true"></i> ' +
        escapeHtml(STATE_LABELS[item.state] || item.state) + '</span>';
    }
    return (item.allowed_decisions || []).map(function (decision) {
      return '<button type="button" data-review-decision="' + escapeHtml(decision) + '" data-review-id="' + escapeHtml(item.id) + '"' +
        (state.resolvingId === item.id ? ' disabled' : '') + '>' +
        '<i class="fas ' + escapeHtml(DECISION_ICONS[decision] || 'fa-check') + '" aria-hidden="true"></i> ' +
        escapeHtml(DECISION_LABELS[decision] || decision) + '</button>';
    }).join('');
  }

  function focusPipelineRun(runId, attempt) {
    var run = document.querySelector('[data-run-id="' + runId + '"]');
    if (!run && attempt < 16) {
      setTimeout(function () { focusPipelineRun(runId, attempt + 1); }, 250);
      return;
    }
    if (!run) return;
    $all('.kc-pipeline-history-item.is-review-target').forEach(function (item) {
      item.classList.remove('is-review-target');
    });
    run.classList.add('is-review-target');
    run.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { run.classList.remove('is-review-target'); }, 3600);
  }

  function renderItems() {
    var target = $('#reviews-list');
    if (!target) return;
    if (state.loading) {
      target.innerHTML = '<div class="kc-cadu-review-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Consultando evidências versionadas…</div>';
      return;
    }
    if (state.error) {
      target.innerHTML = '<div class="kc-cadu-review-empty">A fila não pôde ser carregada. Nenhuma decisão foi enviada.</div>';
      return;
    }
    if (!state.items.length) {
      var emptyCopy = state.origin === 'sites'
        ? 'As revisões do Mapa UFG usam a fila institucional exibida abaixo.'
        : state.repassFilter === 'all'
          ? 'Nenhum item corresponde aos filtros atuais.'
          : 'Nenhum item corresponde ao recorte de reanálise selecionado.';
      target.innerHTML = '<div class="kc-cadu-review-empty"><i class="fas fa-circle-check" aria-hidden="true"></i> ' + escapeHtml(emptyCopy) + '</div>';
      return;
    }
    var visibleItems = state.items.filter(repassFilterPasses);
    if (!visibleItems.length) {
      target.innerHTML = '<div class="kc-cadu-review-empty"><i class="fas fa-circle-check" aria-hidden="true"></i> Nenhum item corresponde ao recorte de reanálise selecionado.</div>';
      return;
    }
    target.innerHTML = visibleItems.map(function (item) {
      var imageUrl = safeHttpsUrl(item.image_url);
      var image = imageUrl
        ? '<img class="kc-cadu-review-item__image" src="' + escapeHtml(imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
        : '';
      var issues = (item.issues || []).slice(0, 8).map(function (issue) {
        return '<span class="kc-cadu-review-item__issue">' + escapeHtml(issueLabel(issue)) + '</span>';
      }).join('');
      var repassInfo = item.repass
        ? '<p class="kc-cadu-review-item__repass">Reanálise em ' + escapeHtml(fmtDate(item.repass.created_at)) +
          ': ' + escapeHtml(repassHintLabel(item.repass.decision_hint)) +
          (item.repass.reasons && item.repass.reasons.length
            ? ' — ' + escapeHtml(item.repass.reasons.slice(0, 3).join(', '))
            : '') + '</p>'
        : '';
      return '<article class="kc-cadu-review-item' + (item.state === 'pending' ? '' : ' is-resolved') + '" data-review-item="' + escapeHtml(item.id) + '" role="listitem">' +
        '<div class="kc-cadu-review-item__content">' + image +
        '<div class="kc-cadu-review-item__body">' +
        '<div class="kc-cadu-review-item__eyebrow">' +
        '<span class="kc-cadu-review-item__origin"><i class="fas ' + escapeHtml(ORIGIN_ICONS[item.origin] || 'fa-clipboard-check') + '" aria-hidden="true"></i> ' + escapeHtml(ORIGIN_LABELS[item.origin] || item.origin) + '</span>' +
        '<span class="kc-cadu-review-item__state">' + escapeHtml(STATE_LABELS[item.state] || item.state) + '</span>' +
        scoreBadge(item) +
        '<span>' + escapeHtml(fmtDate(item.created_at)) + '</span>' +
        '</div>' +
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        (item.summary ? '<p class="kc-cadu-review-item__summary">' + escapeHtml(item.summary) + '</p>' : '') +
        repassInfo +
        '<div class="kc-cadu-review-item__issues">' + issues + '</div>' +
        '<div class="kc-cadu-review-item__links">' + reviewLinks(item) + '</div>' +
        '</div></div>' +
        '<div class="kc-cadu-review-item__actions">' + reviewActions(item) + '</div>' +
        resolutionEditor(item) +
        '</article>';
    }).join('');

    $all('.kc-cadu-review-item__image', target).forEach(function (image) {
      image.addEventListener('error', function () { image.remove(); }, { once: true });
    });
    $all('[data-review-decision]', target).forEach(function (button) {
      button.addEventListener('click', function () {
        state.decisionDraft = {
          id: button.getAttribute('data-review-id'),
          decision: button.getAttribute('data-review-decision')
        };
        renderItems();
        var editor = $('[data-review-resolution="' + state.decisionDraft.id + '"]');
        var textarea = editor && editor.querySelector('[data-review-note]');
        if (textarea) textarea.focus();
      });
    });
    $all('[data-review-cancel]', target).forEach(function (button) {
      button.addEventListener('click', function () {
        state.decisionDraft = null;
        renderItems();
      });
    });
    $all('[data-review-resolution]', target).forEach(function (form) {
      form.addEventListener('submit', submitResolution);
    });
    $all('[data-review-run]', target).forEach(function (button) {
      button.addEventListener('click', function () {
        var runId = button.getAttribute('data-review-run');
        if (bridge && typeof bridge.switchTab === 'function') bridge.switchTab('pipeline');
        focusPipelineRun(runId, 0);
      });
    });
    $all('[data-review-chat]', target).forEach(function (button) {
      button.addEventListener('click', function () {
        var item = state.items.find(function (candidate) {
          return candidate.id === button.getAttribute('data-review-chat');
        });
        if (!item) return;
        if (bridge && typeof bridge.switchTab === 'function') bridge.switchTab('openclaw');
        var input = $('#openclaw-chat-input');
        if (input) {
          input.value = 'Analise esta revisão do ' + (ORIGIN_LABELS[item.origin] || item.origin) +
            ': "' + item.title + '".' +
            (item.run_id ? ' Run: ' + item.run_id + '.' : '') +
            (item.source_url ? ' Fonte: ' + item.source_url : '');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          var chatStatus = $('#openclaw-chat-status');
          if (chatStatus) {
            chatStatus.textContent = 'Contexto da revisão carregado. Confira a mensagem antes de enviar.';
          }
        }
      });
    });
  }

  function renderPager() {
    var meta = $('#reviews-page-meta');
    var prev = $('#reviews-prev');
    var next = $('#reviews-next');
    var first = state.total ? state.offset + 1 : 0;
    var last = Math.min(state.total, state.offset + state.items.length);
    if (meta) meta.textContent = first + '–' + last + ' de ' + state.total + ' itens';
    if (prev) prev.disabled = state.loading || state.offset <= 0;
    if (next) next.disabled = state.loading || state.offset + state.items.length >= state.total;
  }

  function renderRepassSummary() {
    var target = $('#reviews-repass-summary');
    if (!target) return;
    if (state.repassRunning) {
      target.textContent = 'Reanálise automática em andamento…';
      target.classList.add('is-running');
      return;
    }
    target.classList.remove('is-running');
    var withRepass = state.items.filter(function (item) {
      return Boolean(item.repass);
    }).length;
    var latest = null;
    state.items.forEach(function (item) {
      if (item.repass && (!latest || item.repass.created_at > latest)) {
        latest = item.repass;
      }
    });
    target.textContent = latest
      ? withRepass + ' item(ns) deste recorte com reanálise; última em ' + fmtDate(latest.created_at) + '.'
      : 'Nenhuma reanálise registrada neste recorte.';
  }

  function render() {
    renderProviders();
    renderItems();
    renderPager();
    renderRepassSummary();
  }

  function reviewListPath() {
    var params = new URLSearchParams();
    if (state.origin) params.set('origin', state.origin);
    if (state.reviewState) params.set('state', state.reviewState);
    if (state.search) params.set('search', state.search);
    params.set('limit', String(state.limit));
    params.set('offset', String(state.offset));
    return '/api/cadu/reviews?' + params.toString();
  }

  function responseError(envelope) {
    var data = envelope && envelope.data;
    if (data && data.code === 'CADU_REVIEW_VERSION_CHANGED') {
      return 'A evidência mudou. A fila foi recarregada e nenhuma decisão foi aplicada.';
    }
    if (data && typeof data.detail === 'string') return data.detail;
    if (envelope && envelope.status === 401) return 'Sua sessão administrativa expirou. Reautentique e tente novamente.';
    if (envelope && envelope.status === 409) return 'A versão mudou ou já recebeu outra decisão. Atualize antes de continuar.';
    return 'O serviço de revisões não confirmou a operação.';
  }

  function auditIsOpen() {
    var audit = $('#reviews-audit');
    return Boolean(audit && audit.open);
  }

  function invalidateAudit(message) {
    state.auditLoaded = false;
    var target = $('#reviews-audit-list');
    if (target) {
      target.innerHTML = '<div class="kc-cadu-review-empty">' +
        escapeHtml(message || 'Abra ou atualize o histórico para consultar este recorte.') +
        '</div>';
    }
    if (auditIsOpen()) loadAudit();
  }

  async function refresh() {
    if (!bridge || typeof bridge.apiFetchResponse !== 'function') return;
    ++summaryRequestGeneration;
    var generation = ++requestGeneration;
    if (requestController) requestController.abort();
    requestController = typeof AbortController === 'function' ? new AbortController() : null;
    state.loading = true;
    state.error = '';
    render();
    setStatus('Consultando a fila e o estado atual de cada evidência…');
    var envelope = await bridge.apiFetchResponse(reviewListPath(), {
      timeoutMs: 15000,
      signal: requestController ? requestController.signal : undefined
    });
    if (generation !== requestGeneration) return;
    state.loading = false;
    if (!envelope.ok || !envelope.data || !Array.isArray(envelope.data.items)
        || !Array.isArray(envelope.data.providers)) {
      state.error = responseError(envelope);
      state.items = [];
      state.total = 0;
      setStatus(state.error, true);
      render();
      return;
    }
    state.items = envelope.data.items;
    state.providers = envelope.data.providers;
    state.total = Number(envelope.data.total) || 0;
    state.limit = Number(envelope.data.limit) || state.limit;
    state.offset = Number(envelope.data.offset) || 0;
    state.error = '';
    var pending = state.providers.reduce(function (sum, provider) {
      return provider.id === 'sites' ? sum : sum + (Number(provider.pending) || 0);
    }, 0);
    setStatus(state.total + ' item(ns) no recorte atual; ' + pending + ' pendência(s) centrais no total. As decisões não publicam automaticamente.');
    render();
  }

  async function refreshSummary() {
    if (!bridge || typeof bridge.apiFetchResponse !== 'function') return;
    var generation = ++summaryRequestGeneration;
    var envelope = await bridge.apiFetchResponse(
      '/api/cadu/reviews?state=pending&limit=1&offset=0',
      { timeoutMs: 15000 }
    );
    if (generation !== summaryRequestGeneration) return;
    if (!envelope.ok || !envelope.data || !Array.isArray(envelope.data.providers)) return;
    state.providers = envelope.data.providers;
    renderProviders();
  }

  async function submitResolution(event) {
    event.preventDefault();
    if (!state.decisionDraft || !bridge || typeof bridge.apiFetchResponse !== 'function') return;
    var item = state.items.find(function (candidate) {
      return candidate.id === state.decisionDraft.id;
    });
    if (!item || item.state !== 'pending') return;
    var form = event.currentTarget;
    var noteField = form.querySelector('[data-review-note]');
    var note = noteField ? noteField.value.trim() : '';
    var decision = state.decisionDraft.decision;
    if ((decision === 'rejected' || decision === 'changes_requested') && !note) {
      if (noteField) {
        noteField.setCustomValidity('Registre o motivo desta decisão.');
        noteField.reportValidity();
        noteField.addEventListener('input', function () {
          noteField.setCustomValidity('');
        }, { once: true });
      }
      return;
    }
    state.resolvingId = item.id;
    renderItems();
    setStatus('Registrando a decisão na versão exata da evidência…');
    var envelope = await bridge.apiFetchResponse(
      '/api/cadu/reviews/' + encodeURIComponent(item.id) + '/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          review_id: item.id,
          expected_item_version: item.item_version,
          decision: decision,
          resolution_note: note || null
        }),
        timeoutMs: 15000
      }
    );
    state.resolvingId = '';
    state.decisionDraft = null;
    if (!envelope.ok || !envelope.data || envelope.data.published !== false) {
      var message = responseError(envelope);
      setStatus(message, true);
      await refresh();
      return;
    }
    setStatus((DECISION_LABELS[decision] || 'Decisão') + ' registrada. Nenhum conteúdo foi publicado.');
    state.auditLoaded = false;
    await refresh();
    if ($('#reviews-audit') && $('#reviews-audit').open) loadAudit();
  }

  async function runRepass() {
    if (!bridge || typeof bridge.apiFetchResponse !== 'function') return;
    if (state.repassRunning) return;
    state.repassRunning = true;
    renderRepassSummary();
    setStatus('Reanalisando eventos e oportunidades pendentes com o classificador do Curador…');
    var envelope = await bridge.apiFetchResponse('/api/cadu/reviews/repass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ intent: 'repass', run_id: null }),
      timeoutMs: 420000
    });
    state.repassRunning = false;
    if (!envelope.ok || !envelope.data) {
      setStatus(responseError(envelope), true);
      renderRepassSummary();
      return;
    }
    var data = envelope.data;
    setStatus(
      'Reanálise concluída: ' + data.evaluated + ' item(ns) avaliado(s); '
      + data.increased + ' subiram, ' + data.decreased + ' caíram; '
      + data.publish_ready + ' prontos para publicação. A decisão final permanece manual.'
    );
    renderRepassSummary();
    await refresh();
    if ($('#reviews-audit') && $('#reviews-audit').open) loadAudit();
  }

  function auditPath(limit, offset) {
    var params = new URLSearchParams();
    if (state.origin) params.set('origin', state.origin);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return '/api/cadu/reviews/audit?' + params.toString();
  }

  function resolvedAtValue(item) {
    var numeric = Number(item && item.resolved_at);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    var parsed = Date.parse(item && item.resolved_at);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeInstitutionalAuditItem(item) {
    return {
      id: item.id,
      item_id: item.id,
      item_version: item.source_revision,
      origin: 'sites',
      kind: 'institutional_source',
      decision: item.state,
      resolution_note: item.resolution_note || null,
      resolved_by: item.resolved_by,
      resolved_at: item.resolved_at,
      title: item.name || item.source_id,
      run_id: null,
      source_url: item.source_url || null
    };
  }

  async function fetchInstitutionalAudit(maximum) {
    var terminalStates = ['approved', 'rejected', 'superseded'];
    var perStateMaximum = Math.min(1000, Math.max(50, maximum));
    var results = await Promise.all(terminalStates.map(async function (reviewState) {
      var items = [];
      var offset = 0;
      var hasMore = true;
      while (hasMore && items.length < perStateMaximum) {
        var params = new URLSearchParams();
        params.set('state', reviewState);
        params.set('limit', String(Math.min(100, perStateMaximum - items.length)));
        params.set('offset', String(offset));
        var envelope = await bridge.apiFetchResponse(
          '/api/cadu/source-reviews?' + params.toString(),
          { timeoutMs: 15000 }
        );
        if (!envelope.ok || !envelope.data || !Array.isArray(envelope.data.items)) {
          throw new Error(responseError(envelope));
        }
        items = items.concat(envelope.data.items.map(normalizeInstitutionalAuditItem));
        hasMore = envelope.data.has_more === true;
        offset += envelope.data.items.length;
        if (hasMore && envelope.data.items.length === 0) {
          throw new Error('Paginação institucional inconsistente.');
        }
      }
      return { items: items, truncated: hasMore };
    }));
    var combined = [];
    var truncated = false;
    results.forEach(function (result) {
      combined = combined.concat(result.items);
      truncated = truncated || result.truncated;
    });
    combined.sort(function (left, right) {
      return resolvedAtValue(right) - resolvedAtValue(left);
    });
    if (combined.length > maximum) {
      combined = combined.slice(0, maximum);
      truncated = true;
    }
    return { items: combined, truncated: truncated };
  }

  async function fetchCentralAudit(maximum) {
    var items = [];
    var offset = 0;
    var hasMore = true;
    while (hasMore && items.length < maximum) {
      var envelope = await bridge.apiFetchResponse(
        auditPath(Math.min(200, maximum - items.length), offset),
        { timeoutMs: 15000 }
      );
      if (!envelope.ok || !envelope.data || !Array.isArray(envelope.data.items)) {
        throw new Error(responseError(envelope));
      }
      items = items.concat(envelope.data.items);
      hasMore = envelope.data.has_more === true;
      offset += envelope.data.items.length;
      if (hasMore && envelope.data.items.length === 0) {
        throw new Error('Paginação central inconsistente.');
      }
    }
    return { items: items, truncated: hasMore };
  }

  function renderAuditItems(target, items) {
    if (!items.length) {
      target.innerHTML = '<div class="kc-cadu-review-empty">Ainda não há decisões neste recorte.</div>';
      return;
    }
    target.innerHTML = items.map(function (item) {
      return '<div class="kc-cadu-review-audit__item">' +
        '<strong>' + escapeHtml(item.title || item.item_id) + '</strong>' +
        '<span>' + escapeHtml(STATE_LABELS[item.decision] || item.decision) + '</span>' +
        '<span>' + escapeHtml(ORIGIN_LABELS[item.origin] || item.origin) + ' · ' + escapeHtml(fmtDate(item.resolved_at)) + '</span>' +
        '<span>evidência ' + escapeHtml(String(item.item_version || '').slice(0, 10)) + '</span>' +
        (item.resolution_note ? '<span>' + escapeHtml(item.resolution_note) + '</span>' : '') +
        '</div>';
    }).join('');
  }

  async function loadAudit() {
    var target = $('#reviews-audit-list');
    if (!target || !bridge || typeof bridge.apiFetchResponse !== 'function') return;
    target.innerHTML = '<div class="kc-cadu-review-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Consultando decisões…</div>';
    try {
      var result = state.origin === 'sites'
        ? await fetchInstitutionalAudit(50)
        : await fetchCentralAudit(50);
      state.auditLoaded = true;
      renderAuditItems(target, result.items);
    } catch (_) {
      target.innerHTML = '<div class="kc-cadu-review-empty">Não foi possível consultar o histórico agora.</div>';
    }
  }

  async function exportAudit() {
    if (!bridge || typeof bridge.apiFetchResponse !== 'function') return;
    var button = $('#reviews-export-json');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Gerando…';
    }
    try {
      var central = { items: [], truncated: false };
      var institutional = { items: [], truncated: false };
      if (state.origin !== 'sites') {
        central = await fetchCentralAudit(1000);
      }
      if (!state.origin || state.origin === 'sites') {
        institutional = await fetchInstitutionalAudit(1000);
      }
      var items = central.items.concat(institutional.items);
      items.sort(function (left, right) {
        return resolvedAtValue(right) - resolvedAtValue(left);
      });
      var truncated = central.truncated || institutional.truncated;
      if (items.length > 1000) {
        items = items.slice(0, 1000);
        truncated = true;
      }
      var documentBody = {
        schema_version: 1,
        kind: 'kinocampus-cadu-review-audit-export',
        exported_at: new Date().toISOString(),
        origin_filter: state.origin || null,
        truncated: truncated,
        total_exported: items.length,
        items: items
      };
      var blob = new Blob([JSON.stringify(documentBody, null, 2)], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'cadu-revisoes-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 100);
      setStatus(items.length + ' decisão(ões) exportada(s) em JSON.');
    } catch (error) {
      setStatus(String(error && error.message || 'Falha ao exportar o histórico.'), true);
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-file-export" aria-hidden="true"></i> Exportar histórico';
      }
    }
  }

  function applyFilters(event) {
    if (event) event.preventDefault();
    var previousOrigin = state.origin;
    state.origin = ($('#reviews-origin') && $('#reviews-origin').value) || '';
    state.reviewState = ($('#reviews-state') && $('#reviews-state').value) || 'pending';
    state.search = ($('#reviews-search') && $('#reviews-search').value.trim()) || '';
    state.limit = Number(($('#reviews-limit') && $('#reviews-limit').value) || DEFAULT_PAGE_LIMIT);
    state.offset = 0;
    var repassFilter = $('#reviews-repass-filter');
    state.repassFilter = repassFilter && ['all', 'done', 'pending'].indexOf(repassFilter.value) !== -1
      ? repassFilter.value
      : 'all';
    state.decisionDraft = null;
    if (previousOrigin !== state.origin) invalidateAudit('O recorte mudou. Atualizando o histórico correspondente…');
    refresh();
  }

  function clearFilters() {
    var previousOrigin = state.origin;
    state.origin = '';
    state.reviewState = 'pending';
    state.search = '';
    state.limit = DEFAULT_PAGE_LIMIT;
    state.offset = 0;
    state.repassFilter = 'all';
    if ($('#reviews-repass-filter')) $('#reviews-repass-filter').value = 'all';
    ['#reviews-origin', '#reviews-search'].forEach(function (selector) {
      var field = $(selector);
      if (field) field.value = '';
    });
    if ($('#reviews-state')) $('#reviews-state').value = 'pending';
    if ($('#reviews-limit')) $('#reviews-limit').value = String(DEFAULT_PAGE_LIMIT);
    if (previousOrigin !== state.origin) invalidateAudit('Consultando o histórico unificado…');
    refresh();
  }

  function bindEvents() {
    var form = $('#reviews-filters');
    if (form) form.addEventListener('submit', applyFilters);
    var clear = $('#reviews-clear');
    if (clear) clear.addEventListener('click', clearFilters);
    var refreshButton = $('#reviews-refresh');
    if (refreshButton) refreshButton.addEventListener('click', refresh);
    var prev = $('#reviews-prev');
    if (prev) prev.addEventListener('click', function () {
      state.offset = Math.max(0, state.offset - state.limit);
      refresh();
    });
    var next = $('#reviews-next');
    if (next) next.addEventListener('click', function () {
      if (state.offset + state.items.length < state.total) {
        state.offset += state.limit;
        refresh();
      }
    });
    var auditRefresh = $('#reviews-audit-refresh');
    if (auditRefresh) auditRefresh.addEventListener('click', loadAudit);
    var audit = $('#reviews-audit');
    if (audit) audit.addEventListener('toggle', function () {
      if (audit.open && !state.auditLoaded) loadAudit();
    });
    var exportButton = $('#reviews-export-json');
    if (exportButton) exportButton.addEventListener('click', exportAudit);
    var repassButton = $('#reviews-repass-run');
    if (repassButton) repassButton.addEventListener('click', runRepass);
    var repassFilter = $('#reviews-repass-filter');
    if (repassFilter) repassFilter.addEventListener('change', function () {
      state.offset = 0;
      refresh();
    });
  }

  function init(options) {
    bridge = options || {};
    if (initialized) return;
    initialized = true;
    var limitField = $('#reviews-limit');
    if (limitField && limitField.querySelector('option[value="' + DEFAULT_PAGE_LIMIT + '"]')) {
      limitField.value = String(DEFAULT_PAGE_LIMIT);
    }
    bindEvents();
    render();
  }

  function setInstitutionalPending(count) {
    var nextCount = Number.isSafeInteger(count) && count >= 0 ? count : 0;
    if (nextCount !== institutionalPending) {
      institutionalPending = nextCount;
      invalidateAudit('A fila institucional mudou. Atualizando o histórico…');
    }
    renderProviders();
  }

  function open(origin, reviewState) {
    var previousOrigin = state.origin;
    if (ORIGINS.indexOf(origin) !== -1) state.origin = origin;
    if (reviewState) state.reviewState = reviewState;
    state.search = '';
    state.offset = 0;
    var originField = $('#reviews-origin');
    var stateField = $('#reviews-state');
    if (originField) originField.value = state.origin;
    if (stateField) stateField.value = state.reviewState;
    if ($('#reviews-search')) $('#reviews-search').value = '';
    if (previousOrigin !== state.origin) invalidateAudit('Atualizando o histórico desta origem…');
    if (bridge && typeof bridge.switchTab === 'function') {
      bridge.switchTab('reviews', { skipOperationalRefresh: true });
    }
    refresh();
  }

  window.KCCaduReviews = {
    init: init,
    open: open,
    refresh: refresh,
    refreshSummary: refreshSummary,
    setInstitutionalPending: setInstitutionalPending
  };
})();
