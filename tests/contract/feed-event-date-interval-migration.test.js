const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260808152842_feed_event_interval_filters_20260808.sql'), 'utf8');
const proof = fs.readFileSync(path.join(ROOT, 'tests/sql/feed-event-date-interval-proof.sql'), 'utf8');

describe('feed event interval migration', () => {
  test('remove fallback de created_at e usa sobreposição inclusiva', () => {
    expect(migration).toContain('return null;');
    expect(migration).toContain('v_event_start <= v_today and v_event_end >= v_today');
    expect(migration).toContain('v_event_start <= (v_today + 6) and v_event_end >= v_today');
    expect(migration).toContain("v_preset = 'thismonth'");
    expect(migration).toContain('v_event_end < v_today');
  });

  test('inclui prova SQL para intervalos, data ausente e data inválida', () => {
    expect(proof).toContain('ongoing event must match today');
    expect(proof).toContain('undated event must not inherit created_at');
    expect(proof).toContain('invalid civil date must not match');
  });
});
