
(function () {
  'use strict';
  // Sub-adapter de votes — registrado em window._KCSA.votes (v11.30.4)
  // Dependências resolvidas lazily via window._KCSA.getClient / getCurrentUser
  window._KCSA = window._KCSA || {};

  function getClient() {
    return (window._KCSA && typeof window._KCSA.getClient === 'function')
      ? window._KCSA.getClient() : null;
  }

  function getCurrentUser() {
    return (window._KCSA && typeof window._KCSA.getCurrentUser === 'function')
      ? window._KCSA.getCurrentUser() : Promise.resolve(null);
  }

  // ── Constantes e helpers utilitários ──────────────────────────────────────

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function normalizeErrorForDiagnostics(err) {
    if (!err) {
      return { message: 'Erro desconhecido.', code: 'UNKNOWN', details: null, hint: null };
    }
    if (typeof err === 'string') {
      return { message: err, code: 'ERROR_STRING', details: null, hint: null };
    }
    const message = String(err.message || err.msg || 'Erro desconhecido.');
    const code = (err.code != null && String(err.code).trim()) ? String(err.code).trim() : 'UNKNOWN';
    const details = (err.details != null) ? err.details : null;
    const hint = (err.hint != null) ? err.hint : null;
    return { message, code, details, hint };
  }

  // ── Helpers internos de votes ──────────────────────────────────────────────

  function logVoteError(step, error, context) {
    console.error('[KCAPI][votes]', {
      step: String(step || 'UNKNOWN'),
      error: normalizeErrorForDiagnostics(error),
      ...(context && typeof context === 'object' ? context : {}),
    });
  }

  function isVoteConflict(error) {
    if (!error) return false;
    const code = String(error.code || '').trim();
    const msg = String(error.message || '').toLowerCase();
    const details = String(error.details || '').toLowerCase();
    const hint = String(error.hint || '').toLowerCase();
    return (
      code === '23505' ||
      msg.includes('duplicate') ||
      msg.includes('conflict') ||
      msg.includes('post_votes_post_id_voter_id_key') ||
      details.includes('post_votes_post_id_voter_id_key') ||
      hint.includes('post_votes_post_id_voter_id_key')
    );
  }

  function voteFail(step, error, context) {
    logVoteError(step, error, context);
    return {
      ok: false,
      error: {
        message: 'Não foi possível registrar voto.',
        step: String(step || 'UNKNOWN'),
      },
    };
  }

  async function fetchPostScore(client, postUuid) {
    const scoreRes = await client.from('posts').select('votos').eq('id', postUuid).maybeSingle();
    if (scoreRes && scoreRes.error) {
      logVoteError('READ_SCORE', scoreRes.error, { postId: postUuid });
      return 0;
    }
    const value = scoreRes && scoreRes.data ? scoreRes.data.votos : 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  async function deleteVoteByPostAndVoter(client, postUuid, userId, step) {
    const delRes = await client
      .from('post_votes')
      .delete()
      .eq('post_id', postUuid)
      .eq('voter_id', userId);
    if (delRes && delRes.error) {
      return { ok: false, error: delRes.error, step: step || 'DELETE_VOTE' };
    }
    return { ok: true };
  }

  // Resolução lazy de UUID para posts legacy via window._KCSA.posts (se disponível)
  async function resolveLegacyPostUuid(postId) {
    try {
      const postsFn = window._KCSA && window._KCSA.posts && typeof window._KCSA.posts.getPostById === 'function'
        ? window._KCSA.posts.getPostById : null;
      if (!postsFn) return null;
      const p = await postsFn(String(postId));
      return (p && (p.uuid || p.id)) || null;
    } catch (_) { return null; }
  }

  // ── API: Buscar voto do usuário logado ─────────────────────────────────────

  async function getMyVote(postId) {
    const client = getClient();
    if (!client) return null;
    const user = await getCurrentUser();
    if (!user) return null;
    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) return null;
    try {
      const { data } = await client
        .from('post_votes')
        .select('id, direction')
        .eq('post_id', uuid)
        .eq('voter_id', user.id)
        .maybeSingle();
      return data || null;
    } catch (_) { return null; }
  }

  // ── API: Toggle voto num post ──────────────────────────────────────────────

  async function votePost(postId, direction, options = {}) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para votar.' } };
    if (direction !== 'hot' && direction !== 'cold') return { ok: false, error: { message: 'Direção inválida.' } };

    const uuid = (typeof postId === 'string' && UUID_RE.test(postId)) ? postId : null;
    if (!uuid) {
      // tenta resolver UUID para posts legacy
      try {
        const resolved = await resolveLegacyPostUuid(String(postId));
        if (!resolved || !UUID_RE.test(String(resolved))) return { ok: false, error: { message: 'Post inválido.' } };
        return votePost(String(resolved), direction, options);
      } catch (_) { return { ok: false, error: { message: 'Post inválido.' } }; }
    }

    try {
      let shouldToggleOff = false;
      const hasExplicitToggle = Object.prototype.hasOwnProperty.call(options || {}, 'toggleOff');
      if (hasExplicitToggle) {
        shouldToggleOff = !!options.toggleOff;
      } else {
        // Compatibilidade: chamadas antigas sem options continuam com toggle no mesmo botão.
        const existing = await getMyVote(uuid);
        shouldToggleOff = !!(existing && existing.direction === direction);
      }

      if (shouldToggleOff) {
        const del = await deleteVoteByPostAndVoter(client, uuid, user.id, 'TOGGLE_DELETE');
        if (!del.ok) return voteFail(del.step, del.error, { postId: uuid, userId: user.id, direction });
        const score = await fetchPostScore(client, uuid);
        return { ok: true, direction: null, score };
      }

      // Escrita idempotente: limpa voto existente antes de inserir nova direção.
      const preDelete = await deleteVoteByPostAndVoter(client, uuid, user.id, 'PREPARE_DELETE');
      if (!preDelete.ok) return voteFail(preDelete.step, preDelete.error, { postId: uuid, userId: user.id, direction });

      let insertRes = await client
        .from('post_votes')
        .insert({ post_id: uuid, voter_id: user.id, direction });

      // Corrida de concorrência: tenta 1 ciclo de recuperação.
      if (insertRes && insertRes.error) {
        if (!isVoteConflict(insertRes.error)) {
          return voteFail('INSERT', insertRes.error, { postId: uuid, userId: user.id, direction });
        }

        logVoteError('INSERT_CONFLICT_RECOVERY_START', insertRes.error, { postId: uuid, userId: user.id, direction });

        const recoveryDelete = await deleteVoteByPostAndVoter(client, uuid, user.id, 'RECOVERY_DELETE');
        if (!recoveryDelete.ok) {
          return voteFail(recoveryDelete.step, recoveryDelete.error, { postId: uuid, userId: user.id, direction });
        }

        insertRes = await client
          .from('post_votes')
          .insert({ post_id: uuid, voter_id: user.id, direction });

        if (insertRes && insertRes.error) {
          return voteFail('RECOVERY_INSERT', insertRes.error, { postId: uuid, userId: user.id, direction });
        }
      }

      const score = await fetchPostScore(client, uuid);
      return { ok: true, direction, score };
    } catch (e) {
      return voteFail('EXCEPTION', e, { postId: uuid, userId: user.id, direction });
    }
  }

  window._KCSA.votes = {
    getMyVote,
    votePost,
  };
})();
