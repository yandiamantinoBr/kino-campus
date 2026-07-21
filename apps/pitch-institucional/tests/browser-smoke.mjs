import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const baseUrl = process.env.PITCH_BASE_URL ?? "http://127.0.0.1:4173";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function createSessionHarness() {
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
          await delay(180);
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
          await delay(420);
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

async function selectVariant(page, duration, mode) {
  await page.getByRole("group", { name: "Duração da apresentação" })
    .getByRole("button", { name: `${duration} min` })
    .click();
  await page.getByRole("group", { name: "Modalidade da apresentação" })
    .getByRole("button", { name: mode === "interativo" ? "Interativo" : "Expositivo" })
    .click();
}

async function openVariant(browser, duration, mode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const harness = createSessionHarness();
  await harness.install(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await selectVariant(page, duration, mode);
  await page.getByRole("button", { name: /Iniciar apresentação/i }).click();
  await expect(page.locator(".presentation-shell")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Controles da apresentação" })).toBeVisible();
  return { context, page, harness };
}

async function verifyAllSixVariants(browser) {
  for (const duration of [5, 15, 30]) {
    for (const mode of ["expositivo", "interativo"]) {
      const { context, page } = await openVariant(browser, duration, mode);
      const counter = page.locator(".presentation-controls > span");
      await expect(counter).toContainText("01 /");
      await page.getByRole("button", { name: "Próximo slide" }).click();
      await expect(counter).toContainText("02 /");
      await page.getByRole("button", { name: "Slide anterior" }).click();
      await expect(counter).toContainText("01 /");
      await context.close();
    }
  }
}

async function verifyStalePollCannotRevertNavigation(browser) {
  const { context, page, harness } = await openVariant(browser, 15, "interativo");
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
  const { context, page } = await openVariant(browser, 5, "expositivo");
  const projection = page.locator("button[data-kc-projection-toggle]");
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

  await context.close();
}

async function verifyMobileControls(browser) {
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
  await selectVariant(page, 30, "expositivo");
  await page.getByRole("button", { name: /Iniciar apresentação/i }).click();

  const controls = page.getByRole("navigation", { name: "Controles da apresentação" });
  const previous = page.getByRole("button", { name: "Slide anterior" });
  const next = page.getByRole("button", { name: "Próximo slide" });
  await expect(controls).toBeVisible();

  const [controlsBox, previousBox, nextBox, gridColumns] = await Promise.all([
    controls.boundingBox(),
    previous.boundingBox(),
    next.boundingBox(),
    page.locator(".slide").evaluate((element) => getComputedStyle(element).gridTemplateColumns),
  ]);

  assert.ok(controlsBox && previousBox && nextBox, "os controles móveis devem ter geometria mensurável");
  assert.ok(previousBox.width >= 46 && previousBox.height >= 46, "o botão anterior deve ter alvo mínimo de 46 px");
  assert.ok(nextBox.width >= 46 && nextBox.height >= 46, "o botão próximo deve ter alvo mínimo de 46 px");
  assert.ok(controlsBox.x >= 0 && controlsBox.x + controlsBox.width <= 390, "a barra deve caber na largura móvel");
  assert.ok(controlsBox.y + controlsBox.height <= 844, "a barra deve permanecer dentro da área visível");
  assert.equal(gridColumns.trim().split(/\s+/).length, 1, "o slide móvel deve usar uma coluna");

  await next.tap();
  await expect(page.locator(".presentation-controls > span")).toContainText("02 /");
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyAllSixVariants(browser);
  await verifyStalePollCannotRevertNavigation(browser);
  await verifyProjectionSemanticsAndLegibility(browser);
  await verifyMobileControls(browser);
  console.log("Pitch browser smoke passed: 6 variants, stale poll, projection, keyboard and mobile controls.");
} finally {
  await browser.close();
}
