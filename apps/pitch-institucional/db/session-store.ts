/**
 * Portable session store for the pitch app.
 * - On ChatGPT Sites / Cloudflare Workers: can still use D1 via optional path.
 * - On Vercel (production host for KinoCampus): uses Supabase service role.
 */

export type PitchSessionRow = {
  code: string;
  duration: number;
  mode: string;
  currentSlide: number;
  activePrompt: string | null;
  presenterToken: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PitchResponseRow = {
  promptId: string;
  value: string;
};

function supabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.KC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.KC_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "";
  if (!url || !key) {
    throw new Error(
      "Pitch session store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on this host.",
    );
  }
  return { url, key };
}

async function sb<T>(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const { url, key } = supabaseConfig();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && data !== null && "message" in data
        ? String((data as { message?: string }).message)
        : text.slice(0, 200) || `HTTP ${res.status}`;
    return { ok: false, status: res.status, data: null, error: err };
  }
  return { ok: true, status: res.status, data };
}

function mapSession(row: Record<string, unknown>): PitchSessionRow {
  return {
    code: String(row.code),
    duration: Number(row.duration),
    mode: String(row.mode),
    currentSlide: Number(row.current_slide ?? 0),
    activePrompt: row.active_prompt == null ? null : String(row.active_prompt),
    presenterToken: String(row.presenter_token),
    status: String(row.status ?? "live"),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function storeGetSession(code: string): Promise<PitchSessionRow | null> {
  const result = await sb<Record<string, unknown>[]>(
    `pitch_sessions?code=eq.${encodeURIComponent(code)}&select=*&limit=1`,
    { method: "GET" },
  );
  if (!result.ok || !result.data?.length) return null;
  return mapSession(result.data[0]);
}

export async function storeListResponses(
  code: string,
): Promise<PitchResponseRow[]> {
  const result = await sb<Record<string, unknown>[]>(
    `pitch_responses?session_code=eq.${encodeURIComponent(code)}&select=prompt_id,value&limit=1200`,
    { method: "GET" },
  );
  if (!result.ok || !result.data) return [];
  return result.data.map((row) => ({
    promptId: String(row.prompt_id),
    value: String(row.value),
  }));
}

export async function storeCreateSession(input: {
  code: string;
  duration: number;
  mode: string;
  presenterToken: string;
}): Promise<void> {
  // Housekeeping: drop sessions older than 7 days
  await sb(
    `pitch_sessions?updated_at=lt.${encodeURIComponent(new Date(Date.now() - 7 * 864e5).toISOString())}`,
    { method: "DELETE" },
  ).catch(() => undefined);

  const result = await sb("pitch_sessions", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      code: input.code,
      duration: input.duration,
      mode: input.mode,
      current_slide: 0,
      presenter_token: input.presenterToken,
      status: "live",
    }),
  });
  if (!result.ok) {
    throw new Error(result.error || "create_session_failed");
  }
}

export async function storeUpdateSession(
  code: string,
  patch: { currentSlide: number; activePrompt: string | null },
): Promise<void> {
  const result = await sb(`pitch_sessions?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      current_slide: patch.currentSlide,
      active_prompt: patch.activePrompt,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!result.ok) {
    throw new Error(result.error || "update_session_failed");
  }
}

export async function storeUpsertResponse(input: {
  sessionCode: string;
  promptId: string;
  participantId: string;
  value: string;
}): Promise<void> {
  const result = await sb("pitch_responses", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      session_code: input.sessionCode,
      prompt_id: input.promptId,
      participant_id: input.participantId,
      value: input.value,
    }),
  });
  if (!result.ok) {
    throw new Error(result.error || "upsert_response_failed");
  }
}
