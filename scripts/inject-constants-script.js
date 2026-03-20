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
      if (!file.includes('node_modules') && !file.includes('.git')) {
        results = results.concat(getHtmlFiles(file));
      }
    } else if (file.endsWith('.html')) {
      results.push(file);
    }
  });
  return results;
}

const htmlFiles = getHtmlFiles(rootDir);

htmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Look for kc-utils.js and inject kc-constants.js right before it
  // Match the exact indentation.
  const regex = /^([ \t]*)(<script src="([^"]*)kc-utils\.js"><\/script>)/gm;
  
  if (regex.test(content) && !content.includes('kc-constants.js')) {
    content = content.replace(regex, (match, prefix, scriptTag, pathPrefix) => {
      return `${prefix}<script src="${pathPrefix}kc-constants.js"></script>\n${prefix}${scriptTag}`;
    });
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});

console.log('Done injecting kc-constants.js');
