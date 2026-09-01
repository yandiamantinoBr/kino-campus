'use strict';

/**
 * Resiliência da imagem do card (kc-card__image-wrapper):
 * - renderPostCard emite data-kc-image-candidates + data-kc-image-emoji;
 * - handler delegado em capture troca a fonte em caso de erro e, esgotada a
 *   lista, aplica o fallback emoji (mesmo contrato do ramo sem-imagem);
 * - guarda anti-erro-velho não avança com falha de src obsoleto.
 * Cenário real (2026-09): gallery_image_urls com .jpg 404 do cercomp enquanto
 * cover/metadata apontam para o storage local.
 */

const BROKEN_GALLERY = 'https://files.cercomp.ufg.br/weby/up/269/o/post_MEM_02-09_.jpg';
const WORKING_META_IMAGE = 'https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/u1/p1/cadu-1-abc.png';
const WORKING_META_COVER = 'https://wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/post-media/u1/p1/cadu-2-def.jpg';

function buildPost(extra) {
  return Object.assign({
    id: 'candidates-post',
    modulo: 'eventos',
    titulo: 'Publicação com galeria quebrada',
    descricao: 'Descrição',
    emoji: '\uD83D\uDCC5',
  }, extra);
}

beforeAll(() => {
  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.format.js');
  require('../../assets/js/utils/kc-utils.dom.js');
  require('../../assets/js/utils/kc-utils.identity.js');
  require('../../assets/js/utils/kc-utils.taxonomy.js');
  require('../../assets/js/utils/kc-utils.location.js');
  window.KCPostLifecycle = require('../../assets/js/shared/kc-post-lifecycle.shared.js');
  require('../../assets/js/utils/kc-utils.presentation.js');
});

beforeEach(() => {
  window.KCAPI = undefined;
});

function render(post) {
  const container = document.createElement('div');
  container.innerHTML = window._KCU.presentation.renderPostCard(post);
  document.body.appendChild(container);
  const wrapper = container.querySelector('.kc-card__image-wrapper');
  return { container, wrapper, image: wrapper ? wrapper.querySelector('img') : null };
}

function candidatesOf(wrapper) {
  return JSON.parse(wrapper.getAttribute('data-kc-image-candidates'));
}

function fail(image) {
  image.dispatchEvent(new window.Event('error'));
}

