/**
 * @file supabase.chat.adapter.js
 * @description Sub-adapter Chat 1-a-1 (v9.3.5.10+)
 * Registra window._KCSA.chat com todas as operações de mensageria direta.
 *
 * Dependências em runtime:
 *   - window._KCSA.getClient() — via supabase.adapter.js
 *   - window._KCSA.getCurrentUser() — via supabase.adapter.js
 *   - window._KCSA.media.compressImage() — via supabase.media.adapter.js
 *
 * RPCs consumidas (Supabase):
 *   - kc_chat_start_conversation(p_other_user_id)
 *   - kc_chat_send_message(p_conversation_id, p_content, p_message_type, p_media_path)
 *   - kc_chat_list_conversations(p_limit, p_before)
 *   - kc_chat_list_messages(p_conversation_id, p_limit, p_before_ts)
 *   - kc_chat_mark_read(p_conversation_id, p_until_message_id)
 *   - kc_chat_unread_total()
 *   - kc_chat_delete_message(p_message_id) → retorna media_path para hard-delete
 *   - kc_chat_edit_message(p_message_id, p_new_content)
 *   - kc_chat_block_user(p_other_user_id, p_reason)
 *   - kc_chat_unblock_user(p_other_user_id)
 *   - kc_chat_is_blocked(p_other_user_id)
 *   - kc_chat_report_message(p_message_id, p_reason, p_details)
 */
'use strict';

