/*
  KinoCampus - Shared Utils (V8.1.2.4.6)

  Principal função:
  - Centralizar utilitários repetidos (normalize/escape/currency/debounce)
  - Evitar divergência entre scripts (search, filters, etc.)
*/
(function () {
  'use strict';

  // Constantes de localização movidas para kc-utils.location.js (v12.2.5)

  // Delegação → window._KCU.string.titleCase (kc-utils.string.js)
  function titleCase(str) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.titleCase(str) : String(str || '');
  }

  // Delegação → window._KCU.format.timeAgo (kc-utils.format.js)
  function timeAgo(dateString) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.timeAgo(dateString) : '';
  }

  // Delegação → window._KCU.string.beautifyKey (kc-utils.string.js)
  function beautifyKey(key) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.beautifyKey(key) : String(key || '');
  }

  // Delegacao -> window._KCU.taxonomy.getModuleLabel (kc-utils.taxonomy.js)
  function getModuleLabel(moduleKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getModuleLabel(moduleKey) : String(moduleKey || '');
  }

  // Delegacao -> window._KCU.taxonomy.getModuleIconClass (kc-utils.taxonomy.js)
  function getModuleIconClass(moduleKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getModuleIconClass(moduleKey) : 'fas fa-layer-group';
  }

  // Delegacao -> window._KCU.taxonomy.getCategoryLabel (kc-utils.taxonomy.js)
  function getCategoryLabel(moduleKey, catKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getCategoryLabel(moduleKey, catKey) : String(catKey || '');
  }

  // Delegacao -> window._KCU.taxonomy.getSubcategoryLabel (kc-utils.taxonomy.js)
  function getSubcategoryLabel(moduleKey, subKey) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getSubcategoryLabel(moduleKey, subKey) : String(subKey || '');
  }

  // Delegação → window._KCU.string.normalizeText (kc-utils.string.js)
  function normalizeText(str) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.normalizeText(str) : (str || '').toString().toLowerCase().trim();
  }

  // Delegação → window._KCU.identity.normalizeEmail (kc-utils.identity.js)
  function normalizeEmail(email) {
    return (window._KCU && window._KCU.identity) ? window._KCU.identity.normalizeEmail(email) : String(email || '').trim().toLowerCase();
  }

  // Delegação → window._KCU.identity.getEmailDomain (kc-utils.identity.js)
  function getEmailDomain(email) {
    return (window._KCU && window._KCU.identity) ? window._KCU.identity.getEmailDomain(email) : '';
  }

  // Delegação → window._KCU.identity.normalizeAllowedDomains (kc-utils.identity.js)
  function normalizeAllowedDomains(allowedDomains) {
    return (window._KCU && window._KCU.identity) ? window._KCU.identity.normalizeAllowedDomains(allowedDomains) : [];
  }

  // Delegação → window._KCU.identity.isInstitutionalEmailAllowed (kc-utils.identity.js)
  function isInstitutionalEmailAllowed(email, allowedDomains) {
    return (window._KCU && window._KCU.identity) ? window._KCU.identity.isInstitutionalEmailAllowed(email, allowedDomains) : true;
  }

  // Delegação → window._KCU.string.canonicalCategory (kc-utils.string.js)
  function canonicalCategory(str) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.canonicalCategory(str) : String(str || '');
  }

  // Delegação → window._KCU.string.slugifyText (kc-utils.string.js)
  function slugifyText(str) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.slugifyText(str) : String(str || '');
  }

  // Delegação → window._KCU.identity.buildPublicHandle (kc-utils.identity.js)
  function buildPublicHandle(value, options) {
    return (window._KCU && window._KCU.identity) ? window._KCU.identity.buildPublicHandle(value, options) : '';
  }

  // Delegação → window._KCU.string.levenshteinDistance (kc-utils.string.js)
  function levenshteinDistance(a, b) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.levenshteinDistance(a, b) : 0;
  }

  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaDefinitions (kc-utils.taxonomy.js)
  function getOpportunityAreaDefinitions() {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaDefinitions() : [];
  }

  // Delegacao -> window._KCU.taxonomy.buildOpportunityTextParts (kc-utils.taxonomy.js)
  function buildOpportunityTextParts(source, fallbackTags) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.buildOpportunityTextParts(source, fallbackTags)
      : { explicit: source ? [source] : [], text: [], tags: [] };
  }

  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaInfoByKey (kc-utils.taxonomy.js)
  function getOpportunityAreaInfoByKey(key) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaInfoByKey(key) : null;
  }

  // Delegacao -> window._KCU.taxonomy.firstNonEmptyValue (kc-utils.taxonomy.js)
  function firstNonEmptyValue(values) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.firstNonEmptyValue(values) : '';
  }

  // Delegacao -> window._KCU.taxonomy.formatOpportunityAreaLabel (kc-utils.taxonomy.js)
  function formatOpportunityAreaLabel(value) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.formatOpportunityAreaLabel(value) : String(value || '');
  }

  // Delegacao -> window._KCU.taxonomy.scoreOpportunityAreaLabel (kc-utils.taxonomy.js)
  function scoreOpportunityAreaLabel(value) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.scoreOpportunityAreaLabel(value) : 0;
  }

  // Delegacao -> window._KCU.taxonomy.pickPreferredOpportunityAreaLabel (kc-utils.taxonomy.js)
  function pickPreferredOpportunityAreaLabel(current, candidate) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.pickPreferredOpportunityAreaLabel(current, candidate)
      : String(current || candidate || '');
  }

  // Delegacao -> window._KCU.taxonomy.buildOfficialOpportunityAreaMaps (kc-utils.taxonomy.js)
  function buildOfficialOpportunityAreaMaps() {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.buildOfficialOpportunityAreaMaps() : new Map();
  }

  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaFuzzyThreshold (kc-utils.taxonomy.js)
  function getOpportunityAreaFuzzyThreshold(source, target) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaFuzzyThreshold(source, target) : 3;
  }

  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaSimilarityScore (kc-utils.taxonomy.js)
  function getOpportunityAreaSimilarityScore(source, target) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaSimilarityScore(source, target) : 0;
  }

  // Delegacao -> window._KCU.taxonomy.isCloseOpportunityAreaAlias (kc-utils.taxonomy.js)
  function isCloseOpportunityAreaAlias(candidate, alias) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.isCloseOpportunityAreaAlias(candidate, alias) : false;
  }

  // Delegacao -> window._KCU.taxonomy.findBestOfficialOpportunityArea (kc-utils.taxonomy.js)
  function findBestOfficialOpportunityArea(candidate, officialAliasMap) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.findBestOfficialOpportunityArea(candidate, officialAliasMap) : null;
  }

  // Delegacao -> window._KCU.taxonomy.extractOpportunityAreaHistoryEntries (kc-utils.taxonomy.js)
  function extractOpportunityAreaHistoryEntries(history) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.extractOpportunityAreaHistoryEntries(history) : [];
  }

  // Delegacao -> window._KCU.taxonomy.buildHistoryOpportunityAreaMaps (kc-utils.taxonomy.js)
  function buildHistoryOpportunityAreaMaps(history, officialAliasMap) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.buildHistoryOpportunityAreaMaps(history, officialAliasMap)
      : { catalog: new Map(), aliasMap: new Map() };
  }

  // Delegacao -> window._KCU.taxonomy.findBestOfficialContextArea (kc-utils.taxonomy.js)
  function findBestOfficialContextArea(combinedText) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.findBestOfficialContextArea(combinedText) : null;
  }

  // Delegacao -> window._KCU.taxonomy.findBestFuzzyOpportunityArea (kc-utils.taxonomy.js)
  function findBestFuzzyOpportunityArea(candidate, collection) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.findBestFuzzyOpportunityArea(candidate, collection) : null;
  }

  // Delegacao -> window._KCU.taxonomy.resolveOpportunityArea (kc-utils.taxonomy.js)
  function resolveOpportunityArea(source, options) {
    return (window._KCU && window._KCU.taxonomy)
      ? window._KCU.taxonomy.resolveOpportunityArea(source, options)
      : { key: '', label: '', icon: 'fas fa-briefcase', isKnown: false, source: 'empty' };
  }

  // Delegacao -> window._KCU.location.getHousingRegionDefinitions (kc-utils.location.js)
  function getHousingRegionDefinitions() {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingRegionDefinitions() : [];
  }

  // Delegacao -> window._KCU.location.getHousingFeatureDefinitions (kc-utils.location.js)
  function getHousingFeatureDefinitions() {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingFeatureDefinitions() : [];
  }

  // Delegacao -> window._KCU.taxonomy.getOpportunityAreaEmoji (kc-utils.taxonomy.js)
  function getOpportunityAreaEmoji(key) {
    return (window._KCU && window._KCU.taxonomy) ? window._KCU.taxonomy.getOpportunityAreaEmoji(key) : '🏷️';
  }

  // Delegacao -> window._KCU.location.getHousingFeatureEmoji (kc-utils.location.js)
  function getHousingFeatureEmoji(key) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingFeatureEmoji(key) : '🏷️';
  }

  // Delegacao -> window._KCU.location.getLostFoundLocationEmoji (kc-utils.location.js)
  function getLostFoundLocationEmoji(key) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getLostFoundLocationEmoji(key) : '📍';
  }

  // Delegacao -> window._KCU.location.toStringArray (kc-utils.location.js)
  function toStringArray(value) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.toStringArray(value) : [];
  }

  // Delegacao -> window._KCU.location.scoreHousingLabel (kc-utils.location.js)
  function scoreHousingLabel(value) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.scoreHousingLabel(value) : 0;
  }

  // Delegacao -> window._KCU.location.pickPreferredHousingLabel (kc-utils.location.js)
  function pickPreferredHousingLabel(current, candidate) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.pickPreferredHousingLabel(current, candidate) : String(current || candidate || '');
  }

  // Delegacao -> window._KCU.location.formatHousingLabel (kc-utils.location.js)
  function formatHousingLabel(value) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.formatHousingLabel(value) : String(value || '');
  }

  // Delegacao -> window._KCU.location.buildDefinitionAliasMap (kc-utils.location.js)
  function buildDefinitionAliasMap(definitions) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.buildDefinitionAliasMap(definitions) : new Map();
  }

  // Delegacao -> window._KCU.location.getHousingFuzzyThreshold (kc-utils.location.js)
  function getHousingFuzzyThreshold(source, target) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingFuzzyThreshold(source, target) : 3;
  }

  // Delegacao -> window._KCU.location.getHousingSimilarityScore (kc-utils.location.js)
  function getHousingSimilarityScore(source, target) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingSimilarityScore(source, target) : 0;
  }

  // Delegacao -> window._KCU.location.isCloseHousingAlias (kc-utils.location.js)
  function isCloseHousingAlias(candidate, alias) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.isCloseHousingAlias(candidate, alias) : false;
  }

  // Delegacao -> window._KCU.location.findBestFuzzyHousingEntry (kc-utils.location.js)
  function findBestFuzzyHousingEntry(candidate, collection) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.findBestFuzzyHousingEntry(candidate, collection) : null;
  }

  // Delegacao -> window._KCU.location.buildHousingTextParts (kc-utils.location.js)
  function buildHousingTextParts(source, fallbackTags) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.buildHousingTextParts(source, fallbackTags)
      : { explicitRegions: [], explicitFeatures: [], text: [], tags: [] };
  }

  // Delegacao -> window._KCU.location.getHousingRegionInfoByKey (kc-utils.location.js)
  function getHousingRegionInfoByKey(key) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingRegionInfoByKey(key) : null;
  }

  // Delegacao -> window._KCU.location.getHousingFeatureInfoByKey (kc-utils.location.js)
  function getHousingFeatureInfoByKey(key) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getHousingFeatureInfoByKey(key) : null;
  }

  // Delegacao -> window._KCU.location.getLostFoundLocationDefinitions (kc-utils.location.js)
  function getLostFoundLocationDefinitions() {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getLostFoundLocationDefinitions() : [];
  }

  // Delegacao -> window._KCU.location.getLostFoundLocationInfoByKey (kc-utils.location.js)
  function getLostFoundLocationInfoByKey(key) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.getLostFoundLocationInfoByKey(key) : null;
  }

  // Delegacao -> window._KCU.location.extractHousingRegionHistoryEntries (kc-utils.location.js)
  function extractHousingRegionHistoryEntries(history) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.extractHousingRegionHistoryEntries(history) : [];
  }

  // Delegacao -> window._KCU.location.buildHousingRegionHistoryMaps (kc-utils.location.js)
  function buildHousingRegionHistoryMaps(history, officialAliasMap) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.buildHousingRegionHistoryMaps(history, officialAliasMap)
      : { catalog: new Map(), aliasMap: new Map() };
  }

  // Delegacao -> window._KCU.location.resolveHousingRegion (kc-utils.location.js)
  function resolveHousingRegion(source, options) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.resolveHousingRegion(source, options)
      : { key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isKnown: false, source: 'empty' };
  }

  // Delegacao -> window._KCU.location.resolveCaronasLocation (kc-utils.location.js)
  function resolveCaronasLocation(rawInput) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.resolveCaronasLocation(rawInput)
      : { key: '', label: '', icon: 'fas fa-map-pin', zoneKey: '', zoneLabel: '', isCampus: false, isKnown: false, source: 'empty' };
  }

  // Delegacao -> window._KCU.location.extractHousingFeatureHistoryEntries (kc-utils.location.js)
  function extractHousingFeatureHistoryEntries(history) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.extractHousingFeatureHistoryEntries(history) : [];
  }

  // Delegacao -> window._KCU.location.buildHousingFeatureHistoryMaps (kc-utils.location.js)
  function buildHousingFeatureHistoryMaps(history, officialAliasMap) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.buildHousingFeatureHistoryMaps(history, officialAliasMap)
      : { catalog: new Map(), aliasMap: new Map() };
  }

  // Delegacao -> window._KCU.location.resolveSingleHousingFeature (kc-utils.location.js)
  function resolveSingleHousingFeature(value, options) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.resolveSingleHousingFeature(value, options) : null;
  }

  // Delegacao -> window._KCU.location.resolveHousingFeatures (kc-utils.location.js)
  function resolveHousingFeatures(source, options) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.resolveHousingFeatures(source, options) : [];
  }

  // Delegacao -> window._KCU.location.resolveHousingTypeKey (kc-utils.location.js)
  function resolveHousingTypeKey(source) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.resolveHousingTypeKey(source) : '';
  }

  // Delegacao -> window._KCU.location.buildLostFoundTextParts (kc-utils.location.js)
  function buildLostFoundTextParts(source, fallbackTags) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.buildLostFoundTextParts(source, fallbackTags)
      : { explicit: [], text: [], tags: [] };
  }

  // Delegacao -> window._KCU.location.extractLostFoundLocationHistoryEntries (kc-utils.location.js)
  function extractLostFoundLocationHistoryEntries(history) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.extractLostFoundLocationHistoryEntries(history) : [];
  }

  // Delegacao -> window._KCU.location.buildLostFoundHistoryMaps (kc-utils.location.js)
  function buildLostFoundHistoryMaps(history, officialAliasMap) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.buildLostFoundHistoryMaps(history, officialAliasMap)
      : { catalog: new Map(), aliasMap: new Map() };
  }

  // Delegacao -> window._KCU.location.resolveLostFoundLocation (kc-utils.location.js)
  function resolveLostFoundLocation(source, options) {
    return (window._KCU && window._KCU.location)
      ? window._KCU.location.resolveLostFoundLocation(source, options)
      : { key: '', label: '', icon: 'fas fa-map-marker-alt', emoji: '📍', isKnown: false, source: 'empty' };
  }

  // Delegacao -> window._KCU.location.resolveHousingTypeFromCandidates (kc-utils.location.js)
  function resolveHousingTypeFromCandidates(values) {
    return (window._KCU && window._KCU.location) ? window._KCU.location.resolveHousingTypeFromCandidates(values) : '';
  }

  // Delegação → window._KCU.string.escapeHtml (kc-utils.string.js)
  function escapeHtml(str) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.escapeHtml(str) : String(str ?? '');
  }

  // Delegacao -> window._KCU.presentation.cssEscape (kc-utils.presentation.js)
  function cssEscape(str) {
    return (window._KCU && window._KCU.presentation) ? window._KCU.presentation.cssEscape(str) : String(str ?? '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  // Delegação → window._KCU.format.formatCurrencyBRL (kc-utils.format.js)
  function formatCurrencyBRL(value) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.formatCurrencyBRL(value) : 'R$ 0,00';
  }

  // Delegação → window._KCU.format.parseBRLNumber (kc-utils.format.js)
  function parseBRLNumber(input) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.parseBRLNumber(input) : 0;
  }

  // Delegação → window._KCU.format.clamp (kc-utils.format.js)
  function clamp(n, min, max) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.clamp(n, min, max) : Math.max(min, Math.min(max, n));
  }

  // Delegação → window._KCU.dom.debounce (kc-utils.dom.js)
  function debounce(fn, wait) {
    return (window._KCU && window._KCU.dom) ? window._KCU.dom.debounce(fn, wait) : (function () { fn.apply(this, arguments); });
  }

  // Delegação → window._KCU.format.buildProductDetailHref (kc-utils.format.js)
  function buildProductDetailHref(postId) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.buildProductDetailHref(postId) : '';
  }

  // Delegação → window._KCU.dom.canSelectInputLike (kc-utils.dom.js)
  function canSelectInputLike(target) {
    return (window._KCU && window._KCU.dom) ? window._KCU.dom.canSelectInputLike(target) : false;
  }

  // Delegação → window._KCU.dom.fallbackCopyText (kc-utils.dom.js)
  function fallbackCopyText(text, options) {
    return (window._KCU && window._KCU.dom) ? window._KCU.dom.fallbackCopyText(text, options) : false;
  }

  // Delegação → window._KCU.dom.copyTextToClipboard (kc-utils.dom.js)
  async function copyTextToClipboard(text, options) {
    return (window._KCU && window._KCU.dom) ? window._KCU.dom.copyTextToClipboard(text, options) : false;
  }

  // Delegação → window._KCU.format.getConditionLabel (kc-utils.format.js)
  function getConditionLabel(raw) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.getConditionLabel(raw) : '';
  }

  // Delegação → window._KCU.format.splitPriceText (kc-utils.format.js)
  function splitPriceText(text) {
    return (window._KCU && window._KCU.format) ? window._KCU.format.splitPriceText(text) : { main: String(text || ''), small: '' };
  }

  // Delegacao -> window._KCU.presentation.inferCaronasRoute (kc-utils.presentation.js)
  function inferCaronasRoute(title) {
    return (window._KCU && window._KCU.presentation) ? window._KCU.presentation.inferCaronasRoute(title) : { from: '', to: '' };
  }

  // Delegacao -> window._KCU.presentation.inferAchadosLocation (kc-utils.presentation.js)
  function inferAchadosLocation(source, tags) {
    return (window._KCU && window._KCU.presentation) ? window._KCU.presentation.inferAchadosLocation(source, tags) : '';
  }

  // Delegacao -> window._KCU.presentation.inferOportunidadesSubcategory (kc-utils.presentation.js)
  function inferOportunidadesSubcategory(source, tags) {
    return (window._KCU && window._KCU.presentation) ? window._KCU.presentation.inferOportunidadesSubcategory(source, tags) : '';
  }

  // Delegacao -> window._KCU.presentation.inferEventosCategory (kc-utils.presentation.js)
  function inferEventosCategory(rawCat, tags) {
    return (window._KCU && window._KCU.presentation) ? window._KCU.presentation.inferEventosCategory(rawCat, tags) : String(rawCat || '');
  }

  // Delegacao -> window._KCU.presentation.applyPresentationRules (kc-utils.presentation.js)
  function applyPresentationRules(post, context) {
    return (window._KCU && window._KCU.presentation)
      ? window._KCU.presentation.applyPresentationRules(post, context)
      : { ...(post || {}) };
  }

  // Delegacao -> window._KCU.presentation.getDisplayMarkerTags (kc-utils.presentation.js)
  function getDisplayMarkerTags(post, options) {
    return (window._KCU && window._KCU.presentation)
      ? window._KCU.presentation.getDisplayMarkerTags(post, options)
      : [];
  }

  // Delegacao -> window._KCU.presentation.renderMarkerTags (kc-utils.presentation.js)
  function renderMarkerTags(tags, options) {
    return (window._KCU && window._KCU.presentation) ? window._KCU.presentation.renderMarkerTags(tags, options) : '';
  }

  // Renderização padrão de um card (estrutura idêntica aos .kc-card do HTML)
  // - Recebe um post normalizado (authorId)
  // - Busca autor via KCAPI.getAuthorById(post.authorId)
  // - Retorna HTML (string) do <article class="kc-card">...</article>
  // Delegacao -> window._KCU.presentation.renderPostCard (kc-utils.presentation.js)
  function renderPostCard(post, options) {
    return (window._KCU && window._KCU.presentation)
      ? window._KCU.presentation.renderPostCard(post, options)
      : '';
  }

  /**
   * renderMarkdownInline — converte texto markdown inline para HTML seguro.
   * Suporta: **bold**, *italic*, __underline__, ~~strike~~, `code`,
   *          [link](url), > blockquote, - list items, e \n → <br>.
   * Escapa HTML primeiro para prevenir XSS.
   */
  // Delegação → window._KCU.string.renderMarkdownInline (kc-utils.string.js)
  function renderMarkdownInline(raw) {
    return (window._KCU && window._KCU.string) ? window._KCU.string.renderMarkdownInline(raw) : String(raw || '');
  }

  window.KCUtils = Object.freeze({
    escapeHtml,
    renderMarkdownInline,
    normalizeText,
    normalizeEmail,
    getEmailDomain,
    normalizeAllowedDomains,
    isInstitutionalEmailAllowed,
    canonicalCategory,
    slugifyText,
    buildPublicHandle,
    titleCase,
    beautifyKey,
    getModuleLabel,
    getModuleIconClass,
    getCategoryLabel,
    getSubcategoryLabel,
    getConditionLabel,
    getOpportunityAreaDefinitions,
    getOpportunityAreaInfoByKey,
    getHousingRegionDefinitions,
    getHousingRegionInfoByKey,
    getLostFoundLocationDefinitions,
    getLostFoundLocationInfoByKey,
    getHousingFeatureDefinitions,
    getHousingFeatureInfoByKey,
    getDisplayMarkerTags,
    resolveOpportunityArea,
    resolveHousingRegion,
    resolveCaronasLocation,
    resolveLostFoundLocation,
    resolveHousingFeatures,
    resolveHousingTypeKey,
    clamp,
    debounce,
    buildProductDetailHref,
    copyTextToClipboard,
    splitPriceText,
    applyPresentationRules,
    renderPostCard,
    timeAgo,
  });

})();
