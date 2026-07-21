import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function resolvePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(resolvePath(relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.mkdirSync(path.dirname(resolvePath(relativePath)), { recursive: true });
  fs.writeFileSync(resolvePath(relativePath), content);
  console.log(`[patch] wrote ${relativePath}`);
}

function replaceOnce(relativePath, before, after) {
  const content = read(relativePath);
  const first = content.indexOf(before);
  const last = content.lastIndexOf(before);
  if (first === -1) throw new Error(`${relativePath}: expected text not found:\n${before.slice(0, 240)}`);
  if (first !== last) throw new Error(`${relativePath}: expected text occurs more than once`);
  write(relativePath, content.slice(0, first) + after + content.slice(first + before.length));
}

function replaceRegexOnce(relativePath, pattern, replacement) {
  const content = read(relativePath);
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const matches = [...content.matchAll(matcher)];
  if (matches.length !== 1) {
    throw new Error(`${relativePath}: regex expected one match, found ${matches.length}: ${pattern}`);
  }
  const match = matches[0];
  const start = match.index;
  const end = start + match[0].length;
  const next = typeof replacement === 'function'
    ? replacement(...match)
    : replacement.replace(/\$(\d+)/g, (_, rawIndex) => match[Number(rawIndex)] ?? '');
  write(relativePath, content.slice(0, start) + next + content.slice(end));
}

const syncHelper = `/**
 * Serializes presenter control writes and collapses bursts to the latest slide.
 * This prevents slower responses from older navigation commands from winning.
 *
 * @template Payload
 * @template Result
 * @param {(payload: Payload) => Promise<Result>} send
 * @param {{
 *   staleHoldMs?: number,
 *   now?: () => number,
 *   onSuccess?: (result: Result, payload: Payload) => void,
 *   onError?: (error: unknown, payload: Payload) => void,
 * }} [options]
 */
export function createLatestControlQueue(send, options = {}) {
  const staleHoldMs = Math.max(0, options.staleHoldMs ?? 1400);
  const now = options.now ?? Date.now;
  let sending = false;
  let queued = null;
  let disposed = false;
  let holdUntil = 0;

  async function drain() {
    if (disposed || sending || queued === null) return;

    const payload = queued;
    queued = null;
    sending = true;

    try {
      const result = await send(payload);
      if (!disposed) {
        holdUntil = now() + staleHoldMs;
        options.onSuccess?.(result, payload);
      }
    } catch (error) {
      if (!disposed) {
        holdUntil = now() + staleHoldMs;
        options.onError?.(error, payload);
      }
    } finally {
      sending = false;
      if (!disposed && queued !== null) queueMicrotask(drain);
    }
  }

  return {
    /** @param {Payload} payload */
    enqueue(payload) {
      if (disposed) return;
      queued = payload;
      void drain();
    },
    hasPending() {
      return sending || queued !== null;
    },
    canAcceptRemote() {
      return !sending && queued === null && now() >= holdUntil;
    },
    dispose() {
      disposed = true;
      queued = null;
    },
  };
}
`;

const syncTests = `import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createLatestControlQueue } from "../app/presenter-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

async function loadDeckModule() {
  const source = read("app/decks.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
}

test("serializes writes and collapses a burst to the latest slide", async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  let active = 0;
  let maxActive = 0;

  const queue = createLatestControlQueue(async (payload) => {
    calls.push(payload.currentSlide);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await (calls.length === 1 ? first.promise : second.promise);
    active -= 1;
    return payload;
  });

  queue.enqueue({ currentSlide: 1 });
  queue.enqueue({ currentSlide: 2 });
  queue.enqueue({ currentSlide: 3 });

  assert.deepEqual(calls, [1]);
  assert.equal(queue.hasPending(), true);
  first.resolve();
  await tick();
  assert.deepEqual(calls, [1, 3]);
  second.resolve();
  await tick();
  assert.equal(queue.hasPending(), false);
  assert.equal(maxActive, 1);
});

test("rejects stale polling while a write is pending and during the hold window", async () => {
  const pending = deferred();
  let clock = 1000;
  const queue = createLatestControlQueue(() => pending.promise, {
    staleHoldMs: 1200,
    now: () => clock,
  });

  queue.enqueue({ currentSlide: 4 });
  assert.equal(queue.canAcceptRemote(), false);

  pending.resolve({ ok: true });
  await tick();
  assert.equal(queue.canAcceptRemote(), false);

  clock += 1199;
  assert.equal(queue.canAcceptRemote(), false);
  clock += 1;
  assert.equal(queue.canAcceptRemote(), true);
});

test("disposal prevents queued commands from being sent", async () => {
  const first = deferred();
  const calls = [];
  const queue = createLatestControlQueue(async (payload) => {
    calls.push(payload.currentSlide);
    await first.promise;
    return payload;
  });

  queue.enqueue({ currentSlide: 1 });
  queue.enqueue({ currentSlide: 2 });
  queue.dispose();
  first.resolve();
  await tick();
  assert.deepEqual(calls, [1]);
});

test("builds all six presentation variants with stable ordering", async () => {
  const { buildDeck } = await loadDeckModule();
  const expected = new Map([
    ["5-expositivo", 10],
    ["5-interativo", 11],
    ["15-expositivo", 17],
    ["15-interativo", 20],
    ["30-expositivo", 22],
    ["30-interativo", 25],
  ]);

  for (const [key, expectedCount] of expected) {
    const [rawDuration, mode] = key.split("-");
    const deck = buildDeck(Number(rawDuration), mode);
    assert.equal(deck.length, expectedCount, key);
    assert.equal(new Set(deck.map((slide) => slide.id)).size, deck.length, key + " has duplicate slides");
    assert.equal(deck[0]?.id, "vision", key + " starts at vision");
    assert.equal(deck.at(-1)?.id, "ask", key + " ends at ask");
  }
});

test("source contract keeps the six decks, resilient navigation and neutral zoom semantics", () => {
  const page = read("app/page.tsx");
  const decks = read("app/decks.ts");
  const css = read("app/globals.css");

  assert.match(decks, /export type Duration = 5 \\| 15 \\| 30/);
  assert.match(decks, /export type PresentationMode = "expositivo" \\| "interativo"/);
  assert.match(page, /createLatestControlQueue/);
  assert.match(page, /onCurrent\\(\\(previous\\) => Math\\.min/);
  assert.match(page, /isInteractiveTarget\\(event\\.target\\)/);
  assert.match(page, /ZoomIn/);
  assert.match(page, /ZoomOut/);
  assert.doesNotMatch(page, /title="Aumentar a legibilidade na projeção"><Accessibility/);
  assert.match(page, /}, 1500\\);/);
  assert.match(css, /env\\(safe-area-inset-bottom\\)/);
  assert.match(css, /touch-action: manipulation/);
});
`;

write('apps/pitch-institucional/app/presenter-sync.js', syncHelper);
write('apps/pitch-institucional/tests/presenter-sync.test.mjs', syncTests);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  Users,\n  X,\n} from "lucide-react";',
  '  Users,\n  X,\n  ZoomIn,\n  ZoomOut,\n} from "lucide-react";',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '} from "./decks";\n',
  '} from "./decks";\nimport { createLatestControlQueue } from "./presenter-sync";\n',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  responseCount: number;\n  aggregates: Record<string, Record<string, number>>;\n};',
  '  responseCount: number;\n  aggregates: Record<string, Record<string, number>>;\n  updatedAt?: string;\n};',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  'function getServerSearch() {\n  return "";\n}\n',
  'function getServerSearch() {\n  return "";\n}\n\nfunction isInteractiveTarget(target: EventTarget | null) {\n  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [contenteditable=\\"true\\"], [role=\\"button\\"]"));\n}\n',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  onCurrent: (index: number) => void;',
  '  onCurrent: React.Dispatch<React.SetStateAction<number>>;',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  const touchStart = useRef<number | null>(null);',
  '  const touchStart = useRef<{ x: number; y: number; interactive: boolean } | null>(null);',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  const next = useCallback(() => onCurrent(Math.min(deck.length - 1, current + 1)), [current, deck.length, onCurrent]);\n  const previous = useCallback(() => onCurrent(Math.max(0, current - 1)), [current, onCurrent]);',
  '  const next = useCallback(() => onCurrent((previous) => Math.min(deck.length - 1, previous + 1)), [deck.length, onCurrent]);\n  const previous = useCallback(() => onCurrent((previous) => Math.max(0, previous - 1)), [onCurrent]);',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;',
  '      if (isInteractiveTarget(event.target)) return;',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '      onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX; }}\n      onTouchEnd={(event) => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; if (distance < -60) next(); if (distance > 60) previous(); touchStart.current = null; }}',
  `      onTouchStart={(event) => {\n        const touch = event.changedTouches[0];\n        touchStart.current = { x: touch.clientX, y: touch.clientY, interactive: isInteractiveTarget(event.target) };\n      }}\n      onTouchEnd={(event) => {\n        const start = touchStart.current;\n        touchStart.current = null;\n        if (!start || start.interactive) return;\n        const touch = event.changedTouches[0];\n        const distanceX = touch.clientX - start.x;\n        const distanceY = touch.clientY - start.y;\n        if (Math.abs(distanceX) < 60 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.2) return;\n        if (distanceX < 0) next();\n        else previous();\n      }}\n      onTouchCancel={() => { touchStart.current = null; }}`,
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '          <button type="button" onClick={() => setProjectionMode((current) => !current)} className={projectionMode ? "is-active" : ""} aria-pressed={projectionMode} title="Aumentar a legibilidade na projeção"><Accessibility size={18} /><span>Projeção</span></button>',
  '          <button type="button" onClick={() => setProjectionMode((current) => !current)} className={projectionMode ? "is-active" : ""} aria-pressed={projectionMode} aria-label={projectionMode ? "Restaurar tamanho padrão" : "Aumentar texto e contraste para projeção"} title={projectionMode ? "Restaurar tamanho padrão" : "Aumentar texto e contraste para projeção"}>{projectionMode ? <ZoomOut size={18} /> : <ZoomIn size={18} />}<span>{projectionMode ? "Padrão" : "Ampliar"}</span></button>',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  const [session, setSession] = useState<SessionSnapshot | null>(null);\n  const [error, setError] = useState("");\n  const deck = useMemo(() => session ? buildDeck(session.duration as Duration, session.mode as PresentationMode) : [], [session]);\n\n  const load = useCallback(async () => {\n    try { const response = await fetch(`/api/session?code=${encodeURIComponent(code)}`, { cache: "no-store" }); const data = await readJson(response); if (!response.ok) throw new Error(data.error); if (!data.session) throw new Error("Sessão sem dados válidos."); setSession(data.session); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Controle indisponível."); }\n  }, [code]);',
  `  const [session, setSession] = useState<SessionSnapshot | null>(null);\n  const [error, setError] = useState("");\n  const controlQueueRef = useRef<ReturnType<typeof createLatestControlQueue> | null>(null);\n  const deck = useMemo(() => session ? buildDeck(session.duration as Duration, session.mode as PresentationMode) : [], [session]);\n\n  useEffect(() => {\n    const queue = createLatestControlQueue(async ({ currentSlide, activePrompt }: { currentSlide: number; activePrompt: string | null }) => {\n      const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "control", code, token, currentSlide, activePrompt }) });\n      const data = await readJson(response);\n      if (!response.ok) throw new Error(data.error || "Controle não autorizado.");\n      if (!data.session) throw new Error("O controle não recebeu o estado atualizado.");\n      return data.session;\n    }, {\n      onSuccess: (nextSession) => { setSession(nextSession); setError(""); },\n      onError: (caught) => setError(caught instanceof Error ? caught.message : "Controle indisponível."),\n    });\n    controlQueueRef.current = queue;\n    return () => { queue.dispose(); if (controlQueueRef.current === queue) controlQueueRef.current = null; };\n  }, [code, token]);\n\n  const load = useCallback(async () => {\n    try {\n      const response = await fetch(\`/api/session?code=\${encodeURIComponent(code)}\`, { cache: "no-store" });\n      const data = await readJson(response);\n      if (!response.ok) throw new Error(data.error);\n      if (!data.session) throw new Error("Sessão sem dados válidos.");\n      const acceptRemote = controlQueueRef.current?.canAcceptRemote() ?? true;\n      setSession((previous) => acceptRemote || !previous ? data.session! : { ...data.session!, currentSlide: previous.currentSlide, activePrompt: previous.activePrompt });\n      setError("");\n    } catch (caught) { setError(caught instanceof Error ? caught.message : "Controle indisponível."); }\n  }, [code]);`,
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  const control = async (nextIndex: number) => {\n    if (!session || !deck.length) return;\n    const safe = Math.max(0, Math.min(deck.length - 1, nextIndex));\n    const activePrompt = deck[safe]?.prompt?.id ?? null;\n    const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "control", code, token, currentSlide: safe, activePrompt }) });\n    const data = await readJson(response);\n    if (!response.ok) { setError(data.error || "Controle não autorizado."); return; }\n    if (!data.session) { setError("O controle não recebeu o estado atualizado."); return; }\n    setSession(data.session);\n  };',
  '  const control = (nextIndex: number) => {\n    if (!session || !deck.length) return;\n    const safe = Math.max(0, Math.min(deck.length - 1, nextIndex));\n    const activePrompt = deck[safe]?.prompt?.id ?? null;\n    setSession((currentSession) => currentSession ? { ...currentSession, currentSlide: safe, activePrompt } : currentSession);\n    controlQueueRef.current?.enqueue({ currentSlide: safe, activePrompt });\n  };',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  const [sessionError, setSessionError] = useState("");\n  const routeCode = route.code;',
  '  const [sessionError, setSessionError] = useState("");\n  const controlQueueRef = useRef<ReturnType<typeof createLatestControlQueue> | null>(null);\n  const pollInFlightRef = useRef(false);\n  const routeCode = route.code;',
);

