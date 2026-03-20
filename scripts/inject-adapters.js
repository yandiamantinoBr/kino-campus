const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function getHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('assets') && !file.includes('scripts')) {
        results = results.concat(getHtmlFiles(file));
      }
    } else if (file.endsWith('.html')) {
      results.push(file);
    }
  });
  return results;
}

const htmlFiles = getHtmlFiles(rootDir);
let updatedFiles = 0;

htmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  const regex = /^([ \t]*)(<script src="([^"]*)kc-api\.client\.js"><\/script>)/gm;
  
  if (regex.test(content) && !content.includes('adapters/local.adapter.js')) {
    content = content.replace(regex, (match, prefix, scriptTag, pathPrefix) => {
      return `${scriptTag}\n${prefix}<script src="${pathPrefix}adapters/local.adapter.js"></script>\n${prefix}<script src="${pathPrefix}adapters/supabase.adapter.js"></script>`;
    });
    fs.writeFileSync(file, content, 'utf8');
    updatedFiles++;
    console.log('Injected adapters into ' + file);
  }
});

console.log('Successfully injected adapters in ' + updatedFiles + ' HTML files!');
