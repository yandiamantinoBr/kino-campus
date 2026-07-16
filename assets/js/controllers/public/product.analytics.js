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

  function isAdminProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return profile.is_admin === true
      || profile.isAdmin === true
      || profile.admin === true
      || String(profile.role || '').toLowerCase() === 'admin';
  }

  function resolveCurrentProfile(context, fallbackUser) {
    var profile = fallbackUser && fallbackUser.profile;
    if (context && typeof context.getCurrentProfile === 'function') {
      try { profile = context.getCurrentProfile() || profile || null; } catch (_) { }
    }
    if (!profile && window.KCAPI && typeof window.KCAPI.getCurrentProfile === 'function') {
      try { profile = window.KCAPI.getCurrentProfile() || null; } catch (_) { }
    }
    if (!profile && window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
      try { profile = window.KCProfiles.getCurrentProfile() || null; } catch (_) { }
    }
    return profile || null;
  }

  function canViewAuthorAnalytics(post, user, context) {
    if (isAuthor(post, user)) return true;
    return isAdminProfile(resolveCurrentProfile(context, user))
      || isAdminProfile(user && user.app_metadata);
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  var LEAD_CONTACT_TYPES = Object.freeze({
    whatsapp: true,
    email_public: true,
    instagram: true,
    linkedin: true,
    facebook: true,
    chat_internal: true,
    external_contact: true,
  });

  function resolveContactChannel(action) {
    var href = String((action && action.href) || '');
    if (/^https?:\/\/(api\.)?whatsapp\.com|^https:\/\/wa\.me\//i.test(href)) return 'whatsapp';
    if (/^mailto:/i.test(href)) return 'email';
    if (/^tel:/i.test(href)) return 'phone';
    if (/mensagens\.html/i.test(href)) return 'chat_internal';
    return 'external';
  }

  function trackContactAction(action, post) {
    if (!window.KCEvents || !action) return false;
    var pid = getPostIdForMutation(post);
    var contactType = String(action.type || 'unknown');
    var channel = resolveContactChannel(action);

    if (LEAD_CONTACT_TYPES[contactType] && typeof window.KCEvents.trackRecommended === 'function') {
      return window.KCEvents.trackRecommended('generate_lead', {
        item_id: pid || null,
        content_type: 'post',
        contact_type: contactType,
        channel: channel,
      });
    }
    if (LEAD_CONTACT_TYPES[contactType] && typeof window.KCEvents.track === 'function') {
      return window.KCEvents.track('kc_contact_click', {
        post_id: pid || null,
        contact_type: contactType,
        channel: channel,
      });
    }
    if (contactType === 'view_profile' && typeof window.KCEvents.track === 'function') {
      return window.KCEvents.track('kc_profile_cta_click', { item_id: pid || null, content_type: 'post' });
    }
    if (contactType === 'external_link' && typeof window.KCEvents.track === 'function') {
      return window.KCEvents.track('kc_external_cta_click', { item_id: pid || null, content_type: 'post' });
    }
    return false;
  }

  function trackContactFormOpen(action, post) {
    if (!action || action.type !== 'real_form' || !window.KCEvents || typeof window.KCEvents.track !== 'function') return false;
    return window.KCEvents.track('kc_contact_form_open', {
      item_id: getPostIdForMutation(post),
      content_type: 'post',
    });
  }

  function trackProfileCta(post) {
    if (!window.KCEvents || typeof window.KCEvents.track !== 'function') return false;
    var publicPostId = String(getPostIdForMutation(post) || '').trim();
    return window.KCEvents.track('kc_profile_cta_click', {
      item_id: publicPostId || null,
      content_type: 'post',
    });
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
    panel.setAttribute('aria-busy', 'false');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-live');
    panel.innerHTML =
      statBadge('fas fa-eye', result.views, 'Views') +
      statBadge('fas fa-arrow-up', result.votos, 'Votos') +
      statBadge('fas fa-comment', result.comments, 'Coment.') +
      statBadge('fas fa-share-nodes', result.shares, 'Compartilh.') +
      statBadge('fas fa-bookmark', result.saves, 'Salvos') +
      statBadge('fas fa-hand-pointer', result.coupon_clicks, 'Cliques CTA');
  }

  function renderAuthorAnalytics(post, user, context) {
    if (!canViewAuthorAnalytics(post, user, context)) return;
    var details = document.querySelector('.kc-product-details');
    if (!details) return;

    var existing = document.getElementById('kcAuthorAnalytics');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'kcAuthorAnalytics';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-busy', 'true');
    panel.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:10px;background:var(--kc-surface-dark, #1a1a22);margin-bottom:12px;font-size:.85em;align-items:center;';
    panel.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--kc-text-dark-secondary, #888);" aria-hidden="true"></i> <span style="color:var(--kc-text-dark-secondary, #888);">Carregando analytics...</span>';

    var actions = document.querySelector('.kc-product-actions');
    if (actions) actions.insertAdjacentElement('afterend', panel);
    else details.insertAdjacentElement('afterbegin', panel);

    var pid = getPostIdForMutation(post);
    if (!pid || !window.KCAPI || typeof window.KCAPI.getPostAnalytics !== 'function') {
      panel.setAttribute('aria-busy', 'false');
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
        panel.setAttribute('aria-busy', 'false');
        if (!renderedSignature) panel.style.display = 'none';
        return;
      }
      var nextSignature = buildAuthorAnalyticsSignature(res);
      if (!renderedSignature || nextSignature !== renderedSignature) {
        renderedSignature = nextSignature;
        setAuthorAnalyticsMarkup(panel, res);
      }
    }).catch(function () {
      panel.setAttribute('aria-busy', 'false');
      if (!renderedSignature) panel.style.display = 'none';
    });
  }

  window._KCProduct.analytics = {
    renderAuthorAnalytics: renderAuthorAnalytics,
    trackContactAction: trackContactAction,
    trackContactFormOpen: trackContactFormOpen,
    trackProfileCta: trackProfileCta,
  };
})();
