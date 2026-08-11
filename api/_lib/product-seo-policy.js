import lifecycle from '../../assets/js/shared/kc-post-lifecycle.shared.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const { parseDateMs: parseLifecycleDateMs } = lifecycle;

const DEADLINE_PATHS = Object.freeze([
  'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
  'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline', 'dataLimite',
  'data_limite', 'inscricoesAte', 'inscricoes_ate', 'prazoInscricao', 'prazo_inscricao',
  'submissionDeadline', 'submission_deadline', 'prazo', 'dates.applicationDeadline',
  'dates.application_deadline', 'dates.deadlineAt', 'dates.deadline_at', 'dates.deadlineDate',
  'dates.deadline', 'dates.submissionDeadline', 'dates.submission_deadline',
]);
const CURRENT_DEADLINE_PATHS = Object.freeze([
  'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
  'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline', 'dataLimite',
  'data_limite', 'inscricoesAte', 'inscricoes_ate', 'prazoInscricao', 'prazo_inscricao', 'prazo',
  'dates.applicationDeadline', 'dates.application_deadline', 'dates.deadlineAt', 'dates.deadline_at',
  'dates.deadlineDate', 'dates.deadline',
]);
const APPLICATION_PURPOSE_PATHS = Object.freeze([
  'applicationPurpose', 'application_purpose',
  'dates.applicationPurpose', 'dates.application_purpose',
]);
const ACTIVE_EPISODE_PATHS = Object.freeze([
  'applicationEpisode', 'application_episode',
  'dates.applicationEpisode', 'dates.application_episode',
]);
const APPLICATION_EPISODES_PATHS = Object.freeze([
  'applicationEpisodes', 'application_episodes',
  'dates.applicationEpisodes', 'dates.application_episodes',
]);
const EPISODE_DEADLINE_PATHS = Object.freeze([
  'applicationDeadline', 'application_deadline', 'applicationDeadlineAt', 'application_deadline_at',
  'deadlineAt', 'deadline_at', 'deadlineDate', 'deadline_date', 'deadline',
]);
const APPLICATION_PURPOSES = Object.freeze([
  'registration', 'submission', 'candidacy', 'enrollment', 'listener_registration',
]);

function metadataOf(post) {
  return post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)
    ? post.metadata
    : {};
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ');
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '\u2022 ');
}

function cleanText(value) {
  return stripMarkdown(stripHtml(String(value || '')))
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalPostId(post) {
  return String((post && post.id) || (post && post.legacy_id) || '').trim();
}

function parseDateLike(value, mode = 'start') {
  const milliseconds = parseLifecycleDateMs(value, mode);
  return milliseconds == null ? null : new Date(milliseconds);
}

function isoDate(value) {
  const date = parseDateLike(value);
  return date ? date.toISOString() : '';
}

function dateOnly(value) {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 10) : '';
}

function readPath(source, path) {
  let current = source;
  for (const part of String(path || '').split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = current[part];
  }
  return current;
}

function dateKeyInSaoPaulo(value) {
  const parsed = parseDateLike(value, 'end');
  if (!parsed) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsed);
    const values = Object.fromEntries(parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]));
    return values.year && values.month && values.day
      ? `${values.year}-${values.month}-${values.day}`
      : '';
  } catch (_) {
    return '';
  }
}

function normalizeApplicationPurpose(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return APPLICATION_PURPOSES.includes(normalized) ? normalized : '';
}

function episodePurpose(episode) {
  if (!episode || typeof episode !== 'object' || Array.isArray(episode)) return '';
  return normalizeApplicationPurpose(
    episode.purpose || episode.applicationPurpose || episode.application_purpose
  );
}

function isActiveEpisode(episode) {
  if (!episode || typeof episode !== 'object' || Array.isArray(episode)) return false;
  if (episode.active === true || episode.isActive === true || episode.is_active === true || episode.current === true) {
    return true;
  }
  return ['open', 'active', 'ongoing', 'current'].includes(String(episode.status || '').trim().toLowerCase());
}

function valuesAtPaths(source, metadata, paths) {
  const values = [];
  for (const path of paths) {
    const direct = readPath(source, path);
    if (direct != null && direct !== '') values.push(direct);
    const nested = readPath(metadata, path);
    if (nested != null && nested !== '') values.push(nested);
  }
  return values;
}

