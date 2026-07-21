const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('runtime da apresentação institucional', () => {
  const layout = read('apps/pitch-institucional/app/layout.tsx');
  const guard = read('apps/pitch-institucional/app/pitch-runtime-guard.tsx');
  const page = read('apps/pitch-institucional/app/page.tsx');
  const decks = read('apps/pitch-institucional/app/decks.ts');

  test('instala a proteção antes da experiência de apresentação', () => {
    expect(layout).toContain('import PitchRuntimeGuard from "./pitch-runtime-guard"');
    expect(layout).toContain('<PitchRuntimeGuard />');
    expect(layout.indexOf('<PitchRuntimeGuard />')).toBeLessThan(layout.indexOf('{children}'));
  });

  test('mantém os seis percursos e o conteúdo editorial fora da correção', () => {
    expect(page).toContain('([5, 15, 30] as Duration[])');
    expect(page).toContain('"expositivo" as const');
    expect(page).toContain('"interativo" as const');
    expect(decks).toContain('export function buildDeck(duration: Duration, mode: PresentationMode)');
    expect(guard).not.toContain('allSlides');
    expect(guard).not.toContain('buildDeck');
  });

  test('serializa comandos e descarta consultas obsoletas da sessão ao vivo', () => {
    expect(guard).toContain('const SESSION_PATH = "/api/session"');
    expect(guard).toContain('payload?.action === "control"');
    expect(guard).toContain('state.controlChain.then(fetchOnce, fetchOnce)');
    expect(guard).toContain('state.pendingControls');
    expect(guard).toContain('generationAtStart === state.generation');
    expect(guard).toContain('epochAtStart === navigationEpoch');
    expect(guard).toContain('await intentAtStart.observed');
    expect(guard).toContain('await state.controlChain');
    expect(guard).toContain('patchSessionSlide(response, desiredSlide)');
  });

  test('captura clique, teclado e gesto antes do efeito React que grava o slide', () => {
    expect(guard).toContain('document.addEventListener("click"');
    expect(guard).toContain('window.addEventListener("keydown"');
    expect(guard).toContain('document.addEventListener("touchstart"');
    expect(guard).toContain('document.addEventListener("touchend"');
    expect(guard).toContain('NAVIGATION_TARGET_SELECTOR');
    expect(guard).toContain('NAVIGATION_KEYS');
  });

  test('representa projeção como ampliação, não como deficiência', () => {
    expect(guard).toContain('content: "A+"');
    expect(guard).toContain('content: "A−"');
    expect(guard).toContain('Ativar modo de projeção para aumentar texto e contraste');
    expect(guard).toContain('Desativar modo de projeção e restaurar o tamanho do texto');
    expect(guard).toContain('button[data-kc-projection-toggle] > svg');
  });

  test('protege os controles móveis contra gesto concorrente e áreas inseguras', () => {
    expect(guard).toContain('touch-action: manipulation');
    expect(guard).toContain('stopTouchPropagation');
    expect(guard).toContain('safe-area-inset-bottom');
    expect(guard).toContain('width: 48px !important');
    expect(guard).toContain('height: 48px !important');
    expect(guard).toContain('padding-bottom: calc(118px + env(safe-area-inset-bottom, 0px))');
  });
});
