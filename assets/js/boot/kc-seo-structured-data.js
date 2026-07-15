(function () {
  'use strict';

  const ORIGIN = 'https://www.kinocampus.com.br';
  const SITE_NAME = 'KinoCampus';
  const DEFAULT_IMAGE = `${ORIGIN}/api/og-image?type=home`;

  const PAGE_MAP = {
    '/': {
      type: 'WebSite',
      name: 'KinoCampus - Comunidade UFG',
      description: 'Plataforma comunitária da UFG para eventos, oportunidades, moradia, caronas, compra e venda e achados/perdidos.',
    },
    '/index.html': {
      type: 'WebSite',
      name: 'KinoCampus - Comunidade UFG',
      description: 'Plataforma comunitária da UFG para eventos, oportunidades, moradia, caronas, compra e venda e achados/perdidos.',
      canonicalPath: '/',
    },
    '/eventos.html': {
      type: 'CollectionPage',
      name: 'Eventos no KinoCampus',
      section: 'Eventos',
      description: 'Eventos acadêmicos, culturais, esportivos e institucionais divulgados para a comunidade da UFG.',
    },
    '/oportunidades.html': {
      type: 'CollectionPage',
      name: 'Oportunidades no KinoCampus',
      section: 'Oportunidades',
      description: 'Bolsas, editais, estágios, empregos, monitorias e chamadas acadêmicas para a comunidade da UFG.',
    },
    '/moradia.html': {
      type: 'CollectionPage',
      name: 'Moradia no KinoCampus',
      section: 'Moradia',
      description: 'Quartos, repúblicas, kitnets e anúncios de moradia para estudantes da UFG.',
    },
    '/compra-venda-feed.html': {
      type: 'CollectionPage',
      name: 'Compra e venda no KinoCampus',
      section: 'Compra e venda',
      description: 'Itens úteis anunciados pela comunidade universitária da UFG.',
    },
    '/caronas-feed.html': {
      type: 'CollectionPage',
      name: 'Caronas no KinoCampus',
      section: 'Caronas',
      description: 'Ofertas e pedidos de carona para deslocamentos ligados à rotina universitária.',
    },
    '/achados-perdidos.html': {
      type: 'CollectionPage',
      name: 'Achados e perdidos no KinoCampus',
      section: 'Achados e perdidos',
      description: 'Itens perdidos ou encontrados pela comunidade universitária da UFG.',
    },
    '/ajuda.html': {
      type: 'ContactPage',
      name: 'Central de ajuda do KinoCampus',
      section: 'Suporte',
      description: 'Canal de suporte para dúvidas, pedidos administrativos e atendimento da plataforma.',
    },
    '/ods.html': {
      type: 'WebPage',
      name: 'ODS e impacto comunitário no KinoCampus',
      section: 'ODS',
      description: 'Relação da plataforma com objetivos de desenvolvimento sustentável, colaboração e impacto comunitário.',
    },
    '/privacidade.html': {
      type: 'PrivacyPolicy',
      name: 'Declaração de Privacidade do KinoCampus',
      section: 'Privacidade',
      description: 'Informações sobre privacidade, cookies, dados pessoais e direitos dos titulares.',
    },
    '/transparencia.html': {
      type: 'WebPage',
      name: 'Central de Transparência do KinoCampus',
      section: 'Transparência',
      description: 'Mapa público de privacidade, termos, cookies, suporte e direitos LGPD no KinoCampus.',
    },
    '/sobre.html': {
      type: 'AboutPage',
      name: 'Sobre o KinoCampus',
      section: 'Sobre',
      description: 'Missao, governanca, curadoria, privacidade, publicidade e canais oficiais do KinoCampus.',
    },
    '/apresentacao-institucional.html': {
      type: 'WebPage',
      name: 'Apresentacao institucional do KinoCampus',
      section: 'Apresentacao institucional',
      description: 'Seis percursos expositivos e interativos para conhecer o KinoCampus e sua proposta de parceria com a UFG.',
    },
    '/editorial.html': {
      type: 'WebPage',
      name: 'Política editorial do KinoCampus',
      section: 'Política editorial',
      description: 'Fontes, critérios de curadoria, correções, publicidade e responsabilidade editorial do KinoCampus.',
    },
    '/termos.html': {
      type: 'WebPage',
      name: 'Termos de Uso do KinoCampus',
      section: 'Termos de uso',
      description: 'Regras de uso, responsabilidades e condições da plataforma KinoCampus.',
    },
  };

  function isNoindexPage() {
    const robots = document.querySelector('meta[name="robots"]');
    return robots && /\bnoindex\b/i.test(robots.getAttribute('content') || '');
  }

  function getCanonicalUrl(meta) {
    const existing = document.querySelector('link[rel="canonical"]');
    if (existing && existing.href) return existing.href;
    const path = (meta && meta.canonicalPath) || window.location.pathname || '/';
    return `${ORIGIN}${path === '/index.html' ? '/' : path}`;
  }

  function getPageMeta() {
    const path = window.location.pathname || '/';
    return PAGE_MAP[path] || PAGE_MAP[path.replace(/\/$/, '')] || null;
  }

  function getDescription(meta) {
    const desc = document.querySelector('meta[name="description"]');
    return (desc && desc.getAttribute('content')) || (meta && meta.description) || '';
  }

  function buildOrganization() {
    return {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: SITE_NAME,
      alternateName: 'Kino Campus',
      url: ORIGIN,
      logo: `${ORIGIN}/assets/favicon.svg`,
      description: 'Plataforma comunitaria independente para a comunidade da Universidade Federal de Goias.',
      foundingDate: '2025',
      founder: {
        '@type': 'Person',
        name: 'Yan Diamantino',
        jobTitle: 'Responsavel operacional do KinoCampus',
        affiliation: {
          '@type': 'CollegeOrUniversity',
          name: 'Universidade Federal de Goias',
          sameAs: 'https://www.ufg.br/',
        },
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Goiania',
        addressRegion: 'GO',
        addressCountry: 'BR',
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'contato@kinocampus.com.br',
        availableLanguage: 'pt-BR',
      },
      sameAs: [
        'https://github.com/yandiamantinoBr/kino-campus',
      ],
      areaServed: {
        '@type': 'Place',
        name: 'Universidade Federal de Goias',
      },
      knowsAbout: [
        'Universidade Federal de Goias',
        'Eventos universitarios',
        'Oportunidades academicas',
        'Moradia estudantil',
        'Compra e venda universitaria',
        'Caronas universitarias',
        'Achados e perdidos',
      ],
    };
  }

  function buildWebsite() {
    return {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: SITE_NAME,
      url: `${ORIGIN}/`,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${ORIGIN}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${ORIGIN}/search-results.html?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    };
  }

  function buildBreadcrumb(meta, canonicalUrl) {
    const items = [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: `${ORIGIN}/`,
      },
    ];
    if (meta && meta.section) {
      items.push({
        '@type': 'ListItem',
        position: 2,
        name: meta.section,
        item: canonicalUrl,
      });
    }
    return {
      '@type': 'BreadcrumbList',
      itemListElement: items,
    };
  }

  function buildGraph(meta) {
    const canonicalUrl = getCanonicalUrl(meta);
    const pageType = (meta && meta.type) || 'WebPage';
    const itemListId = `${canonicalUrl}#items`;
    const page = {
      '@type': pageType,
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: (meta && meta.name) || document.title || SITE_NAME,
      description: getDescription(meta),
      isPartOf: { '@id': `${ORIGIN}/#website` },
      inLanguage: 'pt-BR',
      image: DEFAULT_IMAGE,
      publisher: { '@id': `${ORIGIN}/#organization` },
      breadcrumb: buildBreadcrumb(meta, canonicalUrl),
    };
    const graph = [
      buildOrganization(),
      buildWebsite(),
      page,
    ];

    if (pageType === 'CollectionPage') {
      page.mainEntity = { '@id': itemListId };
      graph.push({
        '@type': 'ItemList',
        '@id': itemListId,
        name: `${page.name} - publicações públicas`,
        itemListElement: [],
      });
    }

    return {
      '@context': 'https://schema.org',
      '@graph': graph,
    };
  }

  function injectJsonLd(data) {
    if (!data || document.querySelector('script[data-kc-seo-structured-data="true"]')) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.kcSeoStructuredData = 'true';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function init() {
    if (isNoindexPage()) return;
    const meta = getPageMeta();
    if (!meta) return;
    injectJsonLd(buildGraph(meta));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
