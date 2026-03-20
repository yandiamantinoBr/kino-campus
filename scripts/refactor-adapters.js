const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../assets/js/kc-api.client.js');
const localPath = path.join(__dirname, '../assets/js/adapters/local.adapter.js');
const supabasePath = path.join(__dirname, '../assets/js/adapters/supabase.adapter.js');

let content = fs.readFileSync(srcPath, 'utf8');

// We will do a robust regex or string index split.
function extractBlock(startMarker, endMarker) {
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) return null;
    let endIndex = content.length;
    if (endMarker) {
        endIndex = content.indexOf(endMarker, startIndex);
        if (endIndex === -1) endIndex = content.length;
    }
    return content.substring(startIndex, endIndex);
}

// 1. Identify where Supabase stuff starts and ends
const supabaseBlockStartStr = '// ---------- Supabase Client Bootstrap';
const supabaseBlockEndStr = 'const driverSupabase = Object.freeze({';
const afterSupabaseBlockEndStr = 'const activeDriver =';

const localBlockStartStr = '// ---------- Modo estático (fallback)';
const localBlockEndStr = 'const driverLocal = Object.freeze({';
const localDriverEndStr = '// ---------- Driver Pattern';

const idxSupaStart = content.indexOf(supabaseBlockStartStr);

if (idxSupaStart !== -1) {
    // Find the end of driverSupabase definition block.
    // It is assigned, then closed with '});'
    const idxSupaDriverStart = content.indexOf(driverSupabaseEndSearchPattern = '});', content.indexOf(supabaseBlockEndStr)) + 3;
    
    // We will pull everything from supabaseBlockStartStr up to the end of driverSupabase
    // But we need exact bounds.
    let lines = content.split('\n');
    let supaStartLine = lines.findIndex(l => l.includes(supabaseBlockStartStr));
    let localStartLine = lines.findIndex(l => l.includes(localBlockStartStr));
    let supaEndLine = lines.findIndex(l => l.includes('const activeDriver ='));
    let localEndLine = lines.findIndex(l => l.includes('function supabaseNotReady'));

    if (supaStartLine > -1 && supaEndLine > -1) {
        const supaContent = lines.slice(supaStartLine, supaEndLine).join('\n');
        // Wrap in IIFE
        const supaAdapterContent = `/* KinoCampus - Supabase Adapter */\n(function() {\n'use strict';\n\n${supaContent}\n\nwindow.KCSupabaseAdapter = driverSupabase;\n})();\n`;
        fs.writeFileSync(supabasePath, supaAdapterContent);
        
        // Remove from main content
        lines.splice(supaStartLine, supaEndLine - supaStartLine);
    }
    
    // Refind local lines since we mutated array
    localStartLine = lines.findIndex(l => l.includes(localBlockStartStr));
    localEndLine = lines.findIndex(l => l.includes('function supabaseNotReady'));
    
    if (localStartLine > -1 && localEndLine > -1) {
        const localContent = lines.slice(localStartLine, localEndLine).join('\n');
        const localAdapterContent = `/* KinoCampus - Local Adapter */\n(function() {\n'use strict';\n\n${localContent}\n\nwindow.KCLocalAdapter = driverLocal;\n})();\n`;
        fs.writeFileSync(localPath, localAdapterContent);
        
        lines.splice(localStartLine, localEndLine - localStartLine);
    }
    
    // Now replace activeDriver assignment
    const activeDriverIdx = lines.findIndex(l => l.includes('const activeDriver ='));
    if (activeDriverIdx > -1) {
        lines[activeDriverIdx] = `  const activeDriver = (ENV.driver === 'supabase') ? (window.KCSupabaseAdapter || window.KCLocalAdapter) : window.KCLocalAdapter;`;
    }

    fs.writeFileSync(srcPath, lines.join('\n'));
    console.log('Successfully extracted adapters!');
} else {
    console.log('Failed to parse boundaries.');
}
