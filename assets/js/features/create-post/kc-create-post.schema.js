/**
 * @file kc-create-post.schema.js
 * @description Schema and constants for the create-post runtime (v11.31.2).
 * Registers window._KCCreatePost.schema before assets/js/kc-create-post.js.
 *
 * Source of truth for module tag groups used by:
 *  - create-post modal chips
 *  - search field registry (npm run generate:search-registry)
 *  - settings “Busca e descoberta” topics
 */
(function () {
  'use strict';

  window._KCCreatePost = window._KCCreatePost || {};

  window._KCCreatePost.schema = {
    modalId: 'kcCreatePostModalOverlay',
    visibilityOptions: Object.freeze([
      Object.freeze({
        value: 'community',
        label: 'Apenas para comunidade',
        hint: 'Visível só para pessoas com conta no KinoCampus.'
      }),
      Object.freeze({
        value: 'public',
        label: 'Público',
        hint: 'Pode aparecer também para visitantes sem conta.'
      })
    ]),
    modules: {
      'compra-venda': {
        label: 'Compra e Venda',
        icon: 'fas fa-shopping-bag',
        emoji: '🛍️',
        categoryGroupId: 'categoria',
        redirect: 'compra-venda-feed.html',
        tagGroups: [
          {
            id: 'categoria',
            label: 'Categoria',
            required: true,
            multi: false,
            options: [
              { key: 'eletronicos', label: 'Eletrônicos', emoji: '💻' },
              { key: 'livros', label: 'Livros', emoji: '📚' },
              { key: 'ingressos', label: 'Ingressos', emoji: '🎟️' },
              { key: 'moveis', label: 'Móveis', emoji: '🪑' },
              { key: 'vestuario', label: 'Vestuário', emoji: '👕' },
              { key: 'outros', label: 'Outros', emoji: '📦' },
            ]
          },
          {
            id: 'acao',
            label: 'Você quer',
            required: true,
            multi: false,
            options: [
              { key: 'vendo', label: 'Vendo', emoji: '🏷️' },
              { key: 'compro', label: 'Compro', emoji: '🛒' },
            ]
          }
        ]
      },
      'caronas': {
        label: 'Caronas',
        icon: 'fas fa-car',
        emoji: '🚗',
        categoryGroupId: 'tipo',
        redirect: 'caronas-feed.html',
        tagGroups: [
          {
            id: 'tipo',
            label: 'Tipo',
            required: true,
            multi: false,
            options: [
              { key: 'ofereco', label: 'Ofereço carona', emoji: '🙋' },
              { key: 'procuro', label: 'Procuro carona', emoji: '🔎' },
            ]
          }
        ]
      },
      'moradia': {
        label: 'Moradia',
        icon: 'fas fa-home',
        emoji: '🏡',
        categoryGroupId: 'tipo',
        redirect: 'moradia.html',
        tagGroups: [
          {
            id: 'tipo',
            label: 'Tipo',
            required: true,
            multi: false,
            options: [
              { key: 'republicas', label: 'Repúblicas', emoji: '🏠' },
              { key: 'quartos', label: 'Quartos', emoji: '🛏️' },
              { key: 'apartamentos', label: 'Apartamentos', emoji: '🏢' },
              { key: 'casas', label: 'Casas', emoji: '🏡' },
              { key: 'procurando', label: 'Procurando', emoji: '🔍' },
            ]
          }
        ]
      },
      'eventos': {
        label: 'Eventos',
        icon: 'fas fa-calendar',
        emoji: '📅',
        categoryGroupId: 'topico',
        redirect: 'eventos.html',
        tagGroups: [
          {
            id: 'topico',
            label: 'Subtópico',
            required: true,
            multi: false,
            options: [
              { key: 'academicos', label: 'Acadêmicos', emoji: '🎓' },
              { key: 'palestras', label: 'Palestras', emoji: '🎤' },
              { key: 'congressos', label: 'Congressos', emoji: '🏛️' },
              { key: 'cursos', label: 'Cursos', emoji: '📖' },
              { key: 'culturais', label: 'Culturais', emoji: '🎭' },
              { key: 'esportivos', label: 'Esportivos', emoji: '⚽' },
              { key: 'workshops', label: 'Workshops', emoji: '🛠️' },
              { key: 'festas', label: 'Festas', emoji: '🎉' },
              { key: 'sustentabilidade', label: 'Sustentabilidade', emoji: '🌱' },
            ]
          }
        ]
      },
      'achados-perdidos': {
        label: 'Achados e Perdidos',
        icon: 'fas fa-search',
        emoji: '🔎',
        categoryGroupId: 'status',
        redirect: 'achados-perdidos.html',
        tagGroups: [
          {
            id: 'status',
            label: 'Status',
            required: true,
            multi: false,
            options: [
              { key: 'perdidos', label: 'Perdidos', emoji: '😢' },
              { key: 'encontrados', label: 'Encontrados', emoji: '🙌' },
            ]
          },
          {
            id: 'tipo',
            label: 'Tipo do item',
            required: true,
            multi: false,
            options: [
              { key: 'documentos', label: 'Documentos', emoji: '🪪' },
              { key: 'eletronicos', label: 'Eletrônicos', emoji: '📱' },
              { key: 'outros', label: 'Outros', emoji: '🎒' },
            ]
          }
        ]
      },
      'oportunidades': {
        label: 'Oportunidades',
        icon: 'fas fa-briefcase',
        emoji: '💼',
        categoryGroupId: 'tipo',
        redirect: 'oportunidades.html',
        tagGroups: [
          {
            id: 'tipo',
            label: 'Tipo',
            required: true,
            multi: false,
            options: [
              { key: 'editais', label: 'Editais', emoji: '📋' },
              { key: 'concursos', label: 'Concursos', emoji: '🏆' },
              { key: 'bolsas', label: 'Bolsas', emoji: '🎓' },
              { key: 'estagios', label: 'Estágio', emoji: '👔' },
              { key: 'empregos', label: 'Emprego', emoji: '💼' },
              { key: 'monitoria', label: 'Monitoria', emoji: '🧑‍🏫' },
              { key: 'pesquisa', label: 'Pesquisa', emoji: '🔬' },
              { key: 'cursos-capacitacoes', label: 'Cursos e capacitações', emoji: '📚' },
              { key: 'voluntariado', label: 'Voluntariado', emoji: '🤝' },
              { key: 'freelancer', label: 'Freelancer', emoji: '💻' },
            ]
          }
        ]
      }
    }
  };
})();
