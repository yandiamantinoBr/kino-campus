/** @jest-environment node */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const sharp = require('sharp');

describe('dynamic OG image runtime', () => {
  test('keeps the security-patched sharp runtime capable of producing PNG', async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 255, g: 107, b: 0, alpha: 1 },
      },
    }).png().toBuffer();

    expect(sharp.versions.sharp).toBe('0.35.0');
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  test('renders the real OG handler response as a non-empty PNG', async () => {
    const handlerPath = path.resolve(__dirname, '../../api/og-image.js');
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
      const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (
        response.statusCode !== 200 ||
        headers['content-type'] !== 'image/png' ||
        !String(headers['cache-control'] || '').includes('stale-while-revalidate') ||
        !Buffer.isBuffer(response.body) ||
        response.body.length <= 10000 ||
        !response.body.subarray(0, 8).equals(signature)
      ) {
        throw new Error('OG_IMAGE_RUNTIME_SMOKE_FAILED');
      }
    `;
    const smoke = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', smokeSource],
      {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 30_000,
      }
    );

    expect(smoke.error).toBeUndefined();
    expect(smoke.status).toBe(0);
  });
});
