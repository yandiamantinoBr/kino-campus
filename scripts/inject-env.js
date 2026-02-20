/**
 * inject-env.js — Kino Campus Build Script
 *
 * Executado pelo Vercel antes de servir os arquivos estáticos.
 * Injeta as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY
 * no arquivo kc-env.js, substituindo os placeholders por valores reais.
 * Também ativa o driver 'supabase' em produção.
 *
 * Uso local (teste):
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/inject-env.js
 */

const fs = require('fs');
const path = require('path');

// ── Configuração ────────────────────────────────────────────
const ENV_FILE = path.join(__dirname, '..', 'assets', 'js', 'kc-env.js');

const SUPABASE_URL      = process.env.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// ── Validação ───────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ inject-env.js: SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
  console.error('   No Vercel: Settings → Environment Variables → adicione as duas vars.');
  process.exit(1);
}

if (!SUPABASE_URL.startsWith('https://')) {
  console.error('❌ inject-env.js: SUPABASE_URL deve começar com https://');
  process.exit(1);
}

if (!SUPABASE_ANON_KEY.startsWith('eyJ')) {
  console.error('❌ inject-env.js: SUPABASE_ANON_KEY parece inválida (deve começar com eyJ).');
  process.exit(1);
}

// ── Leitura ─────────────────────────────────────────────────
if (!fs.existsSync(ENV_FILE)) {
  console.error(`❌ inject-env.js: arquivo não encontrado: ${ENV_FILE}`);
  process.exit(1);
}

let content = fs.readFileSync(ENV_FILE, 'utf8');
const original = content;

// ── Substituições ────────────────────────────────────────────

// 1) URL do Supabase (suporta qualquer placeholder que contenha "placeholder" ou "supabase.co")
content = content.replace(
  /(['"`])https:\/\/[a-zA-Z0-9-]+\.supabase\.co\1/g,
  `'${SUPABASE_URL}'`
);

// 2) Anon Key do Supabase (substitui qualquer string que comece com eyJ seguida de ...placeholder ou outra)
content = content.replace(
  /(['"`])eyJ[a-zA-Z0-9._-]*(?:placeholder|PLACEHOLDER)[a-zA-Z0-9._-]*\1/g,
  `'${SUPABASE_ANON_KEY}'`
);

// 3) Fallback genérico para anon key (qualquer 'eyJ...' longa que não seja a real)
//    Só substitui se a substituição anterior não pegou
if (content.includes(SUPABASE_ANON_KEY)) {
  // já foi substituída corretamente
} else {
  content = content.replace(
    /(['"`])(eyJ[a-zA-Z0-9._\-+/=]{20,})\1/g,
    (match, quote, key) => {
      if (key === SUPABASE_ANON_KEY) return match; // não substituir a chave real
      return `'${SUPABASE_ANON_KEY}'`;
    }
  );
}

// 4) Ativar driver 'supabase' em produção
//    Substitui driver: 'local' → driver: 'supabase'
content = content.replace(
  /(\bdriver\s*:\s*)(['"`])local\2/g,
  `$1'supabase'`
);

// Também cobre o padrão com DATA_DRIVER ou window.KC_ENV
content = content.replace(
  /(\bDATA_DRIVER\s*=\s*)(['"`])local\2/g,
  `$1'supabase'`
);

// ── Verificação ──────────────────────────────────────────────
const urlInjected     = content.includes(SUPABASE_URL);
const keyInjected     = content.includes(SUPABASE_ANON_KEY);
const driverChanged   = content.includes("'supabase'") || content.includes('"supabase"');
const stillHasLocal   = /driver\s*:\s*['"`]local['"`]/.test(content);

if (!urlInjected) {
  console.error('❌ inject-env.js: SUPABASE_URL não foi injetada. Verifique o formato do kc-env.js.');
  process.exit(1);
}

if (!keyInjected) {
  console.error('❌ inject-env.js: SUPABASE_ANON_KEY não foi injetada. Verifique o formato do kc-env.js.');
  process.exit(1);
}

// ── Escrita ──────────────────────────────────────────────────
if (content === original) {
  console.warn('⚠️  inject-env.js: nenhuma alteração foi feita no arquivo. Verifique os placeholders.');
} else {
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

// ── Relatório ────────────────────────────────────────────────
console.log('✅ inject-env.js: kc-env.js atualizado com sucesso.');
console.log(`   SUPABASE_URL      → ${SUPABASE_URL}`);
console.log(`   SUPABASE_ANON_KEY → ${SUPABASE_ANON_KEY.substring(0, 20)}...`);
console.log(`   driver            → ${stillHasLocal ? '⚠️ ainda local (verifique manualmente)' : '✅ supabase'}`);
console.log('   Pronto para deploy!');
