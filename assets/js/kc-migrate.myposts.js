/*
  KinoCampus — Migração Assistida “Meus Posts” (Roadmap 8.1.5.4)

  Regras-chave:
  - Só opera em driver Supabase + usuário autenticado.
  - Fonte: localStorage["kc_user_posts"].
  - Antes de migrar: cria backup kc_user_posts_backup_<timestamp>.
  - Idempotência: marca metadata.migratedToSupabase=true + metadata.supabaseId=<uuid>.
  - Não injeta HTML com dados do usuário (apenas textContent).

  Exposição:
  - window.KCMigrateMyPosts (stats, migrate)

  Observação:
  - Este módulo NÃO cria novas páginas/rotas. Ele injeta um CTA/banner e um modal.
*/

(function () {
  'use strict';

  const KEY = 'kc_user_posts';
  const MAX_IMAGES = 5;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB por imagem (heurístico para DataURL)

  // ------------- utils -------------

  function nowISO() {
    try { return new Date().toISOString(); } catch (_) { return '' + Date.now(); }
  }

  function safeParseJSON(raw, fallback) {
    try {
      const v = raw ? JSON.parse(raw) : null;
      return (v == null) ? (fallback ?? null) : v;
    } catch (_) {
      return fallback ?? null;
    }
  }

  function isSupabaseDriver() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    const driver = String(env.DATA_DRIVER || env.driver || '').toLowerCase();
    return driver === 'supabase' && !!(window.KCAPI && window.KCAPI.activeDriver === 'supabase');
  }

  async function getAuthUser() {
    // Preferimos a facade do KCAPI (mantém consistência)
    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        return await window.KCAPI.getCurrentUser();
      }
    } catch (_) {}

    // Fallback: facade do Supabase
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getCurrentUser === 'function') {
        return await window.KCSupabase.getCurrentUser();
      }
      if (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') {
        return window.KCSupabase.getUser();
      }
    } catch (_) {}

    return null;
  }

  function rawGetItem(k) {
    try {
      if (window.__KC_ORIG_LS_GETITEM && typeof window.__KC_ORIG_LS_GETITEM === 'function') {
        return window.__KC_ORIG_LS_GETITEM.call(localStorage, k);
      }
    } catch (_) {}
    try { return localStorage.getItem(k); } catch (_) { return null; }
  }

  function loadLocalPosts() {
    try {
      const raw = rawGetItem(KEY);
      const list = safeParseJSON(raw, []);
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalPosts(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function getMetadata(post) {
    const m = (post && typeof post.metadata === 'object' && !Array.isArray(post.metadata)) ? post.metadata : {};
    return m;
  }

  function isMigrated(post) {
    const m = getMetadata(post);
    if (m.migratedToSupabase === true) return true;
    if (m.supabaseId) return true;
    if (m.supabase_id) return true;
    return false;
  }

  function setMigrated(post, supabaseId) {
    const p = (post && typeof post === 'object') ? { ...post } : {};
    const meta = { ...getMetadata(p) };
    meta.migratedToSupabase = true;
    if (supabaseId) meta.supabaseId = String(supabaseId);
    meta.migratedAt = nowISO();
    meta.migratedFrom = 'localStorage';
    meta.migratedFromKey = KEY;
    p.metadata = meta;
    return p;
  }

  function normalizeLocalPostToCreatePayload(p) {
    const src = (p && typeof p === 'object') ? p : {};

    const modulo = String(src.modulo || src.module || '').trim();
    const titulo = String(src.titulo || src.title || '').trim();
    const descricao = String(src.descricao || src.description || '').trim();

    // imagens: aceitar APENAS dataURL image/*
    const rawImgs = Array.isArray(src.imagens)
      ? src.imagens
      : (Array.isArray(src.images) ? src.images : []);

    const imgs = rawImgs
      .filter((x) => typeof x === 'string' && x.trim())
      .map((x) => x.trim());

    // Se tiver imagens e alguma não for data:image, bloqueia (evita perda silenciosa)
    const hasAny = imgs.length > 0;
    const allData = imgs.every((x) => /^data:image\//i.test(x));
    if (hasAny && !allData) {
      return { ok: false, error: 'UNSUPPORTED_IMAGE_FORMAT' };
    }

    // heurística de tamanho (base64) para evitar subir absurdos
    const limited = imgs.slice(0, MAX_IMAGES);
    for (const s of limited) {
      const approxBytes = Math.ceil((s.length * 3) / 4); // aproximação
      if (approxBytes > MAX_IMAGE_BYTES) {
        return { ok: false, error: 'IMAGE_TOO_LARGE' };
      }
    }

    // Campos de compatibilidade (mantemos o máximo do contrato local)
    const meta = { ...getMetadata(src) };
    // Ajuda de dedupe/forense no DB
    meta.localId = meta.localId || (src.id != null ? String(src.id) : undefined);

    const payload = {
      // Obrigatórios do createPost (supabase)
      modulo,
      titulo,
      descricao,

      // Opcionais
      preco: (src.preco != null) ? src.preco : undefined,
      precoTexto: (src.precoTexto != null) ? src.precoTexto : undefined,
      localizacao: (src.localizacao != null) ? src.localizacao : undefined,
      condicao: (src.condicao != null) ? src.condicao : undefined,
      sustentavel: (typeof src.sustentavel === 'boolean') ? src.sustentavel : undefined,
      emoji: (src.emoji != null) ? src.emoji : undefined,

      // Keys de filtros
      categoriaKey: (src.categoriaKey || src.categoryKey || meta.categoryKey) ? String(src.categoriaKey || src.categoryKey || meta.categoryKey) : undefined,
      subcategoriaKey: (src.subcategoriaKey || src.subcategoryKey || meta.subcategoryKey || meta.subcategory) ? String(src.subcategoriaKey || src.subcategoryKey || meta.subcategoryKey || meta.subcategory) : undefined,

      // Tags
      tags: Array.isArray(src.tags) ? src.tags : undefined,
      tagKeys: Array.isArray(src.tagKeys) ? src.tagKeys : undefined,

      // Imagens (DataURL)
      imagens: limited,

      // Metadata: mantém e adiciona marcador de origem
      metadata: {
        ...meta,
        migratedCandidate: true,
      },
    };

    if (!payload.modulo || !payload.titulo || !payload.descricao) {
      return { ok: false, error: 'MISSING_REQUIRED_FIELDS' };
    }

    return { ok: true, payload };
  }

  function makeBackupKey() {
    // ISO safe para localStorage key
    const ts = nowISO().replace(/[:.]/g, '-');
    return `kc_user_posts_backup_${ts}`;
  }

  function makeStats() {
    const list = loadLocalPosts();
    const total = list.length;
    const migrated = list.filter(isMigrated).length;
    const eligible = list.filter((p) => !isMigrated(p)).length;
    return { total, migrated, eligible };
  }

  function sanitizeErrorMessage(raw) {
    const msg = String(raw == null ? '' : raw)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return msg.slice(0, 240);
  }

  function detectBackupFailureType(err) {
    const msg = sanitizeErrorMessage(err && err.message ? err.message : err).toLowerCase();
    if (!msg) return 'unknown';
    if (msg.includes('quota') || msg.includes('exceeded') || msg.includes('space')) return 'quota_exceeded';
    if (msg.includes('security') || msg.includes('access is denied') || msg.includes('not available') || msg.includes('disabled')) return 'storage_unavailable';
    return 'unknown';
  }

  function compactStack(err) {
    try {
      const stack = String((err && err.stack) || '').trim();
      if (!stack) return null;
      return stack
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' | ');
    } catch (_) {
      return null;
    }
  }

  function logStructuredError(payload) {
    try {
      const item = (payload && typeof payload === 'object') ? payload : {};
      console.error('[KinoCampus][MigrateMyPosts]', {
        code: item.code || 'UNKNOWN',
        message: sanitizeErrorMessage(item.message || 'Erro não especificado'),
        backupKey: item.backupKey || null,
        stack: item.stack || null,
      });
    } catch (_) {}
  }

  // ------------- migrate core -------------

  async function migrate(opts) {
    const options = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
    const onProgress = (typeof options.onProgress === 'function') ? options.onProgress : null;
    const maxToMigrate = Number.isFinite(options.maxToMigrate) ? Math.max(1, Math.min(200, options.maxToMigrate)) : 200;

    if (!isSupabaseDriver()) {
      return { ok: false, code: 'NOT_SUPABASE_DRIVER', message: 'Driver Supabase não está ativo.' };
    }

    const user = await getAuthUser();
    if (!user || !user.id) {
      return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Você precisa estar logado para migrar.' };
    }

    if (!(window.KCAPI && typeof window.KCAPI.createPost === 'function')) {
      return { ok: false, code: 'KCAPI_CREATEPOST_MISSING', message: 'KCAPI.createPost não está disponível.' };
    }

    // trava simples
    if (window.__KC_MIGRATE_MYPOSTS_RUNNING) {
      return { ok: false, code: 'ALREADY_RUNNING', message: 'Migração já está em andamento.' };
    }
    window.__KC_MIGRATE_MYPOSTS_RUNNING = true;

    const list = loadLocalPosts();
    const work = list
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => !isMigrated(p))
      .slice(0, maxToMigrate);

    if (!work.length) {
      window.__KC_MIGRATE_MYPOSTS_RUNNING = false;
      return { ok: true, migratedNow: 0, failed: 0, skipped: 0, backupKey: null, details: [] };
    }

    // Backup completo antes de qualquer modificação
    const backupKey = makeBackupKey();
    try {
      localStorage.setItem(backupKey, JSON.stringify(list));
    } catch (e) {
      window.__KC_MIGRATE_MYPOSTS_RUNNING = false;
      const sanitizedMessage = sanitizeErrorMessage(e && e.message ? e.message : e);
      const errorType = detectBackupFailureType(e);
      logStructuredError({
        code: 'BACKUP_FAILED',
        message: sanitizedMessage || 'Falha ao criar backup no localStorage.',
        backupKey,
        stack: compactStack(e),
      });
      return {
        ok: false,
        code: 'BACKUP_FAILED',
        message: 'Falha ao criar backup no localStorage.',
        error: {
          probableType: errorType,
          originalMessage: sanitizedMessage || 'Erro sem mensagem disponível.',
        }
      };
    }

    const details = [];
    let migratedNow = 0;
    let failed = 0;
    let skipped = 0;

    function progress(stage, current, total, extra) {
      if (!onProgress) return;
      try {
        onProgress({ stage, current, total, ...extra });
      } catch (_) {}
    }

    progress('START', 0, work.length, { backupKey });

    // Execução sequencial: mais previsível e fácil de depurar
    for (let i = 0; i < work.length; i++) {
      const { p, idx } = work[i];
      const localId = (p && p.id != null) ? String(p.id) : `idx_${idx}`;

      progress('VALIDATE', i, work.length, { localId });

      const normalized = normalizeLocalPostToCreatePayload(p);
      if (!normalized.ok) {
        skipped++;
        details.push({ localId, ok: false, code: normalized.error, message: 'Post local não elegível para migração.' });
        progress('SKIP', i + 1, work.length, { localId, code: normalized.error });
        continue;
      }

      // Trava leve de imagens (mantém compat: createPost já limita 5)
      if (Array.isArray(normalized.payload.imagens) && normalized.payload.imagens.length > MAX_IMAGES) {
        normalized.payload.imagens = normalized.payload.imagens.slice(0, MAX_IMAGES);
      }

      progress('UPLOAD', i, work.length, { localId });

      try {
        const created = await window.KCAPI.createPost(normalized.payload);
        const supabaseId = created && (created.id || created.uuid || created.post_id) ? String(created.id || created.uuid || created.post_id) : null;

        if (!supabaseId) {
          failed++;
          details.push({ localId, ok: false, code: 'CREATE_POST_FAILED', message: 'createPost não retornou id.' });
          progress('FAIL', i + 1, work.length, { localId, code: 'CREATE_POST_FAILED' });
          continue;
        }

        // Atualiza o item local com metadados de migração
        list[idx] = setMigrated(list[idx], supabaseId);
        migratedNow++;
        details.push({ localId, ok: true, supabaseId });

        progress('DONE', i + 1, work.length, { localId, supabaseId });
      } catch (e) {
        failed++;
        const msg = String(e && e.message ? e.message : e);
        details.push({ localId, ok: false, code: 'EXCEPTION', message: msg });
        progress('FAIL', i + 1, work.length, { localId, code: 'EXCEPTION', message: msg });
      }
    }

    // Persiste o estado atualizado (migrados marcados; não migrados permanecem)
    const saved = saveLocalPosts(list);

    window.__KC_MIGRATE_MYPOSTS_RUNNING = false;

    return {
      ok: saved,
      backupKey,
      migratedNow,
      failed,
      skipped,
      details,
      message: saved ? 'Migração concluída.' : 'Migração concluída, mas falhou ao salvar estado local.'
    };
  }

  // ------------- UI (CTA + Modal) -------------

  function el(tag, attrs) {
    const node = document.createElement(tag);
    const a = (attrs && typeof attrs === 'object') ? attrs : {};

    Object.keys(a).forEach((k) => {
      const v = a[k];
      if (v == null) return;
      if (k === 'class') node.className = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'html') node.innerHTML = String(v); // USO RESTRITO: só conteúdo estático
      else node.setAttribute(k, String(v));
    });

    return node;
  }

  function style(node, styles) {
    if (!node || !styles) return node;
    try {
      Object.keys(styles).forEach((k) => {
        node.style[k] = styles[k];
      });
    } catch (_) {}
    return node;
  }

  function findMainContainer() {
    return document.querySelector('main.kc-main-content') || document.querySelector('main') || document.body;
  }

  function dismissForSession() {
    try { sessionStorage.setItem('kc_migrate_myposts_dismissed', '1'); } catch (_) {}
  }

  function isDismissed() {
    try { return sessionStorage.getItem('kc_migrate_myposts_dismissed') === '1'; } catch (_) { return false; }
  }

  function buildBanner(stats, opts) {
    const needsLogin = !!(opts && opts.needsLogin);
    const wrap = el('div', { class: 'kc-migrate-banner' });

    style(wrap, {
      margin: '14px auto 0',
      maxWidth: '1100px',
      padding: '14px 14px',
      borderRadius: '18px',
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.10), rgba(59, 130, 246, 0.08))',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    });

    const row = el('div');
    style(row, { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' });

    const left = el('div');
    style(left, { display: 'flex', gap: '10px', alignItems: 'center' });

    const icon = el('div', { text: needsLogin ? '🔒' : '⬆️' });
    style(icon, {
      width: '38px', height: '38px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '12px',
      background: 'rgba(255,255,255,0.10)',
      fontSize: '18px',
    });

    const text = el('div');
    const title = el('div', { text: `Você tem ${stats.eligible} post(s) locais para migrar.` });
    style(title, { fontWeight: '800', fontSize: '0.98rem' });

    const sub = el('div', {
      text: needsLogin
        ? 'Para migrar, faça login no Supabase. Seus dados locais permanecem aqui.'
        : 'Opcional: migre para aparecer no feed Supabase (com backup e sem duplicar).'
    });
    style(sub, { opacity: '0.92', fontSize: '0.90rem' });

    text.appendChild(title);
    text.appendChild(sub);

    left.appendChild(icon);
    left.appendChild(text);

    const actions = el('div');
    style(actions, { display: 'flex', gap: '10px', alignItems: 'center' });

    const btn = el('button', {
      class: 'kc-btn-primary',
      type: 'button',
      text: needsLogin ? 'Fazer login' : 'Migrar agora'
    });
    // fallback visual se a classe não existir
    style(btn, { padding: '10px 14px', borderRadius: '12px', border: '0', cursor: 'pointer' });

    const dismiss = el('button', { type: 'button', text: 'Agora não' });
    style(dismiss, {
      padding: '10px 12px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      opacity: '0.92'
    });

    actions.appendChild(btn);
    actions.appendChild(dismiss);

    row.appendChild(left);
    row.appendChild(actions);

    wrap.appendChild(row);

    return { wrap, btn, dismiss };
  }

  function buildModal() {
    const overlay = el('div', { class: 'kc-modal-overlay', id: 'kcMigrateMyPostsOverlay' });
    const modal = el('div', { class: 'kc-create-modal' });

    const header = el('div', { class: 'kc-create-modal__header' });
    const h2 = el('h2');
    const h2Icon = el('span', { text: '🔁' });
    const h2Text = el('span', { text: 'Migrar posts locais' });
    h2.appendChild(h2Icon);
    h2.appendChild(h2Text);

    const closeBtn = el('button', { type: 'button', class: 'kc-create-modal__close', 'aria-label': 'Fechar' });
    closeBtn.textContent = '×';

    header.appendChild(h2);
    header.appendChild(closeBtn);

    const body = el('div');
    style(body, { padding: '16px 18px', display: 'grid', gap: '12px' });

    const info = el('div');
    style(info, { opacity: '0.95', fontSize: '0.95rem', lineHeight: '1.35' });

    const progressWrap = el('div');
    style(progressWrap, { display: 'grid', gap: '8px' });

    const progressLabel = el('div', { text: 'Pronto para migrar.' });
    style(progressLabel, { fontWeight: '700' });

    const barOuter = el('div');
    style(barOuter, { height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.10)', overflow: 'hidden' });
    const barInner = el('div');
    style(barInner, { height: '100%', width: '0%', background: 'rgba(74, 222, 128, 0.75)' });
    barOuter.appendChild(barInner);

    const resultBox = el('div');
    style(resultBox, { maxHeight: '160px', overflow: 'auto', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '10px' });

    const list = el('ul');
    style(list, { margin: '0', paddingLeft: '18px', display: 'grid', gap: '6px' });
    resultBox.appendChild(list);

    progressWrap.appendChild(progressLabel);
    progressWrap.appendChild(barOuter);

    const footer = el('div');
    style(footer, { display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' });

    const startBtn = el('button', { type: 'button', class: 'kc-btn-primary', text: 'Iniciar migração' });
    style(startBtn, { padding: '10px 14px', borderRadius: '12px', border: '0', cursor: 'pointer' });

    const cancelBtn = el('button', { type: 'button', text: 'Fechar' });
    style(cancelBtn, {
      padding: '10px 12px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      opacity: '0.92'
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(startBtn);

    body.appendChild(info);
    body.appendChild(progressWrap);
    body.appendChild(resultBox);
    body.appendChild(footer);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    function open() {
      overlay.classList.add('active');
      document.body.classList.add('kc-modal-open');
    }

    function close() {
      overlay.classList.remove('active');
      document.body.classList.remove('kc-modal-open');
    }

    // Fechar ao clicar no backdrop
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    return {
      overlay,
      open,
      close,
      info,
      progressLabel,
      barInner,
      list,
      startBtn,
      cancelBtn,
    };
  }

  function appendResult(listEl, text) {
    if (!listEl) return;
    const li = el('li', { text: String(text || '').trim() || '-' });
    listEl.appendChild(li);
  }

  async function initMigrationCTA() {
    if (!isSupabaseDriver()) return;

    const stats = makeStats();
    if (!stats.eligible) return;
    if (isDismissed()) return;

    // Evita duplicar o banner
    if (document.querySelector('.kc-migrate-banner')) return;

    const user = await getAuthUser();
    const needsLogin = !user;

    const main = findMainContainer();

    const { wrap, btn, dismiss } = buildBanner(stats, { needsLogin });

    // Modal (lazy)
    let modal = null;

    dismiss.addEventListener('click', () => {
      dismissForSession();
      try { wrap.remove(); } catch (_) {}
    });

    btn.addEventListener('click', () => {
      if (needsLogin) {
        try {
          if (typeof window.kcOpenAuthModal === 'function') {
            window.kcOpenAuthModal();
          } else {
            // fallback: apenas informa
            console.info('[KinoCampus] Abra o modal de autenticação para continuar.');
          }
        } catch (_) {}
        return;
      }

      if (!modal) {
        modal = buildModal();
        document.body.appendChild(modal.overlay);

        // Conteúdo inicial
        modal.info.textContent = `Encontramos ${stats.eligible} post(s) locais para migrar. Antes de iniciar, será criado um backup no localStorage.`;
        appendResult(modal.list, `Elegíveis: ${stats.eligible} | Já migrados: ${stats.migrated} | Total local: ${stats.total}`);

        modal.startBtn.addEventListener('click', async () => {
          modal.startBtn.disabled = true;
          modal.cancelBtn.disabled = true;
          modal.progressLabel.textContent = 'Iniciando...';
          modal.barInner.style.width = '0%';

          const startedAt = Date.now();

          const res = await migrate({
            maxToMigrate: stats.eligible,
            onProgress: (p) => {
              const pct = p.total ? Math.round((Math.min(p.current, p.total) / p.total) * 100) : 0;
              modal.barInner.style.width = `${pct}%`;

              if (p.stage === 'START') {
                modal.progressLabel.textContent = `Backup criado: ${p.backupKey}`;
                appendResult(modal.list, `Backup: ${p.backupKey}`);
              } else if (p.stage === 'VALIDATE') {
                modal.progressLabel.textContent = `Validando ${p.localId}...`;
              } else if (p.stage === 'UPLOAD') {
                modal.progressLabel.textContent = `Migrando ${p.localId}...`;
              } else if (p.stage === 'SKIP') {
                appendResult(modal.list, `⏭️  ${p.localId} (pulado: ${p.code})`);
              } else if (p.stage === 'DONE') {
                appendResult(modal.list, `✅  ${p.localId} → ${p.supabaseId}`);
              } else if (p.stage === 'FAIL') {
                appendResult(modal.list, `❌  ${p.localId} (erro: ${p.code})`);
              }
            },
          });

          const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

          if (res && res.ok) {
            modal.progressLabel.textContent = `Concluído: ${res.migratedNow} migrado(s), ${res.failed} falha(s), ${res.skipped} pulado(s) — ${elapsed}s`;
          } else {
            modal.progressLabel.textContent = `Falhou: ${res && res.code ? res.code : 'UNKNOWN'} — ${elapsed}s`;
            appendResult(modal.list, 'QA: teste fora do modo privado e confirme permissão de armazenamento local.');
            logStructuredError({
              code: (res && res.code) || 'UNKNOWN',
              message: (res && res.message) || 'Falha desconhecida na migração.',
              backupKey: res && res.backupKey,
              stack: null,
            });
          }

          // Atualiza banner (agora talvez não tenha mais elegíveis)
          try {
            const after = makeStats();
            if (!after.eligible) wrap.remove();
          } catch (_) {}

          // Recarrega o feed para buscar os novos posts do Supabase
          try {
            if (res && res.ok) {
              setTimeout(() => {
                try { window.location.reload(); } catch (_) {}
              }, 900);
            }
          } catch (_) {}
        });
      }

      modal.open();
    });

    // Insere no topo do main
    try {
      main.insertBefore(wrap, main.firstChild);
    } catch (_) {
      try { main.appendChild(wrap); } catch (_) {}
    }
  }

  // Exposição mínima (útil para QA manual no console)
  window.KCMigrateMyPosts = Object.freeze({
    stats: makeStats,
    migrate,
  });

  // Boot
  try {
    document.addEventListener('kc:authchange', () => {
      // Reavalia quando login/logout acontecer
      try { initMigrationCTA(); } catch (_) {}
    });
    document.addEventListener('DOMContentLoaded', initMigrationCTA, { once: true });
    // fallback tardio (caso scripts carreguem fora de ordem)
    setTimeout(initMigrationCTA, 1200);
  } catch (_) {}
})();
