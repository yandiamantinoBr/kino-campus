const fs = require('fs');
const path = require('path');

const SCRIPTS_ROOT = path.join(
  __dirname,
  '..',
  '..',
  'data',
  '.openclaw',
  'workspace',
  'scripts'
);

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  });
}

function resolvesLocally(importer, specifier) {
  const target = path.resolve(path.dirname(importer), specifier);
  const candidates = path.extname(target)
    ? [target]
    : [target, `${target}.js`, `${target}.json`, path.join(target, 'index.js')];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

describe('OpenClaw script mirror dependency closure', () => {
  test('every static relative require resolves inside the versioned mirror', () => {
    const missing = [];

    for (const file of listJavaScriptFiles(SCRIPTS_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      const relativeRequires = source.matchAll(/require\((['"])(\.[^'"]+)\1\)/g);

      for (const match of relativeRequires) {
        const specifier = match[2];
        if (!resolvesLocally(file, specifier)) {
          missing.push(
            `${path.relative(SCRIPTS_ROOT, file)} -> ${specifier}`
          );
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
