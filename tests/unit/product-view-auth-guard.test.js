'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCT_LOAD_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'assets',
  'js',
  'controllers',
  'public',
  'product.load.js',
);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return '';
  let depth = 0;
  let started = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      started = true;
    } else if (source[index] === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

function buildTracker(getUser, trackView) {
  const source = fs.readFileSync(PRODUCT_LOAD_PATH, 'utf8');
  const fnSource = extractFunction(source, 'trackProductViewOnce');
  if (!fnSource) throw new Error('trackProductViewOnce not found');

  // Evaluate the production helper with only its two closure dependencies.
  // eslint-disable-next-line no-new-func
  return new Function(
    '_deps',
    'window',
    `var _trackedViewIds = {}; ${fnSource}; return trackProductViewOnce;`,
  )({ getUser }, { KCAPI: { trackView } });
}

describe('product view tracking authentication boundary', () => {
  test('does not invoke the protected RPC for an anonymous product visitor', () => {
    const trackView = jest.fn(() => Promise.resolve({ ok: true }));
    const tracker = buildTracker(() => null, trackView);

    tracker({ uuid: 'post-1' }, 'legacy-1');

    expect(trackView).not.toHaveBeenCalled();
  });

  test('does not consume the once-key before viewer refresh authenticates', () => {
    let viewer = null;
    const trackView = jest.fn(() => Promise.resolve({ ok: true }));
    const tracker = buildTracker(() => viewer, trackView);

    tracker({ uuid: 'post-2' }, 'legacy-2');
    viewer = { id: 'user-1' };
    tracker({ uuid: 'post-2' }, 'legacy-2');
    tracker({ uuid: 'post-2' }, 'legacy-2');

    expect(trackView).toHaveBeenCalledTimes(1);
    expect(trackView).toHaveBeenCalledWith('post-2');
  });
});
