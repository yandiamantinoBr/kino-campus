/*
  KinoCampus - canonical public-post lifecycle helpers (UMD).

  This module is intentionally pure. Browser feeds, search, presentation and
  Node tests use the same module-aware definition of "encerrado".
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.KCPostLifecycle = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = 1;
  var SAO_PAULO_OFFSET = '-03:00';
  var DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var BR_DATE_RE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/;
  var LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

  var MODULE_ALIASES = Object.freeze({
    compra_venda: 'compra-venda',
    compraevenda: 'compra-venda',
    mercado: 'compra-venda',
    achados_perdidos: 'achados-perdidos',
    achadoseperdidos: 'achados-perdidos',
    evento: 'eventos',
    events: 'eventos',
    event: 'eventos',
    oportunidade: 'oportunidades',
    opportunities: 'oportunidades',
    opportunity: 'oportunidades',
    carona: 'caronas',
    rides: 'caronas',
    ride: 'caronas'
  });

  var CLOSED_STATUSES = Object.freeze([
    'closed', 'expired', 'ended', 'encerrado', 'encerrada', 'cancelled', 'canceled',
    'cancelado', 'cancelada', 'finalizado', 'finalizada', 'deleted', 'hidden', 'archived'
  ]);

  function normalizeKey(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function objectValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
      var parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function metadataOf(post) {
    if (!post || typeof post !== 'object') return {};
    var candidates = [post.metadata, post.meta, post._meta];
    var merged = {};
    for (var i = candidates.length - 1; i >= 0; i -= 1) {
      var parsed = objectValue(candidates[i]);
      if (!Object.keys(parsed).length) continue;
      var previousDates = objectValue(merged.dates);
      var incomingDates = objectValue(parsed.dates);
      Object.assign(merged, parsed);
      if (Object.keys(previousDates).length || Object.keys(incomingDates).length) {
        merged.dates = Object.assign({}, previousDates, incomingDates);
      }
    }
    return merged;
  }

  function readPath(source, path) {
    var current = source;
    var parts = String(path || '').split('.').filter(Boolean);
    for (var i = 0; i < parts.length; i += 1) {
      if (!current || typeof current !== 'object') return undefined;
      current = current[parts[i]];
    }
    return current;
  }

  function firstValue(post, paths) {
    var source = post && typeof post === 'object' ? post : {};
    var metadata = metadataOf(source);
    var list = Array.isArray(paths) ? paths : [paths];
    for (var i = 0; i < list.length; i += 1) {
      var path = list[i];
      var direct = readPath(source, path);
      if (direct != null && direct !== '') return direct;
      var nested = readPath(metadata, path);
      if (nested != null && nested !== '') return nested;
    }
    return null;
  }

  function anyBooleanTrue(post, paths) {
    var source = post && typeof post === 'object' ? post : {};
    var metadata = metadataOf(source);
    var list = Array.isArray(paths) ? paths : [paths];
    for (var i = 0; i < list.length; i += 1) {
      if (readPath(source, list[i]) === true || readPath(metadata, list[i]) === true) return true;
    }
    return false;
  }

  function parseDateMs(value, mode) {
    if (value instanceof Date) {
      var dateTime = value.getTime();
      return Number.isFinite(dateTime) ? dateTime : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value < 0) return null;
      var absolute = Math.abs(value);
      if (!Number.isInteger(value)) return null;
      if (absolute >= 1000000000 && absolute < 10000000000) return value * 1000;
      if (absolute >= 1000000000000 && absolute < 10000000000000) return value;
      return null;
    }
    if (value == null || typeof value === 'object') return null;

    var text = String(value).trim();
    if (!text) return null;
    if (/^[0-9]{10}$/.test(text)) return Number(text) * 1000;
    if (/^[0-9]{13}$/.test(text)) return Number(text);
    var dateOnly = text.match(DATE_ONLY_RE);
    var brDate = text.match(BR_DATE_RE);
    var candidate = text;

    function validCalendarDate(year, month, day) {
      var y = Number(year);
      var m = Number(month);
      var d = Number(day);
      if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
      var probe = new Date(Date.UTC(y, m - 1, d));
      return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
    }

    var isoCivilDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
    if (isoCivilDate && !validCalendarDate(isoCivilDate[1], isoCivilDate[2], isoCivilDate[3])) return null;

    if (dateOnly) {
      if (!validCalendarDate(dateOnly[1], dateOnly[2], dateOnly[3])) return null;
      candidate = dateOnly[1] + '-' + dateOnly[2] + '-' + dateOnly[3] +
        (mode === 'end' ? 'T23:59:59.999' : 'T00:00:00.000') + SAO_PAULO_OFFSET;
    } else if (brDate) {
      if (!validCalendarDate(brDate[3], brDate[2], brDate[1])) return null;
      candidate = brDate[3] + '-' + String(brDate[2]).padStart(2, '0') + '-' +
        String(brDate[1]).padStart(2, '0') +
        (mode === 'end' ? 'T23:59:59.999' : 'T00:00:00.000') + SAO_PAULO_OFFSET;
    } else if (LOCAL_DATETIME_RE.test(text)) {
      var localDate = text.slice(0, 10).match(DATE_ONLY_RE);
      if (!localDate || !validCalendarDate(localDate[1], localDate[2], localDate[3])) return null;
      candidate = text.replace(' ', 'T') + SAO_PAULO_OFFSET;
    }

    var parsed = Date.parse(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstDateMs(post, paths, mode) {
    var list = Array.isArray(paths) ? paths : [paths];
    for (var i = 0; i < list.length; i += 1) {
      var parsed = parseDateMs(firstValue(post, list[i]), mode);
      if (parsed != null) return parsed;
    }
    return null;
  }

  function dateKeyInZone(value, timeZone) {
    var parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(parsed);
      var values = {};
      parts.forEach(function (part) {
        if (part.type !== 'literal') values[part.type] = part.value;
      });
      return values.year && values.month && values.day
        ? values.year + '-' + values.month + '-' + values.day
        : '';
    } catch (_) {
      return '';
    }
  }

  function canonicalModule(post) {
    var raw = normalizeKey(firstValue(post || {}, ['module', 'modulo', 'pageModule', 'page_module']));
    return MODULE_ALIASES[raw] || raw;
  }

  function canonicalStatus(post) {
    return normalizeKey(firstValue(post || {}, ['status', 'state', 'estado', 'situacao'])) || 'published';
  }

  function statusIsClosed(value) {
    return CLOSED_STATUSES.indexOf(normalizeKey(value)) !== -1;
  }

  function explicitlyClosed(post, moduleKey) {
    if (statusIsClosed(canonicalStatus(post))) return true;
    var explicitFlags = ['expired', 'isExpired', 'is_expired', 'isClosed', 'is_closed'];
    if (anyBooleanTrue(post, explicitFlags)) return true;

    var eventStatus = firstValue(post, ['eventStatus', 'event_status', 'dates.eventStatus', 'dates.event_status']);
    if (moduleKey === 'eventos' && statusIsClosed(eventStatus)) return true;

    var applicationStatus = firstValue(post, [
      'applicationStatus', 'application_status', 'dates.applicationStatus', 'dates.application_status'
    ]);
    if (moduleKey === 'oportunidades' && statusIsClosed(applicationStatus)) return true;
    return false;
  }

  var EVENT_START_PATHS = Object.freeze([
    'eventStartsAt', 'event_starts_at', 'eventStart', 'event_start', 'startsAt', 'starts_at',
    'startAt', 'start_at', 'dataInicioEvento', 'data_inicio_evento', 'dataEvento', 'data_evento',
    'eventDate', 'event_date', 'event_date_detected', 'dateStart', 'date_start', 'date', 'data', 'dates.eventStartsAt',
    'dates.event_starts_at', 'dates.eventStart', 'dates.event_start', 'dates.dateStart',
    'dates.dataEvento', 'dates.data_evento', 'dates.event_date_detected'
  ]);
  var EVENT_END_PATHS = Object.freeze([
    'eventEndsAt', 'event_ends_at', 'eventEnd', 'event_end', 'endsAt', 'ends_at', 'endAt',
    'end_at', 'dataFimEvento', 'data_fim_evento', 'dataFim', 'data_fim', 'dateEnd', 'date_end',
    'dateEndAt', 'date_end_at', 'dates.eventEndsAt', 'dates.event_ends_at', 'dates.eventEnd',
    'dates.event_end', 'dates.dateEnd', 'dates.date_end'
  ]);
  var DEADLINE_PATHS = Object.freeze([
    'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
    'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline', 'dataLimite',
    'data_limite', 'inscricoesAte', 'inscricoes_ate', 'prazoInscricao', 'prazo_inscricao',
    'submissionDeadline', 'submission_deadline', 'prazo', 'dates.applicationDeadline',
    'dates.application_deadline', 'dates.deadlineAt', 'dates.deadline_at', 'dates.deadlineDate',
    'dates.deadline', 'dates.submissionDeadline', 'dates.submission_deadline'
  ]);
  var RIDE_PATHS = Object.freeze([
    'departureAt', 'departure_at', 'rideDate', 'ride_date', 'dataCarona', 'data_carona',
    'departureDate', 'departure_date', 'dataViagem', 'data_viagem', 'date', 'data',
    'dates.departureAt', 'dates.departure_at', 'dates.rideDate', 'dates.ride_date'
  ]);
  var ACTIVE_UNTIL_PATHS = Object.freeze([
    'activeUntil', 'active_until', 'dates.activeUntil', 'dates.active_until'
  ]);
  var METADATA_EXPIRY_PATHS = Object.freeze([
    'expiresAt', 'expires_at', 'validUntil', 'valid_until', 'validThrough', 'data_encerramento',
    'expirationDate', 'expiration_date', 'dates.expiresAt', 'dates.expires_at',
    'dates.validUntil', 'dates.valid_until'
  ]);

  function genericExpiryMs(post) {
    var activeUntil = firstDateMs(post, ACTIVE_UNTIL_PATHS, 'end');
    if (activeUntil != null) return activeUntil;

    var source = post && typeof post === 'object' ? post : {};
    var typedExpiry = parseDateMs(source.expires_at != null ? source.expires_at : source.expiresAt, 'end');
    if (typedExpiry != null) return typedExpiry;

    var metadata = metadataOf(source);
    return firstDateMs(metadata, METADATA_EXPIRY_PATHS, 'end');
  }

  function resolveEndTime(post, moduleKey) {
    if (moduleKey === 'eventos') {
      var eventEnd = firstDateMs(post, EVENT_END_PATHS, 'end');
      if (eventEnd != null) return { value: eventEnd, source: 'event-end' };
      var eventStart = firstDateMs(post, EVENT_START_PATHS, 'start');
      if (eventStart != null) {
        var dayKey = dateKeyInZone(eventStart, 'America/Sao_Paulo');
        return { value: parseDateMs(dayKey, 'end'), source: 'event-start' };
      }
      var eventFallback = genericExpiryMs(post);
      return { value: eventFallback, source: eventFallback == null ? '' : 'expiry' };
    }

    if (moduleKey === 'oportunidades') {
      var deadline = firstDateMs(post, DEADLINE_PATHS, 'end');
      if (deadline != null) return { value: deadline, source: 'deadline' };
      var opportunityFallback = genericExpiryMs(post);
      return { value: opportunityFallback, source: opportunityFallback == null ? '' : 'expiry' };
    }

    if (moduleKey === 'caronas') {
      var departure = firstDateMs(post, RIDE_PATHS, 'end');
      if (departure != null) return { value: departure, source: 'departure' };
      var rideFallback = genericExpiryMs(post);
      return { value: rideFallback, source: rideFallback == null ? '' : 'expiry' };
    }

    var generic = genericExpiryMs(post);
    return { value: generic, source: generic == null ? '' : 'expiry' };
  }

  function resolve(post, options) {
    var source = post && typeof post === 'object' ? post : {};
    var opts = options && typeof options === 'object' ? options : {};
    var moduleKey = canonicalModule(source);
    var status = canonicalStatus(source);
    var explicit = explicitlyClosed(source, moduleKey);
    var end = resolveEndTime(source, moduleKey);
    var now = parseDateMs(opts.now, 'start');
    if (now == null) now = Date.now();
    var endedByDate = end.value != null && end.value < now;
    var closed = explicit || endedByDate;

    return {
      version: VERSION,
      module: moduleKey,
      status: status,
      state: explicit ? 'closed' : (endedByDate ? 'ended' : 'active'),
      closed: closed,
      ended: endedByDate,
      explicit: explicit,
      endSource: end.source,
      endTime: end.value,
      endAt: end.value == null ? null : new Date(end.value).toISOString()
    };
  }

  function isClosedOrEnded(post, options) {
    var opts = options;
    if (opts != null && (typeof opts !== 'object' || opts instanceof Date)) opts = { now: opts };
    return resolve(post, opts || {}).closed;
  }

  function getEndTime(post) {
    return resolveEndTime(post || {}, canonicalModule(post || {})).value || 0;
  }

  return Object.freeze({
    VERSION: VERSION,
    CLOSED_STATUSES: CLOSED_STATUSES,
    normalizeKey: normalizeKey,
    metadataOf: metadataOf,
    parseDateMs: parseDateMs,
    canonicalModule: canonicalModule,
    canonicalStatus: canonicalStatus,
    getEndTime: getEndTime,
    isClosedOrEnded: isClosedOrEnded,
    resolve: resolve
  });
}));
