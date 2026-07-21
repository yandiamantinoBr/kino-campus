import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const baseUrl = process.env.PITCH_BASE_URL ?? "http://127.0.0.1:4173";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedSlideCounts = new Map([
  ["5-expositivo", 10],
  ["5-interativo", 11],
  ["15-expositivo", 17],
  ["15-interativo", 20],
  ["30-expositivo", 22],
  ["30-interativo", 25],
]);

function createSessionHarness({ getDelayMs = 40, controlDelayMs = 40 } = {}) {
  const state = {
    code: "ABC123",
    presenterToken: "pitch-presenter-token",
    duration: 15,
    mode: "interativo",
    currentSlide: 0,
    activePrompt: null,
    status: "active",
    responseCount: 0,
    aggregates: {},
    nextGetResolver: null,
    waitForNextGet() {
      return new Promise((resolve) => {
        state.nextGetResolver = resolve;
      });
    },
  };

  const snapshot = (overrides = {}) => ({
    code: state.code,
    duration: state.duration,
    mode: state.mode,
    currentSlide: state.currentSlide,
    activePrompt: state.activePrompt,
    status: state.status,
    responseCount: state.responseCount,
    aggregates: state.aggregates,
    ...overrides,
  });

  return {
    state,
    async install(page) {
      await page.route("**/api/session**", async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
          const staleSlide = state.currentSlide;
          const resolver = state.nextGetResolver;
          state.nextGetResolver = null;
          resolver?.();

          // Mantém uma resposta antiga em voo para reproduzir a corrida que
          // antes podia devolver o apresentador ao slide anterior.
          await delay(getDelayMs);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ session: snapshot({ currentSlide: staleSlide }) }),
          });
          return;
        }

        let payload = {};
        try {
          payload = request.postDataJSON() ?? {};
        } catch {
          await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "JSON inválido" }) });
          return;
        }

        if (payload.action === "create") {
          state.duration = payload.duration;
          state.mode = payload.mode;
          state.currentSlide = 0;
          state.activePrompt = null;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ session: snapshot(), presenterToken: state.presenterToken }),
          });
          return;
        }

        if (payload.action === "control") {
          const requestedSlide = payload.currentSlide;
          const requestedPrompt = payload.activePrompt ?? null;
          await delay(controlDelayMs);
          state.currentSlide = requestedSlide;
          state.activePrompt = requestedPrompt;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ session: snapshot() }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: snapshot() }),
        });
      });
    },
  };
}

async function activateSegment(button) {
  if (await button.getAttribute("aria-pressed") === "true") return;

  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await button.click();
    try {
      await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1400 });
      return;
    } catch (error) {
      lastError = error;
      await delay(180);
    }
  }
  throw lastError;
}

async function selectVariant(page, duration, mode) {
  const durationButton = page.getByRole("group", { name: "Duração da apresentação" })
    .getByRole("button", { name: `${duration} min`, exact: true });
  const modeButton = page.getByRole("group", { name: "Modalidade da apresentação" })
    .getByRole("button", { name: mode === "interativo" ? "Interativo" : "Expositivo", exact: true });

  await activateSegment(durationButton);
  await activateSegment(modeButton);
  await expect(durationButton).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton).toHaveAttribute("aria-pressed", "true");
}

async function startPresentation(page) {
  const startButton = page.getByRole("button", { name: /Iniciar apresentação/i });
  const shell = page.locator(".presentation-shell");
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await startButton.click();
    try {
      await expect(shell).toBeVisible({ timeout: 2200 });
      return;
    } catch (error) {
      lastError = error;
      if (!(await startButton.isVisible().catch(() => false))) break;
      await delay(180);
    }
  }
  throw lastError;
}

async function openVariant(browser, duration, mode, harnessOptions = {}, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const harness = createSessionHarness(harnessOptions);
  await harness.install(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".launch-shell")).toBeVisible();
  await selectVariant(page, duration, mode);
  await startPresentation(page);
  await expect(page.getByRole("navigation", { name: "Controles da apresentação" })).toBeVisible();
  return { context, page, harness };
}

function padded(value) {
  return String(value).padStart(2, "0");
}

