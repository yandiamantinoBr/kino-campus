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
const KC_VOTE_SCORE_CACHE = new Map(); // postId -> last visible score
let KC_VOTE_SCORE_CACHE_TS = 0;
const KC_VOTE_SCORE_CACHE_TTL = 15000; // 15s
const KC_VOTE_SESSION_MAX_AGE_MS = 1000 * 60 * 5;
const KC_VOTE_CACHE_MAX_ENTRIES = 250;
let KC_VOTE_SESSION_HYDRATED_FOR = null;
let KC_VOTE_SESSION_WRITE_TIMER = null;

function kcIsSupabaseRuntime() {
  if (typeof isSupabaseRuntime === 'function') return isSupabaseRuntime();
  try {
    return !!(window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver === 'supabase');
  } catch (_) {
    return false;
  }
}

function kcMyVotesCacheGet(postId) {
  return KC_MY_VOTES_CACHE.has(postId) ? KC_MY_VOTES_CACHE.get(postId) : undefined;
}

function kcMyVotesCacheSet(postId, direction) {
  if (kcRememberMyVoteDirection(postId, direction)) kcScheduleVoteSessionPersist();
}

function kcMyVotesCacheIsFresh() {
  return KC_MY_VOTES_CACHE.size > 0 && (Date.now() - KC_MY_VOTES_CACHE_TS) < KC_MY_VOTES_CACHE_TTL;
}

function kcVoteScoreCacheGet(postId) {
  return KC_VOTE_SCORE_CACHE.has(postId) ? KC_VOTE_SCORE_CACHE.get(postId) : undefined;
}

function kcVoteScoreCacheIsFresh(postIds) {
  if (!KC_VOTE_SCORE_CACHE.size) return false;
  if ((Date.now() - KC_VOTE_SCORE_CACHE_TS) >= KC_VOTE_SCORE_CACHE_TTL) return false;
  if (Array.isArray(postIds) && postIds.some((postId) => !KC_VOTE_SCORE_CACHE.has(postId))) return false;
  return true;
}

function kcGetVoteSessionStore() {
  return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
    ? window.KCSessionStore
    : null;
}

function kcTrimVoteCacheMap(cacheMap) {
  while (cacheMap.size > KC_VOTE_CACHE_MAX_ENTRIES) {
    const firstKey = cacheMap.keys().next().value;
    if (typeof firstKey === 'undefined') break;
    cacheMap.delete(firstKey);
  }
}

function kcReadSessionCacheMap(key, maxAge) {
  const store = kcGetVoteSessionStore();
  if (!store) return null;
  const cached = store.get('votes', key, { maxAge: maxAge || KC_VOTE_SESSION_MAX_AGE_MS });
  const value = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
  if (!value) return null;
  return {
    value,
    timestamp: Number(cached.timestamp) || 0,
  };
}

function kcGetVoteCacheIdentity() {
  try {
    if (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') {
      const currentUser = window.KCSupabase.getUser();
      if (currentUser && currentUser.id) return `supabase:${currentUser.id}`;
    }
  } catch (_) { }
  return kcIsSupabaseRuntime() ? 'supabase:anon' : 'local';
}

function kcGetVoteDirectionsSessionKey() {
  return `directions:${kcGetVoteCacheIdentity()}`;
}

function kcRememberMyVoteDirection(postId, direction, options = {}) {
  const normalizedId = String(postId || '').trim();
  if (!normalizedId) return;
  const normalizedDirection = kcNormalizeDirection(direction);
  const previous = KC_MY_VOTES_CACHE.has(normalizedId) ? KC_MY_VOTES_CACHE.get(normalizedId) : undefined;
  if (previous === normalizedDirection) return false;
  if (KC_MY_VOTES_CACHE.has(normalizedId)) KC_MY_VOTES_CACHE.delete(normalizedId);
  KC_MY_VOTES_CACHE.set(normalizedId, normalizedDirection);
  kcTrimVoteCacheMap(KC_MY_VOTES_CACHE);
  if (options.touch !== false) KC_MY_VOTES_CACHE_TS = Date.now();
  return true;
}