replaceOnce(
  'apps/pitch-institucional/app/page.tsx',
  '  const start = async () => {\n    setCurrent(0); setView("deck");\n    if (mode === "interativo") await createSession();\n  };',
  '  const start = async () => {\n    setCurrent(0); setSession(null); setPresenterToken(""); setSessionError(""); setView("deck");\n    if (mode === "interativo") await createSession();\n  };',
);

replaceRegexOnce(
  'apps/pitch-institucional/app/page.tsx',
  /  const sessionCode = session\?\.code;\n  useEffect\(\(\) => \{\n    if \(view !== "deck" \|\| !sessionCode \|\| !presenterToken\) return;[\s\S]*?  \}, \[deck\.length, sessionCode, view\]\);/,
  `  const sessionCode = session?.code;\n  useEffect(() => {\n    if (view !== "deck" || !sessionCode || !presenterToken) {\n      controlQueueRef.current?.dispose();\n      controlQueueRef.current = null;\n      return;\n    }\n\n    const queue = createLatestControlQueue(async ({ currentSlide, activePrompt }: { currentSlide: number; activePrompt: string | null }) => {\n      const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "control", code: sessionCode, token: presenterToken, currentSlide, activePrompt }) });\n      const data = await readJson(response);\n      if (!response.ok) throw new Error(data.error || "Não foi possível sincronizar o slide.");\n      if (!data.session) throw new Error("A sincronização não retornou o estado da sessão.");\n      return data.session;\n    }, {\n      onSuccess: (nextSession) => { setSession(nextSession); setSessionError(""); },\n      onError: (caught) => setSessionError(caught instanceof Error ? caught.message : "A sincronização da sessão falhou."),\n    });\n\n    controlQueueRef.current = queue;\n    return () => { queue.dispose(); if (controlQueueRef.current === queue) controlQueueRef.current = null; };\n  }, [presenterToken, sessionCode, view]);\n\n  useEffect(() => {\n    if (view !== "deck" || !sessionCode || !presenterToken) return;\n    const slide = deck[current];\n    controlQueueRef.current?.enqueue({ currentSlide: current, activePrompt: slide?.prompt?.id ?? null });\n  }, [current, deck, presenterToken, sessionCode, view]);\n\n  useEffect(() => {\n    if (view !== "deck" || !sessionCode) return;\n    const poll = async () => {\n      if (pollInFlightRef.current) return;\n      pollInFlightRef.current = true;\n      try {\n        const response = await fetch(\`/api/session?code=\${sessionCode}\`, { cache: "no-store" });\n        const data = await readJson(response);\n        if (data.session) {\n          const acceptRemote = controlQueueRef.current?.canAcceptRemote() ?? true;\n          setSession((previous) => acceptRemote || !previous ? data.session! : { ...data.session!, currentSlide: previous.currentSlide, activePrompt: previous.activePrompt });\n          if (acceptRemote) {\n            const safeCurrent = Math.max(0, Math.min(deck.length - 1, data.session.currentSlide));\n            setCurrent((previous) => previous === safeCurrent ? previous : safeCurrent);\n          }\n        }\n      } catch { /* keep the stage usable offline */ }\n      finally { pollInFlightRef.current = false; }\n    };\n    const timer = window.setInterval(() => void poll(), 1500);\n    return () => window.clearInterval(timer);\n  }, [deck.length, sessionCode, view]);`,
);

