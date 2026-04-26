/**
 * @file product.analytics.js
 * @description Sub-modulo de analytics do autor na pagina de produto (v11.30.16)
 * Extraido de product.controller.js. Registra window._KCProduct.analytics.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  - namespace criado por product.controller.js
 *   - window.KCAPI       - getCachedPostAnalytics, refreshPostAnalytics, getPostAnalytics
 *   - window.KCUtils     - escapeHtml
 *
 * Carregado apos product.edit.js em _product.html (defer).
 * Execucao: IIFE imediata -> window._KCProduct.analytics disponivel antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  function esc(str) {
    return (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
      ? window.KCUtils.escapeHtml(str)
      : String(str || '');
  }

  function isAuthor(post, user) {
    if (!post || !user || !user.id) return false;
    var postAuthorId = String(post.autorId || post.authorId || post.author_id || '').trim();
    return !!postAuthorId && postAuthorId === String(user.id).trim();
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  function buildAuthorAnalyticsSignature(result) {
    var source = (result && typeof result === 'object') ? result : {};
    return [
      Number(source.views) || 0,
      Number(source.votos) || 0,
      Number(source.comments) || 0,
      Number(source.shares) || 0,
      Number(source.saves) || 0,
      Number(source.coupon_clicks) || 0,
    ].join('|');
  }

  function statBadge(icon, value, label) {
    var v = Number(value) || 0;
    return '<div style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;background:var(--kc-background-dark, #0f0f13);white-space:nowrap;">' +
      '<i class="' + esc(icon) + '" style="color:var(--kc-primary-brand, #ff6b00);font-size:.9em;"></i> ' +
      '<strong>' + v + '</strong> <span style="color:var(--kc-text-dark-secondary, #888);">' + esc(label) + '</span>' +
      '</div>';
  }

  function setAuthorAnalyticsMarkup(panel, result) {
    if (!panel) return;
    panel.innerHTML =
      statBadge('fas fa-eye', result.views, 'Views') +
      statBadge('fas fa-arrow-up', result.votos, 'Votos') +
      statBadge('fas fa-comment', result.comments, 'Coment.') +
      statBadge('fas fa-share-nodes', result.shares, 'Compartilh.') +
      statBadge('fas fa-bookmark', result.saves, 'Salvos') +
      statBadge('fas fa-hand-pointer', result.coupon_clicks, 'Cliques CTA');
  }

  function renderAuthorAnalytics(post, user) {
    if (!isAuthor(post, user)) return;
    var details = document.querySelector('.kc-product-details');
    if (!details) return;

    var existing = document.getElementById('kcAuthorAnalytics');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'kcAuthorAnalytics';
    panel.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:10px;background:var(--kc-surface-dark, #1a1a22);margin-bottom:12px;font-size:.85em;align-items:center;';
    panel.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--kc-text-dark-secondary, #888);"></i> <span style="color:var(--kc-text-dark-secondary, #888);">Carregando analytics...</span>';

    var actions = document.querySelector('.kc-product-actions');
    if (actions) actions.insertAdjacentElement('afterend', panel);
    else details.insertAdjacentElement('afterbegin', panel);

    var pid = getPostIdForMutation(post);
    if (!pid || !window.KCAPI || typeof window.KCAPI.getPostAnalytics !== 'function') {
      panel.style.display = 'none';
      return;
    }

    var cached = (typeof window.KCAPI.getCachedPostAnalytics === 'function')
      ? window.KCAPI.getCachedPostAnalytics(pid, { allowStale: true })
      : null;
    var renderedSignature = '';

    if (cached && cached.data && cached.data.ok) {
      renderedSignature = buildAuthorAnalyticsSignature(cached.data);
      setAuthorAnalyticsMarkup(panel, cached.data);
    }

    var request = (typeof window.KCAPI.refreshPostAnalytics === 'function')
      ? window.KCAPI.refreshPostAnalytics(pid, { force: true, keepStaleOnError: true })
      : window.KCAPI.getPostAnalytics(pid);

    request.then(function (res) {
      if (!res || !res.ok) {
        if (!renderedSignature) panel.style.display = 'none';
        return;
      }
      var nextSignature = buildAuthorAnalyticsSignature(res);
      if (!renderedSignature || nextSignature !== renderedSignature) {
        renderedSignature = nextSignature;
        setAuthorAnalyticsMarkup(panel, res);
      }
    }).catch(function () {
      if (!renderedSignature) panel.style.display = 'none';
    });
  }

  window._KCProduct.analytics = {
    renderAuthorAnalytics: renderAuthorAnalytics,
  };
})();
