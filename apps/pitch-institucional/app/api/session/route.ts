import {
  storeCreateSession,
  storeGetSession,
  storeListResponses,
  storeUpdateSession,
  storeUpsertResponse,
  type PitchSessionRow,
} from "../../../db/session-store";

export const runtime = "nodejs";

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

async function readSession(code: string) {
  const session = await storeGetSession(code);
  if (!session) return null;

  const rows = await storeListResponses(code);
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

  if (payload.action === "create") {
    const duration = [5, 15, 30].includes(Number(payload.duration))
      ? Number(payload.duration)
      : 15;
    const mode = payload.mode === "interativo" ? "interativo" : "expositivo";
    const token = randomToken();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomString(6);
      try {
        await storeCreateSession({
          code,
          duration,
          mode,
          presenterToken: token,
        });
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
    const session = await storeGetSession(code);
    if (!session || session.presenterToken !== payload.token) {
      return Response.json({ error: "Controle não autorizado." }, { status: 403 });
    }

    const currentSlide = Math.max(0, Math.min(60, Number(payload.currentSlide ?? 0)));
    await storeUpdateSession(code, {
      currentSlide,
      activePrompt: payload.activePrompt?.slice(0, 80) || null,
    });
    return Response.json({ session: await readSession(code) });
  }

  if (payload.action === "respond") {
    const participantId = payload.participantId?.trim().slice(0, 64);
    const promptId = payload.promptId?.trim().slice(0, 80);
    const value = cleanWord(payload.value ?? "");
    if (!participantId || !promptId || !value) {
      return Response.json({ error: "Resposta incompleta." }, { status: 400 });
    }
    const normalized = value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (blockedTerms.some((term) => normalized.includes(term))) {
      return Response.json(
        { error: "Use uma resposta respeitosa para participar." },
        { status: 422 },
      );
    }
    const session: PitchSessionRow | null = await storeGetSession(code);
    if (!session || session.status !== "live") {
      return Response.json({ error: "Esta sessão não está disponível." }, { status: 404 });
    }

    await storeUpsertResponse({
      sessionCode: code,
      promptId,
      participantId,
      value,
    });
    return Response.json({ session: await readSession(code) });
  }

  return Response.json({ error: "Ação não suportada." }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    return await getSession(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await mutateSession(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return Response.json({ error: message }, { status: 500 });
  }
}