replaceOnce(
  'apps/pitch-institucional/app/globals.css',
  '.presentation-shell { width: 100vw; height: 100vh; min-height: 620px; position: relative; overflow: hidden; background: var(--cream); }',
  '.presentation-shell { width: 100vw; height: 100vh; height: 100dvh; min-height: min(620px, 100dvh); position: relative; overflow: hidden; overscroll-behavior: contain; background: var(--cream); }',
);

replaceOnce(
  'apps/pitch-institucional/app/globals.css',
  '.presentation-controls { position: absolute; right: clamp(18px, 2.7vw, 42px); bottom: 18px; z-index: 25; display: flex; align-items: center; gap: 12px; }\n.presentation-controls button { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; background: rgba(255,255,255,.86); cursor: pointer; box-shadow: 0 8px 20px rgba(7,26,61,.08); }',
  '.presentation-controls { position: absolute; right: clamp(18px, 2.7vw, 42px); bottom: max(14px, env(safe-area-inset-bottom)); z-index: 25; display: flex; align-items: center; gap: 12px; }\n.presentation-controls button { width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; background: rgba(255,255,255,.9); cursor: pointer; touch-action: manipulation; box-shadow: 0 8px 20px rgba(7,26,61,.08); }',
);

replaceOnce(
  'apps/pitch-institucional/app/globals.css',
  '  .slide { min-height: calc(100dvh - 62px); position: relative; inset: auto; margin-top: 62px; grid-template-columns: 1fr; align-items: start; gap: 30px; padding: 45px 24px 95px; overflow: visible; }',
  '  .slide { min-height: calc(100dvh - 62px); position: relative; inset: auto; margin-top: 62px; grid-template-columns: 1fr; align-items: start; gap: 30px; padding: 45px 24px calc(118px + env(safe-area-inset-bottom)); overflow: visible; }',
);

