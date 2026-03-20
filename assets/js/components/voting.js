/* KinoCampus - Voting Component */
let kcVotesRealtimeChannel = null;
let kcVotesRealtimeRetryTimer = null;
let kcVotesPollingTimer = null;

function kcUpdateVoteScoreInDOM(postId, score) {
  const encoded = encodeURIComponent(String(postId || ''));
  if (!encoded) return;
  const scoreText = String(Number.isFinite(Number(score)) ? Number(score) : 0);

  document.querySelectorAll(`.kc-vote-box [data-post-uuid="${encoded}"], .kc-vote-box [data-post-id="${encoded}"]`).forEach((btn) => {
    const voteBox = btn.closest('.kc-vote-box');
    const scoreEl = voteBox ? voteBox.querySelector('span') : null;
    if (scoreEl) scoreEl.textContent = scoreText;
  });
}

function kcIsUuid(value) {
  return KC_UUID_RE.test(String(value || '').trim());
}

function kcInitVotesRealtime() {
  if (!isSupabaseRuntime()) return;
  if (kcVotesRealtimeChannel) return;

  const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
    ? window.KCSupabase.getClient()
    : null;
  if (!client || typeof client.channel !== 'function') {
    if (!kcVotesRealtimeRetryTimer) {
      kcVotesRealtimeRetryTimer = setTimeout(() => {
        kcVotesRealtimeRetryTimer = null;
        kcInitVotesRealtime();
      }, 1200);
    }
    return;
  }

  const refreshVisibleScores = async () => {
    try {
      const ids = Array.from(new Set(Array.from(document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]'))
        .map((el) => {
          const rawUuid = String(el.getAttribute('data-post-uuid') || '').trim();
          const rawId = String(el.getAttribute('data-post-id') || '').trim();
          const chosen = rawUuid || rawId;
          return chosen ? decodeURIComponent(chosen) : '';
        })
        .filter((id) => kcIsUuid(id))));
      if (!ids.length) return;

      const { data, error } = await client
        .from('posts')
        .select('id, votos')
        .in('id', ids);

      if (error || !Array.isArray(data)) return;
      data.forEach((row) => {
        if (!row || !row.id) return;
        kcUpdateVoteScoreInDOM(row.id, row.votos);
      });
    } catch (_) { }
  };

  try {
    kcVotesRealtimeChannel = client
      .channel(`kc-votes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          const row = payload && payload.new ? payload.new : null;
          if (!row || !row.id) return;
          if (!Object.prototype.hasOwnProperty.call(row, 'votos')) return;
          kcUpdateVoteScoreInDOM(row.id, row.votos);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_votes' },
        () => { refreshVisibleScores(); }
      )
      .subscribe();

    if (!kcVotesPollingTimer) {
      kcVotesPollingTimer = setInterval(() => {
        if (document.hidden) return;
        refreshVisibleScores();
      }, 5000);
    }

    refreshVisibleScores();
  } catch (_) {
    kcVotesRealtimeChannel = null;
  }
}




// -----------------------------
// Vote box
// -----------------------------
const KC_VOTE_IN_FLIGHT = new Set();

function setVoteBoxPending(voteBox, pending) {
  if (!voteBox) return;
  voteBox.querySelectorAll('button').forEach((btn) => {
    if (pending) btn.setAttribute('disabled', 'disabled');
    else btn.removeAttribute('disabled');
  });
  voteBox.dataset.kcVotePending = pending ? '1' : '0';
}

function restoreVoteUI(voteBox, scoreElement, previousScoreText, previousActiveStates) {
  if (scoreElement) scoreElement.textContent = String(previousScoreText);
  const voteButtons = voteBox ? Array.from(voteBox.querySelectorAll('button')) : [];
  voteButtons.forEach((btn, idx) => {
    btn.classList.toggle('active', !!previousActiveStates[idx]);
  });
}

function vote(button, type) {
  const voteBox = button.closest('.kc-vote-box');
  if (!voteBox) return;

  const scoreElement = voteBox.querySelector('span');
  if (!scoreElement) return;
  const voteButtons = Array.from(voteBox.querySelectorAll('button'));
  if (!voteButtons.length) return;

  const currentScore = parseInt(scoreElement.textContent, 10) || 0;
  const isActive = button.classList.contains('active');
  const previousScoreText = scoreElement.textContent;
  const previousActiveStates = voteButtons.map((btn) => btn.classList.contains('active'));

  const isSupabaseMode = isSupabaseRuntime();
  const buttonUuid = button.getAttribute('data-post-uuid');
  const buttonPostId = button.getAttribute('data-post-id');
  const decodedUuid = buttonUuid ? decodeURIComponent(String(buttonUuid)) : '';
  const decodedPostId = buttonPostId ? decodeURIComponent(String(buttonPostId)) : '';
  const postId = decodedUuid || decodedPostId || button.closest('[data-post-id]')?.dataset.postId || getCurrentPostId();
  const lockKey = String(postId || '').trim();

  if (isSupabaseMode && !lockKey) {
    showToast('Não foi possível identificar a publicação para votar.', 'error');
    return;
  }

  if (isSupabaseMode && KC_VOTE_IN_FLIGHT.has(lockKey)) return;

  // clear
  voteButtons.forEach(btn => btn.classList.remove('active'));

  // Qual tipo estava ativo?
  let previouslyActiveType = null;
  voteButtons.forEach((btn, idx) => {
    if (previousActiveStates[idx]) {
      const action = String(btn.getAttribute('data-action') || '');
      if (action.includes('hot')) previouslyActiveType = 'hot';
      if (action.includes('cold')) previouslyActiveType = 'cold';
    }
  });

  // Reverte o efeito do voto anterior na view local
  let baseScore = currentScore;
  if (previouslyActiveType === 'hot') {
    baseScore -= 1;
  } else if (previouslyActiveType === 'cold') {
    baseScore += 1;
  }

  // Aplica o novo estado otimista
  let newScore = baseScore;
  if (!isActive) {
    button.classList.add('active');
    newScore = type === 'hot' ? baseScore + 1 : baseScore - 1;
  }

  scoreElement.textContent = String(newScore);
  if (postId) kcUpdateVoteScoreInDOM(postId, newScore);

  // micro animation
  scoreElement.style.transform = 'scale(1.15)';
  setTimeout(() => { scoreElement.style.transform = 'scale(1)'; }, 160);

  // Modo local: mantém UX otimista sem escrita remota.
  if (!isSupabaseMode) return;

  KC_VOTE_IN_FLIGHT.add(lockKey);
  setVoteBoxPending(voteBox, true);

  // Supabase: explicita intenção de toggle para reduzir corrida de múltiplos cliques.
  window.KCAPI.votePost(postId, type, { toggleOff: isActive }).then(function (res) {
    if (res && res.ok) {
      if (typeof res.score === 'number') {
        scoreElement.textContent = String(res.score);
        kcUpdateVoteScoreInDOM(postId, res.score);
      }

      if (res.direction === null) {
        voteButtons.forEach((btn) => btn.classList.remove('active'));
      } else {
        voteButtons.forEach((btn) => {
          const action = String(btn.getAttribute('data-action') || '').trim().toLowerCase();
          const btnType = action === 'vote-hot' ? 'hot' : (action === 'vote-cold' ? 'cold' : '');
          btn.classList.toggle('active', btnType === res.direction);
        });
      }
      return;
    }

    restoreVoteUI(voteBox, scoreElement, previousScoreText, previousActiveStates);
    const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível registrar voto.';
    showToast(msg, 'error');
  }).catch(function () {
    restoreVoteUI(voteBox, scoreElement, previousScoreText, previousActiveStates);
    showToast('Não foi possível registrar voto.', 'error');
  }).finally(function () {
    KC_VOTE_IN_FLIGHT.delete(lockKey);
    setVoteBoxPending(voteBox, false);
  });
}

// -----------------------------
// Inicializa estados hot/cold dos vote-boxes visíveis
// Chama a RPC kc_get_my_votes para obter os votos do
// usuário autenticado para todos os posts no feed.
// -----------------------------
async function kcInitVoteStates() {
  if (!isSupabaseRuntime()) return;

  // Coleta todos os post-ids presentes no DOM
  const postIds = [];
  const idSet = new Set();
  document.querySelectorAll('[data-action="vote-hot"][data-post-id], [data-action="vote-hot"][data-post-uuid]').forEach((btn) => {
    const rawUuid = btn.getAttribute('data-post-uuid');
    const rawId = btn.getAttribute('data-post-id');
    const id = rawUuid ? decodeURIComponent(rawUuid) : (rawId ? decodeURIComponent(rawId) : null);
    if (id && kcIsUuid(id) && !idSet.has(id)) {
      idSet.add(id);
      postIds.push(id);
    }
  });
  if (!postIds.length) return;

  try {
    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function' ? window.KCSupabase.getClient() : null;
    if (!client) return;

    const { data, error } = await client.rpc('kc_get_my_votes', { p_post_ids: postIds });
    if (error || !Array.isArray(data)) return;

    // Monta mapa: post_id -> direction
    const voteMap = {};
    data.forEach((row) => { voteMap[row.post_id] = row.direction; });

    // Aplica ao DOM
    idSet.forEach((postId) => {
      const dir = voteMap[postId];
      if (!dir) return; // sem voto registrado

      // Localiza o vote-box pelo data-post-id (pode ser encoded)
      const encoded = encodeURIComponent(postId);
      const hotBtn = document.querySelector(`[data-action="vote-hot"][data-post-id="${encoded}"]`);
      const coldBtn = document.querySelector(`[data-action="vote-cold"][data-post-id="${encoded}"]`);
      if (!hotBtn && !coldBtn) return;

      if (hotBtn) hotBtn.classList.toggle('active', dir === 'hot');
      if (coldBtn) coldBtn.classList.toggle('active', dir === 'cold');
    });
  } catch (_) {
    // silencioso — não quebra o feed
  }
}
