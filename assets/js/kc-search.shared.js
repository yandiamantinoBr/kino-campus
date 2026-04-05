/*
  KinoCampus — kc-search.shared.js
  Funções puras de busca, testáveis em Node (UMD).
  Extraído de kc-search.js (v9.0.2).
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KCSearchShared = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SYNONYMS = {
    notebook: ['laptop', 'computador portatil', 'note', 'computador', 'pc'],
    celular: ['smartphone', 'telefone', 'iphone', 'android', 'mobile', 'fone'],
    livro: ['livros', 'apostila', 'material didatico', 'book'],
    roupa: ['roupas', 'vestuario', 'vestimenta', 'blusa', 'camisa', 'calca'],
    cama: ['colchao', 'box', 'movel quarto', 'cama box'],
    fone: ['headphone', 'fone de ouvido', 'earphone', 'airpod', 'fones', 'audio'],
    bicicleta: ['bike', 'bici', 'mountain bike'],
    carona: ['transporte', 'viagem', 'ida', 'volta', 'caronas'],
    estagio: ['trainee', 'jovem aprendiz'],
    emprego: ['vaga', 'trabalho', 'job', 'oportunidade'],
    calculo: ['matematica', 'exatas'],
    iphone: ['apple', 'ios', 'celular apple'],
    dell: ['notebook dell', 'laptop dell'],
    jbl: ['fone jbl', 'headphone jbl', 'audio jbl']
  };

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Expande um termo de busca adicionando sinônimos conhecidos.
   * Retorna array de termos (inclui o original normalizado).
   */
  function expandSynonyms(term) {
    var normalized = normalizeText(term);
    if (!normalized) return [];

    var expanded = [normalized];
    var keys = Object.keys(SYNONYMS);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var synonyms = SYNONYMS[key];
      if (normalized === key || normalized.includes(key)) {
        for (var j = 0; j < synonyms.length; j++) {
          if (expanded.indexOf(synonyms[j]) === -1) expanded.push(synonyms[j]);
        }
      } else {
        for (var j = 0; j < synonyms.length; j++) {
          if (normalized === synonyms[j] || normalized.includes(synonyms[j])) {
            if (expanded.indexOf(key) === -1) expanded.push(key);
            for (var k = 0; k < synonyms.length; k++) {
              if (expanded.indexOf(synonyms[k]) === -1) expanded.push(synonyms[k]);
            }
            break;
          }
        }
      }
    }

    return expanded;
  }

  /**
   * Verifica se um texto contém algum dos termos expandidos.
   */
  function matchesExpandedTerms(text, expandedTerms) {
    var normalizedText = normalizeText(text);
    if (!normalizedText || !expandedTerms || !expandedTerms.length) return false;

    for (var i = 0; i < expandedTerms.length; i++) {
      if (normalizedText.indexOf(expandedTerms[i]) !== -1) return true;
    }
    return false;
  }

  return {
    SYNONYMS: SYNONYMS,
    normalizeText: normalizeText,
    expandSynonyms: expandSynonyms,
    matchesExpandedTerms: matchesExpandedTerms,
  };
}));
