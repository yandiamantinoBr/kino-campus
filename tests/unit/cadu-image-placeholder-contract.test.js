'use strict';

const path = require('path');

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}), { virtual: true });

const scriptsDir = path.resolve(
  __dirname,
  '../../data/.openclaw/workspace/scripts',
);
const {
  isKnownPlaceholderImageUrl,
  normalizeImageUrl,
} = require(path.join(scriptsDir, 'lib/image-utils.js'));
const { resolveBestImage } = require(path.join(
  scriptsDir,
  'lib/image-source-resolver.js',
));
const curator = require(path.join(scriptsDir, 'cadu-curador-v4.4.js'));
const { normalizedFormatterMedia } = require(path.join(
  scriptsDir,
  'formatador-ia.js',
));
const publisher = require(path.join(scriptsDir, 'publish_auto_v5.js'));
const { extractContentImages } = require(path.join(
  scriptsDir,
  'enrich-images.js',
));

const placeholder =
  'https://files.cercomp.ufg.br/weby/up/1/i/IconeX.png?1746546951';
const normalizedPlaceholder =
  'https://files.cercomp.ufg.br/weby/up/1/o/IconeX.png?1746546951';
const realImage =
  'https://files.cercomp.ufg.br/weby/up/269/o/banner-evento-2026.jpg';
const quietLogger = { log() {}, warn() {}, error() {} };

function publicationRecord(images) {
  return {
    module: 'eventos',
    title: 'Evento academico futuro',
    formattedDescription:
      'Descricao formatada com contexto institucional suficiente para uma publicacao segura e completa no KinoCampus.',
    dates: {
      eventStartsAt: '2099-08-13',
      eventEndsAt: '2099-08-13',
      futureDates: ['2099-08-13'],
    },
    images,
  };
}

describe('Cadu image-placeholder contract', () => {
  test('rejects the Weby social placeholder before every publish stage', () => {
    expect(isKnownPlaceholderImageUrl(placeholder)).toBe(true);
    expect(isKnownPlaceholderImageUrl(normalizedPlaceholder)).toBe(true);
    expect(isKnownPlaceholderImageUrl(realImage)).toBe(false);
    expect(normalizeImageUrl(placeholder)).toBe('');

    const event = curator.parseEventItem({
      id: 40001,
      name: 'Evento com imagem generica do Weby',
      information: '<p>Programacao futura.</p>',
      begin_at: '2099-08-13T09:00:00-03:00',
      image: placeholder,
    }, 'ufg', 'https://ufg.br');
    expect(event.image).toBe('');
    expect(event.images).toEqual([]);

    expect(normalizedFormatterMedia({
      image: placeholder,
      images: [normalizedPlaceholder, realImage],
    }).images).toEqual([realImage]);

    expect(
      publisher.normalizeImages(publicationRecord([placeholder, realImage])),
    ).toEqual([realImage]);
    expect(
      publisher.recordToItem(publicationRecord([placeholder, realImage])),
    ).toEqual(expect.objectContaining({
      image: realImage,
      images: [realImage],
    }));

    const html = [
      '<main>',
      `<img src="${placeholder}">`,
      `<img src="${realImage}">`,
      '</main>',
    ].join('');
    expect(
      extractContentImages(html, 'https://ufg.br/n/200001'),
    ).toEqual([realImage]);
  });

  test('resolver rejects placeholders without I/O and honors minBytes', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn(async () => {
        throw new Error('placeholder must not reach the network');
      });
      const rejected = await resolveBestImage({
        image: placeholder,
        images: [],
      }, { logger: quietLogger });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(rejected.url).toBe('');
      expect(rejected.candidates[0].reason).toBe('known_placeholder');

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get(name) {
            const key = String(name).toLowerCase();
            if (key === 'content-length') return '10000';
            if (key === 'content-type') return 'image/jpeg';
            return null;
          },
        },
      }));
      const tooSmall = await resolveBestImage({
        image: realImage,
        images: [],
      }, { minBytes: 20000, logger: quietLogger });
      expect(tooSmall.url).toBe('');
      expect(tooSmall.candidates[0].reason).toBe('too_small');

      const accepted = await resolveBestImage({
        image: realImage,
        images: [],
      }, { minBytes: 5000, logger: quietLogger });
      expect(accepted.url).toBe(realImage);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
