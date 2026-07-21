import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, search, replacement, label) {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${occurrences}`);
  }
  return source.replace(search, replacement);
}

const pagePath = "apps/pitch-institucional/app/page.tsx";
const layoutPath = "apps/pitch-institucional/app/layout.tsx";
const cssPath = "apps/pitch-institucional/app/globals.css";

let page = await readFile(pagePath, "utf8");
page = replaceOnce(page, "  Accessibility,\n", "", "remove obsolete accessibility icon import");

page = replaceOnce(
  page,
  `      onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX; }}
      onTouchEnd={(event) => { if (touchStart.current === null) return; const distance = event.changedTouches[0].clientX - touchStart.current; if (distance < -60) next(); if (distance > 60) previous(); touchStart.current = null; }}`,
  `      onTouchStart={(event) => {
        if (event.target instanceof Element && event.target.closest(".presentation-controls, .presentation-actions")) return;
        touchStart.current = event.changedTouches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        if (distance < -60) next();
        if (distance > 60) previous();
        touchStart.current = null;
      }}`,
  "isolate touch gestures from controls",
);

page = replaceOnce(
  page,
  `          <button type="button" onClick={() => setProjectionMode((current) => !current)} className={projectionMode ? "is-active" : ""} aria-pressed={projectionMode} title="Aumentar a legibilidade na projeção"><Accessibility size={18} /><span>Projeção</span></button>`,
  `          <button
            type="button"
            data-kc-projection-toggle
            onClick={() => setProjectionMode((current) => !current)}
            className={projectionMode ? "is-active" : ""}
            aria-pressed={projectionMode}
            aria-label={projectionMode ? "Desativar modo de projeção e restaurar o tamanho do texto" : "Ativar modo de projeção para aumentar texto e contraste"}
            title={projectionMode ? "Restaurar tamanho e contraste padrão" : "Aumentar texto e contraste para projeção"}
          ><span className="projection-glyph" aria-hidden="true">{projectionMode ? "A−" : "A+"}</span><span>Projeção</span></button>`,
  "replace projection icon and semantics",
);

page = replaceOnce(
  page,
  `  const deck = useMemo(() => buildDeck(duration, mode), [duration, mode]);\n`,
  `  const deck = useMemo(() => buildDeck(duration, mode), [duration, mode]);
  const localSlideIntentRef = useRef<{ slide: number; until: number } | null>(null);
  const controlQueueRef = useRef<Promise<void>>(Promise.resolve());
  const navigate = useCallback((nextIndex: number) => {
    const safeCurrent = Math.max(0, Math.min(deck.length - 1, nextIndex));
    localSlideIntentRef.current = { slide: safeCurrent, until: performance.now() + 1800 };
    if (window.matchMedia("(max-width: 900px)").matches) {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    }
    setCurrent(safeCurrent);
  }, [deck.length]);
