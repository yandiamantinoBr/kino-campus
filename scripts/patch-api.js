const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../assets/js/kc-api.client.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Fix the `activeDriver.xxx` references across all facade functions
code = code.replace(/activeDriver\./g, 'getActiveDriver().');

// 2. Fix the synchronous `activeDriver: getActiveDriver().name` inside window.KCAPI
code = code.replace(
  /activeDriver:\s*getActiveDriver\(\)\.name,/g,
  "get activeDriver() { try { return getActiveDriver().name; } catch(e) { return 'pending'; } },"
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Patched kc-api.client.js successfully.');
