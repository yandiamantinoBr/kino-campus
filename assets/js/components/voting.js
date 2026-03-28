/* KinoCampus - Voting Component */

let kcVotesRealtimeChannel = null;
let kcVotesRealtimeRetryTimer = null;
let kcVotesPollingTimer = null;
let kcInitVoteStatesTimer = null;

const KC_VOTE_IN_FLIGHT = new Set();
const KC_VOTE_PENDING_STATE = new Map();

// Cache de sessão para direção de voto do usuário atual
// Evita re-fetch do RPC a cada append de posts — aplica instantaneamente do cache
const KC_MY_VOTES_CACHE = new Map(); // postId → direction ('hot' | 'cold' | null)
let KC_MY_VOTES_CACHE_TS = 0;
const KC_MY_VOTES_CACHE_TTL = 30000; // 30s

function kcMyVotesCacheGet(postId) {
  return KC_MY_VOTES_CACHE.has(postId) ? KC_MY_VOTES_CACHE.get(postId) : undefined;
}

function kcMyVotesCacheSet(postId, direction) {
  KC_MY_VOTES_CACHE.set(postId, direction);
}

function kcMyVotesCacheIsFresh() {
  return KC_MY_VOTES_CACHE.size > 0 && (Date.now() - KC_MY_VOTES_CACHE_TS) < KC_MY_VOTES_CACHE_TTL;
}

function kcApplyMyVotesCacheToDOM() {
  if (!KC_MY_VOTES_CACHE.size) return;
  KC_MY_VOTES_CACHE.forEach((direction, postId) => {
    if (kcHasPendingVote(postId)) return;
    const boxes = kcGetVoteBoxesForPost(postId);
    boxes.forEach((voteBox) => {
      const current = kcReadVoteState(voteBox);
      kcApplyVoteStateToBox(voteBox, { score: current.score, direction, pending: false }, { force: true });
    });
  });
}

function kcIsUuid(value) {
  return KC_UUID_RE.test(String(value || '').trim());
}

function kcDecodeAttr(value) {
  if (value == null) return '';
  try {
    return decodeURIComponent(String(value));
  } catch (_) {
    return String(value || '');
  }
}

function kcNormalizeDirection(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'hot' || normalized === 'cold' ? normalized : null;
}

function kcGetVoteScoreEl(voteBox) {
  return voteBox ? voteBox.querySelector('[data-kc-vote-score]') : null;
}

function kcGetVoteButtons(voteBox) {
  return voteBox ? Array.from(voteBox.querySelectorAll('button')) : [];
}

function kcGetVotePostIdFromButton(button) {
  if (!button) return '';
  const rawUuid = kcDecodeAttr(button.getAttribute('data-post-uuid'));
  const rawId = kcDecodeAttr(button.getAttribute('data-post-id'));
  return rawUuid || rawId || '';
}

function kcGetVotePostIdFromBox(voteBox) {
  if (!voteBox) return '';
  const firstButton = voteBox.querySelector('[data-post-id], [data-post-uuid]');
  return kcGetVotePostIdFromButton(firstButton);
}

function kcGetVoteBoxesForPost(postId) {
  const wanted = String(postId || '').trim();
  if (!wanted) return [];

  const boxes = new Set();
  document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]').forEach((button) => {
    if (kcGetVotePostIdFromButton(button) !== wanted) return;
    const voteBox = button.closest('.kc-vote-box');
    if (voteBox) boxes.add(voteBox);
  });
  return Array.from(boxes);
}

function kcReadVoteState(voteBox) {
  const scoreEl = kcGetVoteScoreEl(voteBox);
  const hotBtn = voteBox ? voteBox.querySelector('[data-action="vote-hot"]') : null;
  const coldBtn = voteBox ? voteBox.querySelector('[data-action="vote-cold"]') : null;
  return {
    score: parseInt(scoreEl && scoreEl.textContent, 10) || 0,
    direction: hotBtn && hotBtn.classList.contains('active')
      ? 'hot'
      : ((coldBtn && coldBtn.classList.contains('active')) ? 'cold' : null)
  };
}

