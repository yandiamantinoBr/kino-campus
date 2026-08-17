/**
 * @file gallery-drag-reorder.test.js
 * @description Cover and regression tests for image drag reorder in creation/edit.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const CREATE_MEDIA = fs.readFileSync(
  path.join(ROOT, 'assets/js/features/create-post/kc-create-post.media.js'),
  'utf8'
);
const EDIT = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/public/product.edit.js'),
  'utf8'
);

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function createCreateMediaDom(images) {
  const dom = new JSDOM('<!doctype html><html><body><div id="wrap"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'http://localhost/',
  });
  const w = dom.window;
  w._KCCreatePost = {
    _state: {
      images: images.slice(),
      coverImageId: images.length ? images[0].id : null,
    },
  };
  w.kcRenderCreateModal = jest.fn();
  w.eval(CREATE_MEDIA);

  const wrap = w.document.getElementById('wrap');
  wrap.innerHTML = w._KCCreatePost.media.sectionHtml();
  const grid = wrap.querySelector('.kc-img-grid');

  function pointerEvent(type, id, x, y) {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: id },
      clientX: { value: x },
      clientY: { value: y },
      button: { value: 0 },
    });
    return event;
  }

  return {
    dom,
    w,
    grid,
    pointerEvent,
    ids: function () {
      return Array.from(grid.querySelectorAll('.kc-img-thumb'))
        .map(function (el) { return el.getAttribute('data-kc-img-id'); });
    },
  };
}

describe('gallery drag reorder - criação de post', () => {
  test('setCoverById move a imagem escolhida para a primeira posição', () => {
    const images = [
      { id: 'a', dataUrl: PIXEL, name: 'a.gif', size: 1 },
      { id: 'b', dataUrl: PIXEL, name: 'b.gif', size: 1 },
      { id: 'c', dataUrl: PIXEL, name: 'c.gif', size: 1 },
    ];
    const { w, dom } = createCreateMediaDom(images);

    w._KCCreatePost.media.setCoverById('c');
    expect(w._KCCreatePost._state.images.map(function (img) { return img.id; }))
      .toEqual(['c', 'a', 'b']);
    expect(w._KCCreatePost._state.coverImageId).toBe('c');
    dom.window.close();
  });

  test('sectionHtml numera as miniaturas e expõe id para reordenação', () => {
    const { dom, w, grid } = createCreateMediaDom([
      { id: 'a', dataUrl: PIXEL, name: 'a.gif', size: 1 },
      { id: 'b', dataUrl: PIXEL, name: 'b.gif', size: 1 },
    ]);
    const orders = Array.from(grid.querySelectorAll('.kc-img-order'))
      .map(function (el) { return el.textContent; });
    expect(orders).toEqual(['1', '2']);
    expect(grid.querySelector('[data-kc-img-id="a"]')).toBeTruthy();
    expect(grid.querySelector('[data-kc-img-id="b"]')).toBeTruthy();
    dom.window.close();
  });

  test('arraste reordena o estado e elege a primeira imagem como capa', () => {
    const { dom, w, grid, pointerEvent } = createCreateMediaDom([
      { id: 'a', dataUrl: PIXEL, name: 'a.gif', size: 1 },
      { id: 'b', dataUrl: PIXEL, name: 'b.gif', size: 1 },
      { id: 'c', dataUrl: PIXEL, name: 'c.gif', size: 1 },
    ]);

    w._KCCreatePost.media.initDrag(grid);
    w.document.elementFromPoint = function () {
      return grid.querySelector('[data-kc-img-id="c"]');
    };

    const first = grid.querySelector('[data-kc-img-id="a"]');
    first.dispatchEvent(pointerEvent('pointerdown', 1, 0, 0));
    first.dispatchEvent(pointerEvent('pointermove', 1, 50, 0));
    first.dispatchEvent(pointerEvent('pointerup', 1, 50, 0));

    expect(w._KCCreatePost._state.images.map(function (img) { return img.id; }))
      .toEqual(['b', 'c', 'a']);
    expect(w._KCCreatePost._state.coverImageId).toBe('b');
    dom.window.close();
  });
});

describe('gallery drag reorder - edição de post', () => {
  test('modal de edição inclui grade visual de reordenação e sincroniza textarea', () => {
    expect(EDIT).toContain('kc-edit-gallery-grid');
    expect(EDIT).toContain('kc-edit-gallery-thumb');
    expect(EDIT).toContain("form.gallery.value = urls.join('\\n')");
    expect(EDIT).toContain("galleryGrid.addEventListener('pointerdown'");
    expect(EDIT).toContain('renderEditGalleryGrid();');
  });
});
