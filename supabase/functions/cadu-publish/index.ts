// KinoCampus — Edge Function: cadu-publish (v1)
//
// Endpoint canonico e versionado para o Cadu (OpenClaw) publicar/editar/listar
// no Kino Campus. Substitui o INSERT direto dos scripts soltos do servidor.
//
// Por que existe:
//   - Centraliza no repositorio (versionado, testavel) a montagem de campos por
//     modulo, a publicacao privilegiada e o upload de imagem.
//   - So contas na allowlist public.kc_trusted_publishers podem usar (Cadu).
//   - A combinacao com a migration 20260530120000 (isencao do anti-spam para
//     bots confiaveis) garante que posts oficiais com varios links NAO caiam em
//     'pending'.
//
// Acoes (POST /functions/v1/cadu-publish):
//   { action: "publish", item, options? }   -> cria post + capa
//   { action: "edit", postId, fields?, metadata?, image?, images? } -> edita
//   { action: "list", filters? }            -> lista posts do Cadu (filtra)
//   { action: "check", sourceUrl?, sourceId? } -> dedup (ja postado?)
//
// Headers: Authorization: Bearer <access_token da conta do Cadu>
// NOTA: verify_jwt fica desabilitado no gateway; a funcao valida o JWT internamente.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CaduItem, validateItem } from "./schema.ts";
import { deepMergeMetadata, mapItemToPost } from "./mapper.ts";
import { canPersistExternalImageUrl, lightHash, validRemoteImageUrl } from "./util.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("KC_APP_BASE_URL") || "https://www.kinocampus.com.br").replace(/\/$/, "");

const STORAGE_BUCKET = "kino-media";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const USER_AGENT = "KinoCampus-Cadu/1.0 (+https://www.kinocampus.com.br)";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

const MODULE_PAGE: Record<string, string> = {
  eventos: "eventos.html",
  oportunidades: "oportunidades.html",
  moradia: "moradia.html",
  "compra-venda": "compra-venda.html",
  caronas: "caronas.html",
  "achados-perdidos": "achados-perdidos.html",
};