function kcRememberVoteScore(postId, score, options = {}) {
  const normalizedId = String(postId || '').trim();
  const nextScore = Number(score);
  if (!normalizedId || !Number.isFinite(nextScore)) return false;
  const previous = KC_VOTE_SCORE_CACHE.has(normalizedId) ? KC_VOTE_SCORE_CACHE.get(normalizedId) : undefined;
  if (previous === nextScore) return false;
  if (KC_VOTE_SCORE_CACHE.has(normalizedId)) KC_VOTE_SCORE_CACHE.delete(normalizedId);
  KC_VOTE_SCORE_CACHE.set(normalizedId, nextScore);
  kcTrimVoteCacheMap(KC_VOTE_SCORE_CACHE);
  if (options.touch !== false) KC_VOTE_SCORE_CACHE_TS = Date.now();
  return true;
}

function kcPersistVoteSessionNow() {
  const store = kcGetVoteSessionStore();
  if (!store) return;

  const directions = {};
  KC_MY_VOTES_CACHE.forEach((direction, postId) => {
    directions[postId] = kcNormalizeDirection(direction);
  });

  const scores = {};
  KC_VOTE_SCORE_CACHE.forEach((score, postId) => {
    if (Number.isFinite(Number(score))) scores[postId] = Number(score);
  });

  if (Object.keys(directions).length) store.set('votes', kcGetVoteDirectionsSessionKey(), directions);
  else if (typeof store.remove === 'function') store.remove('votes', kcGetVoteDirectionsSessionKey());

  if (Object.keys(scores).length) store.set('votes', 'scores', scores);
  else if (typeof store.remove === 'function') store.remove('votes', 'scores');
}

function kcScheduleVoteSessionPersist() {
  if (KC_VOTE_SESSION_WRITE_TIMER) return;
  KC_VOTE_SESSION_WRITE_TIMER = window.setTimeout(() => {
    KC_VOTE_SESSION_WRITE_TIMER = null;
    kcPersistVoteSessionNow();
  }, 120);
}

function kcEnsureVoteSessionHydrated() {
  const identity = kcGetVoteCacheIdentity();
  if (KC_VOTE_SESSION_HYDRATED_FOR === identity) return;

  KC_MY_VOTES_CACHE.clear();
  KC_MY_VOTES_CACHE_TS = 0;
  KC_VOTE_SCORE_CACHE.clear();
  KC_VOTE_SCORE_CACHE_TS = 0;

  const cachedDirections = kcReadSessionCacheMap(kcGetVoteDirectionsSessionKey(), KC_VOTE_SESSION_MAX_AGE_MS);
  if (cachedDirections && cachedDirections.value) {
    Object.keys(cachedDirections.value).forEach((postId) => {
      kcRememberMyVoteDirection(postId, cachedDirections.value[postId], { touch: false });
    });
    KC_MY_VOTES_CACHE_TS = Number(cachedDirections.timestamp) || 0;
  }

  const cachedScores = kcReadSessionCacheMap('scores', KC_VOTE_SESSION_MAX_AGE_MS);
  if (cachedScores && cachedScores.value) {
    Object.keys(cachedScores.value).forEach((postId) => {
      kcRememberVoteScore(postId, cachedScores.value[postId], { touch: false });
    });
    KC_VOTE_SCORE_CACHE_TS = Number(cachedScores.timestamp) || 0;
  }

  KC_VOTE_SESSION_HYDRATED_FOR = identity;
}

