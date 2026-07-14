/**
 * @file kc-api-facade-contract.test.js
 * @description Static contract tests for assets/js/api/kc-api.client.js facade (v11.32.1)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.client.js');
const DIAGNOSTICS_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.diagnostics.js');
const SESSION_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.session.js');
const FILTERS_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.filters.js');
const AUTHORS_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.authors.js');
const POSTS_NORMALIZE_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.posts-normalize.js');
const RATINGS_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.ratings.js');
let source;
let diagnosticsSource;
let sessionSource;
let filtersSource;
let authorsSource;
let postsNormalizeSource;
let ratingsSource;
let facadeBlock;

const EXPECTED_KCAPI_MEMBERS = [
  'VERSION',
  'ENV',
  'config',
  'registerAdapter',
  'activeDriver',
  'setConfig',
  'fetchJSON',
  'getDatabaseRaw',
  'getDatabaseNormalized',
  'getPosts',
  'searchPosts',
  'getFeedCursor',
  'getPersonalizedTabs',
  'getUserRatingSummary',
  'getUserRatingState',
  'listUserRatings',
  'upsertUserRating',
  'getPostById',
  'createPost',
  'updatePost',
  'deletePost',
  'reportPost',
  'togglePostStatus',
  'renewPost',
  'bumpPost',
  'closePost',
  'reactivatePost',
  'getTopContributors',
  'trackCouponClick',
  'trackShare',
  'trackView',
  'getCachedPostAnalytics',
  'refreshPostAnalytics',
  'invalidatePostAnalyticsCache',
  'getPostAnalytics',
  'checkDuplicatePost',
  'getCachedComments',
  'refreshComments',
  'invalidateCommentsCache',
  'getComments',
  'addComment',
  'likeComment',
  'votePost',
  'getMyVote',
  'getMyProfile',
  'updateMyProfile',
  'uploadProfileAvatar',
  'getMyPosts',
  'getPostsByAuthorId',
  'getRelatedPosts',
  'getSavedPostState',
  'setSavedPostState',
  'clearSavedPostState',
  'getMySavedPosts',
  'getMySavedPostsCount',
  'getProfileHighlights',
  'getProfileHighlightsCount',
  'createHelpRequest',
  'listAdminHelpRequests',
  'updateAdminHelpRequest',
  'processAccountErasure',
  'listExternalAccessRequests',
  'decideExternalAccessRequest',
  'getNotificationPreferences',
  'updateNotificationPreferences',
  'getNotificationChannelTargets',
  'updateNotificationChannelTargets',
  'getNotifications',
  'markNotificationsRead',
  'markAllNotificationsRead',
  'clearNotifications',
  'getUnreadNotificationCount',
  'subscribeNotifications',
  'unsubscribeNotifications',
  'chat',
  'inviteExternalUser',
  'getInvites',
  'revokeInvite',
  'getCurrentUser',
  'signIn',
  'signUp',
  'resendConfirmation',
  'requestPasswordReset',
  'updatePassword',
  'login',
  'logout',
  'getCurrentProfile',
  'getProfileById',
  'syncProfile',
  'getLastCreatePostError',
  'setLastCreatePostError',
  'clearLastCreatePostError',
  'summarizeCreatePayloadForDiagnostics',
  'rankRelatedPosts',
  'MOCK_USERS',
  'apiURL',
  'DEFAULTS',
  'MOCK_USERS_BY_ID',
  'MOCK_USERS_LIST',
  'getAuthorById',
  'filterPosts',
  'normalizePost',
  'normalizeUserRatingSummary',
  'normalizeUserRatingEntry',
  'normalizeUserRatingState',
  'normalizeUserRatingList',
  'isBackendEnabled',
];

function extractFacadeMembers(block) {
  return block.split(/\r?\n/u).reduce((members, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('window.KCAPI') || trimmed === '});') {
      return members;
    }

    const getter = trimmed.match(/^get\s+([A-Za-z0-9_$]+)\s*\(/u);
    if (getter) {
      members.push(getter[1]);
      return members;
    }

    const alias = trimmed.match(/^([A-Za-z0-9_$]+)\s*:/u);
    if (alias) {
      members.push(alias[1]);
      return members;
    }

    const shorthand = trimmed.match(/^([A-Za-z0-9_$]+),$/u);
    if (shorthand) {
      members.push(shorthand[1]);
    }

    return members;
  }, []);
}

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
  diagnosticsSource = fs.readFileSync(DIAGNOSTICS_SRC, 'utf8');
  sessionSource = fs.readFileSync(SESSION_SRC, 'utf8');
  filtersSource = fs.readFileSync(FILTERS_SRC, 'utf8');
  authorsSource = fs.readFileSync(AUTHORS_SRC, 'utf8');
  postsNormalizeSource = fs.readFileSync(POSTS_NORMALIZE_SRC, 'utf8');
  ratingsSource = fs.readFileSync(RATINGS_SRC, 'utf8');

  const facadeStart = source.indexOf('window.KCAPI = Object.freeze({');
  const globalsStart = source.indexOf('window.getLastCreatePostError = getLastCreatePostError;');
  facadeBlock = source.slice(facadeStart, globalsStart);
});

describe('kc-api.client.js - source shape', () => {
  test('mantem IIFE, strict mode e facade congelado em window.KCAPI', () => {
    const preamble = source.slice(0, 600);

    expect(preamble).toContain('(function () {');
    expect(preamble).toContain("'use strict';");
    expect(source).toContain("const VERSION = '8.6.1';");
    expect(source).toContain('window.KCAPI = Object.freeze({');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('mantem snapshot completo dos 107 membros publicos de window.KCAPI', () => {
    expect(extractFacadeMembers(facadeBlock)).toEqual(EXPECTED_KCAPI_MEMBERS);
    expect(EXPECTED_KCAPI_MEMBERS).toHaveLength(107);
  });

  test('mantem kc-api.client.js abaixo do limite de crescimento antes da proxima decomposicao', () => {
    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(1545);
  });

  test('mantem KCAPI como fachada publica principal e _KCAPI como namespace interno', () => {
    expect(source).toContain('- window.KCAPI');
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.notifications = window._KCAPI.notifications || {};');
    expect(source).toContain('window._KCAPI.saved = window._KCAPI.saved || {};');
    expect(source).toContain('window._KCAPI.help = window._KCAPI.help || {};');
    expect(source).toContain('window._KCAPI.postsRead = window._KCAPI.postsRead || {};');
    expect(source).toContain('window._KCAPI.commentsVotes = window._KCAPI.commentsVotes || {};');
    expect(source).toContain('window._KCAPI.ratings = window._KCAPI.ratings || {};');
    expect(source).toContain('window._KCAPI.postsFeed = window._KCAPI.postsFeed || {};');
    expect(source).toContain('window._KCAPI.postsWrite = window._KCAPI.postsWrite || {};');
    expect(source).toContain('window._KCAPI.profiles = window._KCAPI.profiles || {};');
    expect(source).toContain('window._KCAPI.related = window._KCAPI.related || {};');
    expect(source).toContain('window._KCAPI.auth = window._KCAPI.auth || {};');
    expect(source).toContain('window._KCAPI.diagnostics = window._KCAPI.diagnostics || {};');
    expect(source).toContain('window._KCAPI.session = window._KCAPI.session || {};');
    expect(source).toContain('window._KCAPI.filters = window._KCAPI.filters || {};');
    expect(source).toContain('window._KCAPI.authors = window._KCAPI.authors || {};');
    expect(source).toContain('window._KCAPI.postsNormalize = window._KCAPI.postsNormalize || {};');
    expect(facadeBlock).not.toContain('window._KCAPI.notifications');
    expect(facadeBlock).not.toContain('window._KCAPI.saved');
    expect(facadeBlock).not.toContain('window._KCAPI.help');
    expect(facadeBlock).not.toContain('window._KCAPI.postsRead');
    expect(facadeBlock).not.toContain('window._KCAPI.diagnostics');
    expect(facadeBlock).not.toContain('window._KCAPI.session');
    expect(facadeBlock).not.toContain('window._KCAPI.filters');
    expect(facadeBlock).not.toContain('window._KCAPI.authors');
    expect(facadeBlock).not.toContain('window._KCAPI.postsNormalize');
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
      'closePost,',
      'reactivatePost,',
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
      'processAccountErasure,',
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
      'get MOCK_USERS() { return getMockUsers(); },',
      'get MOCK_USERS_BY_ID() { return getMockUsersById(); },',
      'get MOCK_USERS_LIST() { return getMockUsersList(); },',
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
    // createPost guard no facade como fallback (delegado para postsWrite via getPostsWriteModule)
    // votePost/addComment movidos para kc-api.comments-votes.js
    expect(source).toContain("const policyError = enforceSupabaseOnProduction('createPost');");
    expect(source).toContain("code: 'PRODUCTION_REQUIRES_SUPABASE'");
  });

  test('mantem contractos de indisponibilidade em notifications e delega help/invites via getHelpModule', () => {
    expect(source).toContain('async function clearNotifications() {');
    expect(source).toContain("return { ok: false, error: 'UNAVAILABLE' };");
    expect(source).toContain('function getHelpModule() {');
    expect(source).toContain('const helpModule = getHelpModule();');
    expect(source).toContain('return helpModule.createHelpRequest(payload, { getActiveDriver });');
    expect(source).toContain('return helpModule.listAdminHelpRequests(filters, { getActiveDriver });');
    expect(source).toContain('return helpModule.updateAdminHelpRequest(id, patch, { getActiveDriver });');
    expect(source).toContain('return helpModule.processAccountErasure(payload, { getActiveDriver });');
    expect(source).toContain('return helpModule.listExternalAccessRequests(filters, { getActiveDriver });');
    expect(source).toContain('return helpModule.decideExternalAccessRequest(payload, { getActiveDriver });');
    expect(source).toContain('return helpModule.inviteExternalUser(email, note, { getActiveDriver });');
    expect(source).toContain('return helpModule.getInvites({ getActiveDriver });');
    expect(source).toContain('return helpModule.revokeInvite(email, { getActiveDriver });');
    // Fallbacks canonicos quando o submodulo nao esta carregado
    expect(source).toContain("return { ok: false, error: 'DRIVER_NAO_SUPORTA' };");
    expect(source).toContain('return { data: [], error: null };');
  });

  test('mantem fallback canonico de notificacao concentrado no submodulo', () => {
    expect(source).toContain('function getNotificationsModule() {');
    expect(source).not.toContain('function buildFallbackNotificationPreferences() {');
    expect(source).not.toContain('function buildFallbackNotificationChannelTargets() {');
    expect(source).toContain('return notificationsModule.getNotificationPreferences({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.updateNotificationPreferences(preferences, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.getNotificationChannelTargets({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.updateNotificationChannelTargets(targets, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.buildFallbackNotificationPreferences({ accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('return notificationsModule.buildFallbackNotificationChannelTargets({ accountProfileUtils: window.KCAccountProfileUtils });');
    expect(source).toContain('window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationPreferences === \'function\'');
    expect(source).toContain('window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets === \'function\'');
    expect(source).toContain("return { ok: false, error: { message: 'Prefer\\u00EAncias de notifica\\u00E7\\u00E3o indispon\\u00EDveis neste driver.' } };");
    expect(source).toContain("return { ok: false, error: { message: 'Destinos privados de notifica\\u00E7\\u00E3o indispon\\u00EDveis neste driver.' } };");
  });

  test('mantem fachada delegando saved/highlights via getSavedModule com fallback canonico', () => {
    expect(source).toContain('function getSavedModule() {');
    expect(source).toContain('const savedModule = getSavedModule();');
    expect(source).toContain('return savedModule.getSavedPostState(postId, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    expect(source).toContain('return savedModule.setSavedPostState(postId, kind, enabled, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    expect(source).toContain('return savedModule.clearSavedPostState(postId, kind, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    expect(source).toContain('return savedModule.getMySavedPosts(params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    expect(source).toContain('return savedModule.getMySavedPostsCount(params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    expect(source).toContain('return savedModule.getProfileHighlights(profileId, params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    expect(source).toContain('return savedModule.getProfileHighlightsCount(profileId, params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });');
    // Fallbacks canonicos quando o submodulo nao esta carregado
    expect(source).toContain('return { kinds: [] };');
    expect(source).toContain("return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };");
  });

  test('mantem delegacao para auth via getAuthModule e buildAuthDeps', () => {
    expect(source).toContain('function getAuthModule()');
    expect(source).toContain('function buildAuthDeps()');
    expect(source).toContain('return authModule.getCurrentUser(buildAuthDeps());');
    expect(source).toContain('return authModule.signIn(email, password, buildAuthDeps());');
    expect(source).toContain('return authModule.signUp(email, password, options, buildAuthDeps());');
    expect(source).toContain('return authModule.resendConfirmation(email, options, buildAuthDeps());');
    expect(source).toContain('return authModule.requestPasswordReset(email, options, buildAuthDeps());');
    expect(source).toContain('return authModule.updatePassword(password, buildAuthDeps());');
    expect(source).toContain('return authModule.login(email, password, buildAuthDeps());');
    expect(source).toContain('return authModule.logout(buildAuthDeps());');
  });
});

describe('kc-api.client.js - caches, SWR and diagnostics', () => {
  test('mantem delegacao para profiles via getProfilesModule e buildProfilesDeps', () => {
    expect(source).toContain('function getProfilesModule()');
    expect(source).toContain('function buildProfilesDeps()');
    expect(source).toContain('return profilesModule.getCurrentProfile(buildProfilesDeps());');
    expect(source).toContain('return profilesModule.getProfileById(id, buildProfilesDeps());');
    expect(source).toContain('return profilesModule.syncProfile(buildProfilesDeps());');
    expect(source).toContain('return profilesModule.getMyProfile(buildProfilesDeps());');
    expect(source).toContain('return profilesModule.updateMyProfile(patch, buildProfilesDeps());');
    expect(source).toContain('return profilesModule.uploadProfileAvatar(fileOrDataUrl, buildProfilesDeps());');
  });

  test('mantem delegacao para posts-write via getPostsWriteModule e buildPostsWriteDeps', () => {
    expect(source).toContain('function getPostsWriteModule()');
    expect(source).toContain('function buildPostsWriteDeps()');
    expect(source).toContain('postFreshness: window.KCPostFreshness');
    expect(source).toContain('postsWriteModule.createPost(body, buildPostsWriteDeps())');
    expect(source).toContain('postsWriteModule.updatePost(postId, payload, buildPostsWriteDeps())');
    expect(source).toContain('postsWriteModule.deletePost(postId, buildPostsWriteDeps())');
    expect(source).toContain('return postsWriteModule.reportPost(postId, payload, buildPostsWriteDeps());');
    expect(source).toContain('postsWriteModule.togglePostStatus(postId, buildPostsWriteDeps())');
    expect(source).toContain('postsWriteModule.renewPost(postId, buildPostsWriteDeps())');
    expect(source).toContain('postsWriteModule.bumpPost(postId, buildPostsWriteDeps())');
    expect(source).toContain('postsWriteModule.closePost(postId, payload, buildPostsWriteDeps())');
    expect(source).toContain('postsWriteModule.reactivatePost(postId, buildPostsWriteDeps())');
    expect(source).toContain('function emitPostsWriteMutation');
    expect(source).toContain('postsWriteModule.emitPostMutation(type, postId, result, fallback, buildPostsWriteDeps())');
    expect(source).not.toContain('function emitPostMutation');
    expect(source).not.toContain('function isPostMutationOk');
    expect(source).not.toContain('function getPostMutationData');
  });

  test('mantem delegacao para posts-feed via getPostsFeedModule e buildPostsFeedDeps', () => {
    expect(source).toContain('function getPostsFeedModule()');
    expect(source).toContain('function buildPostsFeedDeps()');
    expect(source).toContain('return postsFeedModule.getPosts(params, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.searchPosts(params, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.getFeedCursor(params, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.getPostById(id, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.getTopContributors(period, module, limit, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.checkDuplicatePost(userId, module, title, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.getMyPosts(params, buildPostsFeedDeps());');
    expect(source).toContain('return postsFeedModule.getPostsByAuthorId(authorId, params, buildPostsFeedDeps());');
  });

  test('mantem delegacao para ratings via getRatingsModule e buildRatingsDeps', () => {
    const ratingsDepsStart = source.indexOf('function buildRatingsDeps()');
    const ratingsDepsEnd = source.indexOf('async function getUserRatingSummary', ratingsDepsStart);
    const ratingsDepsBlock = source.slice(ratingsDepsStart, ratingsDepsEnd);

    expect(source).toContain('function getRatingsModule()');
    expect(source).toContain('function buildRatingsDeps()');
    expect(ratingsDepsBlock).toContain('getActiveDriver,');
    expect(ratingsDepsBlock).not.toContain('normalizeUserRatingSummary');
    expect(ratingsDepsBlock).not.toContain('normalizeUserRatingEntry');
    expect(ratingsDepsBlock).not.toContain('normalizeUserRatingState');
    expect(ratingsDepsBlock).not.toContain('normalizeUserRatingList');
    expect(source).toContain('return ratingsModule.getUserRatingSummary(userId, buildRatingsDeps());');
    expect(source).toContain('return ratingsModule.getUserRatingState(params, buildRatingsDeps());');
    expect(source).toContain('return ratingsModule.listUserRatings(userId, options, buildRatingsDeps());');
    expect(source).toContain('return ratingsModule.upsertUserRating(payload, buildRatingsDeps());');
  });

  test('mantem normalizadores de rating como wrappers publicos para kc-api.ratings.js', () => {
    expect(source).toContain('function normalizeUserRatingSummary(raw, fallbackUserId) {');
    expect(source).toContain('return ratingsModule.normalizeUserRatingSummary(raw, fallbackUserId);');
    expect(source).toContain('function normalizeUserRatingEntry(raw) {');
    expect(source).toContain('return ratingsModule.normalizeUserRatingEntry(raw);');
    expect(source).toContain('function normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId) {');
    expect(source).toContain('return ratingsModule.normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId);');
    expect(source).toContain('function normalizeUserRatingList(raw, fallbackPage, fallbackLimit) {');
    expect(source).toContain('return ratingsModule.normalizeUserRatingList(raw, fallbackPage, fallbackLimit);');

    expect(source).not.toContain('const averageRaw = source.average != null ? source.average : source.rating_avg;');
    expect(source).not.toContain('const reviewer = (source.reviewer && typeof source.reviewer ===');
    expect(source).not.toContain('source.hasMore === true || source.has_more === true');

    expect(ratingsSource).toContain('function normalizeUserRatingSummary(raw, fallbackUserId)');
    expect(ratingsSource).toContain('function normalizeUserRatingEntry(raw)');
    expect(ratingsSource).toContain('function normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId)');
    expect(ratingsSource).toContain('function normalizeUserRatingList(raw, fallbackPage, fallbackLimit)');
    expect(ratingsSource).toContain('window._KCAPI.ratings = {');
  });

  test('mantem cache de sessao e deduplicacao para analytics do produto via getPostsReadModule', () => {
    expect(source).toContain('function getPostsReadModule()');
    expect(source).toContain('function buildPostsReadDeps()');
    expect(source).toContain('const postsReadModule = getPostsReadModule();');
    expect(source).toContain('return postsReadModule.getCachedPostAnalytics(postId, options, buildPostsReadDeps());');
    expect(source).toContain('return postsReadModule.invalidatePostAnalyticsCache(postId, buildPostsReadDeps());');
    expect(source).toContain('return postsReadModule.refreshPostAnalytics(postId, options, buildPostsReadDeps());');
    expect(source).toContain('return postsReadModule.getPostAnalytics(postId, options, buildPostsReadDeps());');
    expect(source).toContain('return postsReadModule.trackView(postId, buildPostsReadDeps());');
    expect(source).toContain('return postsReadModule.trackShare(postId, method, buildPostsReadDeps());');
    expect(source).toContain('return postsReadModule.trackCouponClick(postId, buildPostsReadDeps());');
  });

  test('mantem cache de sessao e deduplicacao para comments/votes via getCommentsVotesModule', () => {
    expect(source).toContain('function getCommentsVotesModule()');
    expect(source).toContain('function buildCommentsVotesDeps()');
    expect(source).toContain('const m = getCommentsVotesModule();');
    expect(source).toContain('return m.getCachedComments(postId, options, buildCommentsVotesDeps());');
    expect(source).toContain('return m.invalidateCommentsCache(postId, buildCommentsVotesDeps());');
    expect(source).toContain('return m.refreshComments(postId, options, buildCommentsVotesDeps());');
    expect(source).toContain('return m.getComments(postId, options, buildCommentsVotesDeps());');
    expect(source).toContain('return m.addComment(postId, body, options, buildCommentsVotesDeps());');
    expect(source).toContain('return m.likeComment(commentId, options, buildCommentsVotesDeps());');
    expect(source).toContain('return m.votePost(postId, direction, options, buildCommentsVotesDeps());');
    expect(source).toContain('return m.getMyVote(postId, buildCommentsVotesDeps());');
  });

  test('mantem delegacao para related via getRelatedModule e buildRelatedDeps', () => {
    expect(source).toContain('function getRelatedModule()');
    expect(source).toContain('function buildRelatedDeps()');
    expect(source).toContain('return relatedModule.rankRelatedPosts(currentPost, candidates, options, buildRelatedDeps());');
    expect(source).toContain('return relatedModule.getRelatedPosts(postId, options, buildRelatedDeps());');
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

  test('mantem diagnosticos delegados para kc-api.diagnostics.js sem estado local na fachada', () => {
    expect(source).toContain('function getDiagnosticsModule()');
    expect(source).toContain("throw new Error('KCAPI diagnostics module not loaded.');");
    expect(source).toContain('return getDiagnosticsModule().summarizeCreatePayloadForDiagnostics(parsed);');
    expect(source).toContain('return getDiagnosticsModule().setLastCreatePostError(stage, err, context);');
    expect(source).toContain('return getDiagnosticsModule().clearLastCreatePostError();');
    expect(source).toContain('return getDiagnosticsModule().getLastCreatePostError();');
    expect(source).not.toContain('let lastCreatePostError = null;');
    expect(source).not.toContain('function normalizeErrorForDiagnostics(err) {');
    expect(diagnosticsSource).toContain('let lastCreatePostError = null;');
    expect(diagnosticsSource).toContain('function normalizeErrorForDiagnostics(err) {');
    expect(diagnosticsSource).toContain('window._KCAPI.diagnostics = Object.freeze({');
  });

  test('mantem session/freshness delegados para kc-api.session.js sem estado local na fachada', () => {
    expect(source).toContain('function getSessionModule()');
    expect(source).toContain("throw new Error('KCAPI session module not loaded.');");
    expect(source).toContain('return getSessionModule().getCachedSessionPayload(scope, key, maxAgeMs, staleMaxAgeMs, options);');
    expect(source).toContain('return getSessionModule().persistSessionPayload(scope, key, data, signature);');
    expect(source).toContain('return getSessionModule().removeSessionCache(scope, key);');
    expect(source).toContain('return getSessionModule().clearSessionCachePrefix(scope, keyPrefix);');
    expect(source).toContain('return getSessionModule().withPendingSessionRequest(bucket, key, factory);');
    expect(source).not.toContain("const SESSION_STORE_VERSION = '9.0.0';");
    expect(source).not.toContain("const POST_FRESHNESS_EVENT = 'kc:post-freshness';");
    expect(source).not.toContain('const postFreshnessSubscribers = new Set();');
    expect(source).not.toContain('function normalizePostFreshnessChange(change) {');
    expect(sessionSource).toContain("const SESSION_STORE_VERSION = '9.0.0';");
    expect(sessionSource).toContain("const POST_FRESHNESS_EVENT = 'kc:post-freshness';");
    expect(sessionSource).toContain('const postFreshnessSubscribers = new Set();');
    expect(sessionSource).toContain('function normalizePostFreshnessChange(change) {');
    expect(sessionSource).toContain('window._KCAPI.session = Object.freeze({');
  });

  test('mantem filtros avancados delegados para kc-api.filters.js sem helpers locais na fachada', () => {
    expect(source).toContain('function getFiltersModule()');
    expect(source).toContain("throw new Error('KCAPI filters module not loaded.');");
    expect(source).toContain('return getFiltersModule().filterPosts(posts, params);');
    expect(source).not.toContain('function normalizeFilterText(value) {');
    expect(source).not.toContain('function matchesAdvancedRequestParams(post, params) {');
    expect(source).not.toContain("const FEED_DATE_TIMEZONE = 'America/Sao_Paulo';");
    expect(filtersSource).toContain('function normalizeFilterText(value) {');
    expect(filtersSource).toContain('function matchesAdvancedRequestParams(post, params) {');
    expect(filtersSource).toContain("const FEED_DATE_TIMEZONE = 'America/Sao_Paulo';");
    expect(filtersSource).toContain('window._KCAPI.filters = Object.freeze({');
  });

  test('mantem autores mock delegados para kc-api.authors.js sem indice local na fachada', () => {
    expect(source).toContain('function getAuthorsModule()');
    expect(source).toContain("throw new Error('KCAPI authors module not loaded.');");
    expect(source).toContain('return getAuthorsModule().MOCK_USERS;');
    expect(source).toContain('return getAuthorsModule().MOCK_USERS_BY_ID;');
    expect(source).toContain('return getAuthorsModule().MOCK_USERS_LIST;');
    expect(source).toContain('return getAuthorsModule().getAuthorById(id);');
    expect(source).toContain('return getAuthorsModule().resolveAuthorId(legacyName, legacyAvatarUrl);');
    expect(source).not.toContain('const MOCK_USERS = Object.freeze({');
    expect(source).not.toContain('const LEGACY_AUTHOR_INDEX =');
    expect(source).not.toContain('function normalizeUserProfile(user) {');
    expect(authorsSource).toContain('const MOCK_USERS = Object.freeze({');
    expect(authorsSource).toContain('const LEGACY_AUTHOR_INDEX =');
    expect(authorsSource).toContain('function normalizeUserProfile(user) {');
    expect(authorsSource).toContain('window._KCAPI.authors = Object.freeze({');
  });

  test('mantem normalizePost delegado para kc-api.posts-normalize.js sem corpo local na fachada', () => {
    expect(source).toContain('function getPostsNormalizeModule()');
    expect(source).toContain("throw new Error('KCAPI posts normalize module not loaded.');");
    expect(source).toContain('return getPostsNormalizeModule().normalizePost(raw, {');
    expect(source).toContain('defaultAvatar: (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) ||');
    expect(source).not.toContain('function pickFirstNonEmpty(values) {');
    expect(source).not.toContain("const actionish = ['vendo', 'compro', 'troco'");
    expect(postsNormalizeSource).toContain('function normalizePost(raw, deps = {})');
    expect(postsNormalizeSource).toContain('function pickFirstNonEmpty(values) {');
    expect(postsNormalizeSource).toContain("const actionish = ['vendo', 'compro', 'troco'");
    expect(postsNormalizeSource).toContain('window._KCAPI.postsNormalize = Object.freeze({');
  });
});
