'use strict';

const fs = require('fs');
const path = require('path');

function pathError(message, candidate) {
  return new Error(`${message}: ${candidate}`);
}

function samePath(left, right) {
  return path.relative(left, right) === '' && path.relative(right, left) === '';
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function resolveWorkspacePath(workspace, override, fallback) {
  const base = path.resolve(String(workspace || ''));
  const selected = typeof override === 'string' && override !== '' ? override : fallback;
  if (typeof selected !== 'string' || selected === '') {
    throw new TypeError('workspace path requires a non-empty override or fallback');
  }
  return path.resolve(base, selected);
}

/**
 * Inspect a directory path without following any symbolic-link ancestor.
 *
 * When allowMissing is true, the returned nearestExisting directory is the
 * location whose write/traverse permissions determine whether mkdir({
 * recursive: true }) can create the remaining suffix. The function itself is
 * read-only and never creates the candidate.
 */
function inspectRealDirectoryPath(directory, {
  allowMissing = false,
  within = null,
} = {}) {
  if (typeof directory !== 'string' || directory === '') {
    throw new TypeError('directory path must be a non-empty string');
  }
  const candidate = path.resolve(directory);
  const boundary = within === null ? null : path.resolve(String(within || ''));
  if (boundary !== null && !isPathInside(boundary, candidate)) {
    throw pathError('directory escapes its allowed boundary', candidate);
  }

  const parsed = path.parse(candidate);
  let current = parsed.root;
  let nearestExisting = null;
  let missing = false;
  const components = candidate.slice(parsed.root.length).split(path.sep).filter(Boolean);

  for (const component of ['', ...components]) {
    if (component) current = path.join(current, component);
    if (missing) continue;
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        missing = true;
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw pathError('directory path contains a symbolic-link ancestor', current);
    }
    if (!stat.isDirectory()) {
      throw pathError('directory path contains a non-directory ancestor', current);
    }
    nearestExisting = current;
  }

  if (nearestExisting === null) {
    throw pathError('directory path has no real existing ancestor', candidate);
  }
  const nearestReal = fs.realpathSync.native(nearestExisting);
  if (!samePath(nearestExisting, nearestReal)) {
    throw pathError('directory ancestor resolves outside its lexical path', nearestExisting);
  }

  if (boundary !== null) {
    const boundaryInspection = boundary === candidate
      ? { exists: !missing, nearestExisting }
      : inspectRealDirectoryPath(boundary, { allowMissing: false });
    if (!boundaryInspection.exists) {
      throw pathError('allowed directory boundary does not exist', boundary);
    }
    const boundaryReal = fs.realpathSync.native(boundary);
    if (!samePath(boundary, boundaryReal) || !isPathInside(boundaryReal, nearestReal)) {
      throw pathError('directory real path escapes its allowed boundary', candidate);
    }
  }

  const exists = !missing;
  if (!exists && !allowMissing) {
    throw pathError('directory does not exist', candidate);
  }
  return Object.freeze({
    path: candidate,
    exists,
    nearestExisting,
  });
}

function assertRealDirectory(directory, options = {}) {
  return inspectRealDirectoryPath(directory, {
    ...options,
    allowMissing: false,
  }).path;
}

function ensureWritableRealDirectory(directory, {
  within = null,
  mode = 0o700,
} = {}) {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
    throw new TypeError('directory mode must be an integer between 0000 and 0777');
  }
  const before = inspectRealDirectoryPath(directory, {
    allowMissing: true,
    within,
  });
  fs.accessSync(before.nearestExisting, fs.constants.W_OK | fs.constants.X_OK);
  fs.mkdirSync(before.path, { recursive: true, mode });
  const resolved = assertRealDirectory(before.path, { within });
  const stat = fs.lstatSync(resolved);
  if ((stat.mode & 0o1000) !== 0) {
    throw pathError('writable artifact directory must not have the sticky bit', resolved);
  }
  fs.accessSync(
    resolved,
    fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK,
  );
  return resolved;
}

module.exports = {
  assertRealDirectory,
  ensureWritableRealDirectory,
  inspectRealDirectoryPath,
  isPathInside,
  resolveWorkspacePath,
  samePath,
};