replaceOnce(
  'apps/pitch-institucional/app/globals.css',
  '  .presentation-controls { position: fixed; left: 50%; right: auto; transform: translateX(-50%); padding: 6px; border-radius: 999px; background: rgba(251,249,245,.88); backdrop-filter: blur(14px); }\n  .progress-track { width: 95px; }',
  '  .presentation-actions button { min-width: 44px; height: 44px; padding: 0; touch-action: manipulation; }\n  .presentation-controls { position: fixed; left: 50%; right: auto; bottom: max(10px, env(safe-area-inset-bottom)); max-width: calc(100vw - 20px); transform: translateX(-50%); padding: 6px; border-radius: 999px; background: rgba(251,249,245,.94); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(7,26,61,.13); }\n  .progress-track { width: clamp(62px, 18vw, 95px); }',
);

replaceOnce(
  'apps/pitch-institucional/app/globals.css',
  '  .slide { padding-left: 19px; padding-right: 19px; }\n  .slide__visual { min-height: 390px; }',
  '  .slide { padding-left: 19px; padding-right: 19px; }\n  .slide__body { font-size: 1rem; line-height: 1.58; }\n  .presentation-controls { gap: 8px; }\n  .presentation-controls button { width: 46px; height: 46px; }\n  .presentation-controls span { min-width: 44px; }\n  .slide__visual { min-height: 390px; }',
);

