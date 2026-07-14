'use strict';

const fs = require('fs');
const path = require('path');

const PUBLIC_DIRECTORIES = Object.freeze(['admin', 'assets']);
const PUBLIC_DATA_FILES = Object.freeze(['data/database.json']);
const PUBLIC_ROOT_FILES = Object.freeze([
  'ads.txt',
  'llms.txt',
  'robots.txt',
  'sw.js',
]);
const REQUIRED_OUTPUTS = Object.freeze([
  'index.html',
  '_product.html',
  'admin/index.html',
  'assets/js/boot/kc-env.js',
  'data/database.json',
  'robots.txt',
  'sw.js',
]);

function assertInsideRoot(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe static output path: ${target}`);
  }
}

function copyPath(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Required public path is missing: ${source}`);
  const stats = fs.lstatSync(source);
  if (stats.isSymbolicLink()) throw new Error(`Symlinks are not allowed in static output: ${source}`);
  fs.cpSync(source, target, {
    recursive: stats.isDirectory(),
    errorOnExist: false,
    force: true,
    filter(entry) {
      return !fs.lstatSync(entry).isSymbolicLink() && !entry.toLowerCase().endsWith('.md');
    },
  });
}

function buildStaticOutput(options) {
  const sourceRoot = path.resolve(options && options.sourceRoot ? options.sourceRoot : path.join(__dirname, '..'));
  const outputRoot = path.resolve(options && options.outputRoot ? options.outputRoot : path.join(sourceRoot, 'dist'));
  assertInsideRoot(sourceRoot, outputRoot);

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const rootHtmlFiles = fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name)
    .sort();

  for (const name of [...rootHtmlFiles, ...PUBLIC_ROOT_FILES]) {
    copyPath(path.join(sourceRoot, name), path.join(outputRoot, name));
  }
  for (const name of PUBLIC_DIRECTORIES) {
    copyPath(path.join(sourceRoot, name), path.join(outputRoot, name));
  }
  for (const name of PUBLIC_DATA_FILES) {
    copyPath(path.join(sourceRoot, name), path.join(outputRoot, name));
  }

  for (const relativePath of REQUIRED_OUTPUTS) {
    if (!fs.existsSync(path.join(outputRoot, relativePath))) {
      throw new Error(`Static output contract is incomplete: ${relativePath}`);
    }
  }

  return Object.freeze({
    outputRoot,
    rootFiles: rootHtmlFiles.length + PUBLIC_ROOT_FILES.length,
    directories: PUBLIC_DIRECTORIES.length,
  });
}

if (require.main === module) {
  const result = buildStaticOutput();
  console.log(`Static output ready: ${result.rootFiles} root files and ${result.directories} public directories.`);
}

module.exports = Object.freeze({
  PUBLIC_DIRECTORIES,
  PUBLIC_DATA_FILES,
  PUBLIC_ROOT_FILES,
  REQUIRED_OUTPUTS,
  buildStaticOutput,
});