function phaseContract(source, metadata) {
  let identified = false;
  let invalid = false;
  const purposes = [];
  const explicitEpisodes = [];

  for (const value of valuesAtPaths(source, metadata, APPLICATION_PURPOSE_PATHS)) {
    identified = true;
    const purpose = normalizeApplicationPurpose(value);
    if (purpose) purposes.push(purpose);
    else invalid = true;
  }

  for (const value of valuesAtPaths(source, metadata, ACTIVE_EPISODE_PATHS)) {
    identified = true;
    if (typeof value === 'string') {
      const purpose = normalizeApplicationPurpose(value);
      if (purpose) purposes.push(purpose);
      else invalid = true;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const purpose = episodePurpose(value);
      if (purpose) {
        purposes.push(purpose);
        explicitEpisodes.push(value);
      } else {
        invalid = true;
      }
    } else {
      invalid = true;
    }
  }

  for (const value of valuesAtPaths(source, metadata, APPLICATION_EPISODES_PATHS)) {
    if (!Array.isArray(value)) continue;
    for (const episode of value.filter(isActiveEpisode)) {
      identified = true;
      const purpose = episodePurpose(episode);
      if (purpose) {
        purposes.push(purpose);
        explicitEpisodes.push(episode);
      } else {
        invalid = true;
      }
    }
  }

  const uniquePurposes = [...new Set(purposes)];
  if (!identified) return { identified: false, purpose: '', episodes: [] };
  if (invalid || uniquePurposes.length !== 1) return { identified: true, purpose: '', episodes: [] };
  const purpose = uniquePurposes[0];
  return {
    identified: true,
    purpose,
    episodes: explicitEpisodes.filter((episode) => episodePurpose(episode) === purpose),
  };
}

function deadlineFromPaths(source, metadata, paths) {
  for (const path of paths) {
    const direct = readPath(source, path);
    if (direct != null && direct !== '') {
      const normalized = dateKeyInSaoPaulo(direct);
      if (normalized) return normalized;
    }
    const nested = readPath(metadata, path);
    if (nested != null && nested !== '') {
      const normalized = dateKeyInSaoPaulo(nested);
      if (normalized) return normalized;
    }
  }
  return '';
}

function purposeDeadlinePaths(purpose) {
  const parts = String(purpose || '').split('_').filter(Boolean);
  if (!parts.length) return [];
  const camel = parts[0] + parts.slice(1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const camelAlias = `${camel}Deadline`;
  const snakeAlias = `${parts.join('_')}_deadline`;
  return [camelAlias, snakeAlias, `dates.${camelAlias}`, `dates.${snakeAlias}`];
}

function getPostDeadline(post) {
  const metadata = metadataOf(post);
  const source = post && typeof post === 'object' && !Array.isArray(post) ? post : {};
  const phase = phaseContract(source, metadata);
  if (!phase.identified) return deadlineFromPaths(source, metadata, DEADLINE_PATHS);
  if (!phase.purpose) return '';

  const currentDeadline = deadlineFromPaths(source, metadata, CURRENT_DEADLINE_PATHS);
  if (currentDeadline) return currentDeadline;
  for (const episode of phase.episodes) {
    const episodeDeadline = deadlineFromPaths(episode, {}, EPISODE_DEADLINE_PATHS);
    if (episodeDeadline) return episodeDeadline;
  }
  return deadlineFromPaths(source, metadata, purposeDeadlinePaths(phase.purpose));
}

function getIndexingDeadline(post) {
  const metadata = metadataOf(post);
  const candidates = [
    metadata.deadline_date,
    metadata.validThrough,
    metadata.data_encerramento,
    post && post.expires_at,
  ].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return candidates.find((value) => parseDateLike(value)) || candidates[0] || '';
}

function isExpired(post, now = Date.now()) {
  // Indexability keeps the established technical-expiry contract. Display and
  // JSON-LD use getPostDeadline(), which is purpose-aware and never exposes it.
  const deadline = getIndexingDeadline(post);
  if (!deadline) return false;
  const date = parseDateLike(deadline);
  if (!date) return false;
  return date.getTime() < now - DAY_MS;
}

function buildIndexabilityValues(post) {
  return {
    title: cleanText(post && post.title),
  };
}

// This is the canonical product indexability policy. Sitemap, RSS and SSR must
// call this same predicate so discovery surfaces never advertise a noindex URL.
function shouldIndexPost(post, values = buildIndexabilityValues(post)) {
  if (!post || String(post.status || '').toLowerCase() !== 'published') return false;
  if (isExpired(post)) return false;
  if (!canonicalPostId(post)) return false;
  if (!cleanText(values && values.title)) return false;
  return cleanText(post.description).length >= 24;
}

export {
  buildIndexabilityValues,
  canonicalPostId,
  cleanText,
  dateOnly,
  getPostDeadline,
  isoDate,
  isExpired,
  metadataOf,
  parseDateLike,
  shouldIndexPost,
  stripHtml,
  stripMarkdown,
};
