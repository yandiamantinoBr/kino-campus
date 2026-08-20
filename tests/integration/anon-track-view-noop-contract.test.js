'use strict';

const fs = require('fs');
const path = require('path');

const MIGRATION = path.resolve(
  __dirname,
  '../../supabase/migrations/20260820011214_allow_anon_track_view_noop.sql',
);

describe('anonymous kc_track_view boundary', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION, 'utf8');
  });

  test('grants only the public wrapper to anon', () => {
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.kc_track_view\(uuid\)\s+to\s+anon\s*;/i,
    );
    expect(sql).not.toMatch(/kc_private\.kc_track_view[\s\S]*to\s+anon/i);
    expect(sql).not.toMatch(/grant\s+select\s+on\s+table/i);
    expect(sql).not.toMatch(/security\s+definer/i);
  });

  test('documents the fail-closed AUTH_REQUIRED behavior', () => {
    expect(sql).toContain("{ok:false,code:'AUTH_REQUIRED'}");
    expect(sql).toContain('no table privileges are added');
  });
});
