'use strict';
// Replica exatamente o smoke de tests/integration/og-image-runtime.test.js
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const ROOT = 'C:/Users/yan1n/Documents/DeepSeek/kino-campus';
const handlerPath = path.resolve(ROOT, 'api/og-image.js');
const smokeSource = `
  import fs from 'node:fs';
  import { createRequire } from 'node:module';
  import { pathToFileURL } from 'node:url';
  const require = createRequire(import.meta.url);
  const handlerPath = ${JSON.stringify(handlerPath)};
  const ogEntryUrl = pathToFileURL(require.resolve('@vercel/og')).href;
  let source = fs.readFileSync(handlerPath, 'utf8');
  source = source.replace(
    "from '@vercel/og'",
    "from " + JSON.stringify(ogEntryUrl)
  );
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { default: handler } = await import(moduleUrl);
  globalThis.fetch = async () => ({ text: async () => '' });
  const headers = {};
  const response = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler(
    { url: '/api/og-image?type=ajuda', headers: { host: 'www.kinocampus.com.br' } },
    response
  );
  console.log('SMOKE_OK status=' + response.statusCode + ' bytes=' + (response.body && response.body.length));
`;
const smoke = spawnSync(process.execPath, ['--input-type=module', '--eval', smokeSource], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 30000,
});
console.log('status:', smoke.status);
if (smoke.stderr) console.log('stderr (primeiras 12 linhas):\n' + smoke.stderr.split('\n').slice(0, 12).join('\n'));
if (smoke.stdout) console.log('stdout:\n' + smoke.stdout.slice(0, 500));