replaceOnce(
  'apps/pitch-institucional/package.json',
  '    "test": "npm run build && node --test tests/rendered-html.test.mjs",',
  '    "test": "npm run build && node --test tests/*.test.mjs",',
);

replaceOnce(
  'apresentacao-institucional.html',
  '  <link rel="stylesheet" href="assets/css/kc-pitch-host.css?v=1.2.1" />',
  '  <link rel="stylesheet" href="assets/css/kc-pitch-host.css?v=1.3.0" />\n  <script defer src="assets/js/features/kc-pitch-host.js?v=1.3.0"></script>',
);

replaceOnce(
  'apresentacao-institucional.html',
  '      referrerpolicy="strict-origin-when-cross-origin"\n    ></iframe>',
  '      referrerpolicy="strict-origin-when-cross-origin"\n      loading="eager"\n    ></iframe>',
);

replaceOnce(
  'apresentacao-institucional.html',
  '  <script defer src="assets/js/features/kc-pitch-host.js?v=1.2.0"></script>\n',
  '',
);

replaceOnce(
  'assets/js/features/kc-pitch-host.js',
  '  // v1.2.0: Embed direto do iframe + loop protection.',
  '  // v1.3.0: Embed direto antecipado + loop protection.',
);

replaceOnce(
  'assets/css/kc-pitch-host.css',
  '/* v1.2.0: fallback aparece em 12s (antes 9s) — mais tolerante a conexões lentas */',
  '/* v1.3.0: fallback aparece em 12s; o script agora inicia cedo no documento */',
);

