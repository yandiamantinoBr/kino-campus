"use client";

import { useEffect } from "react";

type SessionRequestPayload = {
  action?: string;
  code?: string;
};

type SessionNetworkState = {
  generation: number;
  pendingControls: number;
  controlChain: Promise<void>;
};

type GuardedWindow = Window &
  typeof globalThis & {
    __kinoPitchSessionFetchGuard?: boolean;
  };

const SESSION_PATH = "/api/session";
const PROJECTION_TITLE = "Aumentar a legibilidade na projeção";
const TOUCH_GUARD_SELECTOR = ".presentation-controls, .presentation-actions";

const runtimeStyles = `
  .presentation-shell {
    overscroll-behavior: contain;
  }

  .presentation-controls,
  .presentation-actions {
    isolation: isolate;
  }

  .presentation-controls button,
  .presentation-actions button {
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
  }

  .presentation-actions button[title="${PROJECTION_TITLE}"] > svg,
  .presentation-actions button[data-kc-projection-toggle] > svg {
    display: none !important;
  }

  .presentation-actions button[title="${PROJECTION_TITLE}"]::before,
  .presentation-actions button[data-kc-projection-toggle]::before {
    content: "A+";
    min-width: 1.4em;
    display: inline-grid;
    place-items: center;
    font-size: 0.72rem;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.06em;
  }

  .presentation-actions button[data-kc-projection-toggle][aria-pressed="true"]::before {
    content: "A−";
  }

  @media (max-width: 900px) {
    .presentation-controls {
      bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
      z-index: 80;
      max-width: calc(100vw - 24px);
      padding: 7px 9px !important;
      gap: 9px !important;
      box-shadow: 0 12px 34px rgba(7, 26, 61, 0.16);
    }

    .presentation-controls button {
      width: 48px !important;
      height: 48px !important;
      flex: 0 0 48px;
    }

    .presentation-controls span {
      min-width: 44px;
      text-align: center;
    }

    .presentation-controls .progress-track {
      width: clamp(72px, 22vw, 108px);
    }

    .slide {
      padding-bottom: calc(118px + env(safe-area-inset-bottom, 0px)) !important;
    }

    .presentation-header {
      padding-left: max(14px, env(safe-area-inset-left, 0px)) !important;
      padding-right: max(14px, env(safe-area-inset-right, 0px)) !important;
    }
  }

  @media (max-width: 390px) {
    .presentation-controls {
      gap: 7px !important;
    }

    .presentation-controls button {
      width: 46px !important;
      height: 46px !important;
      flex-basis: 46px;
    }

    .presentation-controls .progress-track {
      width: clamp(64px, 18vw, 78px);
    }
  }
`;

function resolveRequestUrl(input: RequestInfo | URL) {
  const raw =
    typeof input === "string" || input instanceof URL
      ? input.toString()
      : input.url;
  return new URL(raw, window.location.href);
}

function resolveRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function readSessionPayload(init?: RequestInit): SessionRequestPayload | null {
  if (typeof init?.body !== "string") return null;
  try {
    return JSON.parse(init.body) as SessionRequestPayload;
  } catch {
    return null;
  }
}

function installSessionFetchGuard() {
  const guardedWindow = window as GuardedWindow;
  if (guardedWindow.__kinoPitchSessionFetchGuard) return;
  guardedWindow.__kinoPitchSessionFetchGuard = true;

  const nativeFetch = window.fetch.bind(window);
  const sessionStates = new Map<string, SessionNetworkState>();

  const getSessionState = (code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    const existing = sessionStates.get(normalizedCode);
    if (existing) return existing;

    const created: SessionNetworkState = {
      generation: 0,
      pendingControls: 0,
      controlChain: Promise.resolve(),
    };
    sessionStates.set(normalizedCode, created);
    return created;
  };

  const guardedFetch: typeof window.fetch = async (input, init) => {
    let url: URL;
    try {
      url = resolveRequestUrl(input);
    } catch {
      return nativeFetch(input, init);
    }

    if (url.origin !== window.location.origin || url.pathname !== SESSION_PATH) {
      return nativeFetch(input, init);
    }

    const method = resolveRequestMethod(input, init);
    const payload = method === "POST" ? readSessionPayload(init) : null;
    const code = (payload?.code ?? url.searchParams.get("code") ?? "").trim().toUpperCase();
    if (!code) return nativeFetch(input, init);

    const state = getSessionState(code);
    const fetchOnce = () =>
      input instanceof Request
        ? nativeFetch(input.clone(), init)
        : nativeFetch(input, init);

    if (method === "POST" && payload?.action === "control") {
      state.generation += 1;
      state.pendingControls += 1;

      const request = state.controlChain.then(fetchOnce, fetchOnce).finally(() => {
        state.pendingControls = Math.max(0, state.pendingControls - 1);
      });

      state.controlChain = request.then(
        () => undefined,
        () => undefined,
      );

      return request;
    }

    if (method === "GET") {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const generationAtStart = state.generation;
        const response = await fetchOnce();
        const remainedStable =
          generationAtStart === state.generation && state.pendingControls === 0;

        if (remainedStable) return response;

        try {
          await response.body?.cancel();
        } catch {
          // A resposta ficou obsoleta; o novo GET abaixo é a fonte válida.
        }
        await state.controlChain;
      }
    }

    return fetchOnce();
  };

  window.fetch = guardedFetch;
}

function stopTouchPropagation(event: Event) {
  event.stopPropagation();
}

function enhancePresentationControls() {
  const projectionButtons = document.querySelectorAll<HTMLButtonElement>(
    `button[title="${PROJECTION_TITLE}"], button[data-kc-projection-toggle]`,
  );

  projectionButtons.forEach((button) => {
    button.dataset.kcProjectionToggle = "true";
    const active = button.getAttribute("aria-pressed") === "true";
    button.setAttribute(
      "aria-label",
      active
        ? "Desativar modo de projeção e restaurar o tamanho do texto"
        : "Ativar modo de projeção para aumentar texto e contraste",
    );
    button.title = active
      ? "Restaurar tamanho e contraste padrão"
      : "Aumentar texto e contraste para projeção";
  });

  document.querySelectorAll<HTMLElement>(TOUCH_GUARD_SELECTOR).forEach((region) => {
    if (region.dataset.kcTouchGuard === "true") return;
    region.dataset.kcTouchGuard = "true";
    region.addEventListener("touchstart", stopTouchPropagation, { passive: true });
    region.addEventListener("touchend", stopTouchPropagation, { passive: true });
  });
}

export default function PitchRuntimeGuard() {
  useEffect(() => {
    installSessionFetchGuard();
    enhancePresentationControls();

    const observer = new MutationObserver(enhancePresentationControls);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });

    return () => observer.disconnect();
  }, []);

  return <style id="kc-pitch-runtime-guard-styles">{runtimeStyles}</style>;
}
