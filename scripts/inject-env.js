/**
 * inject-env.js — Kino Campus Build Script v2
 *
 * Executado pelo Vercel antes de servir os arquivos estáticos.
 * Injeta as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY
 * no arquivo kc-env.js, substituindo os placeholders por valores reais.
 * Também ativa o driver 'supabase' em produção.
 *
 * Compatível com:
 *   - Variáveis adicionadas manualmente no Vercel
 *   - Variáveis criadas pela integração oficial Vercel-Supabase
 *   - Variáveis com prefixo NEXT_PUBLIC_ (projetos Next.js)
 *
 * Uso local (teste):
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/inject-env.js
 */

const fs   = require('fs');
const path = require('path');

// ── Resolução de variáveis (tenta vários nomes alternativos) ──────────────
// A integração oficial Vercel-Supabase pode usar nomes ligeiramente diferentes
function resolveEnv(candidates) {
  for (const name of candidates) {
    const val = process.env[name];
    if (val && val.trim() !== '') return val.trim();
  }
  return '';
}

const SUPABASE_URL = resolveEnv([
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'REACT_APP_SUPABASE_URL',
]);

const SUPABASE_ANON_KEY = resolveEnv([
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'REACT_APP_SUPABASE_ANON_KEY',
]);

// ── Validação ───────────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('');
  console.error('❌ inject-env.js: SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
  console.error('');
  console.error('   Variáveis verificadas (todas estão ausentes ou vazias):');
  console.error('   SUPABASE_URL            =', process.env.SUPABASE_URL            || '(vazio)');
  console.error('   NEXT_PUBLIC_SUPABASE_URL =', process.env.NEXT_PUBLIC_SUPABASE_URL || '(vazio)');
  console.error('   SUPABASE_ANON_KEY        =', process.env.SUPABASE_ANON_KEY        || '(vazio)');
  console.error('');
  console.error('   Como corrigir:');
  console.error('   1. Configure as variáveis obrigatórias SUPABASE_URL e SUPABASE_ANON_KEY.');
  console.error('   2. Defina essas variáveis no provedor de CI/deploy usado pelo projeto.');
  console.error('   3. Após salvar, execute um novo deploy/redeploy para aplicar os valores.');
  console.error('');
  process.exit(1);
}

if (!SUPABASE_URL.startsWith('https://')) {
  console.error('❌ inject-env.js: SUPABASE_URL deve começar com https://');
  console.error('   Valor atual:', SUPABASE_URL);
  process.exit(1);
}

if (!SUPABASE_ANON_KEY.startsWith('eyJ')) {
  console.error('❌ inject-env.js: SUPABASE_ANON_KEY parece inválida (deve começar com eyJ).');
  console.error('   Verifique se copiou a "anon public key" correta do Supabase Settings → API.');
  process.exit(1);
}

// ── Localização do kc-env.js ────────────────────────────────────────────────
// Tenta vários caminhos possíveis dependendo da estrutura do repositório
const POSSIBLE_PATHS = [
  path.join(__dirname, '..', 'kc-env.js'),           // raiz do repo (padrão Kino Campus)
  path.join(__dirname, '..', 'assets', 'js', 'kc-env.js'),
  path.join(__dirname, '..', 'js', 'kc-env.js'),
  path.join(__dirname, '..', 'src', 'kc-env.js'),
];

let ENV_FILE = null;
for (const p of POSSIBLE_PATHS) {
  if (fs.existsSync(p)) {
    ENV_FILE = p;
    break;
  }
}

if (!ENV_FILE) {
  console.error('❌ inject-env.js: kc-env.js não encontrado.');
  console.error('   Procurei em:');
  POSSIBLE_PATHS.forEach(p => console.error('   -', p));
  console.error('   Verifique se o arquivo kc-env.js existe no repositório.');
  process.exit(1);
}

console.log('📁 inject-env.js: kc-env.js encontrado em:', ENV_FILE);

// ── Leitura ─────────────────────────────────────────────────────────────────
let content  = fs.readFileSync(ENV_FILE, 'utf8');
const original = content;

// ── Substituições ────────────────────────────────────────────────────────────

