/**
 * @file kc-api-facade-contract.test.js
 * @description Static contract tests for assets/js/kc-api.client.js facade (v11.32.1)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../assets/js/kc-api.client.js');
let source;
let facadeBlock;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');

  const facadeStart = source.indexOf('window.KCAPI = Object.freeze({');
  const globalsStart = source.indexOf('window.getLastCreatePostError = getLastCreatePostError;');
  facadeBlock = source.slice(facadeStart, globalsStart);
});

describe('kc-api.client.js - source shape', () => {
  test('mantem IIFE, strict mode e facade congelado em window.KCAPI', () => {
    const preamble = source.slice(0, 600);

    expect(preamble).toContain('(function () {');
    expect(preamble).toContain("'use strict';");
    expect(source).toContain("const VERSION = '8.6.0';");
    expect(source).toContain('window.KCAPI = Object.freeze({');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('mantem KCAPI como fachada publica principal e _KCAPI como namespace interno', () => {
    expect(source).toContain('- window.KCAPI');
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.notifications = window._KCAPI.notifications || {};');
    expect(facadeBlock).not.toContain('window._KCAPI.notifications');
  });
});

describe('kc-api.client.js - adapter registry and config facade', () => {
  test('mantem registry de adapters com fallback local/supabase e erro quando vazio', () => {
    expect(source).toContain('const _adapters = {};');
    expect(source).toContain('function registerAdapter(name, adapter) {');
    expect(source).toContain('_adapters[name] = adapter;');
    expect(source).toContain("if (ENV.driver === 'supabase' && _adapters['supabase']) return _adapters['supabase'];");
    expect(source).toContain("if (_adapters['local']) return _adapters['local'];");
    expect(source).toContain("throw new Error('No driver adapters loaded!');");
  });

  test('exporta os pontos de bootstrap/config sem alterar a fachada publica', () => {
    expect(facadeBlock).toContain('VERSION,');
    expect(facadeBlock).toContain('ENV,');
    expect(facadeBlock).toContain('config: cfg,');
    expect(facadeBlock).toContain('registerAdapter,');
    expect(facadeBlock).toContain("get activeDriver() { try { return getActiveDriver().name; } catch(e) { return 'pending'; } },");
    expect(facadeBlock).toContain('setConfig,');
    expect(facadeBlock).toContain('fetchJSON,');
    expect(facadeBlock).toContain('apiURL,');
    expect(facadeBlock).toContain('DEFAULTS,');
  });
});

describe('kc-api.client.js - public domains frozen in the facade', () => {
  test('mantem o bloco de leitura/escrita de posts e analytics exposto no facade', () => {
    [
      'getDatabaseRaw,',
      'getDatabaseNormalized,',
      'getPosts,',
      'searchPosts,',
      'getFeedCursor,',
      'getPostById,',
      'createPost,',
      'updatePost,',
      'deletePost,',
      'reportPost,',
      'togglePostStatus,',
      'renewPost,',
      'bumpPost,',
      'getTopContributors,',
      'trackCouponClick,',
      'trackShare,',
      'trackView,',
      'getCachedPostAnalytics,',
      'refreshPostAnalytics,',
      'invalidatePostAnalyticsCache,',
      'getPostAnalytics,',
      'checkDuplicatePost,',
      'rankRelatedPosts,',
    ].forEach((token) => expect(facadeBlock).toContain(token));
  });

  test('mantem comments, votes, saved/help/notifications/invites expostos no facade', () => {
    [
      'getCachedComments,',
      'refreshComments,',
      'invalidateCommentsCache,',
      'getComments,',
      'addComment,',
      'likeComment,',
      'votePost,',
      'getMyVote,',
      'getSavedPostState,',
      'setSavedPostState,',
      'clearSavedPostState,',
      'getMySavedPosts,',
      'getMySavedPostsCount,',
      'getProfileHighlights,',
      'getProfileHighlightsCount,',
      'createHelpRequest,',
      'listAdminHelpRequests,',
      'updateAdminHelpRequest,',
      'getNotificationPreferences,',
      'updateNotificationPreferences,',
      'getNotificationChannelTargets,',
      'updateNotificationChannelTargets,',
      'getNotifications,',
      'markNotificationsRead,',
      'markAllNotificationsRead,',
      'clearNotifications,',
      'getUnreadNotificationCount,',
      'subscribeNotifications,',
      'unsubscribeNotifications,',
      'inviteExternalUser,',
      'getInvites,',
      'revokeInvite,',
    ].forEach((token) => expect(facadeBlock).toContain(token));
  });

  test('mantem auth, profiles, mocks, normalizers e helpers utilitarios expostos', () => {
    [
      'getCurrentUser,',
      'signIn,',
      'signUp,',
      'resendConfirmation,',
      'requestPasswordReset,',
      'updatePassword,',
      'login,',
      'logout,',
      'getCurrentProfile,',
      'getProfileById,',
      'syncProfile,',
      'getMyProfile,',
      'updateMyProfile,',
      'uploadProfileAvatar,',
      'getMyPosts,',
      'getPostsByAuthorId,',
      'getRelatedPosts,',
      'MOCK_USERS,',
      'MOCK_USERS_BY_ID,',
      'MOCK_USERS_LIST,',
      'getAuthorById,',
      'filterPosts,',
      'normalizePost,',
      'normalizeUserRatingSummary,',
      'normalizeUserRatingEntry,',
      'normalizeUserRatingState,',
      'normalizeUserRatingList,',
      'isBackendEnabled,',
    ].forEach((token) => expect(facadeBlock).toContain(token));
  });
});

describe('kc-api.client.js - driver fallback and unavailable guards', () => {
  test('mantem fallback de searchPosts para getPosts do driver quando searchPosts nao existe', () => {
    expect(source).toContain('async function searchPosts(params = {}) {');
    expect(source).toContain("if (!driver || typeof driver.searchPosts !== 'function') {");
    expect(source).toContain('const posts = await driver.getPosts(params);');
    expect(source).toContain('return Array.isArray(posts) ? posts : [];');
  });

  test('mantem guards de producao supabase para mutacoes criticas', () => {
    expect(source).toContain("const policyError = enforceSupabaseOnProduction('createPost');");
    expect(source).toContain("const policyError = enforceSupabaseOnProduction('votePost');");
    expect(source).toContain("code: 'PRODUCTION_REQUIRES_SUPABASE'");
  });

  test('mantem contractos de indisponibilidade em notifications e convites', () => {
    expect(source).toContain('async function clearNotifications() {');
    expect(source).toContain("return { ok: false, error: 'UNAVAILABLE' };");
    expect(source).toContain('async function inviteExternalUser(email, note) {');
    expect(source).toContain("return { ok: false, error: 'DRIVER_NAO_SUPORTA' };");
    expect(source).toContain('async function getInvites() {');
    expect(source).toContain('return { data: [], error: null };');
  });

  test('mantem fallback canonico para preferencias e destinos privados de notificacao', () => {
    expect(source).toContain('function getNotificationsModule() {');
    expect(source).toContain('function buildFallbackNotificationPreferences() {');
    expect(source).toContain('function buildFallbackNotificationChannelTargets() {');
    expect(source).toContain('return notificationsModule.getNotificationPreferences({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.updateNotificationPreferences(preferences, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.getNotificationChannelTargets({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.updateNotificationChannelTargets(targets, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets === \'function\'');
    expect(source).toContain("return { ok: false, error: { message: 'Preferencias de notificacao indisponiveis neste driver.' } };");
    expect(source).toContain("return { ok: false, error: { message: 'Destinos privados de notificacao indisponiveis neste driver.' } };");
  });

  test('mantem fallback local/supabase nas leituras de saved e profile highlights', () => {
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getMySavedPosts === 'function') return driver.getMySavedPosts(params);");
    expect(source).toContain("if (ENV.driver !== 'supabase' || !getActiveDriver().getMySavedPosts) return [];");
    expect(source).toContain("if (ENV.driver !== 'supabase' && driver && typeof driver.getMySavedPostsCount === 'function') return driver.getMySavedPostsCount(params);");
    expect(source).toContain("if (ENV.driver !== 'supabase' || !getActiveDriver().getMySavedPostsCount) return 0;");
    expect(source).toContain("if (ENV.driver !== 'supabase' || !getActiveDriver().getProfileHighlights) return [];");
    expect(source).toContain("if (ENV.driver !== 'supabase' || !getActiveDriver().getProfileHighlightsCount) return 0;");
  });

  test('mantem auth desabilitada de forma explicita no modo local', () => {
    expect(source).toContain('async function getCurrentUser() {');
    expect(source).toContain("if (ENV.driver !== 'supabase') return null;");
    expect(source).toContain("if (ENV.driver !== 'supabase') return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };");
    expect(source).toContain("if (ENV.driver !== 'supabase') return false;");
  });
});

describe('kc-api.client.js - caches, SWR and diagnostics', () => {
  test('mantem cache de sessao e deduplicacao para analytics do produto', () => {
    expect(source).toContain('const _pendingProductAnalyticsRequests = new Map();');
    expect(source).toContain('function getCachedPostAnalytics(');
    expect(source).toContain("return getCachedSessionPayload('product', getPostAnalyticsCacheKey(id), PRODUCT_ANALYTICS_CACHE_MAX_AGE_MS, PRODUCT_ANALYTICS_STALE_MAX_AGE_MS, options);");
    expect(source).toContain('return withPendingSessionRequest(_pendingProductAnalyticsRequests, requestKey, async () => {');
    expect(source).toContain("persistSessionPayload('product', requestKey, result, buildPostAnalyticsSignature(result));");
  });

  test('mantem cache de sessao e deduplicacao para comments do produto', () => {
    expect(source).toContain('const _pendingProductCommentsRequests = new Map();');
    expect(source).toContain('function getCommentsCacheKey(postId) {');
    expect(source).toContain('return `comments:${getCommentsCacheIdentity()}:${String(postId || \'\').trim()}`;');
    expect(source).toContain("return getCachedSessionPayload('product', getCommentsCacheKey(id), PRODUCT_COMMENTS_CACHE_MAX_AGE_MS, PRODUCT_COMMENTS_STALE_MAX_AGE_MS, options);");
    expect(source).toContain('return withPendingSessionRequest(_pendingProductCommentsRequests, requestKey, async () => {');
    expect(source).toContain("persistSessionPayload('product', requestKey, normalized, buildCommentsSignature(normalized));");
  });

  test('mantem os globals de diagnostico de create-post fora da fachada congelada', () => {
    expect(facadeBlock).toContain('getLastCreatePostError,');
    expect(facadeBlock).toContain('setLastCreatePostError,');
    expect(facadeBlock).toContain('clearLastCreatePostError,');
    expect(facadeBlock).toContain('summarizeCreatePayloadForDiagnostics,');
    expect(source).toContain('window.getLastCreatePostError = getLastCreatePostError;');
    expect(source).toContain('window.setLastCreatePostError = setLastCreatePostError;');
    expect(source).toContain('window.clearLastCreatePostError = clearLastCreatePostError;');
    expect(source).toContain('window.summarizeCreatePayloadForDiagnostics = summarizeCreatePayloadForDiagnostics;');
  });
});
