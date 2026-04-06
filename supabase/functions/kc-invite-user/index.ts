// KinoCampus — Edge Function: kc-invite-user (v2)
//
// Gera um link de convite para usuário com e-mail não-institucional.
// O admin recebe o link e envia pelo próprio canal (ex: contato@kinocampus.com.br).
// Requer: caller autenticado com is_admin = true.
//
// POST /functions/v1/kc-invite-user
// Body: { email: string, note?: string }
// Headers: Authorization: Bearer <access_token>
//
// Env vars (disponíveis automaticamente nas Edge Functions do Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Env var adicional (configurar em Supabase → Edge Functions → Secrets):
//   KC_APP_BASE_URL (ex: https://www.kinocampus.com.br)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL            = (Deno.env.get("KC_APP_BASE_URL") || "https://www.kinocampus.com.br").replace(/\/$/, "");
const INVITE_REDIRECT_URL = `${SITE_URL}/auth-callback.html`;

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
    .select("is_admin, display_name")
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

  // E-mails institucionais não precisam de convite
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

  // ── 6. Gerar link de convite via generateLink ─────────────────────────────
  // Usando generateLink (NÃO inviteUserByEmail) para:
  //   a) Obter o link de convite diretamente, sem envio automático de email
  //   b) Evitar conflito de tokens (dual-token problem: inviteByEmail invalidaria o token gerado)
  //   c) Permitir que o admin personalize e envie o email pelo próprio canal
  const adminName: string = (profile as any)?.display_name || "Admin KinoCampus";

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: INVITE_REDIRECT_URL,
      data: {
        invited_by_name: adminName,
        invite_note: note,
        is_invited_external: true,
      },
    },
  });

  if (linkError) {
    // Usuário já confirmado: whitelist foi atualizada, login normal é suficiente
    const alreadyConfirmed =
      linkError.message?.includes("already been registered") ||
      linkError.message?.includes("already registered") ||
      linkError.message?.includes("User already registered") ||
      linkError.message?.includes("email_exists");

    if (alreadyConfirmed) {
      return json(200, {
        ok: true,
        email,
        already_registered: true,
        message: "Usuário já cadastrado. Whitelist atualizada — o usuário pode fazer login normalmente.",
      });
    }

    console.error("[kc-invite-user] generateLink error:", linkError);
    return json(500, {
      error: `Falha ao gerar link de convite: ${linkError.message}`,
    });
  }

  const inviteLink: string = (linkData as any)?.properties?.action_link ?? "";

  if (!inviteLink) {
    console.error("[kc-invite-user] action_link vazio. linkData:", JSON.stringify(linkData));
    return json(500, { error: "Falha ao gerar link de convite: link não retornado pelo servidor." });
  }

  // ── 8. Registrar no audit_log ─────────────────────────────────────────────
  await adminClient.from("audit_log").insert({
    action: "invite_sent",
    entity_type: "invites",
    entity_id: email,
    actor_id: user.id,
    payload: { email, note, expires_at: expiresAt },
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error("[kc-invite-user] audit_log insert error:", auditErr);
  });

  return json(200, {
    ok: true,
    email,
    invite_link: inviteLink,
    expires_at: expiresAt,
    message: `Link de convite gerado para ${email}. Válido por 7 dias.`,
  });
});
