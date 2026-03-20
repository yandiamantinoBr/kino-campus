const fs = require('fs');
const path = require('path');

const localPath = path.join(__dirname, '../assets/js/adapters/local.adapter.js');
const supabasePath = path.join(__dirname, '../assets/js/adapters/supabase.adapter.js');
const apiPath = path.join(__dirname, '../assets/js/kc-api.client.js');

// 1. Fix kc-api.client.js to dynamically bind activeDriver
let apiContent = fs.readFileSync(apiPath, 'utf8');

// The script previously set: const activeDriver = (ENV.driver === 'supabase') ? (window.KCSupabaseAdapter || window.KCLocalAdapter) : window.KCLocalAdapter;
// Now we need a function instead of a const, since the adapters load AFTER kc-api.client.js
const dynamicDriverFn = `
  function getActiveDriver() {
    if (ENV.driver === 'supabase' && window.KCSupabaseAdapter) return window.KCSupabaseAdapter;
    if (window.KCLocalAdapter) return window.KCLocalAdapter;
    throw new Error('No driver adapters loaded!');
  }
`;

apiContent = apiContent.replace(
  /const activeDriver = .*?;/g, 
  dynamicDriverFn
);

// We need to replace all `activeDriver.xxx` with `getActiveDriver().xxx` in facade functions.
// But only in the block AFTER dynamicDriverFn.
const facadeStart = apiContent.indexOf('function getComments(postId)');
if (facadeStart > -1) {
    let beforeFacade = apiContent.substring(0, facadeStart);
    let facadeBlock = apiContent.substring(facadeStart);
    facadeBlock = facadeBlock.replace(/activeDriver\./g, 'getActiveDriver().');
    apiContent = beforeFacade + facadeBlock;
}

// Ensure `apiURL`, `DEFAULTS`, `MOCK_USERS_BY_ID`, `MOCK_USERS_LIST` are exposed in window.KCAPI
// They might not all be exposed. We can just add a patch at the end of window.KCAPI = Object.freeze({
const patchExports = `
    apiURL,
    DEFAULTS,
    MOCK_USERS_BY_ID,
    MOCK_USERS_LIST,
`;
if (!apiContent.includes('MOCK_USERS_BY_ID,')) {
    apiContent = apiContent.replace('MOCK_USERS,', 'MOCK_USERS,\n' + patchExports);
}

fs.writeFileSync(apiPath, apiContent);

// 2. Fix local.adapter.js
let localContent = fs.readFileSync(localPath, 'utf8');
const localInjections = `
  const { config: cfg, fetchJSON, normalizePost, MOCK_USERS_LIST, MOCK_USERS_BY_ID, apiURL, VERSION, ENV, DEFAULTS } = window.KCAPI;
  
  // Helper functions that might be missing
  function toSlug(str) { return String(str||'').toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
`;
localContent = localContent.replace("'use strict';", "'use strict';\n" + localInjections);
fs.writeFileSync(localPath, localContent);

// 3. Fix supabase.adapter.js
let supaContent = fs.readFileSync(supabasePath, 'utf8');
const supaInjections = `
  const { ENV, normalizePost } = window.KCAPI;
`;
supaContent = supaContent.replace("'use strict';", "'use strict';\n" + supaInjections);
fs.writeFileSync(supabasePath, supaContent);

console.log('Fixed adapters successfully!');
