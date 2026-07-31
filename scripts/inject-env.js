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
 *   - Variáveis com prefixo KC_ (padrão documentado em .env.example)
 *   - Variáveis com prefixo NEXT_PUBLIC_ (projetos Next.js)
 *
 * Uso local (teste):
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/inject-env.js
 */

const fs   = require('fs');
const path = require('path');
const {
  resolveBuildRevision,
  applyStaticCacheRevision,
} = require('./static-cache-revision');

// ── Contexto de execução (CI vs local) ─────────────────────────────────────
const isCI = (
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  process.env.GITHUB_ACTIONS === 'true' ||
  process.env.GITLAB_CI === 'true' ||
  process.env.BUILD_ID ||
  process.env.VERCEL === '1'
);

const isLocalExecution = !isCI || process.stdout.isTTY;

if (isLocalExecution && process.env.KC_ALLOW_LOCAL_INJECT !== '1') {
  console.error('❌ Execução local bloqueada. Use conscientemente: KC_ALLOW_LOCAL_INJECT=1 node scripts/inject-env.js');
  process.exit(1);
}

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
  'KC_SUPABASE_URL',              // prefixo documentado no .env.example
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'REACT_APP_SUPABASE_URL',
]);

const SUPABASE_PUBLIC_KEY = resolveEnv([
  'SUPABASE_ANON_KEY',
  'KC_SUPABASE_ANON_KEY',         // prefixo documentado no .env.example
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLIC_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLIC_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'REACT_APP_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLIC_KEY',
  'REACT_APP_SUPABASE_PUBLIC_KEY',
]);

const TURNSTILE_SITE_KEY = resolveEnv([
  'KC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'VITE_TURNSTILE_SITE_KEY',
]);
const TURNSTILE_TEST_SITE_KEYS = new Set([
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]);
const isProductionDeployment = (
  String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production' ||
  String(process.env.KC_APP_ENV || '').trim().toLowerCase() === 'production' ||
  String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
);

function keyLogSummary(key, prefixLength = 6) {
  if (!key) return 'detected: no';
  const safePrefix = key.slice(0, prefixLength);
  return safePrefix ? `${safePrefix}***` : 'detected: yes';
}

