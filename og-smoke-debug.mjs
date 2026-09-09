import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const handlerPath = 'C:/Users/yan1n/Documents/DeepSeek/kino-campus/api/og-image.js';
const ogEntryUrl = pathToFileURL(require.resolve('@vercel/og')).href;
let source = fs.readFileSync(handlerPath, 'utf8');
source = source.replace(
  "from '@vercel/og'",
  "from " + JSON.stringify(ogEntryUrl)
);
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
try {
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
  console.log('status:', response.statusCode, '| ct:', headers['content-type'], '| bytes:', response.body && response.body.length);
} catch (e) {
  console.error('FALHA:', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exit(1);
}