`,
  "install local navigation authority",
);

page = replaceOnce(
  page,
  `  const start = async () => {
    setCurrent(0); setView("deck");
    if (mode === "interativo") await createSession();
  };`,
  `  const start = async () => {
    localSlideIntentRef.current = null;
    setCurrent(0); setView("deck");
    if (mode === "interativo") await createSession();
  };`,
  "reset navigation authority on start",
);

page = replaceOnce(
  page,
  `  useEffect(() => {
    if (view !== "deck" || !sessionCode || !presenterToken) return;
    const slide = deck[current];
    fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "control", code: sessionCode, token: presenterToken, currentSlide: current, activePrompt: slide?.prompt?.id ?? null }) })
      .then((response) => readJson(response))
      .then((data) => { if (data.session) setSession(data.session); })
      .catch(() => undefined);
  }, [current, deck, presenterToken, sessionCode, view]);`,
  `  useEffect(() => {
    if (view !== "deck" || !sessionCode || !presenterToken) return;
    const requestedSlide = current;
    const activePrompt = deck[requestedSlide]?.prompt?.id ?? null;
    const synchronize = async () => {
      try {
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "control", code: sessionCode, token: presenterToken, currentSlide: requestedSlide, activePrompt }),
        });
        const data = await readJson(response);
        if (data.session) setSession(data.session);
      } catch { /* keep local navigation responsive if live sync is unavailable */ }
    };
    controlQueueRef.current = controlQueueRef.current.then(synchronize, synchronize);
  }, [current, deck, presenterToken, sessionCode, view]);`,
  "serialize presenter control writes",
);

page = replaceOnce(
  page,
  `  useEffect(() => {
    if (view !== "deck" || !sessionCode) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(\`/api/session?code=\${sessionCode}\`, { cache: "no-store" });
        const data = await readJson(response);
        if (data.session) {
          setSession(data.session);
          const safeCurrent = Math.max(0, Math.min(deck.length - 1, data.session.currentSlide));
          setCurrent((previous) => previous === safeCurrent ? previous : safeCurrent);
        }
      } catch { /* keep the stage usable offline */ }
    }, 900);
    return () => window.clearInterval(timer);
  }, [deck.length, sessionCode, view]);`,
  `  useEffect(() => {
    if (view !== "deck" || !sessionCode) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(\`/api/session?code=\${sessionCode}\`, { cache: "no-store" });
        const data = await readJson(response);
        if (!data.session) return;

        const localIntent = localSlideIntentRef.current;
        if (localIntent && performance.now() < localIntent.until) {
          const activePrompt = deck[localIntent.slide]?.prompt?.id ?? null;
          const protectedSession = data.session.currentSlide === localIntent.slide && data.session.activePrompt === activePrompt
            ? data.session
            : { ...data.session, currentSlide: localIntent.slide, activePrompt };
          setSession(protectedSession);
          setCurrent((previous) => previous === localIntent.slide ? previous : localIntent.slide);
          return;
        }

        localSlideIntentRef.current = null;
        setSession(data.session);
        const safeCurrent = Math.max(0, Math.min(deck.length - 1, data.session.currentSlide));
        setCurrent((previous) => {
          if (previous === safeCurrent) return previous;
          if (window.matchMedia("(max-width: 900px)").matches) {
            window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
          }
          return safeCurrent;
        });
      } catch { /* keep the stage usable offline */ }
    }, 900);
    return () => window.clearInterval(timer);
  }, [deck, sessionCode, view]);`,
  "protect local state from stale session polling",
);

page = replaceOnce(
  page,
  `  const exit = () => { setView("launch"); setCurrent(0); window.history.replaceState({}, "", window.location.pathname); };`,
  `  const exit = () => { localSlideIntentRef.current = null; setView("launch"); setCurrent(0); window.history.replaceState({}, "", window.location.pathname); };`,
  "reset navigation authority on exit",
);

page = replaceOnce(
  page,
  `  if (view === "deck") return <PresenterView duration={duration} mode={mode} deck={deck} current={current} onCurrent={setCurrent} onExit={exit} session={session} presenterToken={presenterToken} onCreateSession={createSession} sessionError={sessionError} />;`,
  `  if (view === "deck") return <PresenterView duration={duration} mode={mode} deck={deck} current={current} onCurrent={navigate} onExit={exit} session={session} presenterToken={presenterToken} onCreateSession={createSession} sessionError={sessionError} />;`,
  "route all presenter navigation through guarded state",
);

await writeFile(pagePath, page);

let layout = await readFile(layoutPath, "utf8");
layout = replaceOnce(layout, `import PitchRuntimeGuard from "./pitch-runtime-guard";\n`, "", "remove runtime guard import");
layout = replaceOnce(layout, `        <PitchRuntimeGuard />\n`, "", "remove runtime guard component");
await writeFile(layoutPath, layout);

let css = await readFile(cssPath, "utf8");
css = replaceOnce(
  css,
  `.presentation-shell { width: 100vw; height: 100vh; min-height: 620px; position: relative; overflow: hidden; background: var(--cream); }`,
  `.presentation-shell { width: 100vw; height: 100vh; min-height: 620px; position: relative; overflow: hidden; overscroll-behavior: contain; background: var(--cream); }`,
  "contain presentation overscroll",
);
css = replaceOnce(
  css,
  `.presentation-actions button, .icon-button { min-width: 36px; height: 36px; border: 1px solid var(--line); background: rgba(255,255,255,.8); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 10px; color: #656d78; font-size: .72rem; font-weight: 750; cursor: pointer; }`,
  `.presentation-actions button, .icon-button { min-width: 36px; height: 36px; border: 1px solid var(--line); background: rgba(255,255,255,.8); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 10px; color: #656d78; font-size: .72rem; font-weight: 750; cursor: pointer; touch-action: manipulation; user-select: none; }\n.projection-glyph { min-width: 1.45em; display: inline-grid; place-items: center; font-size: .72rem; font-weight: 900; line-height: 1; letter-spacing: -.06em; }`,
  "style projection glyph and touch targets",
);
css = replaceOnce(
  css,
  `.presentation-controls button { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; background: rgba(255,255,255,.86); cursor: pointer; box-shadow: 0 8px 20px rgba(7,26,61,.08); }`,
  `.presentation-controls button { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; background: rgba(255,255,255,.86); cursor: pointer; touch-action: manipulation; user-select: none; box-shadow: 0 8px 20px rgba(7,26,61,.08); }`,
  "harden navigation touch targets",
);
css = replaceOnce(
  css,
  `  .presentation-header { position: fixed; }`,
  `  .presentation-header { position: fixed; padding-left: max(14px, env(safe-area-inset-left, 0px)); padding-right: max(14px, env(safe-area-inset-right, 0px)); }`,
  "respect mobile header safe areas",
);
css = replaceOnce(
  css,
  `  .slide { min-height: calc(100dvh - 62px); position: relative; inset: auto; margin-top: 62px; grid-template-columns: 1fr; align-items: start; gap: 30px; padding: 45px 24px 95px; overflow: visible; }`,
  `  .slide { min-height: calc(100dvh - 62px); position: relative; inset: auto; margin-top: 62px; grid-template-columns: 1fr; align-items: start; gap: 30px; padding: 45px 24px calc(118px + env(safe-area-inset-bottom, 0px)); overflow: visible; }`,
  "reserve mobile space for fixed controls",
);
css = replaceOnce(
  css,
  `  .presentation-controls { position: fixed; left: 50%; right: auto; transform: translateX(-50%); padding: 6px; border-radius: 999px; background: rgba(251,249,245,.88); backdrop-filter: blur(14px); }\n  .progress-track { width: 95px; }`,
  `  .presentation-controls { position: fixed; left: 50%; right: auto; bottom: max(12px, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); max-width: calc(100vw - 24px); padding: 7px 9px; gap: 9px; border-radius: 999px; background: rgba(251,249,245,.88); box-shadow: 0 12px 34px rgba(7,26,61,.16); backdrop-filter: blur(14px); }\n  .presentation-controls button { width: 48px; height: 48px; flex: 0 0 48px; }\n  .presentation-controls span { min-width: 44px; text-align: center; }\n  .progress-track { width: clamp(72px, 22vw, 108px); }`,
  "enlarge and constrain mobile presentation controls",
);
await writeFile(cssPath, css);

console.log("Direct pitch source-state fix applied successfully.");
