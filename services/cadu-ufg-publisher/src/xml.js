'use strict';

const { decodeEntities, normalizeWhitespace } = require('./utils');

function extractBlocks(xml, tag) {
  const blocks = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let match;
  while ((match = re.exec(String(xml || '')))) blocks.push(match[1]);
  return blocks;
}

function tagValue(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = String(block || '').match(re);
  return match ? normalizeWhitespace(decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))) : '';
}

function parseSitemap(xml) {
  const urls = extractBlocks(xml, 'url').map((block) => ({
    loc: tagValue(block, 'loc'),
    lastmod: tagValue(block, 'lastmod'),
    changefreq: tagValue(block, 'changefreq'),
    priority: tagValue(block, 'priority'),
  })).filter((entry) => entry.loc);

  const sitemaps = extractBlocks(xml, 'sitemap').map((block) => ({
    loc: tagValue(block, 'loc'),
    lastmod: tagValue(block, 'lastmod'),
  })).filter((entry) => entry.loc);

  return { urls, sitemaps };
}

function parseFeed(xml) {
  const rssItems = extractBlocks(xml, 'item').map((block) => ({
    title: tagValue(block, 'title'),
    url: tagValue(block, 'link'),
    summary: tagValue(block, 'description'),
    updatedAt: tagValue(block, 'pubDate'),
  }));

  const atomEntries = extractBlocks(xml, 'entry').map((block) => {
    const linkMatch = String(block || '').match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    return {
      title: tagValue(block, 'title'),
      url: linkMatch ? decodeEntities(linkMatch[1]) : tagValue(block, 'id'),
      summary: tagValue(block, 'summary') || tagValue(block, 'content'),
      updatedAt: tagValue(block, 'updated') || tagValue(block, 'published'),
    };
  });

  return rssItems.concat(atomEntries).filter((item) => item.title && item.url);
}

module.exports = {
  parseFeed,
  parseSitemap,
  tagValue,
};