const REQUIRED_PLACEHOLDERS = [
  '__KC_SUPABASE_URL__',
  '__KC_SUPABASE_ANON_KEY__',
  '__KC_DRIVER__',
];

const missingPlaceholders = REQUIRED_PLACEHOLDERS.filter(token => !content.includes(token));
if (missingPlaceholders.length > 0) {
  console.error('❌ inject-env.js: placeholder não encontrado no kc-env.js.');
  missingPlaceholders.forEach(token => console.error('   -', token));
  console.error('   Abortei para evitar injeção parcial silenciosa.');
  process.exit(1);
}

const REPLACEMENTS = {
  __KC_SUPABASE_URL__: SUPABASE_URL,
  __KC_SUPABASE_ANON_KEY__: SUPABASE_ANON_KEY,
  __KC_DRIVER__: 'supabase',
};

for (const [token, value] of Object.entries(REPLACEMENTS)) {
  content = content.split(token).join(value);
}

// 5) Adicionar 'egresso.ufg.br' à allowlist de domínios (frontend)
//    O kc-auth.ui.js verifica AUTH_ALLOWED_DOMAINS ANTES de enviar ao Supabase.
//    Sem isso, e-mails @egresso.ufg.br são bloqueados no frontend.
if (!content.includes('egresso.ufg.br')) {
  // Padrão: AUTH_ALLOWED_DOMAINS: ['ufg.br', 'discente.ufg.br']
  content = content.replace(
    /(AUTH_ALLOWED_DOMAINS\s*:\s*\[)([^\]]*)\]/g,
    (match, prefix, items) => {
      const trimmed = items.trim();
      if (trimmed.includes('egresso.ufg.br')) return match;
      const newItems = trimmed ? `${trimmed}, 'egresso.ufg.br'` : `'egresso.ufg.br'`;
      return `${prefix}${newItems}]`;
    }
  );
  // Padrão: allowedEmailDomains: ['ufg.br', 'discente.ufg.br']
  content = content.replace(
    /(allowedEmailDomains\s*:\s*\[)([^\]]*)\]/g,
    (match, prefix, items) => {
      const trimmed = items.trim();
      if (trimmed.includes('egresso.ufg.br')) return match;
      const newItems = trimmed ? `${trimmed}, 'egresso.ufg.br'` : `'egresso.ufg.br'`;
      return `${prefix}${newItems}]`;
    }
  );
}

// ── Verificação ──────────────────────────────────────────────────────────────
const urlInjected   = content.includes(SUPABASE_URL);
const keyInjected   = content.includes(SUPABASE_ANON_KEY);
const stillHasDriverPlaceholder = content.includes('__KC_DRIVER__');
const hasEgresso    = content.includes('egresso.ufg.br');

if (!urlInjected) {
  console.error('❌ inject-env.js: SUPABASE_URL não foi injetada no kc-env.js.');
  console.error('   Verifique se o arquivo tem uma linha com uma URL supabase.co para substituir.');
  process.exit(1);
}

if (!keyInjected) {
  console.error('❌ inject-env.js: SUPABASE_ANON_KEY não foi injetada no kc-env.js.');
  console.error('   Verifique se o arquivo tem uma linha com uma chave eyJ... para substituir.');
  process.exit(1);
}

// ── Escrita ──────────────────────────────────────────────────────────────────
if (content === original) {
  console.warn('⚠️  inject-env.js: nenhuma alteração detectada no kc-env.js.');
  console.warn('   Pode ser que os placeholders já tenham sido substituídos antes.');
} else {
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

// ── Relatório ────────────────────────────────────────────────────────────────
console.log('');
console.log('✅ inject-env.js: kc-env.js atualizado com sucesso!');
console.log('   SUPABASE_URL      →', SUPABASE_URL);
console.log('   SUPABASE_ANON_KEY →', SUPABASE_ANON_KEY.substring(0, 20) + '...');
console.log('   driver            →', stillHasDriverPlaceholder ? '⚠️  placeholder __KC_DRIVER__ ainda presente' : '✅ supabase');
console.log('   egresso.ufg.br    →', hasEgresso ? '✅ adicionado à allowlist' : '⚠️  não encontrado na allowlist');
console.log('   Arquivo           →', ENV_FILE);
console.log('');
