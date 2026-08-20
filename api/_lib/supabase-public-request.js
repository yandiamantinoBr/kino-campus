export const PUBLIC_SUPABASE_TIMEOUT_MS = 8_000;

function normalizedTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.round(parsed), 30_000)
    : PUBLIC_SUPABASE_TIMEOUT_MS;
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new Error('Supabase public request aborted');
}

function awaitWithAbort(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

export async function fetchPublicSupabaseJson(endpoint, {
  key,
  fetchImpl = globalThis.fetch,
  timeoutMs = PUBLIC_SUPABASE_TIMEOUT_MS,
  signal,
} = {}) {
  if (!endpoint || !key || typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'supabase_not_configured', status: null };
  }

  const controller = new AbortController();
  const parentSignal = signal && typeof signal.addEventListener === 'function'
    ? signal
    : null;
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Supabase public request timed out'));
  }, normalizedTimeout(timeoutMs));
  try {
    if (controller.signal.aborted) throw abortError(controller.signal);
    const response = await awaitWithAbort(fetchImpl(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    }), controller.signal);
    if (!response || !response.ok) {
      return {
        ok: false,
        reason: 'supabase_http_error',
        status: Number.isInteger(response?.status) ? response.status : null,
      };
    }
    return {
      ok: true,
      data: await awaitWithAbort(response.json(), controller.signal),
      status: response.status,
    };
  } catch (_) {
    return {
      ok: false,
      reason: timedOut
        ? 'supabase_timeout'
        : (parentSignal?.aborted ? 'supabase_request_aborted' : 'supabase_request_failed'),
      status: null,
    };
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}
