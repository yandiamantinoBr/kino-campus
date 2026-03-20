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
  
  // Look for kc-core.js and inject components right before it
  // Match the exact indentation.
  const regex = /^([ \t]*)(<script src="([^"]*)kc-core\.js"><\/script>)/gm;
  
  if (regex.test(content) && !content.includes('components/toast.js')) {
    content = content.replace(regex, (match, prefix, scriptTag, pathPrefix) => {
      return `${prefix}<script src="${pathPrefix}components/toast.js"></script>\n${prefix}<script src="${pathPrefix}components/carousel.js"></script>\n${prefix}<script src="${pathPrefix}components/voting.js"></script>\n${prefix}${scriptTag}`;
    });
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated components in ${file}`);
  }
});

console.log('Done injecting components.');
