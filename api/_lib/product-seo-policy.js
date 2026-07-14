const DAY_MS = 24 * 60 * 60 * 1000;

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

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  if (!text) return null;

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCFullYear() === Number(year)
        && date.getUTCMonth() === Number(month) - 1
        && date.getUTCDate() === Number(day)
      ? date
      : null;
  }

  const brDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCFullYear() === Number(year)
        && date.getUTCMonth() === Number(month) - 1
        && date.getUTCDate() === Number(day)
      ? date
      : null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value) {
  const date = parseDateLike(value);
  return date ? date.toISOString() : '';
}

function dateOnly(value) {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 10) : '';
}

function getPostDeadline(post) {
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
  const deadline = getPostDeadline(post);
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
