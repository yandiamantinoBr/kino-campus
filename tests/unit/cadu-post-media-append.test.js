'use strict';

const {
  appendPostMediaIfAbsent,
  buildCanonicalGalleryImageUrls,
} = require('../../data/.openclaw/workspace/scripts/post-media-append');

describe('Cadu append-only post_media writer', () => {
  test('uses one conflict-safe upsert and preserves the database uniqueness key', async () => {
    const select = jest.fn().mockResolvedValue({
      data: [{ id: 'media-1', url: 'https://example.test/a.jpg', is_cover: false, sort_order: 0 }],
      error: null,
    });
    const upsert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ upsert }));

    const result = await appendPostMediaIfAbsent(
      { from },
      'post-1',
      ['https://example.test/a.jpg', 'https://example.test/a.jpg'],
    );

    expect(from).toHaveBeenCalledWith('post_media');
    expect(upsert).toHaveBeenCalledWith(
      [{ post_id: 'post-1', url: 'https://example.test/a.jpg', is_cover: false }],
      { onConflict: 'post_id,url', ignoreDuplicates: true },
    );
    expect(result).toMatchObject({ attempted: 1, inserted: [{ id: 'media-1' }] });
  });

  test('an empty append performs no database request', async () => {
    const from = jest.fn();
    await expect(appendPostMediaIfAbsent({ from }, 'post-1', [])).resolves.toEqual({
      attempted: 0,
      inserted: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  test('canonical gallery mirrors ordered database rows without repeating the cover', () => {
    expect(buildCanonicalGalleryImageUrls(
      'https://example.test/cover.jpg',
      [
        { url: 'https://example.test/cover.jpg' },
        { url: 'https://example.test/second.jpg' },
        { url: 'https://example.test/third.jpg' },
      ],
      3,
    )).toEqual([
      'https://example.test/second.jpg',
      'https://example.test/third.jpg',
    ]);
  });
});
