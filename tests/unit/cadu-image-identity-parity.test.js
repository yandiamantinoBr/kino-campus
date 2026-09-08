'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const service = require('../../services/cadu-ufg-publisher/src/lib/image-signature');
const edgePath = path.resolve(__dirname, '../../supabase/functions/cadu-publish/image-signature.ts');
const edge = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(edgePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: edge.exports, URL, URLSearchParams });

const host = 'https://events.example';
const ig = 'https://scontent.xx.fbcdn.net/v/t51.2885-15/123456_654321_987654_n.jpg';
const distinct = [
  [`${host}/image?id=2026`, `${host}/image?id=2027`],
  [`${host}/cadu-1-abcd1234.jpg`, `${host}/cadu-1-abcd1234.png`],
  [`${host}/2026/cartaz.png`, `${host}/2027/cartaz.png`],
  [`${host}/abcd1234_cartaz.jpg`, `${host}/deadbeef_cartaz.jpg`],
  [`${host}/A.jpg`, `${host}/a.jpg`],
  [`${host}/i/cartaz.jpg`, `${host}/o/cartaz.jpg`],
  [`${host}/weby/up/1/l/a.jpg`, `${host}/weby/up/1/o/a.jpg`],
  ['https://ufg.br/weby/up/1/o/a.jpg', 'https://ufg.br/weby/up/2/o/a.jpg'],
  [`${host}/a%2Fb.png`, `${host}/a/b.png`],
  [`${host}/${'a'.repeat(250)}1.png`, `${host}/${'a'.repeat(250)}2.png`],
  [`${ig}?stp=c0.0.500.500a_dst-jpg`, `${ig}?stp=c500.0.500.500a_dst-jpg`],
  [`${ig}?edition=2026`, `${ig}?edition=2027`],
  [ig, ig.replace('_987654_', '_987655_')],
];
const equivalent = [
  ['https://files.cercomp.ufg.br/weby/up/313/o/Cartaz.png', 'https://files.cercomp.ufg.br/weby/up/313/l/Cartaz.png'],
  [ig + '?oh=old&oe=123', ig.replace('scontent.xx.fbcdn.net', 'scontent.cdninstagram.com') + '?oh=new&oe=456'],
  [ig, ig + '?stp=dst-jpg_e35_s1080x1080'],
];

beforeAll(() => {
  require('../../assets/js/utils/kc-utils.presentation.js');
  require('../../assets/js/api/kc-api.posts-normalize.js');
});

test.each(distinct)('preserves distinct assets across service, Edge, cards and normalized gallery: %s', (a, b) => {
  for (const signature of [service.imageUrlSignature, edge.exports.imageUrlSignature, window._KCU.presentation.imageSignature]) {
    expect(signature(a)).not.toBe(signature(b));
  }
  expect(service.dedupeImageUrls([a, b])).toEqual([a, b]);
  expect(edge.exports.dedupeImageUrls([a, b])).toEqual([a, b]);
  const post = window._KCAPI.postsNormalize.normalizePost({ images: [a, b] });
  expect(post.imagens).toEqual([a, b]);
});

test.each(equivalent)('collapses only reviewed delivery variants across all surfaces: %s', (a, b) => {
  const signatures = [service.imageUrlSignature, edge.exports.imageUrlSignature, window._KCU.presentation.imageSignature];
  for (const signature of signatures) expect(signature(a)).toBe(signature(b));
  expect(signatures.map(fn => fn(a))).toEqual(Array(3).fill(service.imageUrlSignature(a)));
  expect(window._KCAPI.postsNormalize.normalizePost({ images: [a, b] }).imagens).toEqual([a]);
});
