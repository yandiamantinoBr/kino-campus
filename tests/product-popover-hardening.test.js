const fs = require('fs');
const path = require('path');

describe('product controller popover hardening', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../assets/js/controllers/product.controller.js'),
    'utf8'
  );

  test('reuses the shared clipboard helper and tracks successful copy shares', () => {
    expect(source).toContain('utils.copyTextToClipboard');
    expect(source).toContain("throw new Error('copy_unavailable')");
    expect(source).toContain('trackCurrentPostShare();');
  });

  test('centralizes Escape handling for the main product action popovers', () => {
    expect(source).toContain('function handleProductGlobalKeydown(event)');
    expect(source).toContain('bindProductGlobalKeydown();');
    expect(source).not.toContain("if (e.key === 'Escape') closeSharePopover();");
    expect(source).not.toContain("if (e.key === 'Escape') closeSavePopover();");
    expect(source).not.toContain("if (e.key === 'Escape') closeCalendarPopover();");
  });
});
