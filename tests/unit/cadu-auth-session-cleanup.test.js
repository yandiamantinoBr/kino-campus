'use strict';

const fs = require('fs');
const path = require('path');
const {
  signOutCurrentSession,
} = require('../../data/.openclaw/workspace/scripts/auth-retry');

describe('Cadu ephemeral Auth session cleanup', () => {
  test('terminates only the current session and never logs out concurrent runs', async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    await expect(signOutCurrentSession({ auth: { signOut } })).resolves.toEqual({ ok: true });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('all password-grant pipeline scripts clean up in finally', () => {
    const scripts = path.resolve(__dirname, '..', '..', 'data', '.openclaw', 'workspace', 'scripts');
    for (const file of ['publish_auto_v5.js', 'enrich-duplicates.js', 'enrich-images.js', 'dedup-kino.js']) {
      const source = fs.readFileSync(path.join(scripts, file), 'utf8');
      expect(source).toContain('signOutCurrentSession(activeAuthClient');
    }
  });

  test('source identity cache also suppresses already moderated canonicals', () => {
    const source = fs.readFileSync(path.resolve(
      __dirname,
      '..',
      '..',
      'data',
      '.openclaw',
      'workspace',
      'scripts',
      'pipeline-kino.js',
    ), 'utf8');
    expect(source).toContain('status=in.(published,hidden,closed)');
    expect(source).not.toContain('status=eq.published&order=id.asc');
  });
});