replaceOnce(
  'tests/integration/kc-pitch-host.test.js',
  '  const hostScript = read(\'assets/js/features/kc-pitch-host.js\');\n',
  '  const hostScript = read(\'assets/js/features/kc-pitch-host.js\');\n  const hostStyle = read(\'assets/css/kc-pitch-host.css\');\n',
);

replaceOnce(
  'tests/integration/kc-pitch-host.test.js',
  '  test(\'host script tem fallback de loading após timeout\', () => {\n    expect(hostScript).toContain(\'is-pitch-slow\');\n    expect(hostScript).toContain(\'is-pitch-ready\');\n  });',
  `  test('host script tem fallback de loading após timeout', () => {\n    expect(hostScript).toContain('is-pitch-slow');\n    expect(hostScript).toContain('is-pitch-ready');\n  });\n\n  test('inicia o embed antes da cadeia geral e preserva altura dinâmica', () => {\n    const pitchScript = page.indexOf('kc-pitch-host.js?v=1.3.0');\n    const generalChain = page.indexOf('kc-constants.js');\n    expect(pitchScript).toBeGreaterThan(-1);\n    expect(pitchScript).toBeLessThan(generalChain);\n    expect(page.match(/kc-pitch-host\\.js/g)).toHaveLength(1);\n    expect(page).toContain('loading="eager"');\n    expect(hostStyle).toContain('height: 100dvh');\n  });`,
);

replaceOnce(
  '.github/workflows/essential-validation.yml',
  '  database-contracts:\n    name: Supabase reset, lint and pgTAP',
  `  pitch-institucional:\n    name: Pitch build, lint and interaction tests\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n\n    steps:\n      - name: Checkout\n        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0\n\n      - name: Setup Node.js 24\n        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: '24'\n          cache: 'npm'\n          cache-dependency-path: apps/pitch-institucional/package-lock.json\n\n      - name: Install pitch dependencies\n        working-directory: apps/pitch-institucional\n        run: npm ci\n\n      - name: Lint pitch source\n        working-directory: apps/pitch-institucional\n        run: npm run lint\n\n      - name: Build and test all pitch modes\n        working-directory: apps/pitch-institucional\n        run: npm test\n\n  database-contracts:\n    name: Supabase reset, lint and pgTAP`,
);

console.log('[patch] all pitch reliability changes applied');
