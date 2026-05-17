'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    const value = raw.replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

function loadConfig() {
  const serviceRoot = path.resolve(__dirname, '..');
  loadEnvFile(process.env.CADU_ENV_FILE || path.join(serviceRoot, '.env.local'));
  return {
    serviceRoot,
    sourcePath: process.env.CADU_SOURCE_PATH || path.join(serviceRoot, 'config/sources.json'),
    statePath: process.env.CADU_STATE_PATH || path.join(serviceRoot, 'data/state.json'),
    userAgent: process.env.CADU_USER_AGENT || 'CaduKinoCampusBot/1.0 (+contato@kinocampus.com.br)',
    requestTimeoutMs: Number(process.env.CADU_REQUEST_TIMEOUT_MS || 20000),
    minDelayMs: Number(process.env.CADU_MIN_DELAY_MS || 900),
    maxItemsPerSource: Number(process.env.CADU_MAX_ITEMS_PER_SOURCE || 15),
    maxPublishPerRun: Number(process.env.CADU_MAX_PUBLISH_PER_RUN || 3),
    maxPdfBytes: Number(process.env.CADU_MAX_PDF_BYTES || 25 * 1024 * 1024),
    supabaseUrl: process.env.CADU_SUPABASE_URL || process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.CADU_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    kinoEmail: process.env.CADU_KINO_EMAIL,
    kinoPassword: process.env.CADU_KINO_PASSWORD,
    telegramBotToken: process.env.CADU_TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.CADU_TELEGRAM_CHAT_ID,
    resendApiKey: process.env.CADU_RESEND_API_KEY,
    emailWebhookUrl: process.env.CADU_EMAIL_WEBHOOK_URL,
    emailFrom: process.env.CADU_EMAIL_FROM,
    emailTo: process.env.CADU_EMAIL_TO || 'contato@kinocampus.com.br',
    deepseekApiKey: process.env.CADU_DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.CADU_DEEPSEEK_BASE_URL,
    deepseekModel: process.env.CADU_DEEPSEEK_MODEL,
    useModel: process.env.CADU_USE_MODEL === 'true',
  };
}

module.exports = {
  loadConfig,
  loadEnvFile,
};