(function () {
  'use strict';

  window._KCSA = window._KCSA || {};

  function getClient() {
    return (window._KCSA && typeof window._KCSA.getClient === 'function')
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return (window._KCSA && typeof window._KCSA.getCurrentUser === 'function')
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  function getBucketName() {
    var ENV = (window.KCAPI && window.KCAPI.ENV) || {};
    return (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';
  }

  // ── Normalização de retornos das RPCs ────────────────────────────────────

  function normalizeConversation(row) {
    if (!row) return null;
    return {
      conversation_id: row.out_conversation_id || row.conversation_id,
      other_user_id: row.out_other_user_id || row.other_user_id,
      other_display_name: row.out_other_display_name || row.other_display_name || 'Usuário',
      other_avatar_url: row.out_other_avatar_url || row.other_avatar_url || null,
      last_message_at: row.out_last_message_at || row.last_message_at || null,
      last_message_preview: row.out_last_message_preview || row.last_message_preview || '',
      last_message_sender: row.out_last_message_sender || row.last_message_sender || null,
      last_message_type: row.out_last_message_type || row.last_message_type || null,
      unread_count: Number(row.out_unread_count || row.unread_count || 0),
      archived: row.out_archived === true,
    };
  }

  function normalizeMessage(row) {
    if (!row) return null;
    return {
      message_id: row.out_message_id || row.id || row.message_id,
      sender_id: row.out_sender_id || row.sender_id,
      message_type: row.out_message_type || row.message_type,
      content: row.out_content !== undefined ? row.out_content : row.content,
      media_path: row.out_media_path !== undefined ? row.out_media_path : row.media_path,
      created_at: row.out_created_at || row.created_at,
      edited_at: row.out_edited_at || row.edited_at || null,
      deleted_at: row.out_deleted_at || row.deleted_at || null,
      // V76.53: checkmark de leitura, reply/quote e reações
      read_at: row.out_read_at !== undefined ? row.out_read_at : (row.read_at || null),
      reply_to_id: row.out_reply_to_id !== undefined ? row.out_reply_to_id : (row.reply_to_id || null),
      reactions: Array.isArray(row.out_reactions) ? row.out_reactions
        : (Array.isArray(row.reactions) ? row.reactions : []),
    };
  }

  // ── start_conversation ───────────────────────────────────────────────────

  async function startConversation(otherUserId) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    if (!otherUserId) return { ok: false, error: { message: 'Usuário inválido.' } };
    try {
      var r = await client.rpc('kc_chat_start_conversation', { p_other_user_id: otherUserId });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) return { ok: false, error: { message: 'Resposta vazia.' } };
      return {
        ok: true,
        data: {
          conversation_id: row.out_conversation_id,
          is_new: row.out_is_new === true,
        },
      };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── send_message ─────────────────────────────────────────────────────────

  async function sendMessage(conversationId, opts) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    if (!conversationId) return { ok: false, error: { message: 'Conversa inválida.' } };
    var options = (opts && typeof opts === 'object') ? opts : {};
    var messageType = String(options.message_type || 'text');
    var content = options.content != null ? String(options.content) : null;
    var mediaPath = options.media_path != null ? String(options.media_path) : null;
    try {
      var r = await client.rpc('kc_chat_send_message', {
        p_conversation_id: conversationId,
        p_content: content,
        p_message_type: messageType,
        p_media_path: mediaPath,
      });
      if (r.error) return { ok: false, error: { message: r.error.message, code: r.error.code, hint: r.error.hint } };
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) return { ok: false, error: { message: 'Resposta vazia.' } };
      return {
        ok: true,
        data: {
          message_id: row.out_message_id,
          created_at: row.out_created_at,
        },
      };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── upload de imagem para chat ───────────────────────────────────────────

  async function uploadChatImage(conversationId, file, opts) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    var user = await getCurrentUser();
    if (!user || !user.id) return { ok: false, error: { message: 'Faça login para enviar imagens.' } };
    if (!conversationId) return { ok: false, error: { message: 'Conversa inválida.' } };
    if (!file) return { ok: false, error: { message: 'Arquivo inválido.' } };

    var allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    var mime = String(file.type || '').toLowerCase();
    if (!allowedTypes.has(mime)) {
      return { ok: false, error: { message: 'Use uma imagem JPG, PNG, WEBP ou GIF.' } };
    }
    var maxBytes = (opts && Number.isFinite(opts.maxBytes)) ? Number(opts.maxBytes) : 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      return { ok: false, error: { message: 'Imagem excede o limite (4 MB).' } };
    }

    // Magic bytes
    if (window._KCSA && window._KCSA.media && typeof window._KCSA.media.checkImageMagicBytes === 'function') {
      var actualMime = await window._KCSA.media.checkImageMagicBytes(file);
      if (!actualMime || !allowedTypes.has(actualMime)) {
        return { ok: false, error: { message: 'O arquivo não é uma imagem válida.' } };
      }
    }

    // Comprime (max 1200×900 JPEG 85%)
    var compressed = file;
    if (window._KCSA && window._KCSA.media && typeof window._KCSA.media.compressImage === 'function') {
      compressed = await window._KCSA.media.compressImage(file, 1200, 900, 0.85);
    }

    var ext = 'jpg';
    if (window._KCSA && window._KCSA.media && typeof window._KCSA.media.extFromMime === 'function') {
      ext = window._KCSA.media.extFromMime(compressed.type || mime) || 'jpg';
    }

    var bucket = getBucketName();
    var filename = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.' + ext;
    var path = 'chat-media/' + conversationId + '/' + user.id + '/' + filename;
    var up = await client.storage.from(bucket).upload(path, compressed, {
      contentType: compressed.type || mime || 'application/octet-stream',
      upsert: false,
    });
    if (up && up.error) {
      return { ok: false, error: { message: 'Falha no upload da imagem.', detail: up.error.message } };
    }
    return { ok: true, data: { path: path, bucket: bucket } };
  }

  // ── Upload de mídia NÃO-imagem (audio/document) com validação de segurança ─
  // MIME allowlist + verificação de magic bytes (onde aplicável) + limite de tamanho.
  var MEDIA_MIME_MAP = {
    // audio
    'audio/mpeg': { ext: 'mp3', type: 'audio' },
    'audio/mp3': { ext: 'mp3', type: 'audio' },
    'audio/m4a': { ext: 'm4a', type: 'audio' },
    'audio/x-m4a': { ext: 'm4a', type: 'audio' },
    'audio/aac': { ext: 'aac', type: 'audio' },
    'audio/ogg': { ext: 'ogg', type: 'audio' },
    'audio/wav': { ext: 'wav', type: 'audio' },
    'audio/x-wav': { ext: 'wav', type: 'audio' },
    'audio/webm': { ext: 'ogg', type: 'audio' },
    // document
    'application/pdf': { ext: 'pdf', type: 'document' },
    'application/msword': { ext: 'doc', type: 'document' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', type: 'document' },
  };
  var MEDIA_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

  // Magic bytes para os formatos suportados (header inspection anti-spoofing)
  function checkMediaMagicBytes(file) {
    return new Promise(function (resolve) {
      var info = MEDIA_MIME_MAP[String(file.type || '').toLowerCase()];
      if (!info) { resolve(null); return; }
      var slice = file.slice(0, 12);
      var reader = new FileReader();
      reader.onload = function () {
        var buf = new Uint8Array(reader.result);
        var hex = '';
        for (var i = 0; i < Math.min(buf.length, 12); i++) hex += buf[i].toString(16).padStart(2, '0');
        var valid = false;
        if (info.ext === 'mp3') valid = (hex.indexOf('fffb') === 0 || hex.indexOf('fff3') === 0 || hex.indexOf('494433') === 0); // MP3 or ID3
        else if (info.ext === 'ogg') valid = hex.indexOf('4f676753') === 0; // "OggS"
        else if (info.ext === 'wav') valid = hex.indexOf('52494646') === 0; // "RIFF"
        else if (info.ext === 'pdf') valid = hex.indexOf('25504446') === 0; // "%PDF"
        else if (info.ext === 'm4a' || info.ext === 'aac') valid = hex.indexOf('fff0') === 0 || hex.indexOf('0000') === 0 || hex.indexOf('4d34') === 0; // AAC/ADTS or M4A approx
        else if (info.ext === 'doc' || info.ext === 'docx') valid = hex.indexOf('d0cf11e0') === 0 || hex.indexOf('504b0304') === 0; // OLE or ZIP (docx)
        else valid = true; // unknown ext — allow (MIME already validated)
        resolve(valid ? file.type : null);
      };
      reader.onerror = function () { resolve(null); };
      reader.readAsArrayBuffer(slice);
    });
  }

  async function uploadChatMedia(conversationId, file, opts) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    var user = await getCurrentUser();
    if (!user || !user.id) return { ok: false, error: { message: 'Faça login para enviar arquivos.' } };
    if (!conversationId) return { ok: false, error: { message: 'Conversa inválida.' } };
    if (!file) return { ok: false, error: { message: 'Arquivo inválido.' } };

    var mime = String(file.type || '').toLowerCase();
    var info = MEDIA_MIME_MAP[mime];
    if (!info) {
      return { ok: false, error: { message: 'Tipo de arquivo não permitido. Use áudio (MP3, M4A, OGG, WAV, AAC) ou documento (PDF, DOC, DOCX).' } };
    }
    var maxBytes = (opts && Number.isFinite(opts.maxBytes)) ? Number(opts.maxBytes) : MEDIA_MAX_BYTES;
    if (file.size > maxBytes) {
      return { ok: false, error: { message: 'Arquivo excede o limite (' + Math.round(maxBytes / 1048576) + ' MB).' } };
    }

    // Magic bytes — rejeita se o conteúdo não bate com o MIME declarado
    var detected = await checkMediaMagicBytes(file);
    if (detected === null) {
      return { ok: false, error: { message: 'O arquivo parece estar corrompido ou não corresponde ao tipo declarado.' } };
    }

    var bucket = getBucketName();
    var filename = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.' + info.ext;
    var path = 'chat-media/' + conversationId + '/' + user.id + '/' + filename;
    var up = await client.storage.from(bucket).upload(path, file, {
      contentType: mime || 'application/octet-stream',
      upsert: false,
    });
    if (up && up.error) {
      return { ok: false, error: { message: 'Falha no upload do arquivo.', detail: up.error.message } };
    }
    return { ok: true, data: { path: path, bucket: bucket, mediaType: info.type, ext: info.ext } };
  }

  async function getSignedUrl(path, expiresInSeconds) {
    var client = getClient();
    if (!client || !path) return null;
    var bucket = getBucketName();
    var s = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds || 3600);
    if (s && s.error) return null;
    return (s && s.data && s.data.signedUrl) ? s.data.signedUrl : null;
  }

  async function deleteUploadedMedia(path) {
    var client = getClient();
    if (!client || !path) return { ok: false };
    var bucket = getBucketName();
    try {
      var r = await client.storage.from(bucket).remove([path]);
      if (r && r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── list_conversations ───────────────────────────────────────────────────

  async function listConversations(opts) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' }, data: [] };
    var options = (opts && typeof opts === 'object') ? opts : {};
    try {
      var r = await client.rpc('kc_chat_list_conversations', {
        p_limit: options.limit || 30,
        p_before: options.before || null,
      });
      if (r.error) return { ok: false, error: { message: r.error.message }, data: [] };
      var list = Array.isArray(r.data) ? r.data.map(normalizeConversation).filter(Boolean) : [];
      if (options.includeArchived !== true) {
        list = list.filter(function (c) { return !c.archived; });
      }
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) }, data: [] };
    }
  }

  // ── list_messages ────────────────────────────────────────────────────────

  async function listMessages(conversationId, opts) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' }, data: [] };
    var options = (opts && typeof opts === 'object') ? opts : {};
    try {
      var r = await client.rpc('kc_chat_list_messages', {
        p_conversation_id: conversationId,
        p_limit: options.limit || 50,
        p_before_ts: options.before_ts || null,
      });
      if (r.error) return { ok: false, error: { message: r.error.message }, data: [] };
      var list = Array.isArray(r.data) ? r.data.map(normalizeMessage).filter(Boolean) : [];
      // Inverte para ordem cronológica ascendente (UI espera assim)
      list.reverse();
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) }, data: [] };
    }
  }

  // ── mark_read ────────────────────────────────────────────────────────────

  async function markRead(conversationId, untilMessageId) {
    var client = getClient();
    if (!client) return { ok: false };
    try {
      var r = await client.rpc('kc_chat_mark_read', {
        p_conversation_id: conversationId,
        p_until_message_id: untilMessageId || null,
      });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── unread_total ─────────────────────────────────────────────────────────

  async function unreadTotal() {
    var client = getClient();
    if (!client) return 0;
    try {
      var r = await client.rpc('kc_chat_unread_total');
      if (r.error) return 0;
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      return row ? Number(row.out_total || 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  // ── delete_message ───────────────────────────────────────────────────────

  async function deleteMessage(messageId) {
    var client = getClient();
    if (!client) return { ok: false };
    try {
      var r = await client.rpc('kc_chat_delete_message', { p_message_id: messageId });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      var mediaPath = row ? row.out_media_path : null;
      // Hard-delete da imagem no Storage
      if (mediaPath) {
        var bucket = getBucketName();
        try { await client.storage.from(bucket).remove([mediaPath]); } catch (_) {}
      }
      return { ok: true, data: { media_path: mediaPath || null } };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── edit_message ─────────────────────────────────────────────────────────

  async function editMessage(messageId, newContent) {
    var client = getClient();
    if (!client) return { ok: false };
    try {
      var r = await client.rpc('kc_chat_edit_message', {
        p_message_id: messageId,
        p_new_content: newContent,
      });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── toggle_reaction (V76.53) ────────────────────────────────────────────
  // Usa RPC kc_chat_toggle_reaction (SECURITY DEFINER) que preenche user_id via
  // auth.uid() internamente. Isso resolve o problema de RLS: o insert direto na
  // tabela exigia user_id explícito para satisfazer a policy chat_reactions_upsert_own.

  async function toggleReaction(messageId, emoji) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    if (!messageId || !emoji) return { ok: false, error: { message: 'Parâmetros inválidos.' } };
    try {
      var r = await client.rpc('kc_chat_toggle_reaction', {
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) return { ok: false, error: { message: 'Resposta vazia.' } };
      if (row.ok === false) {
        return { ok: false, error: { message: row.error || 'Erro ao reagir.' } };
      }
      return { ok: true, data: { action: row.action } };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── set_message_reply (V76.53) ───────────────────────────────────────────
  // Marca reply_to_id numa mensagem própria recém-enviada. RLS permite update
  // de mensagens do próprio autor.

  async function setMessageReply(messageId, replyToId) {
    var client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    if (!messageId) return { ok: false, error: { message: 'message_id inválido.' } };
    try {
      var r = await client
        .from('chat_messages')
        .update({ reply_to_id: replyToId || null })
        .eq('id', messageId);
      if (r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── block / unblock / isBlocked ──────────────────────────────────────────

  async function blockUser(otherUserId, reason) {
    var client = getClient();
    if (!client) return { ok: false };
    try {
      var r = await client.rpc('kc_chat_block_user', { p_other_user_id: otherUserId, p_reason: reason || null });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  async function unblockUser(otherUserId) {
    var client = getClient();
    if (!client) return { ok: false };
    try {
      var r = await client.rpc('kc_chat_unblock_user', { p_other_user_id: otherUserId });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  async function isBlocked(otherUserId) {
    var client = getClient();
    if (!client) return { ok: false, data: { i_blocked: false, they_blocked: false } };
    try {
      var r = await client.rpc('kc_chat_is_blocked', { p_other_user_id: otherUserId });
      if (r.error) return { ok: false, error: { message: r.error.message }, data: { i_blocked: false, they_blocked: false } };
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      return {
        ok: true,
        data: {
          i_blocked: row ? row.out_i_blocked === true : false,
          they_blocked: row ? row.out_they_blocked === true : false,
        },
      };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) }, data: { i_blocked: false, they_blocked: false } };
    }
  }

  // ── Excluir (arquivar) conversa para o usuário atual ──────────────────────
  async function deleteConversation(conversationId, myUserId) {
    var client = getClient();
    if (!client || !conversationId || !myUserId) return { ok: false, error: { message: 'Parâmetros inválidos.' } };
    try {
      var q = await client.from('chat_conversations')
        .select('id, participant_low, participant_high').eq('id', conversationId).limit(1);
      if (q.error) return { ok: false, error: { message: q.error.message } };
      var row = Array.isArray(q.data) ? q.data[0] : q.data;
      if (!row) return { ok: false, error: { message: 'Conversa não encontrada.' } };
      var patch = {};
      if (String(row.participant_low) === String(myUserId)) patch.archived_by_low = true;
      else if (String(row.participant_high) === String(myUserId)) patch.archived_by_high = true;
      else return { ok: false, error: { message: 'Você não participa desta conversa.' } };
      var u = await client.from('chat_conversations').update(patch).eq('id', conversationId);
      if (u.error) return { ok: false, error: { message: u.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── report_message ───────────────────────────────────────────────────────

  async function reportMessage(messageId, reason, details) {
    var client = getClient();
    if (!client) return { ok: false };
    try {
      var r = await client.rpc('kc_chat_report_message', {
        p_message_id: messageId,
        p_reason: reason,
        p_details: details || null,
      });
      if (r.error) return { ok: false, error: { message: r.error.message } };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: { message: (e && e.message) || String(e) } };
    }
  }

  // ── Realtime: 1 canal por user, filtra postgres_changes em chat_messages ─

  function subscribeChat(userId, callback) {
    var client = getClient();
    if (!client || !userId) return null;
    var channel = client
      .channel('chat:' + userId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        function (payload) {
          if (typeof callback !== 'function') return;
          try {
            callback({
              eventType: String((payload && payload.eventType) || 'INSERT').toUpperCase(),
              new: (payload && payload.new) ? payload.new : null,
              old: (payload && payload.old) ? payload.old : null,
            });
          } catch (e) {
            console.warn('[KCAPI][chat] subscribeChat callback error:', e);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        function (payload) {
          if (typeof callback !== 'function') return;
          try {
            callback({
              eventType: 'CONVERSATION_' + String((payload && payload.eventType) || 'UPDATE').toUpperCase(),
              new: (payload && payload.new) ? payload.new : null,
              old: (payload && payload.old) ? payload.old : null,
            });
          } catch (e) {
            console.warn('[KCAPI][chat] subscribeChat (conv) error:', e);
          }
        }
      )
      .subscribe();
    return channel;
  }

  function unsubscribeChat(channel) {
    var client = getClient();
    if (!client || !channel) return;
    try { client.removeChannel(channel); } catch (_) {}
  }

  // ── Realtime: indicador "digitando..." (broadcast efêmero, sem persistir) ──
  // Canal nomeado por conversa. Não toca chat_messages nem nenhuma tabela.
  // Se o projeto Supabase não tiver broadcast habilitado, falha de forma graciosa
  // (o chat permanece 100% funcional, apenas sem o indicador).

  function typingChannelName(conversationId) {
    return 'chat-typing:' + String(conversationId || '');
  }

  function subscribeTyping(conversationId, userId, onTyping) {
    var client = getClient();
    if (!client || !conversationId || !userId || typeof onTyping !== 'function') return null;
    var channel;
    try {
      channel = client
        .channel(typingChannelName(conversationId), { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'typing' }, function (payload) {
          try {
            var from = payload && payload.payload && payload.payload.user_id;
            if (from && String(from) !== String(userId)) {
              onTyping({ user_id: from, at: Date.now() });
            }
          } catch (e) {
            console.warn('[KCAPI][chat] subscribeTyping callback error:', e);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('[KCAPI][chat] subscribeTyping falhou (gracioso):', e);
      return null;
    }
    return channel;
  }

  function broadcastTyping(conversationId, userId) {
    var client = getClient();
    if (!client || !conversationId || !userId) return;
    try {
      var channel = client.getChannels().filter(function (c) {
        return c && c.topic === typingChannelName(conversationId);
      })[0];
      if (!channel) return;
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: String(userId), at: Date.now() },
      });
    } catch (e) {
      // Gracioso: broadcast é opcional, o chat segue funcionando sem o indicador.
    }
  }

  function unsubscribeTyping(channel) {
    unsubscribeChat(channel);
  }

  // ── Expose ───────────────────────────────────────────────────────────────

  window._KCSA.chat = {
    startConversation: startConversation,
    sendMessage: sendMessage,
    uploadChatImage: uploadChatImage,
    uploadChatMedia: uploadChatMedia,
    getSignedUrl: getSignedUrl,
    deleteUploadedMedia: deleteUploadedMedia,
    listConversations: listConversations,
    listMessages: listMessages,
    markRead: markRead,
    unreadTotal: unreadTotal,
    deleteMessage: deleteMessage,
    editMessage: editMessage,
    toggleReaction: toggleReaction,
    setMessageReply: setMessageReply,
    blockUser: blockUser,
    unblockUser: unblockUser,
    isBlocked: isBlocked,
    deleteConversation: deleteConversation,
    reportMessage: reportMessage,
    subscribeChat: subscribeChat,
    unsubscribeChat: unsubscribeChat,
    subscribeTyping: subscribeTyping,
    broadcastTyping: broadcastTyping,
    unsubscribeTyping: unsubscribeTyping,
  };
})();
