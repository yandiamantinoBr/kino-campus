'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('apresentação institucional — navegação e projeção', () => {
  const page = read('apps/pitch-institucional/app/page.tsx');
  const css = read('apps/pitch-institucional/app/globals.css');
  const decks = read('apps/pitch-institucional/app/decks.ts');
  const host = read('assets/js/features/kc-pitch-host.js');
  const hostHtml = read('apresentacao-institucional.html');

  test('mantém os seis percursos 5/15/30 × expositivo/interativo', () => {
    expect(page).toContain('([5, 15, 30] as Duration[])');
    expect(page).toContain('"expositivo" as const');
    expect(page).toContain('"interativo" as const');
    expect(decks).toContain('export function buildDeck(duration: Duration, mode: PresentationMode)');
  });

  test('protege navegação local contra poll remoto obsoleto', () => {
    expect(page).toContain('localAuthorityUntilRef');
    expect(page).toContain('desiredSlideRef');
    expect(page).toContain('controlChainRef');
    expect(page).toContain('pollGenerationRef');
    expect(page).toContain('const goToSlide = useCallback');
    expect(page).toContain('onCurrent={goToSlide}');
    expect(page).toContain('localAuthorityActive');
    expect(page).toContain('generationAtStart !== pollGenerationRef.current');
    expect(page).toContain('if (!localAuthorityActive)');
    // Unconditional poll overwrite of current (without local authority guard) must not return.
    expect(page).not.toMatch(/setSession\(data\.session\);\s*setCurrent\(\(previous\) => \(previous === safeCurrent \? previous : safeCurrent\)\);/);
  });

  test('serializa controle remoto e preserva intenção local', () => {
    expect(page).toContain('function RemoteView');
    expect(page).toContain('controlChainRef.current = controlChainRef.current.then(run, run)');
    expect(page).toMatch(/localAuthorityUntilRef\.current = Date\.now\(\) \+ (2400|2800)/);
  });

  test('suaviza navegação com debounce de control e poll inteligente', () => {
    expect(page).toContain('setTimeout');
    expect(page).toContain('intervalMs');
    expect(page).toContain('generationAtStart !== pollGenerationRef.current');
    expect(page).toContain('if (!localAuthorityActive)');
    expect(page).toContain('key={slide.id}');
  });

  test('INTERAÇÃO 02 (barrier-cloud) renderiza nuvem de palavras, não um único token', () => {
    expect(decks).toContain('id: "word-cloud"');
    expect(decks).toContain('id: "barrier-cloud"');
    expect(decks).toContain('type: "word"');
    expect(decks).toContain('Em uma palavra: o que mais dificulta encontrar oportunidades?');
    expect(page).toContain('word-cloud');
    expect(page).toContain('word-cloud__word');
    expect(page).toContain('A nuvem se forma com as palavras do público');
    expect(css).toContain('.word-cloud__word');
  });

  test('slide__index e launch-footer sobem no layout web', () => {
    expect(css).toMatch(/\.slide__index[^}]*bottom:\s*clamp\(58px/);
    expect(css).toContain('launch-shell');
    expect(css).toContain('flex-direction: column');
    expect(css).toMatch(/\.launch-footer[^}]*margin-top:\s*clamp/);
    expect(css).toMatch(/\.source-node[^}]*font-size:\s*clamp\(/);
  });

  test('usa ZoomIn/ZoomOut no botão de projeção (não o ícone de deficiência)', () => {
    expect(page).toContain('ZoomIn');
    expect(page).toContain('ZoomOut');
    expect(page).toContain('data-kc-projection-toggle');
    expect(page).toContain('Ativar modo de projeção para aumentar texto e contraste');
    // Projection control block uses ZoomIn/ZoomOut; Accessibility remains only for content copy.
    const projectionBlock = page.slice(
      page.indexOf('data-kc-projection-toggle'),
      page.indexOf('data-kc-projection-toggle') + 700,
    );
    expect(projectionBlock).toMatch(/ZoomIn|ZoomOut/);
    expect(projectionBlock).not.toContain('Accessibility');
  });

  test('impede que toque em botões seja interpretado como swipe', () => {
    expect(page).toContain('touchIgnoreUntil');
    expect(page).toContain('markControlTouch');
    expect(page).toContain('.presentation-controls, .presentation-actions');
    expect(css).toContain('touch-action: manipulation');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toContain('width: 48px !important');
  });

  test('host da página canônica continua com embed e loop protection', () => {
    expect(hostHtml).toContain('id="kc-pitch-frame"');
    expect(hostHtml).toContain('kc-pitch-host.js');
    expect(host).toContain('LIVE_ORIGIN');
    expect(host).toContain('kino-campus-pitch.vercel.app');
  });
});
