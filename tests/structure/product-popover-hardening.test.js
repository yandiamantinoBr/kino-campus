const fs = require('fs');
const path = require('path');

describe('product controller popover hardening', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, '../../assets/js/controllers/public/product.controller.js'),
    'utf8'
  );
  const popoversSource = fs.readFileSync(
    path.join(__dirname, '../../assets/js/controllers/public/product.popovers.js'),
    'utf8'
  );

  test('reuses the shared clipboard helper and tracks successful copy shares', () => {
    expect(popoversSource).toContain('window.KCUtils.copyTextToClipboard');
    expect(popoversSource).toContain("throw new Error('copy_unavailable')");
    expect(popoversSource).toContain("trackCurrentPostShare('copy_link');");
  });

  test('centralizes Escape handling for the main product action popovers', () => {
    expect(popoversSource).toContain('function handleProductGlobalKeydown(event)');
    expect(controllerSource).toContain('window._KCProduct.popovers.bindProductGlobalKeydown()');
    expect(popoversSource).not.toContain("if (e.key === 'Escape') closeSharePopover();");
    expect(popoversSource).not.toContain("if (e.key === 'Escape') closeSavePopover();");
    expect(popoversSource).not.toContain("if (e.key === 'Escape') closeCalendarPopover();");
  });
});
