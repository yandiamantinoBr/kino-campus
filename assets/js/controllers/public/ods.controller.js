(function () {
  'use strict';

  const Content = window.KCODSContent;
  if (!Content) return;

  function getGoalId() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('goal') || '4';
    } catch (_) {
      return '4';
    }
  }

  function setDocumentMeta(goal) {
    document.title = `ODS ${goal.goal} - ${goal.title} | KinoCampus`;
    const titleEl = document.getElementById('kcOdsTitle');
    const subtitleEl = document.getElementById('kcOdsSubtitle');
    if (titleEl) titleEl.textContent = `ODS ${goal.goal} - ${goal.title}`;
    if (subtitleEl) subtitleEl.textContent = goal.subtitle;
  }

  function renderGoalTabs(goalId) {
    const tabs = document.querySelector('[data-kc-ods-goal-tabs]');
    if (!tabs) return;
    tabs.innerHTML = Object.values(Content.goals).map((goal) => `
      <a href="ods.html?goal=${goal.goal}" class="kc-ods-goal-chip${goal.goal === goalId ? ' is-active' : ''}">
        <span>ODS ${goal.goal}</span>
        <strong>${goal.title}</strong>
      </a>
    `).join('');
  }

  function renderHero(goal) {
    const root = document.querySelector('[data-kc-ods-root]');
    const eyebrow = document.querySelector('[data-kc-ods-eyebrow]');
    const lead = document.querySelector('[data-kc-ods-lead]');
    if (root) {
      root.style.setProperty('--kc-ods-color', goal.color);
      root.style.setProperty('--kc-ods-accent', goal.accent);
    }
    if (eyebrow) eyebrow.textContent = `Objetivo ${goal.goal} da Agenda 2030`;
    if (lead) lead.textContent = goal.hero;
  }

  function renderStats(goal) {
    const container = document.querySelector('[data-kc-ods-stats]');
    if (!container) return;
    container.innerHTML = goal.stats.map((stat) => `
      <article class="kc-ods-stat-card">
        <div class="kc-ods-stat-card__value">${stat.value}</div>
        <h3>${stat.label}</h3>
        <p>${stat.detail}</p>
        <a href="${stat.sourceUrl}" target="_blank" rel="noopener noreferrer">${stat.sourceLabel}</a>
      </article>
    `).join('');
  }

  function renderContext(goal) {
    const container = document.querySelector('[data-kc-ods-context]');
    if (!container) return;
    container.innerHTML = goal.context.map((paragraph) => `<p>${paragraph}</p>`).join('');
  }

  function renderHighlights(goal) {
    const container = document.querySelector('[data-kc-ods-highlights]');
    if (!container) return;
    container.innerHTML = goal.highlights.map((item) => `
      <div class="kc-ods-highlight">
        <i class="fas fa-check-circle"></i>
        <span>${item}</span>
      </div>
    `).join('');
  }

  function renderModuleExplorer(goal) {
    const tabs = document.querySelector('[data-kc-ods-module-tabs]');
    const panels = document.querySelector('[data-kc-ods-module-panels]');
    if (!tabs || !panels) return;

    tabs.innerHTML = goal.modules.map((module, index) => `
      <button type="button" class="kc-ods-module-tab${index === 0 ? ' is-active' : ''}" data-kc-ods-module-tab="${module.key}">
        <i class="${module.icon}"></i>
        <span>${module.label}</span>
      </button>
    `).join('');

    panels.innerHTML = goal.modules.map((module, index) => `
      <article class="kc-ods-module-panel${index === 0 ? ' is-active' : ''}" data-kc-ods-module-panel="${module.key}">
        <div class="kc-ods-module-panel__icon"><i class="${module.icon}"></i></div>
        <div>
          <h3>${module.label}</h3>
          <p>${module.body}</p>
          <a href="${module.href}" class="kc-btn-primary">Explorar na plataforma</a>
        </div>
      </article>
    `).join('');

    tabs.addEventListener('click', function (event) {
      const button = event.target.closest('[data-kc-ods-module-tab]');
      if (!button) return;
      const key = String(button.getAttribute('data-kc-ods-module-tab') || '');
      tabs.querySelectorAll('[data-kc-ods-module-tab]').forEach((item) => {
        item.classList.toggle('is-active', item === button);
      });
      panels.querySelectorAll('[data-kc-ods-module-panel]').forEach((panel) => {
        panel.classList.toggle('is-active', panel.getAttribute('data-kc-ods-module-panel') === key);
      });
    });
  }

  function renderSources(goal) {
    const container = document.querySelector('[data-kc-ods-sources]');
    if (!container) return;
    container.innerHTML = goal.sources.map((source) => `
      <a class="kc-ods-source-card" href="${source.url}" target="_blank" rel="noopener noreferrer">
        <strong>${source.label}</strong>
        <span>${source.url.includes('odsbrasil') ? 'Fonte oficial brasileira' : (source.url.includes('sdgs.un.org') ? 'Fonte oficial ONU' : 'Base do projeto')}</span>
      </a>
    `).join('');
  }

  function init() {
    const goal = Content.getGoal(getGoalId()) || Content.getGoal('4');
    if (!goal) return;
    setDocumentMeta(goal);
    renderGoalTabs(goal.goal);
    renderHero(goal);
    renderStats(goal);
    renderContext(goal);
    renderHighlights(goal);
    renderModuleExplorer(goal);
    renderSources(goal);
  }

  document.addEventListener('DOMContentLoaded', init);
}());
