/*
  KinoCampus - KCAPI authors internals (V76)

  Extracted from kc-api.client.js to keep mock users and legacy author lookup
  outside the public facade while preserving the public members:
  - window.KCAPI.MOCK_USERS
  - window.KCAPI.MOCK_USERS_BY_ID
  - window.KCAPI.MOCK_USERS_LIST
  - window.KCAPI.getAuthorById

  Exposicao interna:
  - window._KCAPI.authors
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  const MOCK_USERS = Object.freeze({
    'USER_01': { id: 'USER_01', displayName: 'Rafael Almeida', avatarUrl: 'https://i.pravatar.cc/150?img=12' },
    'USER_02': { id: 'USER_02', displayName: 'Fernanda Lima', avatarUrl: 'https://i.pravatar.cc/150?img=35' },
    'USER_03': { id: 'USER_03', displayName: 'Ricardo Souza', avatarUrl: 'https://i.pravatar.cc/150?img=28' },
    'USER_04': { id: 'USER_04', displayName: 'Camila Rodrigues', avatarUrl: 'https://i.pravatar.cc/150?img=42' },
    'USER_05': { id: 'USER_05', displayName: 'Beatriz Santos', avatarUrl: 'https://i.pravatar.cc/150?img=48' },
    'USER_06': { id: 'USER_06', displayName: 'Thiago Alves', avatarUrl: 'https://i.pravatar.cc/150?img=52' },
    'USER_07': { id: 'USER_07', displayName: 'Gabriela Mendes', avatarUrl: 'https://i.pravatar.cc/150?img=60' },
    'USER_08': { id: 'USER_08', displayName: 'Felipe Costa', avatarUrl: 'https://i.pravatar.cc/150?img=65' },
    'USER_09': { id: 'USER_09', displayName: 'Maria Souza', avatarUrl: 'https://i.pravatar.cc/150?img=25' },
    'USER_10': { id: 'USER_10', displayName: 'Jo\u00e3o Pedro', avatarUrl: 'https://i.pravatar.cc/150?img=33' },
    'USER_11': { id: 'USER_11', displayName: 'Carlos Silva', avatarUrl: 'https://i.pravatar.cc/150?img=15' },
    'USER_12': { id: 'USER_12', displayName: 'Ana Paula', avatarUrl: 'https://i.pravatar.cc/150?img=20' },
    'USER_13': { id: 'USER_13', displayName: 'TechCorp RH', avatarUrl: 'https://i.pravatar.cc/150?img=50' },
    'USER_14': { id: 'USER_14', displayName: 'Startup XYZ', avatarUrl: 'https://i.pravatar.cc/150?img=55' },
    'USER_15': { id: 'USER_15', displayName: 'Lucas Mendes', avatarUrl: 'https://i.pravatar.cc/150?img=22' },
    'USER_16': { id: 'USER_16', displayName: 'Mariana Costa', avatarUrl: 'https://i.pravatar.cc/150?img=30' },
    'USER_17': { id: 'USER_17', displayName: 'UFG Eventos', avatarUrl: 'https://i.pravatar.cc/150?img=45' },
    'USER_18': { id: 'USER_18', displayName: 'Pedro Henrique', avatarUrl: 'https://i.pravatar.cc/150?img=40' },
    'USER_19': { id: 'USER_19', displayName: 'Carlos Henrique', avatarUrl: 'https://i.pravatar.cc/150?img=13' },
    'USER_20': { id: 'USER_20', displayName: 'Mariana Costa', avatarUrl: 'https://i.pravatar.cc/150?img=25' },
    'USER_21': { id: 'USER_21', displayName: 'Rafael Santos', avatarUrl: 'https://i.pravatar.cc/150?img=40' },
    'USER_22': { id: 'USER_22', displayName: 'Juliana Oliveira', avatarUrl: 'https://i.pravatar.cc/150?img=45' },
    'USER_23': { id: 'USER_23', displayName: 'Pedro Almeida', avatarUrl: 'https://i.pravatar.cc/150?img=50' },
    'USER_24': { id: 'USER_24', displayName: 'Amanda Silva', avatarUrl: 'https://i.pravatar.cc/150?img=55' },
    'USER_25': { id: 'USER_25', displayName: 'Fernando Santos', avatarUrl: 'https://i.pravatar.cc/150?img=35' },
    'USER_26': { id: 'USER_26', displayName: 'Beatriz Lima', avatarUrl: 'https://i.pravatar.cc/150?img=36' },
    'USER_27': { id: 'USER_27', displayName: 'Roberto Oliveira', avatarUrl: 'https://i.pravatar.cc/150?img=37' },
    'USER_28': { id: 'USER_28', displayName: 'Amanda Rodrigues', avatarUrl: 'https://i.pravatar.cc/150?img=38' },
    'USER_29': { id: 'USER_29', displayName: 'CA Ci\u00eancias Ambientais', avatarUrl: 'https://i.pravatar.cc/150?img=14' },
    'USER_30': { id: 'USER_30', displayName: 'Instituto de Inform\u00e1tica', avatarUrl: 'https://i.pravatar.cc/150?img=15' },
    'USER_31': { id: 'USER_31', displayName: 'Pr\u00f3-Reitoria de Extens\u00e3o', avatarUrl: 'https://i.pravatar.cc/150?img=16' },
    'USER_32': { id: 'USER_32', displayName: 'Atl\u00e9tica UFG', avatarUrl: 'https://i.pravatar.cc/150?img=17' },
    'USER_33': { id: 'USER_33', displayName: 'DCE UFG', avatarUrl: 'https://i.pravatar.cc/150?img=18' },
    'USER_34': { id: 'USER_34', displayName: 'Maria Silva', avatarUrl: 'https://i.pravatar.cc/150?img=26' },
    'USER_35': { id: 'USER_35', displayName: 'Pedro Henrique', avatarUrl: 'https://i.pravatar.cc/150?img=27' },
    'USER_36': { id: 'USER_36', displayName: 'J\u00falia Martins', avatarUrl: 'https://i.pravatar.cc/150?img=28' },
    'USER_37': { id: 'USER_37', displayName: 'TechStart Solu\u00e7\u00f5es', avatarUrl: 'https://i.pravatar.cc/150?img=30' },
    'USER_38': { id: 'USER_38', displayName: 'Digital Marketing Agency', avatarUrl: 'https://i.pravatar.cc/150?img=31' },
    'USER_39': { id: 'USER_39', displayName: 'Lucas Ferreira', avatarUrl: 'https://i.pravatar.cc/150?img=32' },
    'USER_40': { id: 'USER_40', displayName: 'Instituto de Matem\u00e1tica - UFG', avatarUrl: 'https://i.pravatar.cc/150?img=33' },
    'USER_41': { id: 'USER_41', displayName: 'ONG Educa\u00e7\u00e3o para Todos', avatarUrl: 'https://i.pravatar.cc/150?img=34' },
    'USER_42': { id: 'USER_42', displayName: 'Maria Souza', avatarUrl: 'https://i.pravatar.cc/150?img=16' },
    'USER_SELF': { id: 'USER_SELF', displayName: 'Voc\u00ea', avatarUrl: '' },
  });

  const MOCK_USERS_LIST = Object.freeze(Object.values(MOCK_USERS));

  const MOCK_USERS_BY_ID = Object.freeze(MOCK_USERS_LIST.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {}));

  const LEGACY_AUTHOR_INDEX = (() => {
    const index = Object.create(null);
    MOCK_USERS_LIST.forEach((user) => {
      index[`${user.displayName}::${user.avatarUrl}`] = user.id;
      if (!index[user.displayName]) index[user.displayName] = user.id;
    });
    return Object.freeze(index);
  })();

  function normalizeUserProfile(user) {
    if (!user) return null;
    const name = user.name || user.displayName || '';
    const avatar = user.avatar || user.avatarUrl || '';
    return Object.freeze({
      id: user.id,
      name,
      avatar,
      displayName: name,
      avatarUrl: avatar,
    });
  }

  function getAuthorById(id) {
    return normalizeUserProfile(MOCK_USERS_BY_ID[String(id)]) || null;
  }

  function resolveAuthorId(legacyName, legacyAvatarUrl) {
    const name = String(legacyName || '').trim();
    const avatar = String(legacyAvatarUrl || '').trim();
    if (name && avatar) {
      return LEGACY_AUTHOR_INDEX[`${name}::${avatar}`] || LEGACY_AUTHOR_INDEX[name] || null;
    }
    if (name) return LEGACY_AUTHOR_INDEX[name] || null;
    return null;
  }

  window._KCAPI.authors = Object.freeze({
    MOCK_USERS,
    MOCK_USERS_BY_ID,
    MOCK_USERS_LIST,
    getAuthorById,
    normalizeUserProfile,
    resolveAuthorId,
  });
})();
