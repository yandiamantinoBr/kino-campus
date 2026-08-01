'use strict';

const fs = require('fs');
const path = require('path');

const FUNCTION_NAME_RE = /^[a-z0-9_-]+$/;
const RELATIVE_IMPORT_RE = [
  /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const IMPORT_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.json'];
const IMPORT_INDEX_FILES = ['mod.ts', 'index.ts', 'mod.js', 'index.js'];

function assertFunctionName(functionName) {
  if (!FUNCTION_NAME_RE.test(functionName || '')) {
    throw new Error(`Invalid Edge Function name: ${functionName || '<empty>'}`);
  }
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelativeImport(sourceFile, specifier, functionsRoot) {
  if (!specifier.startsWith('.')) return null;

  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  if (!isInside(functionsRoot, basePath)) {
    throw new Error(`Relative import escapes the Edge Functions root: ${specifier}`);
  }

  for (const extension of IMPORT_EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const filename of IMPORT_INDEX_FILES) {
      const candidate = path.join(basePath, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  throw new Error(`Downloaded source has an unresolved relative import: ${specifier}`);
}

function readRelativeImports(sourceFile, functionsRoot) {
  const source = fs.readFileSync(sourceFile, 'utf8');
  const imports = new Set();

  for (const pattern of RELATIVE_IMPORT_RE) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveRelativeImport(sourceFile, match[1], functionsRoot);
      if (resolved) imports.add(resolved);
    }
  }

  return [...imports].sort();
}

function collectReachableRemoteFiles(functionsRoot, entrypoint) {
  const pending = [entrypoint];
  const visited = new Set();

  while (pending.length > 0) {
    const sourceFile = pending.pop();
    if (visited.has(sourceFile)) continue;
    visited.add(sourceFile);

    const extension = path.extname(sourceFile).toLowerCase();
    if (['.ts', '.tsx', '.js', '.mjs'].includes(extension)) {
      for (const dependency of readRelativeImports(sourceFile, functionsRoot)) {
        if (!visited.has(dependency)) pending.push(dependency);
      }
    }
  }

  return [...visited].sort();
}

function compareEdgeFunctionSource({ localRoot, remoteRoot, functionName }) {
  assertFunctionName(functionName);

  const localFunctionsRoot = path.resolve(localRoot, 'supabase', 'functions');
  const remoteFunctionsRoot = path.resolve(remoteRoot, 'supabase', 'functions');
  const localEntrypoint = path.join(localFunctionsRoot, functionName, 'index.ts');
  const remoteEntrypoint = path.join(remoteFunctionsRoot, functionName, 'index.ts');

  if (!fs.existsSync(localEntrypoint) || !fs.statSync(localEntrypoint).isFile()) {
    throw new Error(`Local Edge Function entrypoint is missing: ${functionName}/index.ts`);
  }

  if (!fs.existsSync(remoteEntrypoint)) {
    return {
      function: functionName,
      drift: true,
      reason: 'remote_function_missing',
      differences: [{ path: `${functionName}/index.ts`, kind: 'remote_missing' }],
    };
  }

  const remoteFiles = collectReachableRemoteFiles(
    remoteFunctionsRoot,
    remoteEntrypoint
  );
  const differences = [];

  for (const remoteFile of remoteFiles) {
    const relativePath = path.relative(remoteFunctionsRoot, remoteFile);
    const localFile = path.join(localFunctionsRoot, relativePath);

    if (!isInside(localFunctionsRoot, localFile)) {
      throw new Error(`Resolved local source escapes the Edge Functions root: ${relativePath}`);
    }
    if (!fs.existsSync(localFile) || !fs.statSync(localFile).isFile()) {
      differences.push({ path: relativePath.replace(/\\/g, '/'), kind: 'local_missing' });
      continue;
    }

    const remoteContent = fs.readFileSync(remoteFile);
    const localContent = fs.readFileSync(localFile);
    if (!remoteContent.equals(localContent)) {
      differences.push({ path: relativePath.replace(/\\/g, '/'), kind: 'content_mismatch' });
    }
  }

  return {
    function: functionName,
    drift: differences.length > 0,
    reason: differences.length > 0 ? 'source_mismatch' : 'source_equal',
    compared_files: remoteFiles.length,
    differences,
  };
}

function parseArguments(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      options.check = true;
      continue;
    }
    if (!['--local-root', '--remote-root', '--function'].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }

  for (const required of ['localRoot', 'remoteRoot', 'function']) {
    if (!options[required]) throw new Error(`Missing required argument: --${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return options;
}

function runCli(argv) {
  const options = parseArguments(argv);
  const result = compareEdgeFunctionSource({
    localRoot: options.localRoot,
    remoteRoot: options.remoteRoot,
    functionName: options.function,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return options.check && result.drift ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Edge source comparison failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  assertFunctionName,
  collectReachableRemoteFiles,
  compareEdgeFunctionSource,
  parseArguments,
  readRelativeImports,
  runCli,
};
