/**
 * @file kc-create-post.schema.js
 * @description Schema and constants for the create-post runtime (v11.31.2).
 * Registers window._KCCreatePost.schema before assets/js/kc-create-post.js.
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
              { key: 'eletronicos', label: 'Eletrônicos' },
              { key: 'livros', label: 'Livros' },
              { key: 'ingressos', label: 'Ingressos' },
              { key: 'moveis', label: 'Móveis' },
              { key: 'vestuario', label: 'Vestuário' },
              { key: 'outros', label: 'Outros' },
            ]
          },
          {
            id: 'acao',
            label: 'Você quer',
            required: true,
            multi: false,
            options: [
              { key: 'vendo', label: 'Vendo' },
              { key: 'compro', label: 'Compro' },
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
              { key: 'ofereco', label: 'Ofereço carona' },
              { key: 'procuro', label: 'Procuro carona' },
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
              { key: 'republicas', label: 'Repúblicas' },
              { key: 'quartos', label: 'Quartos' },
              { key: 'apartamentos', label: 'Apartamentos' },
              { key: 'casas', label: 'Casas' },
              { key: 'procurando', label: 'Procurando' },
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
              { key: 'sustentabilidade', label: 'Sustentabilidade' },
              { key: 'academicos', label: 'Acadêmicos' },
              { key: 'culturais', label: 'Culturais' },
              { key: 'esportivos', label: 'Esportivos' },
              { key: 'workshops', label: 'Workshops' },
              { key: 'festas', label: 'Festas' },
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
              { key: 'perdidos', label: 'Perdidos' },
              { key: 'encontrados', label: 'Encontrados' },
            ]
          },
          {
            id: 'tipo',
            label: 'Tipo do item',
            required: true,
            multi: false,
            options: [
              { key: 'documentos', label: 'Documentos' },
              { key: 'eletronicos', label: 'Eletrônicos' },
              { key: 'outros', label: 'Outros' },
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
              { key: 'estagios', label: 'Estágio' },
              { key: 'empregos', label: 'Emprego' },
              { key: 'freelancer', label: 'Freelancer' },
              { key: 'monitoria', label: 'Monitoria' },
              { key: 'voluntariado', label: 'Voluntariado' },
            ]
          }
        ]
      }
    }
  };
})();
