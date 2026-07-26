'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertRealDirectory } = require('./safe-directory.js');

function fsyncParentDirectory(directory) {
  const resolved = assertRealDirectory(directory);
  // Windows does not expose portable directory handles through fs.openSync.
  // Production runs on Linux, where fsyncing the parent makes the rename
  // durable instead of only making the temporary file durable.
  if (process.platform === 'win32') return;
  let descriptor = null;
  try {
    descriptor = fs.openSync(
      resolved,
      fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0),
    );
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch (_) {}
    }
  }
}

function writeJsonAtomic(filePath, value, { space = 2, newline = false, mode = 0o600 } = {}) {
  const target = path.resolve(String(filePath || ''));
  const directory = path.dirname(target);
  assertRealDirectory(directory);

  const json = JSON.stringify(value, null, space);
  if (json === undefined) throw new TypeError('atomic JSON value is not serializable');
  const payload = newline ? `${json}\n` : json;
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let descriptor = null;
  let renamed = false;

  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_WRONLY
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW || 0),
      mode,
    );
    fs.writeFileSync(descriptor, payload, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    // Revalidate every ancestor immediately before publishing the temp file.
    // This catches a directory/junction replacement that happened while the
    // payload was being serialized and synced.
    assertRealDirectory(directory);
    fs.renameSync(temporary, target);
    renamed = true;

    const finalStat = fs.lstatSync(target);
    if (!finalStat.isFile() || finalStat.isSymbolicLink() || finalStat.nlink !== 1) {
      throw new Error(`atomic JSON target is not a single-link regular file: ${target}`);
    }
    fsyncParentDirectory(directory);
    return target;
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch (_) {}
    }
    if (!renamed) {
      try { fs.unlinkSync(temporary); } catch (_) {}
    }
  }
}

module.exports = { fsyncParentDirectory, writeJsonAtomic };