describe('kc-card__image-wrapper data-kc-image-candidates', () => {
  test('emite candidatos ordenados (imagens → image_url → metadata) deduplicados e sem onerror inline', () => {
    const { wrapper, image, container } = render(buildPost({
      imagens: [BROKEN_GALLERY],
      image_url: WORKING_META_IMAGE,
      metadata: { cover_url: WORKING_META_COVER, image_url: WORKING_META_IMAGE },
    }));
    expect(candidatesOf(wrapper)).toEqual([BROKEN_GALLERY, WORKING_META_IMAGE, WORKING_META_COVER]);
    expect(wrapper.getAttribute('data-kc-image-emoji')).toBe('\uD83D\uDCC5');
    expect(image.getAttribute('src')).toBe(BROKEN_GALLERY);
    expect(container.querySelector('[onerror]')).toBeNull();
  });

  test('avança para o próximo candidato ao falhar e mantém o wrapper utilizável', () => {
    const { wrapper, image } = render(buildPost({
      imagens: [BROKEN_GALLERY],
      metadata: { image_url: WORKING_META_IMAGE, cover_url: WORKING_META_COVER },
    }));
    // Ordem do pool: imagens → image_url/cover_url próprios → metadata (cover antes de image).
    expect(candidatesOf(wrapper)).toEqual([BROKEN_GALLERY, WORKING_META_COVER, WORKING_META_IMAGE]);
    fail(image);
    expect(image.getAttribute('src')).toBe(WORKING_META_COVER);
    expect(wrapper.getAttribute('data-kc-image-candidate-index')).toBe('1');
    expect(wrapper.classList.contains('kc-image-fallback')).toBe(false);
    fail(image);
    expect(image.getAttribute('src')).toBe(WORKING_META_IMAGE);
    expect(wrapper.classList.contains('kc-image-fallback')).toBe(false);
  });

  test('esgota a lista e aplica o fallback emoji idêntico ao ramo sem-imagem', () => {
    const { wrapper, image } = render(buildPost({
      imagens: [BROKEN_GALLERY],
      metadata: { image_url: WORKING_META_IMAGE },
    }));
    fail(image);
    fail(image);
    expect(wrapper.classList.contains('kc-image-fallback')).toBe(true);
    expect(image.style.display).toBe('none');
    const emoji = wrapper.querySelector('.kc-card__emoji');
    expect(emoji).not.toBeNull();
    expect(emoji.textContent).toBe('\uD83D\uDCC5');
    expect(wrapper.hasAttribute('data-kc-image-candidates')).toBe(false);
  });

  test('guarda anti-erro-velho: falha de src obsoleto não consome candidatos', () => {
    const { wrapper, image } = render(buildPost({
      imagens: [BROKEN_GALLERY],
      metadata: { image_url: WORKING_META_IMAGE },
    }));
    fail(image);
    expect(wrapper.getAttribute('data-kc-image-candidate-index')).toBe('1');
    image.setAttribute('src', 'https://example.com/outra-fonte.png');
    fail(image);
    expect(wrapper.getAttribute('data-kc-image-candidate-index')).toBe('1');
    expect(image.getAttribute('src')).toBe('https://example.com/outra-fonte.png');
    expect(wrapper.classList.contains('kc-image-fallback')).toBe(false);
  });

  test('candidato único quebrado cai direto no fallback emoji', () => {
    const { wrapper, image } = render(buildPost({ imagens: [BROKEN_GALLERY] }));
    expect(candidatesOf(wrapper)).toEqual([BROKEN_GALLERY]);
    fail(image);
    expect(wrapper.classList.contains('kc-image-fallback')).toBe(true);
    expect(image.style.display).toBe('none');
  });

  test.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data não-imagem', 'data:text/html;base64,PGI+'],
    ['protocol-relative', '//evil.example/a.png'],
    ['esquema desconhecido', 'blob:https://example.com/xyz'],
  ])('filtra candidatos não renderizáveis (%s)', (_label, bad) => {
    const { wrapper, image } = render(buildPost({
      imagens: [bad, '  '],
      image_url: WORKING_META_IMAGE,
    }));
    expect(candidatesOf(wrapper)).toEqual([WORKING_META_IMAGE]);
    expect(image.getAttribute('src')).toBe(WORKING_META_IMAGE);
  });

  test('mantém Offline First: dataURL image/* é candidato válido e único', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const { wrapper, image } = render(buildPost({ imagens: [dataUrl] }));
    expect(image.getAttribute('src')).toBe(dataUrl);
    expect(candidatesOf(wrapper)).toEqual([dataUrl]);
  });

  test('limita a lista a 6 candidatos preservando a ordem', () => {
    const imagens = Array.from({ length: 10 }, (_v, i) => 'https://example.com/img-' + i + '.png');
    const { wrapper } = render(buildPost({ imagens }));
    expect(candidatesOf(wrapper)).toHaveLength(6);
    expect(candidatesOf(wrapper)[0]).toBe(imagens[0]);
  });

  test('card sem imagens mantém o fallback emoji inalterado e sem atributo de candidatos', () => {
    const { wrapper, image } = render(buildPost({}));
    expect(image).toBeNull();
    expect(wrapper.classList.contains('kc-image-fallback')).toBe(true);
    expect(wrapper.hasAttribute('data-kc-image-candidates')).toBe(false);
  });

  test('não interfere no caminho dos avatares de autor', () => {
    const { container } = render(buildPost({
      imagens: [BROKEN_GALLERY],
      metadata: { image_url: WORKING_META_IMAGE },
      authorId: 'author-candidates',
    }));
    window.KCAPI = {
      getAuthorById: () => ({ name: 'Autor', avatar: 'https://example.com/avatar.png' }),
    };
    const authorImage = container.querySelector('.kc-card__author > img');
    if (authorImage) {
      fail(authorImage);
      expect(container.querySelector('.kc-card__image-wrapper').classList.contains('kc-image-fallback')).toBe(false);
    }
  });
});
