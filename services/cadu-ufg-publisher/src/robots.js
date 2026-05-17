'use strict';

function pathFromUrl(input) {
  try {
    const url = new URL(input);
    return `${url.pathname || '/'}${url.search || ''}`;
  } catch (_) {
    return '/';
  }
}

function parseRobotsTxt(text, crawlerName = 'CaduKinoCampusBot') {
  const groups = [];
  let group = null;

  String(text || '').split(/\r?\n/).forEach((line) => {
    const cleaned = line.replace(/#.*/, '').trim();
    if (!cleaned) {
      group = null;
      return;
    }

    const idx = cleaned.indexOf(':');
    if (idx === -1) return;
    const key = cleaned.slice(0, idx).trim().toLowerCase();
    const value = cleaned.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      return;
    }

    if (key === 'sitemap') {
      if (!groups.sitemaps) groups.sitemaps = [];
      groups.sitemaps.push(value);
      return;
    }

    if (!group) return;
    if (key === 'allow' || key === 'disallow') {
      group.rules.push({ type: key, path: value });
    }
  });

  const token = String(crawlerName || '').toLowerCase();
  const matching = groups.filter((g) => g.agents.some((agent) => agent === '*' || token.includes(agent) || agent.includes(token)));
  return {
    groups,
    rules: (matching.length ? matching : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules),
    sitemaps: groups.sitemaps || [],
  };
}

function isAllowedByRobots(url, robots) {
  const rules = (robots && robots.rules) || [];
  const path = pathFromUrl(url);
  let winner = null;

  rules.forEach((rule) => {
    if (!rule.path) return;
    if (!path.startsWith(rule.path)) return;
    if (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.type === 'allow')) {
      winner = rule;
    }
  });

  return !winner || winner.type !== 'disallow';
}

module.exports = {
  isAllowedByRobots,
  parseRobotsTxt,
};