function postUrl(module: string): string {
  const page = MODULE_PAGE[module] || "index.html";
  return `${SITE_URL}/${page}`;
}

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  const resp = await fetch(url, { headers: { accept: "image/*,*/*;q=0.5", "user-agent": USER_AGENT } });
  if (!resp.ok) throw new Error(`image_download_http_${resp.status}`);
  const ct = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  let ext = IMAGE_EXT[ct] || "";
  if (!ext) {
    const m = url.toLowerCase().match(/\.(jpe?g|png|gif|webp)(?:$|[?#])/);
    if (m) ext = m[1] === "jpeg" ? "jpg" : m[1];
  }
  if (!ext) throw new Error("unsupported_image_type");
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty_image");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("image_too_large");
  const contentType = ct.startsWith("image/") ? ct : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return { bytes, contentType, ext };
}

// Sobe a capa para kino-media e devolve a URL publica do Storage (ou "" se falhar).
async function uploadCover(
  admin: SupabaseClient,
  userId: string,
  postId: string,
  sourceUrl: string,
): Promise<string> {
  const clean = validRemoteImageUrl(sourceUrl);
  if (!clean) return "";
  const { bytes, contentType, ext } = await downloadImage(clean);
  const path = `post-media/${userId}/${postId}/cadu-1-${lightHash(clean)}.${ext}`;
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

// Aplica a capa ao post: posts.image_url + metadata + post_media (best-effort).
async function applyCover(
  admin: SupabaseClient,
  postId: string,
  coverUrl: string,
  currentMetadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const metadata = deepMergeMetadata(currentMetadata, { image_url: coverUrl, cover_url: coverUrl });
  await admin.from("posts").update({ image_url: coverUrl, metadata }).eq("id", postId);
  const { data: previousMedia } = await admin
    .from("post_media")
    .select("post_id,url,is_cover,sort_order")
    .eq("post_id", postId);
  try {
    await admin.from("post_media").delete().eq("post_id", postId);
    await admin.from("post_media").insert({ post_id: postId, url: coverUrl, is_cover: true, sort_order: 0 });
  } catch (_) {
    if (Array.isArray(previousMedia) && previousMedia.length) {
      await admin.from("post_media").insert(previousMedia).then(() => {}, () => {});
    }
  }
  return metadata;
}

async function isTrustedPublisher(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("kc_trusted_publishers").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

async function findExisting(
  admin: SupabaseClient,
  userId: string,
  sourceId: string,
  sourceUrl: string,
): Promise<{ id: string; status: string } | null> {
  if (sourceId) {
    const { data } = await admin
      .from("posts")
      .select("id,status")
      .eq("author_id", userId)
      .eq("metadata->>source_id", sourceId)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string; status: string };
  }
  if (sourceUrl) {
    const { data } = await admin
      .from("posts")
      .select("id,status")
      .eq("author_id", userId)
      .eq("metadata->>source_url", sourceUrl)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string; status: string };
  }
  return null;
}

function audit(admin: SupabaseClient, action: string, entityId: string, actorId: string, payload: Record<string, unknown>) {
  // fire-and-forget; o builder do supabase-js e PromiseLike (sem .catch)
  admin.from("audit_log").insert({
    action,
    entity_type: "posts",
    entity_id: entityId,
    actor_id: actorId,
    payload,
  }).then(() => {}, () => {});
}

// ── publish ───────────────────────────────────────────────────────────────────
async function handlePublish(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const item = (body.item || {}) as CaduItem;
  const options = (body.options || {}) as { dryRun?: boolean; runId?: string };

  const validation = validateItem(item);
  if (!validation.ok) {
    return json(422, { ok: false, code: "VALIDATION_FAILED", message: validation.errors.join(" "), validation });
  }

  const mapped = mapItemToPost(item, { runId: options.runId });

  // Dedup: nao republica o mesmo source_id/source_url.
  const existing = await findExisting(admin, userId, mapped.dedup.sourceId, mapped.dedup.sourceUrl);
  if (existing) {
    return json(200, {
      ok: false,
      code: "DUPLICATE",
      message: "Ja existe um post deste mesmo conteudo (mesma fonte).",
      post_id: existing.id,
      status: existing.status,
    });
  }

  if (options.dryRun) {
    return json(200, { ok: true, code: "DRY_RUN", row: mapped.row, warnings: [...validation.warnings, ...mapped.warnings] });
  }

  const insertRow = { ...mapped.row, author_id: userId, status: "published" };
  const { data: post, error } = await admin.from("posts").insert(insertRow).select("*").single();
  if (error || !post) {
    return json(500, { ok: false, code: "INSERT_FAILED", message: error?.message || "Falha ao inserir o post." });
  }

  // Imagem: sobe para o Storage; em caso de falha, mantem a URL externa (fallback).
  const media: { uploaded: boolean; cover_url: string; error?: string } = {
    uploaded: false,
    cover_url: String(post.image_url || ""),
  };
  const candidate = mapped.images[0] || "";
  if (candidate) {
    try {
      const storageUrl = await uploadCover(admin, userId, post.id, candidate);
      if (storageUrl) {
        post.metadata = await applyCover(admin, post.id, storageUrl, post.metadata || {});
        post.image_url = storageUrl;
        media.uploaded = true;
        media.cover_url = storageUrl;
      }
    } catch (e) {
      media.error = e instanceof Error ? e.message : String(e);
      // fallback: grava URL externa apenas quando ela e estavel. CDN de Instagram,
      // Telegram e SVG nao viram capa definitiva se o upload falhar.
      if (canPersistExternalImageUrl(candidate) && item.allowExternalImageFallback !== false) {
        try {
          post.metadata = await applyCover(admin, post.id, candidate, post.metadata || {});
          post.image_url = candidate;
          media.cover_url = candidate;
        } catch (_) { /* ignore */ }
      }
    }
  }

  audit(admin, "cadu_post_published", post.id, userId, {
    module: post.module,
    status: post.status,
    source_url: mapped.dedup.sourceUrl,
    source_id: mapped.dedup.sourceId,
    image_uploaded: media.uploaded,
  });

  const pending = post.status === "pending";
  return json(200, {
    ok: true,
    code: pending ? "PENDING" : "PUBLISHED",
    post_id: post.id,
    status: post.status,
    pending,
    pending_reason: post.moderation_reason || "",
    url: postUrl(String(post.module)),
    image_url: post.image_url || "",
    media,
    warnings: [...validation.warnings, ...mapped.warnings],
  });
}

// ── edit ────────────────────────────────────────────────────────────────────
const EDITABLE_FIELDS = ["title", "description", "price", "location", "category", "visibility", "status"] as const;

async function handleEdit(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const postId = String(body.postId || "");
  if (!postId) return json(400, { ok: false, code: "MISSING_POST_ID", message: "Informe postId." });

  const { data: current, error: getErr } = await admin
    .from("posts")
    .select("id,author_id,module,status,metadata,image_url")
    .eq("id", postId)
    .maybeSingle();
  if (getErr || !current) return json(404, { ok: false, code: "POST_NOT_FOUND", message: "Post nao encontrado." });
  if (current.author_id !== userId) {
    return json(403, { ok: false, code: "NOT_OWNER", message: "O Cadu so pode editar os proprios posts." });
  }

  const update: Record<string, unknown> = {};
  const fields = (body.fields || {}) as Record<string, unknown>;
  for (const f of EDITABLE_FIELDS) {
    if (fields[f] !== undefined) update[f] = fields[f];
  }

  if (body.metadata && typeof body.metadata === "object") {
    update.metadata = deepMergeMetadata(current.metadata || {}, body.metadata as Record<string, unknown>);
  }
  // Publicar pendente: limpa o motivo de moderacao.
  if (update.status === "published") update.moderation_reason = null;

  if (Object.keys(update).length) {
    const { error: updErr } = await admin.from("posts").update(update).eq("id", postId);
    if (updErr) return json(500, { ok: false, code: "UPDATE_FAILED", message: updErr.message });
  }

  // Troca de imagem (opcional).
  const newImage = validRemoteImageUrl((body.image as string) || (Array.isArray(body.images) ? body.images[0] : ""));
  let coverUrl = String(current.image_url || "");
  let uploaded = false;
  let imageError = "";
  if (newImage) {
    const baseMeta = (update.metadata as Record<string, unknown>) || current.metadata || {};
    try {
      const storageUrl = await uploadCover(admin, userId, postId, newImage);
      if (storageUrl) {
        await applyCover(admin, postId, storageUrl, baseMeta);
        coverUrl = storageUrl;
        uploaded = true;
      }
    } catch (e) {
      imageError = e instanceof Error ? e.message : String(e);
      if (canPersistExternalImageUrl(newImage)) {
        await applyCover(admin, postId, newImage, baseMeta);
        coverUrl = newImage;
      }
    }
  }

  const { data: fresh } = await admin.from("posts").select("id,status,module,image_url").eq("id", postId).maybeSingle();
  audit(admin, "cadu_post_edited", postId, userId, { fields: Object.keys(update), image_changed: !!newImage });
  return json(200, {
    ok: true,
    code: "UPDATED",
    post_id: postId,
    status: fresh?.status || current.status,
    image_url: coverUrl,
    image_uploaded: uploaded,
    image_error: imageError,
    url: postUrl(String(fresh?.module || current.module)),
  });
}

// ── list ──────────────────────────────────────────────────────────────────────
async function handleList(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const filters = (body.filters || {}) as Record<string, unknown>;
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

  let query = admin
    .from("posts")
    .select("id,title,module,status,created_at,image_url,metadata")
    .eq("author_id", userId);

  if (filters.module) query = query.eq("module", String(filters.module));
  if (filters.status) query = query.eq("status", String(filters.status));
  if (filters.since) query = query.gte("created_at", String(filters.since));
  if (filters.sourceId) query = query.eq("metadata->>source_id", String(filters.sourceId));
  if (filters.sourceUrl) query = query.eq("metadata->>source_url", String(filters.sourceUrl));

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return json(500, { ok: false, code: "LIST_FAILED", message: error.message });

  const posts = (data || []).map((p: Record<string, unknown>) => {
    const meta = (p.metadata || {}) as Record<string, unknown>;
    return {
      id: p.id,
      title: p.title,
      module: p.module,
      status: p.status,
      created_at: p.created_at,
      image_url: p.image_url,
      source_url: meta.source_url || "",
      source_id: meta.source_id || "",
    };
  });
  return json(200, { ok: true, code: "OK", count: posts.length, posts });
}

// ── check (dedup) ─────────────────────────────────────────────────────────────
async function handleCheck(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const sourceId = String(body.sourceId || "");
  const sourceUrl = String(body.sourceUrl || "");
  if (!sourceId && !sourceUrl) {
    return json(400, { ok: false, code: "MISSING_SOURCE", message: "Informe sourceId ou sourceUrl." });
  }
  const existing = await findExisting(admin, userId, sourceId, sourceUrl);
  return json(200, {
    ok: true,
    code: "OK",
    exists: !!existing,
    post_id: existing?.id || "",
    status: existing?.status || "",
  });
}

// ── HTTP entrypoint ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST." });

  // 1) Autenticacao
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, code: "AUTH_REQUIRED", message: "Token de autenticacao ausente." });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json(401, { ok: false, code: "AUTH_INVALID", message: "Sessao invalida. Refaca o login do Cadu." });
  }

  // 2) Cliente privilegiado + allowlist
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  if (!(await isTrustedPublisher(admin, user.id))) {
    return json(403, { ok: false, code: "NOT_TRUSTED", message: "Conta nao autorizada a publicar pelo endpoint do Cadu." });
  }

  // 3) Body + roteamento de acao
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "BAD_BODY", message: "Body invalido. Envie JSON." });
  }
  const action = String(body.action || "publish");

  try {
    switch (action) {
      case "publish":
        return await handlePublish(admin, user.id, body);
      case "edit":
        return await handleEdit(admin, user.id, body);
      case "list":
        return await handleList(admin, user.id, body);
      case "check":
        return await handleCheck(admin, user.id, body);
      default:
        return json(400, { ok: false, code: "UNKNOWN_ACTION", message: `Acao desconhecida: ${action}.` });
    }
  } catch (e) {
    console.error("[cadu-publish] erro:", e);
    return json(500, { ok: false, code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e) });
  }
});