function kcAnimateVoteScore(scoreEl) {
  if (!scoreEl) return;
  scoreEl.classList.remove('is-score-bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('is-score-bump');
  window.setTimeout(() => {
    try { scoreEl.classList.remove('is-score-bump'); } catch (_) { }
  }, 220);
}

function kcSetVoteBoxPending(voteBox, pending) {
  if (!voteBox) return;
  kcGetVoteButtons(voteBox).forEach((btn) => {
    if (pending) btn.setAttribute('disabled', 'disabled');
    else btn.removeAttribute('disabled');
  });
  voteBox.classList.toggle('is-pending', !!pending);
  voteBox.dataset.kcVotePending = pending ? '1' : '0';
}

function kcApplyVoteStateToBox(voteBox, state, options = {}) {
  if (!voteBox || !state) return;
  const scoreEl = kcGetVoteScoreEl(voteBox);
  const hotBtn = voteBox.querySelector('[data-action="vote-hot"]');
  const coldBtn = voteBox.querySelector('[data-action="vote-cold"]');
  const direction = kcNormalizeDirection(state.direction);
  const score = Number.isFinite(Number(state.score)) ? Number(state.score) : 0;

  if (scoreEl) {
    scoreEl.textContent = String(score);
    if (options.animate) kcAnimateVoteScore(scoreEl);
  }

  if (hotBtn) hotBtn.classList.toggle('active', direction === 'hot');
  if (coldBtn) coldBtn.classList.toggle('active', direction === 'cold');
  kcSetVoteBoxPending(voteBox, !!state.pending);
}

function kcApplyVoteStateToPost(postId, state, options = {}) {
  const boxes = kcGetVoteBoxesForPost(postId);
  boxes.forEach((voteBox) => kcApplyVoteStateToBox(voteBox, state, options));
}

function kcHasPendingVote(postId) {
  return KC_VOTE_PENDING_STATE.has(String(postId || '').trim());
}

function kcUpdateVoteScoreInDOM(postId, score, options = {}) {
  const targetId = String(postId || '').trim();
  if (!targetId) return;
  if (kcHasPendingVote(targetId) && !options.force) return;

  kcGetVoteBoxesForPost(targetId).forEach((voteBox) => {
    const current = kcReadVoteState(voteBox);
    kcApplyVoteStateToBox(voteBox, {
      score,
      direction: current.direction,
      pending: false
    }, options);
  });
}

function kcBuildTrackingPost(voteBox) {
  const card = voteBox ? voteBox.closest('.kc-card') : null;
  if (!card) return null;
  return {
    module: card.getAttribute('data-module') || '',
    category: card.getAttribute('data-category') || '',
    subcategory: card.getAttribute('data-subcategory') || '',
    title: (card.querySelector('.kc-card__title') || {}).textContent || '',
    description: (card.querySelector('.kc-card__description-preview') || {}).textContent || '',
    tagKeys: String(card.getAttribute('data-kc-tags') || '').split(/\s+/).filter(Boolean)
  };
}

function kcInitVotesRealtime() {
  if (!isSupabaseRuntime()) return;
  if (kcVotesRealtimeChannel) return;

  const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
    ? window.KCSupabase.getClient()
    : null;
  if (!client || typeof client.channel !== 'function') {
    if (!kcVotesRealtimeRetryTimer) {
      kcVotesRealtimeRetryTimer = window.setTimeout(() => {
        kcVotesRealtimeRetryTimer = null;
        kcInitVotesRealtime();
      }, 400);
    }
    return;
  }

  const refreshVisibleScores = async () => {
    try {
      const ids = Array.from(new Set(
        Array.from(document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]'))
          .map((el) => kcGetVotePostIdFromButton(el))
          .filter((id) => kcIsUuid(id) && !kcHasPendingVote(id))
      ));
      if (!ids.length) return;

      const { data, error } = await client
        .from('posts')
        .select('id, votos')
        .in('id', ids);

      if (error || !Array.isArray(data)) return;
      data.forEach((row) => {
        if (!row || !row.id || kcHasPendingVote(row.id)) return;
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
          if (!row || !row.id || !Object.prototype.hasOwnProperty.call(row, 'votos')) return;
          if (kcHasPendingVote(row.id)) return;
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
      kcVotesPollingTimer = window.setInterval(() => {
        if (document.hidden) return;
        refreshVisibleScores();
      }, 5000);
    }

    refreshVisibleScores();
  } catch (_) {
    kcVotesRealtimeChannel = null;
  }
}

function vote(button, type) {
  const voteBox = button ? button.closest('.kc-vote-box') : null;
  if (!voteBox) return;

  const postId = kcGetVotePostIdFromButton(button)
    || voteBox.closest('[data-post-id]')?.getAttribute('data-post-id')
    || getCurrentPostId();
  const lockKey = String(postId || '').trim();

  if (!lockKey) {
    showToast('Não foi possível identificar a publicação para votar.', 'error');
    return;
  }

  // Se Supabase está ativo e não há usuário logado, abre o modal de login
  if (isSupabaseRuntime()) {
    const currentUser = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!currentUser) {
      if (typeof window.kcOpenAuthModal === 'function') {
        window.kcOpenAuthModal({ tab: 'login' });
      } else {
        showToast('Faça login para votar.', 'info');
      }
      return;
    }
  }

  if (!isSupabaseRuntime()) {
    const localState = kcReadVoteState(voteBox);
    const nextDirection = localState.direction === type ? null : type;
    let nextScore = localState.score;
    if (localState.direction === 'hot') nextScore -= 1;
    if (localState.direction === 'cold') nextScore += 1;
    if (nextDirection === 'hot') nextScore += 1;
    if (nextDirection === 'cold') nextScore -= 1;
    kcApplyVoteStateToPost(lockKey, { score: nextScore, direction: nextDirection, pending: false }, { animate: true });
    return;
  }

  if (KC_VOTE_IN_FLIGHT.has(lockKey)) return;

  const previousState = kcReadVoteState(voteBox);
  const nextDirection = previousState.direction === type ? null : type;
  let optimisticScore = previousState.score;

  if (previousState.direction === 'hot') optimisticScore -= 1;
  if (previousState.direction === 'cold') optimisticScore += 1;
  if (nextDirection === 'hot') optimisticScore += 1;
  if (nextDirection === 'cold') optimisticScore -= 1;

  KC_VOTE_IN_FLIGHT.add(lockKey);
  KC_VOTE_PENDING_STATE.set(lockKey, {
    score: optimisticScore,
    direction: nextDirection
  });

  kcApplyVoteStateToPost(lockKey, {
    score: optimisticScore,
    direction: nextDirection,
    pending: true
  }, { animate: true });

  KCAPI.votePost(lockKey, type, { toggleOff: previousState.direction === type }).then((res) => {
    if (!res || res.ok === false) {
      const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível registrar voto.';
      kcApplyVoteStateToPost(lockKey, {
        score: previousState.score,
        direction: previousState.direction,
        pending: false
      }, { animate: true, force: true });
      showToast(msg, 'error');
      return;
    }

    const finalDirection = kcNormalizeDirection(res.direction);
    const finalScore = Number.isFinite(Number(res.score)) ? Number(res.score) : optimisticScore;
    kcApplyVoteStateToPost(lockKey, {
      score: finalScore,
      direction: finalDirection,
      pending: false
    }, { animate: true, force: true });

    // Atualiza o cache com a direção confirmada pelo servidor
    kcMyVotesCacheSet(lockKey, finalDirection);
    KC_MY_VOTES_CACHE_TS = Date.now();

    if (finalDirection && window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
      window.KCHomeCategories.trackEvent('vote', { post: kcBuildTrackingPost(voteBox) });
    }
  }).catch(() => {
    kcApplyVoteStateToPost(lockKey, {
      score: previousState.score,
      direction: previousState.direction,
      pending: false
    }, { animate: true, force: true });
    showToast('Não foi possível registrar voto.', 'error');
  }).finally(() => {
    KC_VOTE_IN_FLIGHT.delete(lockKey);
    KC_VOTE_PENDING_STATE.delete(lockKey);
  });
}

async function kcInitVoteStates() {
  if (!isSupabaseRuntime()) return;

  // 1. Aplica do cache imediatamente (sem esperar DB)
  kcApplyMyVotesCacheToDOM();

  // 2. Coleta IDs visíveis ainda não cacheados (ou cache expirado)
  const postIds = [];
  const idSet = new Set();
  const needsFetch = !kcMyVotesCacheIsFresh();

  document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]').forEach((btn) => {
    const id = kcGetVotePostIdFromButton(btn);
    if (id && kcIsUuid(id) && !idSet.has(id)) {
      idSet.add(id);
      // Só precisa buscar IDs não cacheados ou quando cache expirou
      if (needsFetch || kcMyVotesCacheGet(id) === undefined) {
        postIds.push(id);
      }
    }
  });

  if (!postIds.length) return;

  try {
    const client = KCSupabase && typeof KCSupabase.getClient === 'function' ? KCSupabase.getClient() : null;
    if (!client) return;

    const { data, error } = await client.rpc('kc_get_my_votes', { p_post_ids: postIds });
    if (error || !Array.isArray(data)) return;

    const voteMap = {};
    data.forEach((row) => {
      if (row && row.post_id) voteMap[row.post_id] = kcNormalizeDirection(row.direction);
    });

    // Atualiza cache e aplica ao DOM
    postIds.forEach((postId) => {
      const direction = voteMap[postId] || null;
      kcMyVotesCacheSet(postId, direction);
    });
    KC_MY_VOTES_CACHE_TS = Date.now();

    idSet.forEach((postId) => {
      if (kcHasPendingVote(postId)) return;
      kcApplyVoteStateToPost(postId, {
        score: kcReadVoteState(kcGetVoteBoxesForPost(postId)[0]).score,
        direction: voteMap[postId],
        pending: false
      }, { force: true });
    });
  } catch (_) {
    // silencioso — não quebra o feed
  }
}
