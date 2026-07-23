'use strict';
const crypto = require('crypto');
const d = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const candidates = [
  '540208497',
  "'540208497'",
  'properties/540208497',
  'sc-domain:kinocampus.com.br',
  'https://www.kinocampus.com.br/',
  'https://kinocampus.com.br/',
  'https://www.kinocampus.com.br',
  'sc-domain:www.kinocampus.com.br',
];
const targets = {
  KC_GA4_PROPERTY_ID: '5ab9f44ea6b96244adeb3504fea963cb60848c2423eedd80443e9fde2382749f',
  KC_SEARCH_CONSOLE_SITE_URL: 'd4d272ea392c18443d99d538b567ab5924651ee978f1679c45eba12f667a8b6a',
};
for (const c of candidates) {
  const digest = d(c);
  for (const [name, target] of Object.entries(targets)) {
    if (digest === target) console.log('MATCH', name, '<=', JSON.stringify(c));
  }
}
console.log('done');
