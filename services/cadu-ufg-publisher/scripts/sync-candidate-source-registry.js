#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EXPECTED_ARTIFACTS,
  EXPECTED_MIRROR_SAFETY,
  EXPECTED_PROVENANCE,
  REGISTRY_DIR,
  gitBlobOid,
  parseRegistryVersion,
  sha256,
  validateManifest,
  validateRegistryBundle,
  verifyMirroredRegistry,
} = require('./lib/candidate-source-registry');

const SPECS = Object.freeze([
  {
    id: 'candidate',
    ...EXPECTED_ARTIFACTS.candidate,
  },
  {
    id: 'schema',
    ...EXPECTED_ARTIFACTS.schema,
  },
  {
    id: 'reconciliation-report',
    ...EXPECTED_ARTIFACTS['reconciliation-report'],
  },
]);

const EXPECTED_OPENCLAW_REMOTE = 'https://github.com/yandiamantinoBr/openclaw-cadu';
const EXPECTED_KINO_REMOTE = 'https://github.com/yandiamantinoBr/kino-campus';
// 2026-08-05: branch permanente migrada de "kinocampus-V75.0-foundations" para "main".
const EXPECTED_KINO_BRANCH = 'main';
const GITHUB_HTTP_SCOPE = 'https://github.com/';
const IMPORT_LOCK_FILE = '.cadu-source-registry-import.lock';
const INVALID_LOCK_GRACE_MS = 30_000;
const LOCK_CHOOSING_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;
const FILE_UNLINK_MAX_RETRIES = 8;
const FILE_UNLINK_RETRY_MS = 15;
const FILE_UNLINK_RETRY_CODES = new Set(['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'EPERM']);
const OWNED_IMPORT_LOCK_TOKENS = new Set();

function parseArgs(argv) {
  const options = {
    check: false,
    allowDowngrade: false,
    repair: false,
    openclawRepo: null,
    openclawCommit: null,
  };
  const optionMap = {
    '--openclaw-repo': 'openclawRepo',
    '--openclaw-commit': 'openclawCommit',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--allow-downgrade') {
      options.allowDowngrade = true;
      continue;
    }
    if (arg === '--repair') {
      options.repair = true;
      continue;
    }
    const key = optionMap[arg];
    if (!key) throw new Error(`unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    options[key] = value;
    index += 1;
  }
  const importValues = [
    options.openclawRepo,
    options.openclawCommit,
  ];
  if (options.check && importValues.some(Boolean)) throw new Error('--check cannot be combined with import options');
  if (options.check && options.allowDowngrade) throw new Error('--check cannot be combined with --allow-downgrade');
  if (options.check && options.repair) throw new Error('--check cannot be combined with --repair');
  if (options.allowDowngrade && options.repair) {
    throw new Error('--repair cannot be combined with --allow-downgrade');
  }
  if (!options.check && !importValues.every(Boolean)) {
    throw new Error('import requires --openclaw-repo and --openclaw-commit');
  }
  return options;
}

function runGit(repoDir, args, encoding = 'utf8') {
  const env = { ...process.env };
  const githubToken = env.GH_TOKEN || env.GITHUB_TOKEN || '';
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_INDEX_FILE',
    'GIT_REPLACE_REF_BASE',
    'GIT_EXEC_PATH',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_SYSTEM',
    'GIT_CONFIG_NOSYSTEM',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'GIT_PROXY_COMMAND',
    'GIT_ASKPASS',
    'SSH_ASKPASS',
    'SSH_ASKPASS_REQUIRE',
    'SUDO_ASKPASS',
    'GIT_EXTERNAL_DIFF',
    'GIT_SEQUENCE_EDITOR',
    'GIT_EDITOR',
    'GIT_PAGER',
    'GIT_TEMPLATE_DIR',
    'GIT_SSL_CAINFO',
    'GIT_SSL_CAPATH',
    'CURL_CA_BUNDLE',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
    'GCM_CREDENTIAL_STORE',
    'GCM_GUI_PROMPT',
    'GCM_MODAL_PROMPT',
    'GCM_TRACE',
    'GCM_TRACE_SECRETS',
    'GH_TOKEN',
    'GITHUB_TOKEN',
  ]) delete env[key];
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key)) delete env[key];
    if (/^(?:GIT_TRACE(?:2)?(?:_.*)?|GIT_CURL_VERBOSE)$/.test(key)) delete env[key];
  }
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'http.extraHeader';
  env.GIT_CONFIG_VALUE_0 = '';
  if (args.includes('fetch') && githubToken) {
    assert(!/[\0\r\n]/.test(githubToken), 'GitHub token contains forbidden control characters');
    env.GIT_CONFIG_COUNT = '2';
    env.GIT_CONFIG_KEY_1 = 'http.https://github.com/.extraHeader';
    env.GIT_CONFIG_VALUE_1 = `Authorization: Basic ${Buffer
      .from(`x-access-token:${githubToken}`, 'utf8')
      .toString('base64')}`;
  }
  env.GIT_NO_REPLACE_OBJECTS = '1';
  env.GIT_SSL_NO_VERIFY = 'false';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GCM_INTERACTIVE = 'Never';

  const privateGitStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-cadu-git-state-'));
  fs.chmodSync(privateGitStateDir, 0o700);
  const privateHooksDir = path.join(privateGitStateDir, 'hooks');
  fs.mkdirSync(privateHooksDir, { mode: 0o700 });
  const privateGlobalConfig = path.join(privateGitStateDir, 'global.config');
  fs.writeFileSync(privateGlobalConfig, '', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  env.GIT_CONFIG_GLOBAL = privateGlobalConfig;
  env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    return execFileSync('git', [
      '-c', `core.hooksPath=${privateHooksDir}`,
      '-c', 'core.askPass=',
      '-c', 'credential.helper=',
      '-c', 'credential.interactive=false',
      '-C', repoDir,
      ...args,
    ], {
      encoding,
      env,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    fs.rmSync(privateGitStateDir, { recursive: true, force: true });
  }
}

function repositoryGit(rawGit, repoDir) {
  return (args, encoding = 'utf8') => rawGit(
    repoDir,
    [
      '--no-replace-objects',
      '-c', 'http.sslVerify=true',
      '-c', 'http.sslCAInfo=',
      '-c', 'http.sslCAPath=',
      '-c', 'http.proxy=',
      '-c', 'http.extraHeader=',
      ...args,
    ],
    encoding,
  );
}

function withIsolatedCanonicalRepository(rawGit, expectedRemote, tempPrefix, callback) {
  assert.strictEqual(typeof rawGit, 'function', 'runGit dependency must be a function');
  assert.strictEqual(typeof callback, 'function', 'isolated repository callback must be a function');
  assert(
    [EXPECTED_OPENCLAW_REMOTE, EXPECTED_KINO_REMOTE].includes(expectedRemote),
    'isolated repository remote must be a pinned canonical origin',
  );
  assert(/^[a-z][a-z0-9-]*$/.test(tempPrefix), 'invalid isolated repository prefix');

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kc-cadu-${tempPrefix}-`));
  fs.chmodSync(temporaryRoot, 0o700);
  const repoDir = path.join(temporaryRoot, 'upstream.git');
  const emptyTemplateDir = path.join(temporaryRoot, 'empty-template');
  fs.mkdirSync(repoDir, { mode: 0o700 });
  fs.mkdirSync(emptyTemplateDir, { mode: 0o700 });
  const git = repositoryGit(rawGit, repoDir);

  try {
    // An explicitly empty template prevents GIT_TEMPLATE_DIR/init.templateDir
    // from planting hooks or configuration in the disposable repository.
    git(['init', '--quiet', '--bare', `--template=${emptyTemplateDir}`, '.']);

    // Fetches happen only in this repository. URL-scoped settings in the
    // caller's checkout therefore cannot weaken TLS, redirect through a proxy
    // or append headers (including a GitHub token) to another endpoint.
    for (const [key, value] of [
      ['http.sslVerify', 'true'],
      ['http.sslCAInfo', ''],
      ['http.sslCAPath', ''],
      ['http.proxy', ''],
      ['http.extraHeader', ''],
      [`http.${GITHUB_HTTP_SCOPE}.sslVerify`, 'true'],
      [`http.${GITHUB_HTTP_SCOPE}.proxy`, ''],
      [`http.${GITHUB_HTTP_SCOPE}.extraHeader`, ''],
    ]) {
      git(['config', '--local', key, value]);
    }
    git(['remote', 'add', 'origin', `${expectedRemote}.git`]);

    return callback({ repoDir, git });
  } finally {
    fs.rmSync(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

function withIsolatedImportRepository(rawGit, callback) {
  return withIsolatedCanonicalRepository(
    rawGit,
    EXPECTED_OPENCLAW_REMOTE,
    'upstream',
    callback,
  );
}

function normalizeGithubRemote(remote) {
  const normalized = String(remote || '').trim();
  // Only HTTPS is accepted. Treating GitHub-looking SSH URLs as equivalent
  // would let ~/.ssh/config or core.sshCommand redirect an otherwise canonical
  // declaration to an arbitrary host.
  if (!/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+(?:\.git)?\/?$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\.git\/?$/, '').replace(/\/$/, '');
}

function assertCanonicalOrigin(git, expectedRemote, context) {
  const declaredRemotes = git(['config', '--get-all', 'remote.origin.url'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeGithubRemote);
  assert.deepStrictEqual(declaredRemotes, [expectedRemote], `${context} origin remote mismatch`);
  const effectiveRemotes = git(['remote', 'get-url', '--all', 'origin'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeGithubRemote);
  assert.deepStrictEqual(effectiveRemotes, [expectedRemote], `effective ${context} origin remote mismatch`);
}

function assertNoGraphOverrides(git, repoDir, context) {
  const replaceRefs = git(['for-each-ref', '--format=%(refname)', 'refs/replace'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  assert.strictEqual(replaceRefs.length, 0, `${context} repository replace refs are not allowed`);
  const commonDir = path.resolve(repoDir, git(['rev-parse', '--git-common-dir']).trim());
  const graftsPath = path.join(commonDir, 'info', 'grafts');
  assert(
    !fs.existsSync(graftsPath) || fs.statSync(graftsPath).size === 0,
    `${context} repository grafts are not allowed`,
  );
}

function sortObjectDeepByCodepoint(value) {
  if (Array.isArray(value)) return value.map(sortObjectDeepByCodepoint);
  if (!value || typeof value !== 'object') return value;
  // A null prototype makes every JSON key data. In particular, assigning an
  // own `__proto__` key must not invoke Object.prototype's legacy setter and
  // silently remove provenance-significant content from the canonical hash.
  const sorted = Object.create(null);
  for (const key of Object.keys(value).sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ))) {
    sorted[key] = sortObjectDeepByCodepoint(value[key]);
  }
  return sorted;
}

function canonicalJsonSha256(value) {
  return sha256(Buffer.from(JSON.stringify(sortObjectDeepByCodepoint(value)), 'utf8'));
}

function normalizedTextSha256(bytes) {
  assert(Buffer.isBuffer(bytes), 'text provenance bytes are required');
  const normalized = bytes.toString('utf8').replace(/\r\n?/g, '\n');
  return sha256(Buffer.from(normalized, 'utf8'));
}

function validateKinoPublisherProvenance(registry, options = {}) {
  const input = registry.provenance.inputs.find((candidate) => candidate.id === 'kino_publisher');
  assert(input, 'kino_publisher provenance input is required');
  const expected = EXPECTED_PROVENANCE.inputs.find((candidate) => candidate.id === 'kino_publisher');
  assert.strictEqual(input.repository, EXPECTED_KINO_REMOTE, 'kino_publisher repository drift');
  assert.strictEqual(input.path, expected.path, 'kino_publisher path drift');
  assert(/^[0-9a-f]{40}$/.test(input.commit), 'kino_publisher requires a full commit SHA');
  assert(/^[0-9a-f]{64}$/.test(input.contentSha256), 'kino_publisher invalid canonical payload SHA-256');

  const rawGit = options.runGit || runGit;
  assert.strictEqual(typeof rawGit, 'function', 'KinoCampus runGit dependency must be a function');
  return withIsolatedCanonicalRepository(
    rawGit,
    EXPECTED_KINO_REMOTE,
    'kino-publisher',
    ({ repoDir, git }) => {
      assertCanonicalOrigin(git, EXPECTED_KINO_REMOTE, 'KinoCampus');
      assertNoGraphOverrides(git, repoDir, 'KinoCampus');
      const trustedRef = `refs/remotes/origin/${EXPECTED_KINO_BRANCH}`;
      git([
        'fetch',
        '--quiet',
        '--no-tags',
        'origin',
        `+refs/heads/${EXPECTED_KINO_BRANCH}:${trustedRef}`,
      ]);
      assertCanonicalOrigin(git, EXPECTED_KINO_REMOTE, 'KinoCampus');
      assertNoGraphOverrides(git, repoDir, 'KinoCampus');

      let resolvedCommit = '';
      try {
        resolvedCommit = git(['rev-parse', '--verify', `${input.commit}^{commit}`]).trim();
      } catch (_) {
        assert.fail(`kino_publisher provenance commit is not reachable from fetched origin/${EXPECTED_KINO_BRANCH}`);
      }
      assert.strictEqual(resolvedCommit, input.commit, 'kino_publisher provenance commit did not resolve exactly');

      let isAncestor = true;
      try {
        git(['merge-base', '--is-ancestor', resolvedCommit, trustedRef]);
      } catch (_) {
        isAncestor = false;
      }
      assert(
        isAncestor,
        `kino_publisher provenance commit is not an ancestor of fetched origin/${EXPECTED_KINO_BRANCH}`,
      );

      const objectSpec = `${resolvedCommit}:${expected.path}`;
      let objectOid = '';
      try {
        objectOid = git(['rev-parse', '--verify', objectSpec]).trim();
      } catch (_) {
        assert.fail('kino_publisher provenance path is absent from the declared commit');
      }
      assert(/^[0-9a-f]{40}$/.test(objectOid), 'kino_publisher object must be a full Git OID');
      assert.strictEqual(git(['cat-file', '-t', objectOid]).trim(), 'blob', 'kino_publisher object must be a blob');
      const bytes = git(['cat-file', 'blob', objectOid], null);
      assert.strictEqual(gitBlobOid(bytes), objectOid, 'kino_publisher bytes do not match the declared Git blob');
      const parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      assert(parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta), 'kino_publisher input must contain meta{}');
      assert(Array.isArray(parsed.sources), 'kino_publisher input must contain sources[]');
      assert.strictEqual(parsed.sources.length, parsed.meta.totalSites, 'kino_publisher meta.totalSites drift');
      const canonicalPayloadSha256 = canonicalJsonSha256({ meta: parsed.meta, sources: parsed.sources });
      assert.strictEqual(
        canonicalPayloadSha256,
        input.contentSha256,
        'kino_publisher canonical payload hash drift',
      );
      return {
        branch: EXPECTED_KINO_BRANCH,
        canonicalPayloadSha256,
        commit: resolvedCommit,
        gitBlobOid: objectOid,
        rawContentSha256: sha256(bytes),
        trustTarget: trustedRef,
      };
    },
  );
}

function compareRegistryVersions(left, right) {
  const a = parseRegistryVersion(left, 'registry version for monotonic comparison');
  const b = parseRegistryVersion(right, 'registry version for monotonic comparison');
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.revision.length !== b.revision.length) return a.revision.length < b.revision.length ? -1 : 1;
  if (a.revision === b.revision) return 0;
  return a.revision < b.revision ? -1 : 1;
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function unlinkFileWithRetry(filePath) {
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt <= FILE_UNLINK_MAX_RETRIES; attempt += 1) {
    try {
      fs.unlinkSync(filePath);
      assert(!fs.existsSync(filePath), `file still exists after unlink: ${filePath}`);
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') return false;
      if (!error || !FILE_UNLINK_RETRY_CODES.has(error.code) || attempt === FILE_UNLINK_MAX_RETRIES) {
        throw error;
      }
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        try {
          fs.chmodSync(filePath, 0o600);
        } catch (chmodError) {
          if (chmodError && chmodError.code === 'ENOENT') return false;
          if (!chmodError || !FILE_UNLINK_RETRY_CODES.has(chmodError.code)) throw chmodError;
        }
      }
      Atomics.wait(
        waitArray,
        0,
        0,
        Math.min((attempt + 1) * FILE_UNLINK_RETRY_MS, 100),
      );
    }
  }
  return false;
}

function compareDecimalStrings(left, right) {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function writeLockIntent(filePath, metadata) {
  const descriptor = fs.openSync(filePath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(metadata)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function listActiveLockIntents(registryDir) {
  const resolvedRegistryDir = path.resolve(registryDir);
  const escapedPrefix = IMPORT_LOCK_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}\\.(choosing|ticket)\\.(\\d+)\\.([0-9a-f]{32})$`);
  const intents = [];
  for (const file of fs.readdirSync(resolvedRegistryDir)) {
    const match = pattern.exec(file);
    if (!match) continue;
    const filePath = path.join(resolvedRegistryDir, file);
    let stat;
    let metadata;
    try {
      stat = fs.statSync(filePath);
      metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      if (stat && Date.now() - stat.mtimeMs >= INVALID_LOCK_GRACE_MS) {
        unlinkFileWithRetry(filePath);
        continue;
      }
      intents.push({ kind: 'blocking', path: filePath, pid: null, ticket: '0', token: file });
      continue;
    }

    const valid = metadata
      && metadata.schemaVersion === 1
      && metadata.kind === match[1]
      && metadata.pid === Number(match[2])
      && Number.isSafeInteger(metadata.pid)
      && metadata.pid > 0
      && metadata.token === match[3]
      && (metadata.kind !== 'ticket' || /^[1-9]\d{0,63}$/.test(metadata.ticket));
    if (!valid) {
      if (Date.now() - stat.mtimeMs >= INVALID_LOCK_GRACE_MS) {
        unlinkFileWithRetry(filePath);
        continue;
      }
      intents.push({ kind: 'blocking', path: filePath, pid: null, ticket: '0', token: file });
      continue;
    }
    if (metadata.pid === process.pid && !OWNED_IMPORT_LOCK_TOKENS.has(metadata.token)) {
      // The current process cannot own an untracked token. This is a residue
      // from an earlier process that had the same PID (or from a prior failed
      // release), so it is safe to remove without treating an unrelated live
      // PID as stale.
      unlinkFileWithRetry(filePath);
      continue;
    }
    if (!isProcessAlive(metadata.pid)) {
      // Each intent path contains a cryptographically random token and is
      // never reused. Removing this exact dead-owner path cannot delete a new
      // contender's intent, unlike reclaiming a shared lock filename.
      unlinkFileWithRetry(filePath);
      continue;
    }
    intents.push({ ...metadata, path: filePath });
  }
  return intents;
}

function releaseImportLock(lock) {
  try {
    const metadata = JSON.parse(fs.readFileSync(lock.ticketPath, 'utf8'));
    if (metadata.token === lock.token) unlinkFileWithRetry(lock.ticketPath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  } finally {
    OWNED_IMPORT_LOCK_TOKENS.delete(lock.token);
  }
}

function acquireImportLock(registryDir) {
  const resolvedRegistryDir = path.resolve(registryDir);
  fs.mkdirSync(resolvedRegistryDir, { recursive: true });
  const token = crypto.randomBytes(16).toString('hex');
  const choosingPath = path.join(resolvedRegistryDir, `${IMPORT_LOCK_FILE}.choosing.${process.pid}.${token}`);
  let ticketPath = null;
  OWNED_IMPORT_LOCK_TOKENS.add(token);

  try {
    writeLockIntent(choosingPath, {
      schemaVersion: 1,
      kind: 'choosing',
      pid: process.pid,
      createdAt: new Date().toISOString(),
      token,
    });
    const existingTickets = listActiveLockIntents(resolvedRegistryDir)
      .filter((intent) => intent.kind === 'ticket');
    let maximumTicket = '0';
    for (const intent of existingTickets) {
      if (compareDecimalStrings(intent.ticket, maximumTicket) > 0) maximumTicket = intent.ticket;
    }
    const ticket = (BigInt(maximumTicket) + 1n).toString();
    ticketPath = path.join(resolvedRegistryDir, `${IMPORT_LOCK_FILE}.ticket.${process.pid}.${token}`);
    writeLockIntent(ticketPath, {
      schemaVersion: 1,
      kind: 'ticket',
      pid: process.pid,
      createdAt: new Date().toISOString(),
      ticket,
      token,
    });
    unlinkFileWithRetry(choosingPath);

    const waitArray = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + LOCK_CHOOSING_TIMEOUT_MS;
    while (true) {
      const choosing = listActiveLockIntents(resolvedRegistryDir)
        .filter((intent) => intent.kind === 'choosing' || intent.kind === 'blocking');
      if (choosing.length === 0) break;
      if (Date.now() >= deadline) throw new Error('source registry import lock election timed out');
      Atomics.wait(waitArray, 0, 0, LOCK_POLL_MS);
    }

    const contenders = listActiveLockIntents(resolvedRegistryDir)
      .filter((intent) => intent.kind === 'ticket');
    const predecessor = contenders.find((intent) => {
      const ticketOrder = compareDecimalStrings(intent.ticket, ticket);
      return ticketOrder < 0 || (ticketOrder === 0 && intent.token < token);
    });
    if (predecessor) throw new Error(`source registry import lock is held by PID ${predecessor.pid}`);
    return { registryDir: resolvedRegistryDir, ticket, ticketPath, token };
  } catch (error) {
    unlinkFileWithRetry(choosingPath);
    if (ticketPath) unlinkFileWithRetry(ticketPath);
    OWNED_IMPORT_LOCK_TOKENS.delete(token);
    throw error;
  }
}

function withImportLock(registryDir, callback) {
  assert.strictEqual(typeof callback, 'function', 'import lock callback must be a function');
  const lock = acquireImportLock(registryDir);
  let result;
  let primaryError = null;
  try {
    result = callback(lock);
    assert(!result || typeof result.then !== 'function', 'import lock callback must be synchronous');
  } catch (error) {
    primaryError = error;
  }

  let releaseFailure = null;
  try {
    releaseImportLock(lock);
  } catch (cause) {
    releaseFailure = new Error(`failed to release source registry import lock: ${cause.message}`, { cause });
  }
  if (releaseFailure) {
    throw new AggregateError(
      primaryError ? [primaryError, releaseFailure] : [releaseFailure],
      primaryError
        ? `source registry operation failed and lock release was incomplete: ${primaryError.message}`
        : 'source registry operation completed but lock release was incomplete',
      { cause: primaryError || releaseFailure },
    );
  }
  if (primaryError) throw primaryError;
  return result;
}

function rollbackImport(staged) {
  const failures = [];
  for (const item of [...staged].reverse()) {
    try {
      if (item.installed && fs.existsSync(item.destination)) {
        unlinkFileWithRetry(item.destination);
      }
      if (item.backedUp) {
        assert(fs.existsSync(item.backup), `rollback backup disappeared: ${item.backup}`);
        fs.renameSync(item.backup, item.destination);
        assert(fs.existsSync(item.destination), `rollback destination was not restored: ${item.destination}`);
        assert.strictEqual(
          sha256(fs.readFileSync(item.destination)),
          item.originalContentSha256,
          `rollback content hash drift: ${item.destination}`,
        );
      }
      item.installed = false;
      item.backedUp = false;
    } catch (cause) {
      failures.push(new Error(
        `failed to roll back ${path.basename(item.destination)}: ${cause.message}`,
        { cause },
      ));
    }
  }
  return failures;
}

function replaceImportAtomically(registryDir, contents, manifest, verifyInstalled) {
  assert.strictEqual(typeof verifyInstalled, 'function', 'installed mirror verifier must be a function');
  const resolvedRegistryDir = path.resolve(registryDir);
  fs.mkdirSync(resolvedRegistryDir, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const payloads = [
    ...SPECS.map((spec) => ({ file: spec.file, bytes: contents.get(spec.file) })),
    {
      file: 'upstream-manifest.json',
      bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    },
  ];
  const staged = payloads.map(({ file, bytes }) => {
    assert(Buffer.isBuffer(bytes), `missing validated bytes for ${file}`);
    const destination = path.resolve(resolvedRegistryDir, file);
    assert.strictEqual(path.dirname(destination), resolvedRegistryDir, `${file} must stay inside registry directory`);
    return {
      destination,
      temporary: `${destination}.${token}.tmp`,
      backup: `${destination}.${token}.bak`,
      bytes,
      backedUp: false,
      installed: false,
      originalContentSha256: null,
    };
  });
  let completed = false;
  let rollbackCompleted = false;
  let verifiedResult;
  let primaryError = null;

  try {
    for (const item of staged) fs.writeFileSync(item.temporary, item.bytes, { flag: 'wx' });
    // The manifest is deliberately the final rename. A crash or interrupted
    // replacement therefore fails closed as hash drift instead of blessing a
    // partially updated artifact set.
    for (const item of staged) {
      if (fs.existsSync(item.destination)) {
        item.originalContentSha256 = sha256(fs.readFileSync(item.destination));
        fs.renameSync(item.destination, item.backup);
        item.backedUp = true;
      }
      fs.renameSync(item.temporary, item.destination);
      item.installed = true;
    }
    verifiedResult = verifyInstalled({ registryDir: resolvedRegistryDir });
    assert(
      !verifiedResult || typeof verifiedResult.then !== 'function',
      'installed mirror verifier must be synchronous',
    );
    completed = true;
  } catch (error) {
    const rollbackFailures = rollbackImport(staged);
    rollbackCompleted = rollbackFailures.length === 0;
    if (rollbackFailures.length > 0) {
      primaryError = new AggregateError(
        [error, ...rollbackFailures],
        `source registry import failed and rollback was incomplete: ${error.message}`,
        { cause: error },
      );
    } else {
      primaryError = error;
    }
  }

  const cleanupFailures = [];
  for (const item of staged) {
    try {
      unlinkFileWithRetry(item.temporary);
      if (completed) unlinkFileWithRetry(item.backup);
    } catch (cause) {
      cleanupFailures.push(new Error(
        `failed to clean transaction files for ${path.basename(item.destination)}: ${cause.message}`,
        { cause },
      ));
    }
  }
  // Windows filesystem filters can leave a case-variant `<backup>.tmp`
  // after a replace/rollback. Remove only residue carrying this exact,
  // cryptographically random transaction token. Preserve every backup when
  // rollback itself was incomplete so --repair can recover it.
  if (completed || rollbackCompleted) {
    try {
      cleanupTransactionResidues(resolvedRegistryDir, token);
    } catch (cause) {
      cleanupFailures.push(new Error(`failed to clean source registry transaction residue: ${cause.message}`, { cause }));
    }
  }
  if (cleanupFailures.length > 0 && (completed || rollbackCompleted)) {
    try {
      if (transactionResiduePaths(resolvedRegistryDir, token).length === 0) cleanupFailures.length = 0;
    } catch (cause) {
      cleanupFailures.push(new Error(`failed to verify source registry transaction cleanup: ${cause.message}`, { cause }));
    }
  }

  if (cleanupFailures.length > 0) {
    const errors = primaryError ? [primaryError, ...cleanupFailures] : cleanupFailures;
    throw new AggregateError(
      errors,
      primaryError
        ? `source registry import failed and cleanup was incomplete: ${primaryError.message}`
        : 'source registry import committed but cleanup was incomplete',
      { cause: primaryError || cleanupFailures[0] },
    );
  }
  if (primaryError) throw primaryError;
  return verifiedResult;
}

function writeImportAtomically(
  registryDir,
  contents,
  manifest,
  verifyInstalled = verifyMirroredRegistry,
) {
  return withImportLock(
    registryDir,
    () => replaceImportAtomically(registryDir, contents, manifest, verifyInstalled),
  );
}

function transactionResiduePaths(registryDir, transactionToken) {
  const resolvedRegistryDir = path.resolve(registryDir);
  if (!fs.existsSync(resolvedRegistryDir)) return [];
  const escapedNames = [
    ...SPECS.map((spec) => spec.file),
    'upstream-manifest.json',
  ].map((file) => file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let tokenPattern = '\\d+-\\d+-[0-9a-f]{16}';
  if (transactionToken != null) {
    assert(/^\d+-\d+-[0-9a-f]{16}$/.test(transactionToken), 'invalid source registry transaction token');
    tokenPattern = transactionToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const pattern = new RegExp(
    `^(?:${escapedNames.join('|')})\\.${tokenPattern}\\.(?:tmp|bak(?:\\.tmp)?)$`,
    'i',
  );
  return fs.readdirSync(resolvedRegistryDir)
    .filter((file) => pattern.test(file))
    .map((file) => path.join(resolvedRegistryDir, file));
}

function hasMirrorState(registryDir) {
  const resolvedRegistryDir = path.resolve(registryDir);
  return [
    ...SPECS.map((spec) => spec.file),
    'upstream-manifest.json',
  ].some((file) => fs.existsSync(path.join(resolvedRegistryDir, file)))
    || transactionResiduePaths(resolvedRegistryDir).length > 0;
}

function readManifestIfValid(filePath) {
  try {
    return validateManifest(JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')));
  } catch (_) {
    return null;
  }
}

function collectMirrorBaselines(registryDir, repair) {
  const resolvedRegistryDir = path.resolve(registryDir);
  const currentManifestPath = path.join(resolvedRegistryDir, 'upstream-manifest.json');
  const baselines = [];
  let currentVerificationError = null;
  if (fs.existsSync(currentManifestPath)) {
    try {
      baselines.push(verifyMirroredRegistry({ registryDir: resolvedRegistryDir }).manifest);
    } catch (error) {
      currentVerificationError = error;
      if (!repair) {
        const wrapped = new Error(`existing source registry mirror is invalid; use --repair: ${error.message}`);
        wrapped.cause = error;
        throw wrapped;
      }
      const manifest = readManifestIfValid(currentManifestPath);
      if (manifest) baselines.push(manifest);
    }
  }

  if (repair) {
    for (const residuePath of transactionResiduePaths(resolvedRegistryDir)) {
      if (!/^upstream-manifest\.json\./i.test(path.basename(residuePath))) continue;
      const manifest = readManifestIfValid(residuePath);
      if (manifest) baselines.push(manifest);
    }
  }

  const unique = new Map(baselines.map((manifest) => [JSON.stringify(manifest), manifest]));
  if (unique.size === 0 && hasMirrorState(resolvedRegistryDir)) {
    const detail = currentVerificationError ? `: ${currentVerificationError.message}` : '';
    throw new Error(`cannot prove a monotonic repair baseline from the partial mirror${detail}`);
  }
  return [...unique.values()];
}

function artifactIdentity(manifest) {
  return Object.fromEntries(manifest.artifacts.map((artifact) => [
    artifact.id,
    {
      upstreamGitBlobOid: artifact.upstreamGitBlobOid,
      contentSha256: artifact.contentSha256,
      byteLength: artifact.byteLength,
    },
  ]));
}

function enforceMonotonicImport(manifest, baselines, git, allowDowngrade) {
  for (const baseline of baselines) {
    if (!allowDowngrade) {
      assert(
        compareRegistryVersions(manifest.registryVersion, baseline.registryVersion) >= 0,
        'source registry downgrade requires --allow-downgrade',
      );
      assert(
        manifest.auditCutoff >= baseline.auditCutoff,
        'source registry audit cutoff downgrade requires --allow-downgrade',
      );
      let advancesCurrentCommit = true;
      try {
        git(['merge-base', '--is-ancestor', baseline.upstream.commit, manifest.upstream.commit]);
      } catch (_) {
        advancesCurrentCommit = false;
      }
      assert(advancesCurrentCommit, 'source registry commit downgrade requires --allow-downgrade');
    }
    if (manifest.registryVersion === baseline.registryVersion) {
      assert.deepStrictEqual(
        artifactIdentity(manifest),
        artifactIdentity(baseline),
        'source registry artifacts changed without a version increment',
      );
    }
  }
}

function cleanupTransactionResidues(registryDir, transactionToken) {
  for (const residuePath of transactionResiduePaths(registryDir, transactionToken)) {
    unlinkFileWithRetry(residuePath);
  }
}

function validateOpenClawProvenance(registry, git, artifactCommit) {
  for (const expected of EXPECTED_PROVENANCE.inputs.filter((input) => input.repository === EXPECTED_OPENCLAW_REMOTE)) {
    const input = registry.provenance.inputs.find((candidate) => candidate.id === expected.id);
    let resolvedInputCommit = '';
    try {
      resolvedInputCommit = git(['rev-parse', '--verify', `${input.commit}^{commit}`]).trim();
    } catch (_) {
      assert.fail(`${input.id} provenance commit is not reachable from fetched origin/main`);
    }
    assert.strictEqual(resolvedInputCommit, input.commit, `${input.id} provenance commit did not resolve exactly`);
    let isAncestor = true;
    try {
      git(['merge-base', '--is-ancestor', input.commit, artifactCommit]);
    } catch (_) {
      isAncestor = false;
    }
    assert(isAncestor, `${input.id} provenance commit must be an ancestor of the artifact commit`);
    const objectSpec = `${input.commit}:${expected.path}`;
    const objectOid = git(['rev-parse', '--verify', objectSpec]).trim();
    assert(/^[0-9a-f]{40}$/.test(objectOid), `${input.id} provenance object must be a full Git OID`);
    assert.strictEqual(git(['cat-file', '-t', objectOid]).trim(), 'blob', `${input.id} provenance object must be a blob`);
    const bytes = git(['show', objectSpec], null);
    assert.strictEqual(
      normalizedTextSha256(bytes),
      input.contentSha256,
      `${input.id} provenance content hash drift`,
    );
  }
}

function importRegistry(options, registryDir = REGISTRY_DIR, dependencies = {}) {
  assert(/^[0-9a-f]{40}$/.test(options.openclawCommit), '--openclaw-commit must be a full SHA');
  const repoDir = path.resolve(options.openclawRepo);
  const rawGit = dependencies.runGit || runGit;
  assert.strictEqual(typeof rawGit, 'function', 'runGit dependency must be a function');
  // The supplied checkout is inspected read-only. Network access and all
  // object reads happen later in a fresh bare repository with controlled
  // configuration, so this function never fetches into the user's checkout.
  const sourceGit = repositoryGit(rawGit, repoDir);
  const declaredRemotes = sourceGit(['config', '--get-all', 'remote.origin.url'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeGithubRemote);
  assert.deepStrictEqual(declaredRemotes, [EXPECTED_OPENCLAW_REMOTE], 'OpenClaw origin remote mismatch');
  // `url.*.insteadOf` can leave remote.origin.url looking canonical while
  // transparently redirecting fetches elsewhere. `remote get-url` expands
  // those rewrites, so both the declared and effective origins are pinned.
  const effectiveRemotes = sourceGit(['remote', 'get-url', '--all', 'origin'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeGithubRemote);
  assert.deepStrictEqual(effectiveRemotes, [EXPECTED_OPENCLAW_REMOTE], 'effective OpenClaw origin remote mismatch');
  const replaceRefs = sourceGit(['for-each-ref', '--format=%(refname)', 'refs/replace'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  assert.strictEqual(replaceRefs.length, 0, 'OpenClaw repository replace refs are not allowed');
  const commonDir = path.resolve(repoDir, sourceGit(['rev-parse', '--git-common-dir']).trim());
  const graftsPath = path.join(commonDir, 'info', 'grafts');
  assert(
    !fs.existsSync(graftsPath) || fs.statSync(graftsPath).size === 0,
    'OpenClaw repository grafts are not allowed',
  );
  return withIsolatedImportRepository(rawGit, ({ git }) => {
    git([
      'fetch',
      '--quiet',
      '--no-tags',
      'origin',
      '+refs/heads/main:refs/remotes/origin/main',
    ]);
    let resolvedCommit = '';
    try {
      resolvedCommit = git(['rev-parse', '--verify', `${options.openclawCommit}^{commit}`]).trim();
    } catch (_) {
      assert.fail('OpenClaw commit is not reachable from fetched origin/main');
    }
    assert.strictEqual(resolvedCommit, options.openclawCommit, 'OpenClaw commit did not resolve exactly');
    let reachableFromOriginMain = true;
    try {
      git(['merge-base', '--is-ancestor', resolvedCommit, 'refs/remotes/origin/main']);
    } catch (_) {
      reachableFromOriginMain = false;
    }
    assert(reachableFromOriginMain, 'OpenClaw commit is not reachable from fetched origin/main');
    const artifacts = [];
    const contents = new Map();
    for (const spec of SPECS) {
      const objectSpec = `${resolvedCommit}:${spec.upstreamPath}`;
      const expectedBlob = git(['rev-parse', '--verify', objectSpec]).trim();
      assert(/^[0-9a-f]{40}$/.test(expectedBlob), `${spec.id} blob must be a full Git OID`);
      const objectType = git(['cat-file', '-t', expectedBlob]).trim();
      assert.strictEqual(objectType, 'blob', `${spec.id} upstream object must be a blob`);
      const bytes = git(['show', objectSpec], null);
      assert.strictEqual(gitBlobOid(bytes), expectedBlob, `${spec.id} bytes do not match upstream Git blob`);
      JSON.parse(bytes.toString('utf8'));
      contents.set(spec.file, bytes);
      artifacts.push({
        id: spec.id,
        file: spec.file,
        upstreamPath: spec.upstreamPath,
        upstreamGitBlobOid: expectedBlob,
        contentSha256: sha256(bytes),
        byteLength: bytes.length,
      });
    }
    const candidate = JSON.parse(contents.get('ufg-source-registry.candidate.json').toString('utf8'));
    const schema = JSON.parse(contents.get('ufg-source-registry.schema.json').toString('utf8'));
    const report = JSON.parse(contents.get('source-reconciliation-report.json').toString('utf8'));
    validateRegistryBundle(
      candidate,
      schema,
      report,
      contents.get('ufg-source-registry.schema.json'),
    );
    validateKinoPublisherProvenance(candidate, {
      runGit: dependencies.kinoRunGit || rawGit,
    });
    validateOpenClawProvenance(candidate, git, resolvedCommit);
    const manifest = {
      schemaVersion: 1,
      registryVersion: candidate.registryVersion,
      auditCutoff: candidate.auditCutoff,
      upstream: {
        repository: EXPECTED_OPENCLAW_REMOTE,
        commit: resolvedCommit,
      },
      artifacts,
      safety: { ...EXPECTED_MIRROR_SAFETY },
    };
    validateManifest(manifest);
    return withImportLock(registryDir, () => {
      const baselines = collectMirrorBaselines(registryDir, Boolean(options.repair));
      enforceMonotonicImport(manifest, baselines, git, Boolean(options.allowDowngrade));
      const verified = replaceImportAtomically(
        registryDir,
        contents,
        manifest,
        dependencies.verifyInstalledMirror || verifyMirroredRegistry,
      );
      cleanupTransactionResidues(registryDir);
      return verified;
    });
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const verified = options.check ? verifyMirroredRegistry() : importRegistry(options);
  console.log(JSON.stringify({
    upstreamCommit: verified.manifest.upstream.commit,
    registryVersion: verified.registry.registryVersion,
    entities: verified.registry.entities.length,
    webSources: verified.registry.webSources.length,
    instagramProfiles: verified.registry.instagramProfiles.length,
    enabledWebSources: verified.registry.webSources.filter((source) => source.enabled).length,
    enabledInstagramProfiles: verified.registry.instagramProfiles.filter((profile) => profile.enabled).length,
    upstreamLifecycle: verified.registry.activation.state,
    upstreamRuntimeConsumers: verified.registry.activation.runtimeConsumers,
    readOnlyMirror: verified.manifest.safety.readOnlyMirror,
    collectionActivated: verified.report.safety.collectionActivated,
    publishAttempted: verified.report.safety.publishAttempted,
    publisherUsesLegacySources: verified.manifest.safety.publisherUsesLegacySources,
  }));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

module.exports = {
  canonicalJsonSha256,
  compareRegistryVersions,
  EXPECTED_KINO_BRANCH,
  EXPECTED_KINO_REMOTE,
  EXPECTED_OPENCLAW_REMOTE,
  IMPORT_LOCK_FILE,
  importRegistry,
  normalizeGithubRemote,
  parseArgs,
  repositoryGit,
  runGit,
  sortObjectDeepByCodepoint,
  validateKinoPublisherProvenance,
  validateOpenClawProvenance,
  withImportLock,
  withIsolatedCanonicalRepository,
  withIsolatedImportRepository,
  writeImportAtomically,
};
