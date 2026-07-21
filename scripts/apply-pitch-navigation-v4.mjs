import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => fs.readFileSync(target(relativePath), "utf8");
const write = (relativePath, content) => {
  const destination = target(relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
};
const replaceOnce = (source, before, after, label) => {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Patch anchor not found: ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) throw new Error(`Patch anchor is ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
};

const pagePath = "apps/pitch-institucional/app/page.tsx";
let page = read(pagePath);
if (!page.includes("pendingNavigationRef") || !page.includes("reconcilePresenterSlide")) {
  page = replaceOnce(page, "  Maximize2,\n  Menu,", "  Maximize2,\n  Menu,\n  ZoomIn,", "ZoomIn import");
  page = replaceOnce(page, "} from \"./decks\";\n\ntype SessionSnapshot = {", "} from \"./decks\";\nimport { clampSlide, reconcilePresenterSlide, type PendingLocalNavigation } from \"./presentation-sync\";\n\ntype SessionSnapshot = {", "presentation sync import");
  page = replaceOnce(page, "type SessionApiResponse = {\n  error?: string;\n  session?: SessionSnapshot;\n  presenterToken?: string;\n};\n\nasync function readJson", "type SessionApiResponse = {\n  error?: string;\n  session?: SessionSnapshot;\n  presenterToken?: string;\n};\n\ntype SlideStateUpdate = number | ((current: number) => number);\n\nasync function readJson", "slide update type");
  page = replaceOnce(page, "  onCurrent: (index: number) => void;", "  onCurrent: (update: SlideStateUpdate) => void;", "presenter callback type");
  page = replaceOnce(page, "  const touchStart = useRef<number | null>(null);", "  const touchStart = useRef<{ x: number; y: number; blocked: boolean } | null>(null);", "touch state");
  page = replaceOnce(page, "  const next = useCallback(() => onCurrent(Math.min(deck.length - 1, current + 1)), [current, deck.length, onCurrent]);\n  const previous = useCallback(() => onCurrent(Math.max(0, current - 1)), [current, onCurrent]);", "  const next = useCallback(() => onCurrent((value) => Math.min(deck.length - 1, value + 1)), [deck.length, onCurrent]);\n  const previous = useCallback(() => onCurrent((value) => Math.max(0, value - 1)), [onCurrent]);", "functional navigation");
  page = replaceOnce(page, "      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;\n      if ([\"ArrowRight\", \"PageDown\", \" \"].includes(event.key)) { event.preventDefault(); next(); }\n      if ([\"ArrowLeft\", \"PageUp\"].includes(event.key)) { event.preventDefault(); previous(); }\n      if (event.key === \"Home\") onCurrent(0);\n      if (event.key === \"End\") onCurrent(deck.length - 1);", "      const target = event.target;\n      if (\n        target instanceof HTMLInputElement ||\n        target instanceof HTMLTextAreaElement ||\n        target instanceof HTMLSelectElement ||\n        (target instanceof HTMLElement && target.isContentEditable)\n      ) return;\n      const navigationKeys = [\"ArrowRight\", \"PageDown\", \" \", \"ArrowLeft\", \"PageUp\", \"Home\", \"End\"];\n      if (event.repeat && navigationKeys.includes(event.key)) return;\n      if ([\"ArrowRight\", \"PageDown\", \" \"].includes(event.key)) { event.preventDefault(); next(); }\n      if ([\"ArrowLeft\", \"PageUp\"].includes(event.key)) { event.preventDefault(); previous(); }\n      if (event.key === \"Home\") { event.preventDefault(); onCurrent(0); }\n      if (event.key === \"End\") { event.preventDefault(); onCurrent(deck.length - 1); }", "keyboard guards");
  page = replaceOnce(page, "      onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX; }}\n      onTouchEnd={(event) => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; if (distance < -60) next(); if (distance > 60) previous(); touchStart.current = null; }}", "      onTouchStart={(event) => {\n        const touch = event.changedTouches[0];\n        if (!touch) return;\n        const target = event.target;\n        const blocked = target instanceof Element && Boolean(target.closest(\"button, a, input, textarea, select, [role=\\\"button\\\"]\"));\n        touchStart.current = { x: touch.clientX, y: touch.clientY, blocked };\n      }}\n      onTouchEnd={(event) => {\n        const start = touchStart.current;\n        const touch = event.changedTouches[0];\n        touchStart.current = null;\n        if (!start || !touch || start.blocked) return;\n        const deltaX = touch.clientX - start.x;\n        const deltaY = touch.clientY - start.y;\n        if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;\n        if (deltaX < 0) next();\n        else previous();\n      }}\n      onTouchCancel={() => { touchStart.current = null; }}", "safe touch navigation");
  page = replaceOnce(page, "          <button type=\"button\" onClick={() => setProjectionMode((current) => !current)} className={projectionMode ? \"is-active\" : \"\"} aria-pressed={projectionMode} title=\"Aumentar a legibilidade na projeção\"><Accessibility size={18} /><span>Projeção</span></button>", "          <button\n            type=\"button\"\n            onClick={() => setProjectionMode((value) => !value)}\n            className={projectionMode ? \"is-active\" : \"\"}\n            aria-pressed={projectionMode}\n            aria-label={projectionMode ? \"Restaurar tamanho padrão da apresentação\" : \"Ampliar conteúdo para projeção\"}\n            title={projectionMode ? \"Restaurar tamanho padrão\" : \"Ampliar conteúdo para projeção\"}\n          >\n            <ZoomIn size={18} />\n            <span>{projectionMode ? \"Padrão\" : \"Ampliar\"}</span>\n          </button>", "projection control");
  page = replaceOnce(page, "  const [sessionError, setSessionError] = useState(\"\");\n  const routeCode = route.code;", "  const [sessionError, setSessionError] = useState(\"\");\n  const currentRef = useRef(0);\n  const pendingNavigationRef = useRef<PendingLocalNavigation | null>(null);\n  const controlRequestRef = useRef(0);\n  const routeCode = route.code;", "synchronization refs");
  page = replaceOnce(page, "  const deck = useMemo(() => buildDeck(duration, mode), [duration, mode]);\n\n  const createSession = useCallback(async () => {", "  const deck = useMemo(() => buildDeck(duration, mode), [duration, mode]);\n\n  useEffect(() => {\n    currentRef.current = current;\n  }, [current]);\n\n  const updatePresenterCurrent = useCallback((update: SlideStateUpdate) => {\n    const base = currentRef.current;\n    const requested = typeof update === \"function\" ? update(base) : update;\n    const nextSlide = clampSlide(requested, deck.length);\n    if (nextSlide === base) return;\n    currentRef.current = nextSlide;\n    pendingNavigationRef.current = { slide: nextSlide, startedAt: Date.now() };\n    setCurrent(nextSlide);\n  }, [deck.length]);\n\n  const createSession = useCallback(async () => {", "presenter current updater");
  page = replaceOnce(page, "      if (!data.session || !data.presenterToken) throw new Error(\"A sessão foi criada sem dados de controle.\");\n      setSession(data.session); setPresenterToken(data.presenterToken);", "      if (!data.session || !data.presenterToken) throw new Error(\"A sessão foi criada sem dados de controle.\");\n      const initialSlide = clampSlide(currentRef.current, deck.length);\n      pendingNavigationRef.current = { slide: initialSlide, startedAt: Date.now() };\n      setSession(data.session); setPresenterToken(data.presenterToken);", "session initialization");
  page = replaceOnce(page, "  }, [duration, mode]);\n\n  const start = async () => {\n    setCurrent(0); setView(\"deck\");\n    if (mode === \"interativo\") await createSession();\n  };", "  }, [deck.length, duration, mode]);\n\n  const start = async () => {\n    controlRequestRef.current += 1;\n    currentRef.current = 0;\n    pendingNavigationRef.current = null;\n    setCurrent(0);\n    setSession(null);\n    setPresenterToken(\"\");\n    setSessionError(\"\");\n    setView(\"deck\");\n    if (mode === \"interativo\") await createSession();\n  };", "clean start");

  const syncStart = page.indexOf("  const sessionCode = session?.code;");
  const syncEnd = page.indexOf("\n\n  const exit = () =>", syncStart);
  if (syncStart === -1 || syncEnd === -1) throw new Error("Unable to locate presentation synchronization effects");
  const syncBlock = `  const sessionCode = session?.code;
  useEffect(() => {
    if (view !== "deck" || !sessionCode || !presenterToken) return;
    const pending = pendingNavigationRef.current;
    if (!pending || pending.slide !== current) return;

    const requestId = ++controlRequestRef.current;
    const controller = new AbortController();
    const slide = deck[current];
    const synchronize = async () => {
      try {
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "control",
            code: sessionCode,
            token: presenterToken,
            currentSlide: current,
            activePrompt: slide?.prompt?.id ?? null,
          }),
          signal: controller.signal,
        });
        const data = await readJson(response);
        if (requestId !== controlRequestRef.current || !response.ok || !data.session) return;
        setSession(data.session);
        const acknowledged = clampSlide(data.session.currentSlide, deck.length);
        if (pendingNavigationRef.current?.slide === acknowledged) pendingNavigationRef.current = null;
      } catch {
        // Local navigation remains responsive; polling reconciles after recovery.
      }
    };
    void synchronize();
    return () => controller.abort();
  }, [current, deck, presenterToken, sessionCode, view]);

  useEffect(() => {
    if (view !== "deck" || !sessionCode) return;
    let stopped = false;
    let inFlight = false;
    let pollController: AbortController | null = null;

    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      pollController = new AbortController();
      try {
        const response = await fetch(\`/api/session?code=\${encodeURIComponent(sessionCode)}\`, {
          cache: "no-store",
          signal: pollController.signal,
        });
        const data = await readJson(response);
        if (stopped || !response.ok || !data.session) return;
        setSession(data.session);
        const result = reconcilePresenterSlide({
          localSlide: currentRef.current,
          remoteSlide: data.session.currentSlide,
          totalSlides: deck.length,
          pending: pendingNavigationRef.current,
        });
        pendingNavigationRef.current = result.pending;
        if (result.slide !== currentRef.current) {
          currentRef.current = result.slide;
          setCurrent(result.slide);
        }
      } catch {
        // The local stage stays usable while the live service is unavailable.
      } finally {
        inFlight = false;
      }
    };

    const firstPoll = window.setTimeout(() => void poll(), 0);
    const timer = window.setInterval(() => void poll(), 900);
    return () => {
      stopped = true;
      window.clearTimeout(firstPoll);
      window.clearInterval(timer);
      pollController?.abort();
    };
  }, [deck.length, sessionCode, view]);`;
  page = page.slice(0, syncStart) + syncBlock + page.slice(syncEnd);
  page = replaceOnce(page, "  const exit = () => { setView(\"launch\"); setCurrent(0); window.history.replaceState({}, \"\", window.location.pathname); };", "  const exit = () => {\n    controlRequestRef.current += 1;\n    pendingNavigationRef.current = null;\n    currentRef.current = 0;\n    setSession(null);\n    setPresenterToken(\"\");\n    setSessionError(\"\");\n    setView(\"launch\");\n    setCurrent(0);\n    window.history.replaceState({}, \"\", window.location.pathname);\n  };", "clean exit");
  page = replaceOnce(page, "  if (view === \"deck\") return <PresenterView duration={duration} mode={mode} deck={deck} current={current} onCurrent={setCurrent} onExit={exit} session={session} presenterToken={presenterToken} onCreateSession={createSession} sessionError={sessionError} />;", "  if (view === \"deck\") return <PresenterView duration={duration} mode={mode} deck={deck} current={current} onCurrent={updatePresenterCurrent} onExit={exit} session={session} presenterToken={presenterToken} onCreateSession={createSession} sessionError={sessionError} />;", "presenter binding");
  page = replaceOnce(page, "  return <LaunchScreen duration={duration} mode={mode} onDuration={(value) => { setDuration(value); setCurrent(0); }} onMode={(value) => { setMode(value); setCurrent(0); }} onStart={start} />;", "  return <LaunchScreen duration={duration} mode={mode} onDuration={(value) => { setDuration(value); currentRef.current = 0; pendingNavigationRef.current = null; setCurrent(0); }} onMode={(value) => { setMode(value); currentRef.current = 0; pendingNavigationRef.current = null; setCurrent(0); }} onStart={start} />;", "launch reset");
}
write(pagePath, page);

write("apps/pitch-institucional/app/presentation-sync.ts", `export const LOCAL_NAVIGATION_GRACE_MS = 5000;

export type PendingLocalNavigation = {
  slide: number;
  startedAt: number;
};

type ReconciliationInput = {
  localSlide: number;
  remoteSlide: number;
  totalSlides: number;
  pending: PendingLocalNavigation | null;
  now?: number;
};

type ReconciliationResult = {
  slide: number;
  pending: PendingLocalNavigation | null;
  source: "unchanged" | "remote" | "acknowledged" | "local-pending";
};

export function clampSlide(index: number, totalSlides: number) {
  if (!Number.isFinite(totalSlides) || totalSlides <= 0) return 0;
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.max(0, Math.min(Math.trunc(totalSlides) - 1, safeIndex));
}

export function reconcilePresenterSlide({
  localSlide,
  remoteSlide,
  totalSlides,
  pending,
  now = Date.now(),
}: ReconciliationInput): ReconciliationResult {
  const safeLocal = clampSlide(localSlide, totalSlides);
  const safeRemote = clampSlide(remoteSlide, totalSlides);
  if (!pending) {
    return { slide: safeRemote, pending: null, source: safeRemote === safeLocal ? "unchanged" : "remote" };
  }
  const safePending = clampSlide(pending.slide, totalSlides);
  if (safeRemote === safePending) {
    return { slide: safePending, pending: null, source: "acknowledged" };
  }
  const age = Math.max(0, now - pending.startedAt);
  if (age <= LOCAL_NAVIGATION_GRACE_MS) {
    return { slide: safeLocal, pending: { ...pending, slide: safePending }, source: "local-pending" };
  }
  return { slide: safeRemote, pending: null, source: "remote" };
}
`);

const cssPath = "apps/pitch-institucional/app/globals.css";
let css = read(cssPath);
if (!css.includes("bottom: max(12px, env(safe-area-inset-bottom))")) {
  css = replaceOnce(css, ".presentation-shell { width: 100vw; height: 100vh; min-height: 620px; position: relative; overflow: hidden; background: var(--cream); }", ".presentation-shell { width: 100%; height: 100vh; height: 100dvh; min-height: min(620px, 100dvh); position: relative; overflow: hidden; overscroll-behavior: contain; background: var(--cream); }", "dynamic viewport");
  css = replaceOnce(css, ".presentation-controls button { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; background: rgba(255,255,255,.86); cursor: pointer; box-shadow: 0 8px 20px rgba(7,26,61,.08); }", ".presentation-controls button { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; background: rgba(255,255,255,.86); cursor: pointer; touch-action: manipulation; user-select: none; box-shadow: 0 8px 20px rgba(7,26,61,.08); }", "touch targets");
  css = replaceOnce(css, "  .presentation-shell { min-height: 100dvh; height: auto; overflow: auto; }", "  .presentation-shell { width: 100%; min-height: 100dvh; height: auto; overflow: auto; touch-action: pan-y pinch-zoom; }", "mobile shell");
  css = replaceOnce(css, "  .slide { min-height: calc(100dvh - 62px); position: relative; inset: auto; margin-top: 62px; grid-template-columns: 1fr; align-items: start; gap: 30px; padding: 45px 24px 95px; overflow: visible; }", "  .slide { min-height: calc(100dvh - 62px); position: relative; inset: auto; margin-top: 62px; grid-template-columns: 1fr; align-items: start; gap: 30px; padding: 45px 24px calc(106px + env(safe-area-inset-bottom)); overflow: visible; }", "mobile control clearance");
  css = replaceOnce(css, "  .presentation-controls { position: fixed; left: 50%; right: auto; transform: translateX(-50%); padding: 6px; border-radius: 999px; background: rgba(251,249,245,.88); backdrop-filter: blur(14px); }", "  .presentation-controls { position: fixed; left: 50%; right: auto; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 6px; border-radius: 999px; background: rgba(251,249,245,.92); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(7,26,61,.12); }\n  .presentation-controls button { width: 44px; height: 44px; }", "mobile safe area");
  css = replaceOnce(css, "  .presentation-shell.is-projection .slide { grid-template-columns: 1fr; }.presentation-shell.is-projection .slide__visual { min-height: 430px; }", "  .presentation-shell.is-projection .slide { grid-template-columns: 1fr; }\n  .presentation-shell.is-projection .slide__copy h1 { font-size: clamp(2.8rem, 10.8vw, 4.7rem); }\n  .presentation-shell.is-projection .slide__body { font-size: clamp(1.03rem, 3.8vw, 1.25rem); line-height: 1.55; }\n  .presentation-shell.is-projection .slide__visual { min-height: 430px; }", "mobile projection typography");
}
write(cssPath, css);

const packagePath = "apps/pitch-institucional/package.json";
const packageJson = JSON.parse(read(packagePath));
packageJson.scripts.test = "npm run build && node --test tests/*.test.mjs";
write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

write("apps/pitch-institucional/tests/presentation-behavior.test.mjs", `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  const context = { module: { exports: {} }, exports: null, console, Date, Math, Number };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename });
  return context.module.exports;
}

test("all six presentation variants remain complete", () => {
  const { buildDeck } = loadTypeScriptModule("app/decks.ts");
  const expected = [[5, "expositivo", 10], [5, "interativo", 11], [15, "expositivo", 17], [15, "interativo", 20], [30, "expositivo", 22], [30, "interativo", 25]];
  for (const [duration, mode, count] of expected) assert.equal(buildDeck(duration, mode).length, count, `${duration}-${mode}`);
});

test("a stale poll cannot undo pending local navigation", () => {
  const { LOCAL_NAVIGATION_GRACE_MS, reconcilePresenterSlide } = loadTypeScriptModule("app/presentation-sync.ts");
  const pending = { slide: 4, startedAt: 1000 };
  const stale = reconcilePresenterSlide({ localSlide: 4, remoteSlide: 3, totalSlides: 20, pending, now: 1000 + LOCAL_NAVIGATION_GRACE_MS - 1 });
  assert.equal(stale.slide, 4);
  assert.equal(stale.source, "local-pending");
  const acknowledged = reconcilePresenterSlide({ localSlide: 4, remoteSlide: 4, totalSlides: 20, pending, now: 1100 });
  assert.equal(acknowledged.pending, null);
  assert.equal(acknowledged.source, "acknowledged");
  const remoteAfterTimeout = reconcilePresenterSlide({ localSlide: 4, remoteSlide: 7, totalSlides: 20, pending, now: 1000 + LOCAL_NAVIGATION_GRACE_MS + 1 });
  assert.equal(remoteAfterTimeout.slide, 7);
  assert.equal(remoteAfterTimeout.source, "remote");
});

test("presenter controls use stable keyboard, touch and zoom contracts", () => {
  const source = read("app/page.tsx");
  assert.match(source, /onCurrent\(\(value\) => Math\.min\(deck\.length - 1, value \+ 1\)\)/);
  assert.match(source, /event\.repeat && navigationKeys\.includes\(event\.key\)/);
  assert.match(source, /Math\.abs\(deltaX\) <= Math\.abs\(deltaY\) \* 1\.25/);
  assert.match(source, /onTouchCancel=\{\(\) => \{ touchStart\.current = null; \}\}/);
  assert.match(source, /<ZoomIn size=\{18\} \/>/);
  assert.match(source, /Ampliar conteúdo para projeção/);
  assert.match(source, /reconcilePresenterSlide/);
  assert.match(source, /pendingNavigationRef/);
});

test("mobile controls reserve dynamic viewport and safe-area space", () => {
  const source = read("app/globals.css");
  assert.match(source, /height: 100dvh/);
  assert.match(source, /bottom: max\(12px, env\(safe-area-inset-bottom\)\)/);
  assert.match(source, /padding: 45px 24px calc\(106px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(source, /touch-action: pan-y pinch-zoom/);
});
`);

console.log("Pitch navigation reliability patch applied.");
