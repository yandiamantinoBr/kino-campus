'use strict';

const PUBLIC_PAGES = Object.freeze([
  'index.html',
  '_product.html',
  'account-setup.html',
  'achados-perdidos.html',
  'ajuda.html',
  'auth-callback.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'create-post.html',
  'eventos.html',
  'moradia.html',
  'my-posts.html',
  'ods.html',
  'oportunidades.html',
  'profile.html',
  'privacidade.html',
  'search-results.html',
  'settings.html',
  'transparencia.html',
  'termos.html',
]);

const ADMIN_PAGES = Object.freeze([
  'admin/index.html',
  'admin/moderation.html',
  'admin/reports.html',
  'admin/banners.html',
  'admin/help-requests.html',
  'admin/privacy-analytics.html',
]);

const ADMIN_ROUTES = Object.freeze([
  Object.freeze({ route: '/admin', file: 'admin/index.html', label: 'Dashboard' }),
  Object.freeze({ route: '/admin/moderation', file: 'admin/moderation.html', label: 'Moderacao' }),
  Object.freeze({ route: '/admin/reports', file: 'admin/reports.html', label: 'Denuncias' }),
  Object.freeze({ route: '/admin/banners', file: 'admin/banners.html', label: 'Banners' }),
  Object.freeze({ route: '/admin/help-requests', file: 'admin/help-requests.html', label: 'Pedidos de ajuda' }),
  Object.freeze({ route: '/admin/privacy-analytics', file: 'admin/privacy-analytics.html', label: 'Privacidade e Analytics' }),
]);

function routeFromPage(page) {
  if (page === 'index.html') return '/';
  return '/' + String(page || '').replace(/\.html$/i, '');
}

const PUBLIC_ROUTES = Object.freeze(PUBLIC_PAGES.map(function (page) {
  return Object.freeze({ route: routeFromPage(page), file: page });
}));

const ALL_HTML_PAGES = Object.freeze(PUBLIC_PAGES.concat(ADMIN_PAGES));

module.exports = Object.freeze({
  PUBLIC_PAGES,
  ADMIN_PAGES,
  PUBLIC_ROUTES,
  ADMIN_ROUTES,
  ALL_HTML_PAGES,
});
