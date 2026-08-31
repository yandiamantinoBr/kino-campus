'use strict';

// Build-only, optional latency hint. Never fetch data, embed keys, rewrite the
// configured endpoint or broaden CSP. Unsupported configurations keep working
// without this optimization. Only the copied home HTML may be changed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');
const parse5 = require('parse5');

function supabasePreconnectOrigin(value) {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  // Check raw syntax before URL normalization can erase empty queries, dot
  // segments, control characters, credentials or an explicit default port.
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co\/?$/i.test(source)) return '';
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return '';
    return url.origin;
  } catch (_) { return ''; }
}

function cspAllowsOrigin(policy, origin) {
  if (!origin || supabasePreconnectOrigin(origin) !== origin) return false;
  if (typeof policy !== 'string' || !policy.trim() || policy.includes(',')) return false;
  const directives = new Map();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), values);
  }
  const values = directives.get('connect-src') || directives.get('default-src') || [];
  const normalized = values.map(value => value.toLowerCase());
  if (normalized.includes("'none'")) return false;
  // Recognize only the reviewed policy forms. A broader/novel source expression
  // may be valid CSP, but skipping a hint is safer than guessing its semantics.
  return normalized.includes(origin) || normalized.includes('https://*.supabase.co');
}

function attributes(node) {
  return Object.fromEntries((node.attrs || []).map(attribute => [attribute.name, attribute.value]));
}

function addSupabasePreconnect(html, origin, policies) {
  const unchanged = reason => Object.freeze({ html, changed: false, reason });
  if (!origin || supabasePreconnectOrigin(origin) !== origin) return unchanged('unsupported-url');
  if (!Array.isArray(policies) || !policies.length || !policies.every(policy => cspAllowsOrigin(policy, origin))) return unchanged('csp-not-authorized');
  const document = parse5.parse(html, { sourceCodeLocationInfo: true });
  const root = document.childNodes.find(node => node.tagName === 'html');
  const head = root && root.childNodes.find(node => node.tagName === 'head');
  if (!head?.sourceCodeLocation?.startTag || !head.sourceCodeLocation.endTag) return unchanged('explicit-head-required');
  const children = head.childNodes || [];
  const metaPolicies = children.filter(node => node.tagName === 'meta' && (attributes(node)['http-equiv'] || '').toLowerCase() === 'content-security-policy')
    .map(node => attributes(node).content || '');
  if (!metaPolicies.every(policy => cspAllowsOrigin(policy, origin))) return unchanged('meta-csp-not-authorized');
  const links = [];
  function collectLinks(node) {
    if (node.tagName === 'link') links.push(node);
    (node.childNodes || []).forEach(collectLinks);
  }
  collectLinks(document); // preconnect is also valid in the body, not just head.
  for (const node of links) {
    const attrs = attributes(node);
    if (!(attrs.rel || '').toLowerCase().split(/\s+/).includes('preconnect')) continue;
    let existingOrigin;
    try { existingOrigin = new URL(attrs.href, 'https://resource-hint.invalid').origin; } catch (_) { continue; }
    if (existingOrigin === origin) return unchanged('already-present');
  }
  const charset = children.find(node => node.tagName === 'meta' && Object.hasOwn(attributes(node), 'charset'));
  const offset = charset?.sourceCodeLocation?.endOffset || head.sourceCodeLocation.startTag.endOffset;
  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const hint = `${newline}  <link rel="preconnect" href="${origin}" crossorigin="anonymous" />`;
  return Object.freeze({ html: html.slice(0, offset) + hint + html.slice(offset), changed: true, reason: 'added' });
}

function fail(reason) { throw new Error(`STATIC_RESOURCE_HINT_${reason}`); }
function inside(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('UNSAFE_PATH');
  return relative;
}
function checkedFile(root, relative) {
  const target = path.resolve(root, relative);
  inside(root, target);
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor); // Includes dangling links.
    if (stat.isSymbolicLink()) fail('SYMLINK');
    if (cursor === target ? !stat.isFile() : !stat.isDirectory()) fail('NOT_REGULAR');
    if (stat.isFile() && stat.nlink !== 1) fail('HARDLINK');
    inside(root, fs.realpathSync(cursor));
  }
  return target;
}

function applySupabasePreconnect(options = {}) {
  const origin = supabasePreconnectOrigin(options.supabaseUrl);
  if (!origin) return Object.freeze({ changed: false, reason: 'unsupported-url' });
  const source = path.resolve(options.sourceRoot || path.join(__dirname, '..'));
  const output = path.resolve(options.outputRoot || path.join(source, 'dist'));
  for (const root of [source, output]) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(root, fs.realpathSync(root))) fail('UNSAFE_ROOT');
  }
  const relative = inside(source, output);
  const segments = relative.split(path.sep);
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(segments[0]) && !(segments[0] === 'output' && segments.length > 1)) fail('UNSAFE_PATH');
  let directory = source;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('UNSAFE_ROOT');
    inside(source, fs.realpathSync(directory));
  }
  const config = JSON.parse(fs.readFileSync(checkedFile(source, 'vercel.json'), 'utf8'));
  // Conservatively honor every configured enforced policy, even route-specific
  // ones. Unknown policy layouts only lose the hint; application CSP is intact.
  const policies = (Array.isArray(config.headers) ? config.headers : []).flatMap(entry => entry && Array.isArray(entry.headers) ? entry.headers : [])
    .filter(header => header && String(header.key || '').toLowerCase() === 'content-security-policy')
    .map(header => header.value);
  const filename = checkedFile(output, 'index.html');
  let html;
  try { html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(filename)); }
  catch (cause) { throw new Error('STATIC_RESOURCE_HINT_UTF8', { cause }); }
  const result = addSupabasePreconnect(html, origin, policies);
  if (!result.changed) return Object.freeze({ changed: false, reason: result.reason });
  const temporary = path.join(output, `.resource-hint-${crypto.randomBytes(12).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temporary, result.html, { encoding: 'utf8', flag: 'wx' });
    checkedFile(output, 'index.html');
    if (fs.readFileSync(filename, 'utf8') !== html) fail('HTML_CHANGED_DURING_BUILD');
    fs.renameSync(temporary, filename);
  } finally {
    // Only remove this unique temporary file, never a directory or user asset.
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return Object.freeze({ changed: true, reason: 'added' });
}

module.exports = Object.freeze({ supabasePreconnectOrigin, cspAllowsOrigin, addSupabasePreconnect, applySupabasePreconnect });