function kcApplyMyVotesCacheToDOM() {
  kcEnsureVoteSessionHydrated();

  const handledIds = new Set();
  document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]').forEach((button) => {
    const postId = kcGetVotePostIdFromButton(button);
    if (!postId || handledIds.has(postId) || kcHasPendingVote(postId)) return;
    handledIds.add(postId);

    const boxes = kcGetVoteBoxesForPost(postId);
    if (!boxes.length) return;

    const cachedDirection = kcMyVotesCacheGet(postId);
    const cachedScore = kcVoteScoreCacheGet(postId);

    boxes.forEach((voteBox) => {
      const current = kcReadVoteState(voteBox);
      kcApplyVoteStateToBox(voteBox, {
        score: Number.isFinite(Number(cachedScore)) ? Number(cachedScore) : current.score,
        direction: cachedDirection !== undefined ? cachedDirection : current.direction,
        pending: false
      }, { force: true });
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

  kcEnsureVoteSessionHydrated();
  if (kcRememberVoteScore(targetId, score)) kcScheduleVoteSessionPersist();

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

function kcGetVisibleVotePostIds() {
  kcEnsureVoteSessionHydrated();
  return Array.from(new Set(
    Array.from(document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]'))
      .map((el) => kcGetVotePostIdFromButton(el))
      .filter((id) => kcIsUuid(id) && !kcHasPendingVote(id))
  ));
}

async function kcRefreshVisibleScores(options = {}) {
  if (!kcIsSupabaseRuntime()) return;

  const ids = kcGetVisibleVotePostIds();
  if (!ids.length) return;

  if (!options.force && kcVoteScoreCacheIsFresh(ids)) {
    ids.forEach((postId) => {
      const cachedScore = kcVoteScoreCacheGet(postId);
      if (Number.isFinite(Number(cachedScore))) {
        kcUpdateVoteScoreInDOM(postId, Number(cachedScore), { force: true });
      }
    });
    return;
  }

  try {
    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
    if (!client) return;

    const { data, error } = await client
      .from('posts')
      .select('id, votos')
      .in('id', ids);

    if (error || !Array.isArray(data)) return;
    const returnedIds = new Set();
    data.forEach((row) => {
      if (!row || !row.id) return;
      const postId = String(row.id).trim();
      if (!postId) return;
      returnedIds.add(postId);
      if (kcHasPendingVote(postId)) return;
      kcUpdateVoteScoreInDOM(row.id, row.votos);
    });

    // A resposta pode repetir exatamente os mesmos votos. Ainda assim ela
    // confirmou que todos os cards visíveis continuam atuais; sem renovar o
    // timestamp, o polling de 5 s faria uma nova consulta a cada tick após o
    // TTL, apesar de não haver nenhuma mudança para renderizar.
    if (ids.every((postId) => returnedIds.has(String(postId)))) {
      KC_VOTE_SCORE_CACHE_TS = Date.now();
      kcScheduleVoteSessionPersist();
    }
  } catch (_) { }
}

function kcInitVotesRealtime() {
  if (!kcIsSupabaseRuntime()) return;
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
        () => { kcRefreshVisibleScores({ force: true }); }
      )
      .subscribe();

    if (!kcVotesPollingTimer) {
      kcVotesPollingTimer = window.setInterval(() => {
        if (document.hidden) return;
        kcRefreshVisibleScores();
      }, 5000);
    }

    kcRefreshVisibleScores();
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
  if (kcIsSupabaseRuntime()) {
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

  if (!kcIsSupabaseRuntime()) {
    const localState = kcReadVoteState(voteBox);
    const nextDirection = localState.direction === type ? null : type;
    let nextScore = localState.score;
    if (localState.direction === 'hot') nextScore -= 1;
    if (localState.direction === 'cold') nextScore += 1;
    if (nextDirection === 'hot') nextScore += 1;
    if (nextDirection === 'cold') nextScore -= 1;
    kcApplyVoteStateToPost(lockKey, { score: nextScore, direction: nextDirection, pending: false }, { animate: true });
    const changedDirection = kcRememberMyVoteDirection(lockKey, nextDirection);
    const changedScore = kcRememberVoteScore(lockKey, nextScore);
    if (changedDirection || changedScore) kcScheduleVoteSessionPersist();
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
    const changedDirection = kcRememberMyVoteDirection(lockKey, finalDirection);
    const changedScore = kcRememberVoteScore(lockKey, finalScore);
    KC_MY_VOTES_CACHE_TS = Date.now();
    KC_VOTE_SCORE_CACHE_TS = Date.now();
    if (changedDirection || changedScore) kcScheduleVoteSessionPersist();

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
  if (!kcIsSupabaseRuntime()) return;
  // Não busca votos no servidor se o usuário não está autenticado (evita 401 desnecessário).
  // O cache local (se houver) ainda é aplicado abaixo.
  const isAuthenticated = (function () {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') {
        return !!window.KCSupabase.getUser();
      }
      if (window.KCAPI && window.KCAPI.ENV) return !!window.KCAPI.ENV.user;
    } catch (_) {}
    return false;
  })();
  if (!isAuthenticated) {
    kcApplyMyVotesCacheToDOM();
    return;
  }
  kcEnsureVoteSessionHydrated();

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
    let didChangeCache = false;
    postIds.forEach((postId) => {
      const direction = voteMap[postId] || null;
      if (kcRememberMyVoteDirection(postId, direction)) didChangeCache = true;
    });
    KC_MY_VOTES_CACHE_TS = Date.now();
    if (didChangeCache) kcScheduleVoteSessionPersist();

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