async function auditCurrentSlide(page, label, { mobile = false } = {}) {
  if (mobile) {
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }
  await expect(page.locator(".slide")).toBeVisible();
  await expect(page.locator(".slide__copy h1")).not.toHaveText("");

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(".presentation-shell");
    const slide = document.querySelector(".slide");
    const copy = document.querySelector(".slide__copy");
    const title = document.querySelector(".slide__copy h1");
    const body = document.querySelector(".slide__body");
    const visual = document.querySelector(".slide__visual");
    const controls = document.querySelector(".presentation-controls");
    if (!shell || !slide || !copy || !title || !body || !visual || !controls) {
      return { missing: true };
    }

    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const copyRect = rect(copy);
    const controlsRect = rect(controls);
    const overlapWidth = Math.max(0, Math.min(copyRect.right, controlsRect.right) - Math.max(copyRect.left, controlsRect.left));
    const overlapHeight = Math.max(0, Math.min(copyRect.bottom, controlsRect.bottom) - Math.max(copyRect.top, controlsRect.top));

    return {
      missing: false,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      shellRect: rect(shell),
      slideRect: rect(slide),
      copyRect,
      titleRect: rect(title),
      visualRect: rect(visual),
      controlsRect,
      titleText: title.textContent?.trim() ?? "",
      bodyText: body.textContent?.trim() ?? "",
      titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
      bodyFont: Number.parseFloat(getComputedStyle(body).fontSize),
      copyControlsOverlapArea: overlapWidth * overlapHeight,
      gridColumns: getComputedStyle(slide).gridTemplateColumns,
    };
  });

  assert.equal(metrics.missing, false, `${label}: estrutura essencial do slide ausente`);
  assert.ok(metrics.titleText.length > 0, `${label}: título vazio`);
  assert.ok(metrics.bodyText.length > 0, `${label}: texto principal vazio`);
  assert.ok(metrics.titleFont >= 32, `${label}: título pequeno demais (${metrics.titleFont}px)`);
  assert.ok(metrics.bodyFont >= 14, `${label}: corpo pequeno demais (${metrics.bodyFont}px)`);
  assert.ok(metrics.documentWidth <= metrics.viewportWidth + 2, `${label}: rolagem horizontal (${metrics.documentWidth}px > ${metrics.viewportWidth}px)`);
  assert.ok(metrics.copyRect.left >= -1 && metrics.copyRect.right <= metrics.viewportWidth + 1, `${label}: bloco textual fora da largura útil`);
  assert.ok(metrics.titleRect.left >= -1 && metrics.titleRect.right <= metrics.viewportWidth + 1, `${label}: título cortado horizontalmente`);
  assert.ok(metrics.visualRect.left >= -1 && metrics.visualRect.right <= metrics.viewportWidth + 1, `${label}: área visual fora da largura útil`);
  assert.ok(metrics.controlsRect.left >= -1 && metrics.controlsRect.right <= metrics.viewportWidth + 1, `${label}: controles fora da largura visível`);
  assert.ok(metrics.controlsRect.top >= -1 && metrics.controlsRect.bottom <= metrics.viewportHeight + 1, `${label}: controles fora da altura visível`);

  if (mobile) {
    assert.equal(metrics.gridColumns.trim().split(/\s+/).length, 1, `${label}: layout móvel deve usar uma coluna`);
  } else {
    assert.ok(metrics.slideRect.top >= 60, `${label}: slide invade o cabeçalho`);
    assert.ok(metrics.slideRect.bottom <= metrics.viewportHeight + 1, `${label}: slide excede a altura de projeção`);
    assert.equal(metrics.copyControlsOverlapArea, 0, `${label}: controles sobrepõem o texto`);
  }
}

async function verifyAllSixVariants(browser) {
  for (const duration of [5, 15, 30]) {
    for (const mode of ["expositivo", "interativo"]) {
      const key = `${duration}-${mode}`;
      const total = expectedSlideCounts.get(key);
      assert.ok(total, `contagem esperada ausente para ${key}`);

      const { context, page, harness } = await openVariant(browser, duration, mode);
      const counter = page.locator(".presentation-controls > span");
      const next = page.getByRole("button", { name: "Próximo slide" });

      for (let index = 0; index < total; index += 1) {
        await expect(counter).toHaveText(`${padded(index + 1)} / ${padded(total)}`);
        await auditCurrentSlide(page, `${key} — slide ${index + 1}/${total}`);
        if (index < total - 1) {
          await next.click();
          if (mode === "interativo") await delay(55);
        }
      }

      await page.getByRole("button", { name: "Slide anterior" }).click();
      await expect(counter).toHaveText(`${padded(total - 1)} / ${padded(total)}`);
      await auditCurrentSlide(page, `${key} — retorno pelo botão anterior`);

      if (mode === "interativo") {
        await delay(160);
        assert.equal(harness.state.currentSlide, total - 2, `${key}: servidor deve confirmar o retorno`);
      }
      await context.close();
    }
  }
}

