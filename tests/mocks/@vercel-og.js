'use strict';

/**
 * Mock do @vercel/og para o Jest. O pacote real resolve para o build "edge"
 * (ESM com import de yoga.wasm?module) que so e bundleado corretamente pelo
 * builder da Vercel — sob require() CJS do Jest ele nao carrega. Nenhum teste
 * precisa gerar a imagem institucional de verdade; o modo media de
 * api/og-image.js usa sharp diretamente e nao passa por aqui.
 */
class ImageResponse {
  constructor(element, options) {
    this.element = element;
    this.options = options || {};
  }

  async arrayBuffer() {
    // PNG 1x1 transparente suficiente para os contratos de teste.
    var base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    var buffer = Buffer.from(base64, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
}

module.exports = { ImageResponse: ImageResponse };
module.exports.default = module.exports;
