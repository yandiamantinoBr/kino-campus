/**
 * auth-retry.js — Helper compartilhado para signInWithPassword resiliente.
 *
 * PROBLEMA: O gateway Cloudflare do Supabase Auth retorna AuthRetryableFetchError
 * (status 504, message "{}") sob carga — quando muitos requests simultaneos batem
 * o mesmo projeto. O retry interno do supabase-js NAO existe pra isso, e o default
 * timeout do fetch é ~37s (custo alto por run).
 *
 * SOLUCAO: Wrapper com retry exponencial agressivo (max 5 tentativas: 2/4/8/16/32s),
 * timeout explicito menor (10s por tentativa), e deteccao de AuthRetryableFetchError.
 *
 * Uso:
 *   const { signInWithRetry } = require('./auth-retry');
 *   const { user, session } = await signInWithRetry(supabase, email, password);
 *   if (!session) process.exit(1);
 *   const token = session.access_token;
 *
 * v1.0 (2026-07-11): criado por Mavis apos diagnosticar 504 em duplicates/enrich/dedup
 *   com credenciais validas (cadu-api health OK, formato 02:46 OK, publish 03:22 OK,
 *   individuais duplicates/enrich/dedup falham 03:29-03:51 com AuthRetryableFetchError 504).
 */

'use strict';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_BACKOFF_BASE_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  if (!error) return false;
  // Supabase AuthRetryableFetchError vem com status 502/503/504/timeout
  if (error.name === 'AuthRetryableFetchError') return true;
  if (typeof error.status === 'number' && [408, 425, 429, 500, 502, 503, 504].includes(error.status)) return true;
  if (error.message && /timeout|fetch failed|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(error.message)) return true;
  return false;
}

/**
 * signInWithRetry — signInWithPassword com retry exponencial.
 *
 * @param {object} supabase  - supabase-js client (createClient)
 * @param {string} email
 * @param {string} password
 * @param {object} options
 * @param {number} options.maxAttempts - default 5
 * @param {number} options.timeoutMs   - per-attempt fetch timeout, default 10000
 * @param {number} options.backoffBaseMs - base backoff in ms, default 2000
 * @param {function} options.onAttempt - callback(attempt, errorOrNull) for observability
 * @returns {Promise<{user: object, session: object, attempts: number}>}
 * @throws {Error} if auth fails after all retries
 */
async function signInWithRetry(supabase, email, password, options = {}) {
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const backoffBaseMs = options.backoffBaseMs || DEFAULT_BACKOFF_BASE_MS;
  const onAttempt = options.onAttempt || (() => {});

  let lastError = null;
  let lastData = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeoutHandle;
    try {
      // Race entre signInWithPassword e timeout explicito
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(Object.assign(new Error(`signInWithPassword timeout ${timeoutMs}ms`), { name: 'AuthRetryableFetchError', status: 504 })),
          timeoutMs,
        );
      });
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeoutPromise,
      ]);
      clearTimeout(timeoutHandle);

      if (result.error) {
        lastError = result.error;
        lastData = result.data;
        onAttempt(attempt, result.error);
        if (!isRetryable(result.error)) {
          // Erro nao-retryable (ex: InvalidCredentials 400) — desiste
          throw new Error(`signInWithPassword falhou (nao-retryable): ${result.error.name} status=${result.error.status} message=${result.error.message}`);
        }
        if (attempt < maxAttempts) {
          const backoff = backoffBaseMs * Math.pow(2, attempt - 1);
          console.log(`  ⏳ auth retry ${attempt}/${maxAttempts - 1}: ${result.error.name} status=${result.error.status} — aguardando ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        break;
      }

      if (!result.data || !result.data.session) {
        lastError = new Error('signInWithPassword returned no session');
        onAttempt(attempt, lastError);
        if (attempt < maxAttempts) {
          const backoff = backoffBaseMs * Math.pow(2, attempt - 1);
          console.log(`  ⏳ auth retry ${attempt}/${maxAttempts - 1}: no session — aguardando ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        break;
      }

      // Sucesso
      onAttempt(attempt, null);
      return { user: result.data.user, session: result.data.session, attempts: attempt };
    } catch (err) {
      lastError = err;
      onAttempt(attempt, err);
      if (!isRetryable(err)) {
        throw err;
      }
      if (attempt < maxAttempts) {
        const backoff = backoffBaseMs * Math.pow(2, attempt - 1);
        console.log(`  ⏳ auth retry ${attempt}/${maxAttempts - 1}: ${err.name || 'Error'} ${err.message?.slice(0, 60)} — aguardando ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      break;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  throw Object.assign(
    new Error(`signInWithPassword falhou apos ${maxAttempts} tentativas: ${lastError?.name || 'unknown'} status=${lastError?.status} message=${lastError?.message}`),
    { name: 'AuthRetryableFetchError', status: lastError?.status || 504, attempts: maxAttempts, lastError },
  );
}

module.exports = { signInWithRetry, isRetryable, sleep };
