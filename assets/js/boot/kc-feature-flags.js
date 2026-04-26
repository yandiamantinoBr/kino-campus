/*
  KinoCampus - Feature Flags Facade (v12.6.0)

  Fonte primaria: window.KC_ENV.flags
  Compat: window.KC_ENV.featureFlags

  Exposicao:
  - window.KCFF
*/
(function () {
  'use strict';

  var TRUE_VALUES = ['1', 'true', 'on', 'yes', 'enabled', 'sim'];
  var FALSE_VALUES = ['0', 'false', 'off', 'no', 'disabled', 'nao'];

  function getRoot() {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined') return globalThis;
    return {};
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }

    if (isPlainObject(value)) {
      var cloned = {};
      Object.keys(value).forEach(function (key) {
        cloned[key] = cloneValue(value[key]);
      });
      return cloned;
    }

    return value;
  }

  function freezeValue(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }

    Object.keys(value).forEach(function (key) {
      freezeValue(value[key]);
    });

    return Object.freeze(value);
  }

  function normalizeName(name) {
    return String(name == null ? '' : name).trim();
  }

  function readEnv() {
    var root = getRoot();
    return (root.KC_ENV && typeof root.KC_ENV === 'object') ? root.KC_ENV : {};
  }

  function collectFlags(source, target, prefix) {
    if (!isPlainObject(source)) return target;

    Object.keys(source).forEach(function (key) {
      var value = source[key];
      var name = prefix ? prefix + '.' + key : key;

      target[name] = cloneValue(value);

      if (isPlainObject(value)) {
        collectFlags(value, target, name);
      }
    });

    return target;
  }

  function addDerivedFlags(env, target) {
    var driver = String(env.driver || env.DATA_DRIVER || '').toLowerCase();
    var environment = String(env.environment || env.APP_ENV || '').toLowerCase();

    target['env.driver'] = driver || 'local';
    target['env.driver.local'] = driver !== 'supabase';
    target['env.driver.supabase'] = driver === 'supabase';
    target['env.environment'] = environment || 'development';
    target['env.isProduction'] = env.isProduction === true || environment === 'production';
    target['env.production'] = target['env.isProduction'];
    target['env.development'] = !target['env.isProduction'];
    target['env.debug'] = env.debug !== false;

    return target;
  }

  function buildFlagMap(env) {
    var flags = {};
    collectFlags(env.featureFlags, flags);
    collectFlags(env.flags, flags);
    return addDerivedFlags(env, flags);
  }

  function getPathValue(source, path) {
    var parts = normalizeName(path).split('.').filter(Boolean);
    var current = source;

    for (var i = 0; i < parts.length; i += 1) {
      if (!current || typeof current !== 'object' || !hasOwn(current, parts[i])) {
        return { found: false, value: undefined };
      }
      current = current[parts[i]];
    }

    return { found: true, value: current };
  }

  function get(name, fallback) {
    var key = normalizeName(name);
    if (!key) return cloneValue(fallback);

    var env = readEnv();
    var flags = buildFlagMap(env);

    if (hasOwn(flags, key)) {
      return cloneValue(flags[key]);
    }

    if (key.indexOf('env.') === 0) {
      var envValue = getPathValue(env, key.slice(4));
      if (envValue.found) return cloneValue(envValue.value);
    }

    return cloneValue(fallback);
  }

  function toBoolean(value, fallback) {
    if (value === undefined || value === null) {
      return fallback === undefined ? false : toBoolean(fallback, false);
    }

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    if (typeof value === 'string') {
      var normalized = value.trim().toLowerCase();
      if (TRUE_VALUES.indexOf(normalized) !== -1) return true;
      if (FALSE_VALUES.indexOf(normalized) !== -1) return false;
    }

    return Boolean(value);
  }

  function isEnabled(name, fallback) {
    return toBoolean(get(name, fallback), fallback);
  }

  function getAll() {
    return freezeValue(cloneValue(buildFlagMap(readEnv())));
  }

  getRoot().KCFF = Object.freeze({
    get: get,
    getAll: getAll,
    isEnabled: isEnabled,
  });
})();