async function verifyStalePollCannotRevertNavigation(browser) {
  const { context, page, harness } = await openVariant(
    browser,
    15,
    "interativo",
    { getDelayMs: 180, controlDelayMs: 420 },
  );
  const counter = page.locator(".presentation-controls > span");
  const next = page.getByRole("button", { name: "Próximo slide" });

  // Aguarda o primeiro ciclo inicial terminar. Depois arma a próxima consulta
  // GET para devolver deliberadamente o slide antigo enquanto dois comandos
  // locais são enviados em sequência.
  await delay(700);
  const stalePollStarted = harness.state.waitForNextGet();
  await stalePollStarted;

  await next.click();
  await expect(counter).toContainText("02 /");
  await next.click();
  await expect(counter).toContainText("03 /");

  await delay(1700);
  await expect(counter).toContainText("03 /");
  assert.equal(harness.state.currentSlide, 2, "o servidor simulado deve confirmar o terceiro slide");

  await page.keyboard.press("ArrowLeft");
  await expect(counter).toContainText("02 /");
  await delay(1100);
  await expect(counter).toContainText("02 /");

  await context.close();
}

async function verifyProjectionSemanticsAndLegibility(browser) {
  const total = expectedSlideCounts.get("30-expositivo");
  const { context, page } = await openVariant(browser, 30, "expositivo");
  const projection = page.locator("button[data-kc-projection-toggle]");
  const counter = page.locator(".presentation-controls > span");
  const next = page.getByRole("button", { name: "Próximo slide" });
  await expect(projection).toHaveAttribute("aria-pressed", "false");
  await expect(projection).toHaveAttribute("aria-label", /aumentar texto e contraste/i);

  const before = await page.locator(".slide__body").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  const beforeSymbol = await projection.evaluate((element) => getComputedStyle(element, "::before").content);
  assert.match(beforeSymbol, /A\+/);

  await projection.click();
  await expect(projection).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".presentation-shell")).toHaveClass(/is-projection/);
  await expect(projection).toHaveAttribute("aria-label", /desativar modo de projeção/i);

  const after = await page.locator(".slide__body").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  const afterSymbol = await projection.evaluate((element) => getComputedStyle(element, "::before").content);
  assert.match(afterSymbol, /A−/);
  assert.ok(after > before, `o texto projetado deve crescer (${before}px → ${after}px)`);

  for (let index = 0; index < total; index += 1) {
    await expect(counter).toHaveText(`${padded(index + 1)} / ${padded(total)}`);
    await auditCurrentSlide(page, `projeção 30-expositivo — slide ${index + 1}/${total}`);
    if (index < total - 1) await next.click();
  }

  await context.close();
}

async function verifyMobileControlsAndAllSlides(browser) {
  const total = expectedSlideCounts.get("30-interativo");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const harness = createSessionHarness();
  await harness.install(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".launch-shell")).toBeVisible();
  await selectVariant(page, 30, "interativo");
  await startPresentation(page);

  const controls = page.getByRole("navigation", { name: "Controles da apresentação" });
  const previous = page.getByRole("button", { name: "Slide anterior" });
  const next = page.getByRole("button", { name: "Próximo slide" });
  const counter = page.locator(".presentation-controls > span");
  await expect(controls).toBeVisible();

  const [controlsBox, previousBox, nextBox] = await Promise.all([
    controls.boundingBox(),
    previous.boundingBox(),
    next.boundingBox(),
  ]);

  assert.ok(controlsBox && previousBox && nextBox, "os controles móveis devem ter geometria mensurável");
  assert.ok(previousBox.width >= 46 && previousBox.height >= 46, "o botão anterior deve ter alvo mínimo de 46 px");
  assert.ok(nextBox.width >= 46 && nextBox.height >= 46, "o botão próximo deve ter alvo mínimo de 46 px");
  assert.ok(controlsBox.x >= 0 && controlsBox.x + controlsBox.width <= 390, "a barra deve caber na largura móvel");
  assert.ok(controlsBox.y + controlsBox.height <= 844, "a barra deve permanecer dentro da área visível");

  for (let index = 0; index < total; index += 1) {
    await expect(counter).toHaveText(`${padded(index + 1)} / ${padded(total)}`);
    await auditCurrentSlide(page, `móvel 30-interativo — slide ${index + 1}/${total}`, { mobile: true });
    if (index < total - 1) {
      await next.tap();
      await delay(55);
    }
  }

  await delay(180);
  assert.equal(harness.state.currentSlide, total - 1, "o servidor simulado deve acompanhar todos os slides móveis");
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyAllSixVariants(browser);
  await verifyStalePollCannotRevertNavigation(browser);
  await verifyProjectionSemanticsAndLegibility(browser);
  await verifyMobileControlsAndAllSlides(browser);
  console.log("Pitch browser audit passed: 105 variant slides, 22 projection slides, 25 mobile slides, stale poll and keyboard navigation.");
} finally {
  await browser.close();
}