function readLegacyJwtRole(key) {
  try {
    const parts = String(key || '').split('.');
    if (parts.length !== 3) return '';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return String(payload && payload.role || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

// ── Validação ───────────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
  console.error('');
  console.error('❌ inject-env.js: SUPABASE_URL e uma chave pública do Supabase são obrigatórios (SUPABASE_ANON_KEY ou SUPABASE_PUBLIC_KEY).');
  console.error('');
  console.error('   Variáveis verificadas (todas estão ausentes ou vazias):');
  console.error('   SUPABASE_URL            =', process.env.SUPABASE_URL            || '(vazio)');
  console.error('   KC_SUPABASE_URL         =', process.env.KC_SUPABASE_URL         || '(vazio)');
  console.error('   NEXT_PUBLIC_SUPABASE_URL =', process.env.NEXT_PUBLIC_SUPABASE_URL || '(vazio)');
  console.error('   SUPABASE_ANON_KEY        =', `detected: ${process.env.SUPABASE_ANON_KEY ? 'yes' : 'no'}`);
  console.error('   KC_SUPABASE_ANON_KEY     =', `detected: ${process.env.KC_SUPABASE_ANON_KEY ? 'yes' : 'no'}`);
  console.error('   SUPABASE_PUBLIC_KEY      =', `detected: ${process.env.SUPABASE_PUBLIC_KEY ? 'yes' : 'no'}`);
  console.error('');
  console.error('   Como corrigir:');
  console.error('   1. Configure SUPABASE_URL e uma chave pública do Supabase (SUPABASE_ANON_KEY ou SUPABASE_PUBLIC_KEY).');
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

const hasLegacyJwtPrefix = SUPABASE_PUBLIC_KEY.startsWith('eyJ');
const hasPublishablePrefix = SUPABASE_PUBLIC_KEY.startsWith('sb_publishable_');
const legacyJwtRole = hasLegacyJwtPrefix ? readLegacyJwtRole(SUPABASE_PUBLIC_KEY) : '';
if ((!hasLegacyJwtPrefix && !hasPublishablePrefix) || (hasLegacyJwtPrefix && legacyJwtRole !== 'anon')) {
  console.error('❌ inject-env.js: chave pública do Supabase inválida.');
  console.error('   Formatos aceitos: JWT legado com role anon ou publishable key (sb_publishable_...).');
  console.error('   Copie a chave em Supabase Dashboard → Project Settings → API (chave "anon" / "publishable").');
  process.exit(1);
}
if (
  TURNSTILE_SITE_KEY &&
  (
    TURNSTILE_SITE_KEY.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(TURNSTILE_SITE_KEY)
  )
) {
  console.error('❌ inject-env.js: KC_TURNSTILE_SITE_KEY tem formato inválido.');
  process.exit(1);
}
if (isProductionDeployment && !TURNSTILE_SITE_KEY) {
  console.error('');
  console.error(
    '❌ TURNSTILE_SITE_KEY_REQUIRED: configure uma site key real antes do build de produção.'
  );
  console.error('');
  console.error('   O PR #747 (LGPD/DSR visitante) tornou KC_TURNSTILE_SITE_KEY obrigatória em');
  console.error('   produção. Sem ela o Vercel aborta o build e o site fica preso no deploy');
  console.error('   anterior (pré-privacidade). Previews continuam ok porque VERCEL_ENV!=production.');
  console.error('');
  console.error('   Variáveis aceitas (todas vazias neste build):');
  console.error('   - KC_TURNSTILE_SITE_KEY');
  console.error('   - TURNSTILE_SITE_KEY');
  console.error('   - NEXT_PUBLIC_TURNSTILE_SITE_KEY');
  console.error('   - VITE_TURNSTILE_SITE_KEY');
  console.error('');
  console.error('   Destravar (site key pública do Cloudflare Turnstile, formato 0x4AAAA...):');
  console.error('   1) Cloudflare Dashboard → Turnstile → widget de www.kinocampus.com.br → Site Key');
  console.error('   2) vercel env add KC_TURNSTILE_SITE_KEY production');
  console.error('      (repita para preview/development se quiser o widget nesses ambientes)');
  console.error('   3) No Supabase (edge de guest): KC_TURNSTILE_SECRET_KEY +');
  console.error('      KC_TURNSTILE_ENVIRONMENT=production + KC_TURNSTILE_EXPECTED_HOSTNAMES');
  console.error('   4) Redeploy: vercel --prod  (ou push vazio na branch de produção)');
  console.error('');
  console.error('   NÃO use chaves oficiais de teste (1x0000.../2x0000...) em produção —');
  console.error('   o build também recusa TURNSTILE_TEST_SITE_KEY_FORBIDDEN.');
  console.error('   Detalhes: docs/ops/production-turnstile-unblock.md e docs/env-vars.md');
  console.error('');
  process.exit(1);
}
if (
  isProductionDeployment &&
  TURNSTILE_TEST_SITE_KEYS.has(TURNSTILE_SITE_KEY)
) {
  console.error('❌ TURNSTILE_TEST_SITE_KEY_FORBIDDEN: chaves de teste não podem entrar em produção.');
  console.error('   Use a Site Key real do widget Turnstile do domínio de produção.');
  process.exit(1);
}

// ── Localização do kc-env.js ────────────────────────────────────────────────
// Tenta vários caminhos possíveis dependendo da estrutura do repositório
const POSSIBLE_PATHS = [
  path.join(__dirname, '..', 'assets', 'js', 'boot', 'kc-env.js'), // v15.5.0 — boot/ subdir
  path.join(__dirname, '..', 'kc-env.js'),           // raiz do repo (padrão Kino Campus)
  path.join(__dirname, '..', 'assets', 'js', 'kc-env.js'),         // fallback — raiz assets/js/
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
  '__KC_TURNSTILE_SITE_KEY__',
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
  __KC_SUPABASE_ANON_KEY__: SUPABASE_PUBLIC_KEY,
  __KC_TURNSTILE_SITE_KEY__: TURNSTILE_SITE_KEY,
  __KC_DRIVER__: 'supabase',
};

for (const [token, value] of Object.entries(REPLACEMENTS)) {
  content = content.split(token).join(value);
}

// ── Verificação ──────────────────────────────────────────────────────────────
const urlInjected   = content.includes(SUPABASE_URL);
const keyInjected   = content.includes(SUPABASE_PUBLIC_KEY);
const stillHasDriverPlaceholder = content.includes('__KC_DRIVER__');

if (!urlInjected) {
  console.error('❌ inject-env.js: SUPABASE_URL não foi injetada no kc-env.js.');
  console.error('   Verifique se o arquivo tem uma linha com uma URL supabase.co para substituir.');
  process.exit(1);
}

if (!keyInjected) {
  console.error('❌ inject-env.js: SUPABASE_ANON_KEY não foi injetada no kc-env.js.');
  console.error('   Verifique se o arquivo tem o placeholder __KC_SUPABASE_ANON_KEY__ para substituir.');
  process.exit(1);
}

// ── Escrita ──────────────────────────────────────────────────────────────────
if (content === original) {
  console.warn('⚠️  inject-env.js: nenhuma alteração detectada no kc-env.js.');
  console.warn('   Pode ser que os placeholders já tenham sido substituídos antes.');
} else {
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

// ── Cache-busting consistente do artefato público ───────────────────────────
// Os assets (/assets/*) são servidos com cache imutável de 1 ano. Como o ?v dos
// HTML é fixo, quem já visitou o site continua executando JS/CSS antigos por muito
// tempo (causa de "atualização demora a aparecer / outro navegador funciona").
// O build reescreve o ?v= de todos os HTMLs, o precache e o namespace do Service
// Worker com a MESMA revisão. Depois valida o dist; divergência em CI/deploy
// encerra o build em vez de publicar uma combinação de caches incompatível.
function applyAssetCacheBust() {
  const revision = resolveBuildRevision(process.env);
  const productionBuild = isCI || process.env.NODE_ENV === 'production';
  if (!revision) {
    if (productionBuild) {
      throw new Error(
        'KC_BUILD_REVISION_REQUIRED: configure KC_BUILD_REVISION ou forneça a revisão do provedor de deploy.',
      );
    }
    console.log(
      'ℹ️  inject-env.js: revisão de cache ignorada localmente; defina KC_BUILD_REVISION para validar o dist.',
    );
    return null;
  }

  const result = applyStaticCacheRevision({
    outputRoot: path.join(__dirname, '..', 'dist'),
    revision,
  });
  console.log(
    `🔄 inject-env.js: revisão ${result.revision} aplicada e validada `
    + `em ${result.htmlFiles} HTML, ${result.htmlAssets} referências e `
    + `${result.shellAssets} itens de precache.`,
  );
  return result;
}

// Cria primeiro o artefato público por allowlist. O cache-bust abaixo opera
// apenas nessa cópia, mantendo fontes internas fora do diretório publicado.
const { buildStaticOutput } = require('./build-static-output');
const staticOutput = buildStaticOutput({
  sourceRoot: path.join(__dirname, '..'),
  outputRoot: path.join(__dirname, '..', 'dist'),
});
console.log(`Static output isolated in dist (${staticOutput.rootFiles} root files).`);

// Não envolver em fallback silencioso: em produção, HTML, precache e namespace
// precisam pertencer à mesma revisão ou o artefato não pode ser publicado.
applyAssetCacheBust();

// ── Relatório ────────────────────────────────────────────────────────────────
console.log('');
console.log('✅ inject-env.js: kc-env.js atualizado com sucesso!');
console.log('   SUPABASE_URL      →', SUPABASE_URL);
console.log('   SUPABASE_PUBLIC_KEY (SUPABASE_ANON_KEY compat) →', keyLogSummary(SUPABASE_PUBLIC_KEY));
console.log('   KC_TURNSTILE_SITE_KEY →', TURNSTILE_SITE_KEY ? 'detected: yes' : 'detected: no (guest privacy requests fail closed)');
console.log('   driver            →', stillHasDriverPlaceholder ? '⚠️  placeholder __KC_DRIVER__ ainda presente' : '✅ supabase');
console.log('   Arquivo           →', ENV_FILE);
console.log('');
