// KinoCampus — Edge Function: kc-invite-user
//
// Envia um convite para um usuário com e-mail não-institucional.
// Requer: caller autenticado com is_admin = true.
//
// POST /functions/v1/kc-invite-user
// Body: { email: string, note?: string }
// Headers: Authorization: Bearer <access_token>
//
// Env vars necessárias (já disponíveis nas Edge Functions do Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Env var adicional (configurar em Supabase → Edge Functions → Secrets):
//   KC_APP_BASE_URL (ex: https://www.kinocampus.com.br)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL               = (Deno.env.get("KC_APP_BASE_URL") || "https://www.kinocampus.com.br").replace(/\/$/, "");
const INVITE_REDIRECT_URL    = `${SITE_URL}/auth-callback.html`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Método não permitido. Use POST." });
  }

  // ── 1. Verificar autenticação ─────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Token de autenticação ausente." });
  }

  // Cliente com o JWT do usuário chamador (para verificar permissões)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json(401, { error: "Sessão inválida. Faça login novamente." });
  }

  // ── 2. Verificar se é admin ───────────────────────────────────────────────
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.is_admin) {
    return json(403, { error: "Acesso negado. Apenas administradores podem convidar usuários." });
  }

  // ── 3. Validar body ───────────────────────────────────────────────────────
  let body: { email?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body inválido. Envie JSON com { email, note? }." });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const note  = String(body.note  || "").trim() || null;

  if (!email || !email.includes("@") || !email.includes(".")) {
    return json(400, { error: "E-mail inválido." });
  }

  // Não permitir convidar e-mails institucionais (eles já podem se cadastrar normalmente)
  const isInstitutional = email.endsWith("@ufg.br") ||
                          email.endsWith("@discente.ufg.br") ||
                          email.endsWith("@egresso.ufg.br");
  if (isInstitutional) {
    return json(400, {
      error: "E-mails institucionais (@ufg.br, @discente.ufg.br, @egresso.ufg.br) não precisam de convite — podem se cadastrar diretamente.",
    });
  }

  // ── 4. Cliente admin (service role) ──────────────────────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── 5. Registrar na whitelist ─────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: whitelistError } = await adminClient
    .from("kc_invited_emails")
    .upsert(
      { email, invited_by: user.id, note, expires_at: expiresAt, used_at: null },
      { onConflict: "email" }
    );

  if (whitelistError) {
    console.error("[kc-invite-user] whitelist upsert error:", whitelistError);
    return json(500, { error: "Falha ao registrar convite. Tente novamente." });
  }

  // ── 6. Enviar convite via Supabase Auth Admin API ─────────────────────────
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: INVITE_REDIRECT_URL,
      data: {
        invited_by_admin: user.id,
        is_invited_external: true,
      },
    }
  );

  if (inviteError) {
    // Se o usuário já existe e está confirmado, apenas re-registrar na whitelist é suficiente
    const alreadyExists =
      inviteError.message?.includes("already been registered") ||
      inviteError.message?.includes("already registered") ||
      inviteError.message?.includes("User already registered");

    if (alreadyExists) {
      return json(200, {
        ok: true,
        email,
        already_registered: true,
        message: "Usuário já cadastrado. Whitelist atualizada — o usuário pode fazer login normalmente.",
      });
    }

    console.error("[kc-invite-user] invite error:", inviteError);
    return json(500, {
      error: `Falha ao enviar convite: ${inviteError.message}`,
    });
  }

  return json(200, {
    ok: true,
    email,
    user_id: inviteData?.user?.id ?? null,
    message: `Convite enviado para ${email}. O link expira em 7 dias.`,
    redirect_url: INVITE_REDIRECT_URL,
  });
});
