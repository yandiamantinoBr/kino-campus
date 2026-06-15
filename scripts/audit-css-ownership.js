#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const cssDir = path.join(rootDir, 'assets', 'css');
const stylesPath = path.join(cssDir, 'styles.css');

const BUCKETS = [
  {
    id: 'tokens-theme',
    label: 'Tokens e tema',
    target: 'Permanece global em styles.css',
  },
  {
    id: 'admin-overlap',
    label: 'Admin overlap',
    target: 'Encerrado em CSS-C.2; admin-shell.css',
  },
  {
    id: 'product-overlap',
    label: 'Produto overlap',
    target: 'Candidato a product.css/product-lightbox.css apos baseline visual',
  },
  {
    id: 'public-shell-overlap',
    label: 'Public shell/profile/legal overlap',
    target: 'Candidato a kc-public-shell.css apos baseline visual',
  },
  {
    id: 'chat-overlap',
    label: 'Chat overlap',
    target: 'Encerrado em CSS-C.3; atalho global em kc-chat-shortcut.css',
  },
  {
    id: 'create-post-modal-uploader',
    label: 'Create-post/modal/uploader',
    target: 'Permanece global ate haver CSS de rota ou split aprovado',
  },
  {
    id: 'page-public-modules',
    label: 'Modulos publicos de pagina',
    target: 'Bloqueado para split futuro; rotas nao tem CSS dedicado',
  },
  {
    id: 'feed-cards-ranking',
    label: 'Feed, cards e ranking',
    target: 'Permanece global em styles.css',
  },
  {
    id: 'global-layout-navigation',
    label: 'Layout e navegacao globais',
    target: 'Permanece global em styles.css',
  },
  {
    id: 'base-a11y-reset',
    label: 'Base, reset e a11y',
    target: 'Permanece global em styles.css',
  },
  {
    id: 'shared-components',
    label: 'Componentes compartilhados',
    target: 'Permanece global; candidato a future-split apos prova de cascade',
  },
  {
    id: 'manual-review',
    label: 'Revisao manual',
    target: 'Classificacao manual obrigatoria antes de mover',
  },
];

const BUCKET_BY_ID = BUCKETS.reduce(function (map, bucket) {
  map[bucket.id] = bucket;
  return map;
}, {});

function main() {
  const args = process.argv.slice(2);
  const report = buildReport();

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  printMarkdown(report);
}

