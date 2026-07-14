import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { responses, sessions } from "../../../db/schema";

export const runtime = "edge";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomString(length: number) {
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function randomToken() {
  const values = new Uint8Array(24);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function cleanWord(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

const blockedTerms = [
  "caralho",
  "foder",
  "fodase",
  "foda-se",
  "porra",
  "puta",
  "merda",
  "nazista",
];

let schemaReady: Promise<void> | null = null;

function ensureSchema() {
  if (!schemaReady) {
    const db = getDb();
    schemaReady = (async () => {
      await db.run(sql.raw(`
        CREATE TABLE IF NOT EXISTS pitch_sessions (
          code TEXT PRIMARY KEY NOT NULL,
          duration INTEGER NOT NULL,
          mode TEXT NOT NULL,
          current_slide INTEGER DEFAULT 0 NOT NULL,
          active_prompt TEXT,
          presenter_token TEXT NOT NULL,
          status TEXT DEFAULT 'live' NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `));
      await db.run(sql.raw(`
        CREATE TABLE IF NOT EXISTS pitch_responses (
          session_code TEXT NOT NULL,
          prompt_id TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (session_code, prompt_id, participant_id),
          FOREIGN KEY (session_code) REFERENCES pitch_sessions(code) ON DELETE CASCADE
        )
      `));
      await db.run(sql.raw(`
        CREATE INDEX IF NOT EXISTS pitch_responses_session_idx
        ON pitch_responses(session_code)
      `));
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function readSession(code: string) {
  await ensureSchema();
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.code, code)).limit(1);
  if (!session) return null;

  const rows = await db
    .select({ promptId: responses.promptId, value: responses.value })
    .from(responses)
    .where(eq(responses.sessionCode, code))
    .limit(1200);

  const aggregates: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    aggregates[row.promptId] ??= {};
    aggregates[row.promptId][row.value] =
      (aggregates[row.promptId][row.value] ?? 0) + 1;
  }

  return {
    code: session.code,
    duration: session.duration,
    mode: session.mode,
    currentSlide: session.currentSlide,
    activePrompt: session.activePrompt,
    status: session.status,
    updatedAt: session.updatedAt,
    responseCount: rows.length,
    aggregates,
  };
}

async function getSession(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return Response.json({ error: "Código da sessão ausente." }, { status: 400 });

  const session = await readSession(code);
  if (!session) return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
  return Response.json({ session });
}

async function mutateSession(request: Request) {
  const payload = (await request.json()) as {
    action?: "create" | "control" | "respond";
    code?: string;
    token?: string;
    duration?: number;
    mode?: string;
    currentSlide?: number;
    activePrompt?: string | null;
    participantId?: string;
    promptId?: string;
    value?: string;
  };
  await ensureSchema();
  const db = getDb();

  if (payload.action === "create") {
    const duration = [5, 15, 30].includes(Number(payload.duration))
      ? Number(payload.duration)
      : 15;
    const mode = payload.mode === "interativo" ? "interativo" : "expositivo";
    const token = randomToken();

    await db.run(sql.raw(`
      DELETE FROM pitch_sessions
      WHERE datetime(updated_at) < datetime('now', '-7 days')
    `));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomString(6);
      try {
        await db.insert(sessions).values({ code, duration, mode, presenterToken: token });
        return Response.json({
          session: await readSession(code),
          presenterToken: token,
        });
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
  }

  const code = payload.code?.trim().toUpperCase();
  if (!code) return Response.json({ error: "Código da sessão ausente." }, { status: 400 });

  if (payload.action === "control") {
    const [session] = await db.select().from(sessions).where(eq(sessions.code, code)).limit(1);
    if (!session || session.presenterToken !== payload.token) {
      return Response.json({ error: "Controle não autorizado." }, { status: 403 });
    }

    const currentSlide = Math.max(0, Math.min(60, Number(payload.currentSlide ?? 0)));
    await db
      .update(sessions)
      .set({
        currentSlide,
        activePrompt: payload.activePrompt?.slice(0, 80) || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.code, code));
    return Response.json({ session: await readSession(code) });
  }

  if (payload.action === "respond") {
    const participantId = payload.participantId?.trim().slice(0, 64);
    const promptId = payload.promptId?.trim().slice(0, 80);
    const value = cleanWord(payload.value ?? "");
    if (!participantId || !promptId || !value) {
      return Response.json({ error: "Resposta incompleta." }, { status: 400 });
    }
    const normalized = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (blockedTerms.some((term) => normalized.includes(term))) {
      return Response.json({ error: "Use uma resposta respeitosa para participar." }, { status: 422 });
    }
    const [session] = await db.select().from(sessions).where(eq(sessions.code, code)).limit(1);
    if (!session || session.status !== "live") {
      return Response.json({ error: "Esta sessão não está disponível." }, { status: 404 });
    }
    if (session.activePrompt !== promptId) {
      return Response.json({ error: "Esta interação não está ativa no momento." }, { status: 409 });
    }

    await db
      .insert(responses)
      .values({ sessionCode: code, promptId, participantId, value })
      .onConflictDoUpdate({
        target: [responses.sessionCode, responses.promptId, responses.participantId],
        set: { value, createdAt: new Date().toISOString() },
      });

    return Response.json({ session: await readSession(code) });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });
}

function apiError(error: unknown) {
  console.error("[pitch-session]", error);
  return Response.json(
    { error: "A sessão ao vivo está temporariamente indisponível. A apresentação expositiva continua funcionando." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    return await getSession(request);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return await mutateSession(request);
  } catch (error) {
    return apiError(error);
  }
}
