'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'scripts', 'grant-admin.js'),
  'utf8',
);

describe('grant-admin Auth boundary', () => {
  test('uses Auth Admin identity resolution without treating sb_secret as a JWT', () => {
    expect(source).toContain('auth.admin.getUserById');
    expect(source).toContain('auth.admin.listUsers');
    expect(source).not.toContain('Authorization: `Bearer ${SVC}`');
    expect(source).not.toContain('rows[0].id');
  });

  test('requires e-mail confirmation, exact identity and runtime admin verification', () => {
    expect(source).toContain('matches.length !== 1');
    expect(source).toContain('user.email_confirmed_at');
    expect(source).toContain("supabase.rpc('kc_is_admin'");
    expect(source).toContain('isAdmin !== true');
  });
});