function buildReport() {
  const styles = fs.readFileSync(stylesPath, 'utf8');
  const comments = extractComments(styles);
  const rules = extractStyleRules(styles, comments);
  const classifiedRules = rules.map(function (rule) {
    const bucket = classifyRule(rule);
    return Object.assign({}, rule, {
      bucket: bucket,
      bucketLabel: BUCKET_BY_ID[bucket].label,
      target: BUCKET_BY_ID[bucket].target,
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    styles: getFileStats(stylesPath),
    productionCss: listCssFiles(cssDir),
    links: readCssLinks(),
    ruleCount: classifiedRules.length,
    selectorCount: classifiedRules.reduce(function (total, rule) {
      return total + rule.selectors.length;
    }, 0),
    ownership: summarizeOwnership(classifiedRules),
    routeTargets: summarizeRouteTargets(classifiedRules),
    manualReview: summarizeManualReview(classifiedRules),
  };
}

function extractComments(content) {
  const lineStarts = buildLineStarts(content);
  const comments = [];
  const re = /\/\*[\s\S]*?\*\//g;
  let match;

  while ((match = re.exec(content))) {
    comments.push({
      startLine: lineFromIndex(lineStarts, match.index),
      endLine: lineFromIndex(lineStarts, match.index + match[0].length),
      text: match[0]
        .replace(/^\/\*/, '')
        .replace(/\*\/$/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }

  return comments;
}

function extractStyleRules(content, comments) {
  const rules = [];
  const stack = [];
  let buffer = '';
  let bufferStartLine = null;
  let line = 1;
  let mode = 'normal';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (mode === 'comment') {
      if (ch === '\n') line += 1;
      if (ch === '*' && next === '/') {
        mode = 'normal';
        i += 1;
      }
      continue;
    }

    if (mode === 'string') {
      if (canCapturePrelude(stack)) {
        if (bufferStartLine === null && /\S/.test(ch)) bufferStartLine = line;
        buffer += ch;
      }
      if (ch === '\n') line += 1;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        mode = 'normal';
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      mode = 'comment';
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      mode = 'string';
      quote = ch;
      if (canCapturePrelude(stack)) {
        if (bufferStartLine === null) bufferStartLine = line;
        buffer += ch;
      }
      continue;
    }

    if (ch === '{') {
      const prelude = canCapturePrelude(stack) ? normalizeSpace(buffer) : '';
      const startLine = bufferStartLine || line;
      stack.push({
        prelude: prelude,
        startLine: startLine,
        type: classifyBlock(prelude, stack),
      });
      buffer = '';
      bufferStartLine = null;
      continue;
    }

    if (ch === '}') {
      const block = stack.pop();
      if (block && block.type === 'style') {
        const nearestComment = findNearestComment(comments, block.startLine);
        rules.push({
          selectorText: block.prelude,
          selectors: splitSelectors(block.prelude),
          startLine: block.startLine,
          endLine: line,
          containers: stack.filter(function (item) {
            return item.type === 'container';
          }).map(function (item) {
            return item.prelude;
          }),
          comment: nearestComment ? nearestComment.text : '',
          commentLine: nearestComment ? nearestComment.startLine : null,
        });
      }
      buffer = '';
      bufferStartLine = null;
      continue;
    }

    if (canCapturePrelude(stack)) {
      if (bufferStartLine === null && /\S/.test(ch)) bufferStartLine = line;
      buffer += ch;
    }

    if (ch === '\n') {
      line += 1;
    }
  }

  return rules.filter(function (rule) {
    return rule.selectorText && rule.selectors.length;
  });
}

function canCapturePrelude(stack) {
  return !stack.some(function (block) {
    return block.type === 'style' ||
      block.type === 'keyframes' ||
      block.type === 'keyframe-step' ||
      block.type === 'at-block';
  });
}

function classifyBlock(prelude, stack) {
  const lower = String(prelude || '').toLowerCase();
  const insideKeyframes = stack.some(function (block) {
    return block.type === 'keyframes';
  });

  if (insideKeyframes) return 'keyframe-step';
  if (/^@(-webkit-)?keyframes\b/.test(lower)) return 'keyframes';
  if (/^@(media|supports|container|layer|scope)\b/.test(lower)) return 'container';
  if (/^@/.test(lower)) return 'at-block';
  if (lower) return 'style';
  return 'unknown';
}

function classifyRule(rule) {
  const selectorText = String(rule.selectorText || '').toLowerCase();
  const commentText = String(rule.comment || '').toLowerCase();
  const haystack = [
    selectorText,
    commentText,
    rule.containers.join(' ').toLowerCase(),
  ].join(' ');

  if (matches(haystack, [
    /(^|[\s,{]):root\b/,
    /\[data-theme/,
    /html\[data-theme/,
    /body\[data-theme/,
  ])) {
    return 'tokens-theme';
  }

  if (matches(selectorText + ' ' + commentText, [
    /\bkc-admin\b/,
    /\bkc-admin-/,
    /\badmin-/,
    /\bdashboard\b/,
    /\bmoderation\b/,
    /\breports?\b/,
    /\bkc-admin-banner\b/,
    /\badmin\b.*\bbanner\b/,
    /\bhelp-request/,
    /\bprivacy-analytics\b/,
  ])) {
    return 'admin-overlap';
  }

  if (matches(selectorText, [
    /\bproduct\b/,
    /\bproduct-/,
    /\bproduto\b/,
    /\blightbox\b/,
    /\bsave-popover\b/,
    /\bshare-popover\b/,
    /\breport-modal\b/,
    /\brelated-/,
    /\brating\b/,
    /\bratings?\b/,
    /\bstar-rating\b/,
    /\bprice\b/,
    /\bseller\b/,
  ]) || (
    matches(commentText, [/\bproduct\.css\b/, /\bproduct\.html\b/]) &&
    !matches(selectorText, [/\bmy-posts?\b/])
  )) {
    return 'product-overlap';
  }

  if (matches(haystack, [
    /\bprofile\b/,
    /\bprofile-/,
    /\bsettings\b/,
    /\baccount\b/,
    /\bauth\b/,
    /\bprivacy\b/,
    /\bprivacidade\b/,
    /\bterms?\b/,
    /\btermos\b/,
    /\btransparencia\b/,
    /\blegal\b/,
    /\blgpd\b/,
    /\bkc-shell\b/,
  ])) {
    return 'public-shell-overlap';
  }

  if (matches(haystack, [
    /\bkc-chat\b/,
    /\bchat-/,
    /\bchat\b/,
  ])) {
    return 'chat-overlap';
  }

  if (matches(haystack, [
    /\bcreate-post\b/,
    /\bpost-modal\b/,
    /\bmodal-create\b/,
    /\bmedia-upload/,
    /\buploader\b/,
    /\bmarkdown\b/,
    /\btag-chip\b/,
    /\bcategory-chip\b/,
    /\bimage-preview\b/,
  ])) {
    return 'create-post-modal-uploader';
  }

  if (matches(haystack, [
    /\bmy-posts?\b/,
    /\bcompra\b/,
    /\bvenda\b/,
    /\bcarona/,
    /\beventos?\b/,
    /\bcalendar\b/,
    /\bkc-calendar\b/,
    /\bmoradia\b/,
    /\boportunidades\b/,
    /\bachados\b/,
    /\bperdidos\b/,
    /\bods\b/,
    /\btickets?\b/,
    /\bhousing\b/,
    /\bride\b/,
  ])) {
    return 'page-public-modules';
  }

  if (matches(haystack, [
    /\bpost-card\b/,
    /\bfeed-/,
    /\bkc-feed\b/,
    /\branking\b/,
    /\bvote\b/,
    /\bvoting\b/,
    /\bcomment\b/,
    /\bfilters?\b/,
    /\bsort\b/,
    /\bhero-carousel\b/,
    /\bcarousel\b/,
    /\bsearch-result\b/,
    /\bsearch-dropdown/,
    /\bempty-feed\b/,
  ])) {
    return 'feed-cards-ranking';
  }

  if (matches(haystack, [
    /\bkc-header\b/,
    /\bheader\b/,
    /\bnav\b/,
    /\bsidebar\b/,
    /\bmain-content\b/,
    /\blayout\b/,
    /\bcontainer\b/,
    /\bmobile-menu\b/,
    /\bdrawer\b/,
    /\bfooter\b/,
    /\bsearch-bar\b/,
    /\bsearch-dropdown/,
    /\bsearch-mobile/,
    /\buser-actions\b/,
    /\blogo\b/,
    /\bidentity\b/,
  ])) {
    return 'global-layout-navigation';
  }

  if (matches(haystack, [
    /^html(\b|[.#:[\s])/,
    /^body(\b|[.#:[\s])/,
    /^\*/,
    /^a(\b|[.#:[\s])/,
    /^button(\b|[.#:[\s])/,
    /^input(\b|[.#:[\s])/,
    /^textarea(\b|[.#:[\s])/,
    /^select(\b|[.#:[\s])/,
    /\bkc-sr-only\b/,
    /\bkc-skip-link\b/,
    /\bfocus-visible\b/,
    /\breduced-motion\b/,
    /\bprint\b/,
    /\[hidden\]/,
  ])) {
    return 'base-a11y-reset';
  }

  if (matches(haystack, [
    /\bbtn\b/,
    /\bbutton\b/,
    /\bmodal\b/,
    /\bpopover\b/,
    /\bbadge\b/,
    /\btoast\b/,
    /\bskeleton\b/,
    /\bloading\b/,
    /\bspinner\b/,
    /\bfeedback\b/,
    /\btooltip\b/,
    /\bform\b/,
    /\binput\b/,
    /\bselect\b/,
    /\bfield\b/,
    /\bcard\b/,
    /\bchip\b/,
    /\bdropdown/,
    /\bicon\b/,
  ])) {
    return 'shared-components';
  }

  return 'manual-review';
}

function summarizeOwnership(rules) {
  return BUCKETS.map(function (bucket) {
    const bucketRules = rules.filter(function (rule) {
      return rule.bucket === bucket.id;
    });
    const selectorSet = new Set();
    const lineSet = new Set();
    bucketRules.forEach(function (rule) {
      rule.selectors.forEach(function (selector) {
        selectorSet.add(selector);
      });
      for (let line = rule.startLine; line <= rule.endLine; line += 1) {
        lineSet.add(line);
      }
    });
    return {
      id: bucket.id,
      label: bucket.label,
      target: bucket.target,
      rules: bucketRules.length,
      selectors: selectorSet.size,
      lines: lineSet.size,
      firstLine: bucketRules.length ? Math.min.apply(null, bucketRules.map(function (rule) { return rule.startLine; })) : null,
      lastLine: bucketRules.length ? Math.max.apply(null, bucketRules.map(function (rule) { return rule.endLine; })) : null,
      ranges: compactRanges(bucketRules.map(function (rule) {
        return [rule.startLine, rule.endLine];
      })).slice(0, 8),
      samples: Array.from(selectorSet).slice(0, 6),
    };
  });
}

function summarizeRouteTargets(rules) {
  const routeBuckets = [
    ['admin-shell.css', 'admin-overlap'],
    ['product.css/product-lightbox.css', 'product-overlap'],
    ['kc-public-shell.css', 'public-shell-overlap'],
    ['kc-chat.css', 'chat-overlap'],
  ];

  return routeBuckets.map(function (pair) {
    const file = pair[0];
    const bucket = pair[1];
    const entry = summarizeBucket(rules.filter(function (rule) {
      return rule.bucket === bucket;
    }), bucket);
    return {
      file: file,
      bucket: bucket,
      rules: entry.rules,
      selectors: entry.selectors,
      lines: entry.lines,
      ranges: entry.ranges,
      samples: entry.samples,
    };
  });
}

function summarizeBucket(bucketRules, bucket) {
  const selectorSet = new Set();
  const lineSet = new Set();
  bucketRules.forEach(function (rule) {
    rule.selectors.forEach(function (selector) {
      selectorSet.add(selector);
    });
    for (let line = rule.startLine; line <= rule.endLine; line += 1) {
      lineSet.add(line);
    }
  });

  return {
    id: bucket,
    label: BUCKET_BY_ID[bucket].label,
    target: BUCKET_BY_ID[bucket].target,
    rules: bucketRules.length,
    selectors: selectorSet.size,
    lines: lineSet.size,
    firstLine: bucketRules.length ? Math.min.apply(null, bucketRules.map(function (rule) { return rule.startLine; })) : null,
    lastLine: bucketRules.length ? Math.max.apply(null, bucketRules.map(function (rule) { return rule.endLine; })) : null,
    ranges: compactRanges(bucketRules.map(function (rule) {
      return [rule.startLine, rule.endLine];
    })).slice(0, 8),
    samples: Array.from(selectorSet).slice(0, 6),
  };
}

function summarizeManualReview(rules) {
  return rules.filter(function (rule) {
    return rule.bucket === 'manual-review';
  }).slice(0, 25).map(function (rule) {
    return {
      lines: rule.startLine + '-' + rule.endLine,
      selector: rule.selectorText,
      comment: rule.comment,
    };
  });
}

function listCssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(function (entry) {
      return entry.isFile() && entry.name.endsWith('.css');
    })
    .map(function (entry) {
      return getFileStats(path.join(dir, entry.name));
    })
    .sort(function (a, b) {
      return a.path.localeCompare(b.path);
    });
}

function readCssLinks() {
  const pages = []
    .concat(readHtmlFiles(rootDir, ''))
    .concat(readHtmlFiles(path.join(rootDir, 'admin'), 'admin'));
  const byFile = {};

  pages.forEach(function (page) {
    const content = fs.readFileSync(page.absPath, 'utf8');
    const linkRe = /<link\b[^>]*rel=["']stylesheet["'][^>]*>|<link\b[^>]*href=["'][^"']+\.css(?:\?[^"']*)?["'][^>]*>/gi;
    let match;

    while ((match = linkRe.exec(content))) {
      const tag = match[0];
      if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
      const hrefMatch = tag.match(/\bhref=["']([^"']+\.css(?:\?[^"']*)?)["']/i);
      if (!hrefMatch) continue;
      const parsed = parseCssHref(hrefMatch[1]);
      if (!parsed.file) continue;
      byFile[parsed.file] = byFile[parsed.file] || {
        file: parsed.file,
        versions: {},
        pages: [],
      };
      byFile[parsed.file].versions[parsed.version || '(none)'] =
        (byFile[parsed.file].versions[parsed.version || '(none)'] || 0) + 1;
      byFile[parsed.file].pages.push(page.relPath);
    }
  });

  return Object.keys(byFile).sort().map(function (file) {
    const entry = byFile[file];
    entry.pages = Array.from(new Set(entry.pages)).sort();
    return entry;
  });
}

function readHtmlFiles(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(function (entry) {
      return entry.isFile() && entry.name.endsWith('.html');
    })
    .map(function (entry) {
      return {
        relPath: prefix ? prefix + '/' + entry.name : entry.name,
        absPath: path.join(dir, entry.name),
      };
    });
}

function parseCssHref(href) {
  const cleanHref = href.replace(/^\.\.\//, '').replace(/^\.\//, '');
  if (!/^assets\/css\//.test(cleanHref)) {
    return { file: '', version: '' };
  }
  const queryIndex = cleanHref.indexOf('?');
  const pathname = queryIndex === -1 ? cleanHref : cleanHref.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : cleanHref.slice(queryIndex + 1);
  const versionMatch = query.match(/(?:^|&)v=([^&]+)/);
  const file = pathname.replace(/^assets\/css\//, '');
  return {
    file: file,
    version: versionMatch ? versionMatch[1] : '',
  };
}

function getFileStats(absPath) {
  const content = fs.readFileSync(absPath, 'utf8');
  const stat = fs.statSync(absPath);
  return {
    path: path.relative(rootDir, absPath).replace(/\\/g, '/'),
    lines: countLines(content),
    bytes: stat.size,
  };
}

function splitSelectors(selectorText) {
  const selectors = [];
  let current = '';
  let paren = 0;
  let bracket = 0;
  let quote = null;
  let escaped = false;

  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i];

    if (quote) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') paren += 1;
    if (ch === ')' && paren > 0) paren -= 1;
    if (ch === '[') bracket += 1;
    if (ch === ']' && bracket > 0) bracket -= 1;

    if (ch === ',' && paren === 0 && bracket === 0) {
      pushSelector(selectors, current);
      current = '';
      continue;
    }

    current += ch;
  }

  pushSelector(selectors, current);
  return selectors;
}

function pushSelector(selectors, selector) {
  const clean = normalizeSpace(selector);
  if (clean) selectors.push(clean);
}

function compactRanges(ranges) {
  const sorted = ranges
    .filter(function (range) { return range[0] !== null && range[1] !== null; })
    .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  const merged = [];

  sorted.forEach(function (range) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1] + 3) {
      merged.push([range[0], range[1]]);
    } else if (range[1] > last[1]) {
      last[1] = range[1];
    }
  });

  return merged.map(function (range) {
    return 'L' + range[0] + '-L' + range[1];
  });
}

function findNearestComment(comments, line) {
  let nearest = null;
  comments.forEach(function (comment) {
    if (comment.endLine <= line && line - comment.endLine <= 8) {
      if (!nearest || comment.endLine > nearest.endLine) nearest = comment;
    }
  });
  return nearest;
}

function matches(text, patterns) {
  return patterns.some(function (pattern) {
    return pattern.test(text);
  });
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function countLines(content) {
  if (!content) return 0;
  const lines = content.split(/\r\n|\r|\n/);
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

function buildLineStarts(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineFromIndex(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (starts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function printMarkdown(report) {
  console.log('# CSS ownership audit');
  console.log('');
  console.log('Generated: `' + report.generatedAt + '`');
  console.log('');
  console.log('## Baseline');
  console.log('');
  console.log('| File | Lines | Bytes |');
  console.log('|---|---:|---:|');
  report.productionCss.forEach(function (file) {
    console.log('| `' + file.path + '` | ' + file.lines + ' | ' + file.bytes + ' |');
  });
  console.log('');
  console.log('`' + report.styles.path + '` contains ' + report.ruleCount +
    ' parsed style rules and ' + report.selectorCount + ' parsed selectors.');
  console.log('');
  console.log('## Ownership');
  console.log('');
  console.log('| Bucket | Rules | Selectors | Lines | Main ranges | Target |');
  console.log('|---|---:|---:|---:|---|---|');
  report.ownership.forEach(function (entry) {
    console.log('| ' + entry.label + ' | ' + entry.rules + ' | ' + entry.selectors +
      ' | ' + entry.lines + ' | ' + (entry.ranges.join(', ') || '-') +
      ' | ' + entry.target + ' |');
  });
  console.log('');
  console.log('## CSS links');
  console.log('');
  console.log('| CSS file | Versions | Pages |');
  console.log('|---|---|---:|');
  report.links.forEach(function (entry) {
    const versions = Object.keys(entry.versions).sort().map(function (version) {
      return version + ' x' + entry.versions[version];
    }).join(', ');
    console.log('| `' + entry.file + '` | ' + versions + ' | ' + entry.pages.length + ' |');
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReport,
  classifyRule,
  extractStyleRules,
  splitSelectors,
};
