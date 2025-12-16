/**
 * KinoCampus - Sistema de Busca Global V5.1
 * Busca inteligente com suporte a sinônimos e busca fuzzy
 */

// Banco de dados de anúncios (carregado do JSON)
let kcDatabase = null;

// Sinônimos para busca inteligente
const sinonimos = {
    "notebook": ["laptop", "computador portátil", "note", "computador", "pc"],
    "celular": ["smartphone", "telefone", "iphone", "android", "mobile", "fone"],
    "livro": ["livros", "apostila", "material didático", "livro", "book"],
    "roupa": ["roupas", "vestuário", "vestimenta", "blusa", "camisa", "calça"],
    "cama": ["colchão", "box", "móvel quarto", "cama box"],
    "fone": ["headphone", "fone de ouvido", "earphone", "airpod", "fones", "audio"],
    "bicicleta": ["bike", "bici", "bicicleta", "mountain bike"],
    "carona": ["transporte", "viagem", "ida", "volta", "caronas"],
    "estágio": ["estagio", "trainee", "jovem aprendiz"],
    "emprego": ["vaga", "trabalho", "job", "oportunidade"],
    "cálculo": ["calculo", "matemática", "exatas"],
    "iphone": ["apple", "ios", "celular apple"],
    "dell": ["notebook dell", "laptop dell"],
    "jbl": ["fone jbl", "headphone jbl", "audio jbl"]
};

// Carregar banco de dados
async function loadDatabase() {
    try {
        const response = await fetch('data/database.json');
        kcDatabase = await response.json();
        console.log('KinoCampus Database loaded:', kcDatabase.anuncios.length, 'anúncios');
        return kcDatabase;
    } catch (error) {
        console.error('Erro ao carregar database:', error);
        return null;
    }
}

// Ler parâmetro da URL
function getQueryParam(name) {
    try {
        const url = new URL(window.location.href);
        const v = url.searchParams.get(name);
        return v ? String(v) : '';
    } catch {
        return '';
    }
}

// Mapeamento simples para labels e páginas
function moduleToLabel(modulo) {
    const map = {
        'compra-venda': 'Compra e Venda',
        'livros': 'Livros',
        'caronas': 'Caronas',
        'oportunidades': 'Oportunidades',
        'achados-perdidos': 'Achados/Perdidos',
        'eventos': 'Eventos',
        'moradia': 'Moradia'
    };
    return map[modulo] || modulo || 'Publicação';
}

function moduleToPage(modulo) {
    const map = {
        'compra-venda': 'compra-venda-feed.html',
        'livros': 'compra-venda-feed.html?filter=livros',
        'caronas': 'caronas-feed.html',
        'oportunidades': 'oportunidades.html',
        'achados-perdidos': 'achados-perdidos.html',
        'eventos': 'eventos.html',
        'moradia': 'moradia.html'
    };
    return map[modulo] || 'index.html';
}

function formatCurrencyBRL(value) {
    try {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    } catch {
        return `R$ ${value}`;
    }
}

// Posts do usuário (localStorage), se existir
function getUserPosts() {
    try {
        const list = window.kcUserPosts?.list ? window.kcUserPosts.list() : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function normalizeUserPost(post) {
    return {
        ...post,
        // compat com database.json
        modulo: post.modulo || 'publicacao',
        titulo: post.titulo || '',
        descricao: post.descricao || '',
        tags: Array.isArray(post.tags) ? post.tags : [],
        emoji: post.emoji || '✨',
        verificado: !!post.verificado,
        votos: post.votos ?? 0,
        comentarios: post.comentarios ?? 0,
        timestamp: post.timestamp || 'Agora',
        autor: post.autor || 'Você',
        autorAvatar: post.autorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(post.autor || 'Você')}`
    };
}

function getAllPosts() {
    const dbPosts = kcDatabase?.anuncios ? kcDatabase.anuncios : [];
    const userPosts = getUserPosts().map(normalizeUserPost);
    // usuário primeiro
    return [...userPosts, ...dbPosts];
}

function escapeHtml(str) {
    const s = String(str ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Normalizar texto para busca (remover acentos, lowercase)
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

// Expandir termo de busca com sinônimos
function expandSearchTerm(term) {
    const normalizedTerm = normalizeText(term);
    const expandedTerms = [normalizedTerm];
    
    // Verificar sinônimos
    for (const [key, values] of Object.entries(sinonimos)) {
        const normalizedKey = normalizeText(key);
        const normalizedValues = values.map(v => normalizeText(v));
        
        if (normalizedKey === normalizedTerm || normalizedValues.includes(normalizedTerm)) {
            expandedTerms.push(normalizedKey);
            expandedTerms.push(...normalizedValues);
        }
    }
    
    return [...new Set(expandedTerms)]; // Remover duplicatas
}

// Calcular similaridade entre strings (algoritmo simples)
function calculateSimilarity(str1, str2) {
    const s1 = normalizeText(str1);
    const s2 = normalizeText(str2);
    
    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // Verificar palavras em comum
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w));
    
    if (commonWords.length > 0) {
        return commonWords.length / Math.max(words1.length, words2.length);
    }
    
    return 0;
}

// Busca principal
function searchAnuncios(query, options = {}) {
    if (!query) return [];
    
    const {
        modulo = null,        // Filtrar por módulo específico
        categoria = null,     // Filtrar por categoria
        limit = 50,           // Limite de resultados
        minScore = 0.3        // Score mínimo de relevância
    } = options;
    
    const normalizedQuery = normalizeText(query);
    const queryTerms = normalizedQuery.split(/\s+/).filter(t => t.length > 1);
    const expandedTerms = queryTerms.flatMap(t => expandSearchTerm(t));
    
    const results = [];
    
    for (const anuncio of getAllPosts()) {
        // Filtrar por módulo se especificado
        if (modulo && anuncio.modulo !== modulo) continue;
        
        // Filtrar por categoria se especificado
        if (categoria && anuncio.categoria !== categoria) continue;
        
        // Calcular score de relevância
        let score = 0;
        
        // Buscar no título (peso maior)
        const normalizedTitle = normalizeText(anuncio.titulo);
        for (const term of expandedTerms) {
            if (normalizedTitle.includes(term)) {
                score += 0.5;
            }
        }
        
        // Buscar na descrição
        const normalizedDesc = normalizeText(anuncio.descricao);
        for (const term of expandedTerms) {
            if (normalizedDesc.includes(term)) {
                score += 0.2;
            }
        }
        
        // Buscar nas tags
        const normalizedTags = (Array.isArray(anuncio.tags) ? anuncio.tags : []).map(t => normalizeText(t));
        for (const term of expandedTerms) {
            if (normalizedTags.some(tag => tag.includes(term) || term.includes(tag))) {
                score += 0.3;
            }
        }
        
        // Buscar na categoria/subcategoria
        if (normalizeText(anuncio.categoria).includes(normalizedQuery) ||
            normalizeText(anuncio.subcategoria).includes(normalizedQuery)) {
            score += 0.2;
        }
        
        // Adicionar se score for suficiente
        if (score >= minScore) {
            results.push({
                ...anuncio,
                relevanceScore: score
            });
        }
    }
    
    // Ordenar por relevância
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return results.slice(0, limit);
}

// Busca rápida para autocomplete
function quickSearch(query, limit = 5) {
    if (!query || query.length < 2) return [];
    
    const normalizedQuery = normalizeText(query);
    const results = [];
    
    for (const anuncio of getAllPosts()) {
        const normalizedTitle = normalizeText(anuncio.titulo);
        
        if (normalizedTitle.includes(normalizedQuery)) {
            results.push({
                id: anuncio.id,
                titulo: anuncio.titulo,
                modulo: anuncio.modulo,
                categoria: anuncio.categoria,
                emoji: anuncio.emoji
            });
            
            if (results.length >= limit) break;
        }
    }
    
    return results;
}

// Filtrar cards na página atual
function filterCurrentPageCards(query) {
    const cards = document.querySelectorAll('.kc-card');
    const normalizedQuery = normalizeText(query);
    const expandedTerms = expandSearchTerm(normalizedQuery);
    
    let visibleCount = 0;
    
    cards.forEach(card => {
        const title = card.querySelector('.kc-card__title')?.textContent || '';
        const description = card.querySelector('.kc-card__description-preview')?.textContent || '';
        const categorySource = card.querySelector('.kc-card__category-source')?.textContent || '';
        
        const normalizedTitle = normalizeText(title);
        const normalizedDesc = normalizeText(description);
        const normalizedCategory = normalizeText(categorySource);
        
        let matches = false;
        
        if (!query || query.length === 0) {
            matches = true;
        } else {
            for (const term of expandedTerms) {
                if (normalizedTitle.includes(term) || 
                    normalizedDesc.includes(term) || 
                    normalizedCategory.includes(term)) {
                    matches = true;
                    break;
                }
            }
        }
        
        card.style.display = matches ? 'block' : 'none';
        if (matches) visibleCount++;
    });
    
    // Mostrar/esconder mensagem de "nenhum resultado"
    const noResults = document.getElementById('noResults');
    if (noResults) {
        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }
    
    return visibleCount;
}

// Busca global (redireciona para página de resultados ou filtra na página atual)
function globalSearch(query, redirectToResults = false) {
    if (!query || query.trim().length === 0) return;
    
    if (redirectToResults) {
        // Redirecionar para página de resultados
        window.location.href = `search-results.html?q=${encodeURIComponent(query)}`;
    } else {
        // Filtrar na página atual
        filterCurrentPageCards(query);
    }
}

// -----
// Página de resultados
// -----
function isResultsPage() {
    const file = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return file === 'search-results.html' || !!document.getElementById('searchResultsList');
}

function getPriceText(anuncio) {
    if (anuncio.preco === undefined || anuncio.preco === null || String(anuncio.preco).trim() === '') return '';
    if (typeof anuncio.preco === 'number') return formatCurrencyBRL(anuncio.preco);
    return String(anuncio.preco);
}

function buildResultCard(anuncio) {
    const emoji = anuncio.emoji || '✨';
    const price = getPriceText(anuncio);
    const title = anuncio.titulo || '';
    const desc = anuncio.descricao || '';
    const author = anuncio.autor || 'Anônimo';
    const avatar = anuncio.autorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(author)}`;
    const timestamp = anuncio.timestamp || '';
    const moduloLabel = moduleToLabel(anuncio.modulo);
    const votes = anuncio.votos ?? 0;
    const comments = anuncio.comentarios ?? 0;
    const href = `product.html?id=${encodeURIComponent(anuncio.id)}`;

    const priceHtml = price ? `<div class="kc-card__price"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(price)}</div>` : '';

    return `
      <article class="kc-card" data-category="${escapeHtml(anuncio.categoria || '')}">
        <div class="kc-card__main">
          <div class="kc-card__image-wrapper" style="font-size: 3em; display: flex; align-items: center; justify-content: center;">
            ${escapeHtml(emoji)}
          </div>
          <div class="kc-card__content">
            <div class="kc-card__header">
              <div class="kc-card__category-source">${escapeHtml(moduloLabel)}${anuncio.categoria ? ` • ${escapeHtml(anuncio.categoria)}` : ''}</div>
              <div class="kc-card__timestamp">${escapeHtml(timestamp)}</div>
            </div>
            <a href="${href}" class="kc-card__title">${escapeHtml(title)}</a>
            ${priceHtml}
            <div class="kc-card__description-preview">${escapeHtml(desc.length > 150 ? desc.slice(0, 150) + '…' : desc)}</div>
            <div class="kc-card__author">
              <img src="${escapeHtml(avatar)}" alt="${escapeHtml(author)}">
              <span>Por <strong>${escapeHtml(author)}</strong></span>
            </div>
          </div>
        </div>
        <div class="kc-card__footer">
          <div class="kc-card__interactions">
            <div class="kc-vote-box">
              <button class="hot" onclick="vote(this, 'hot')"><i class="fas fa-fire"></i></button>
              <span>${escapeHtml(votes)}</span>
              <button class="cold" onclick="vote(this, 'cold')"><i class="fas fa-snowflake"></i></button>
            </div>
            <a href="${href}#comments" class="kc-comment-link"><i class="fas fa-comment"></i><span>${escapeHtml(comments)}</span></a>
          </div>
          <a href="${href}" class="kc-action-button kc-get-coupon-button">Ver Detalhes</a>
        </div>
      </article>
    `;
}

function renderResultsToPage(query) {
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) return;

    const q = String(query || '').trim();
    const titleEl = document.getElementById('searchQueryText');
    if (titleEl) titleEl.textContent = q ? `“${q}”` : '';

    if (!q) {
        listEl.innerHTML = '';
        const no = document.getElementById('noResults');
        if (no) no.style.display = 'block';
        const countEl = document.getElementById('resultsCount');
        if (countEl) countEl.textContent = '0';
        return;
    }

    const results = searchAnuncios(q, { limit: 50, minScore: 0.2 });
    listEl.innerHTML = results.map(buildResultCard).join('');

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.style.display = results.length ? 'none' : 'block';
    const countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = String(results.length);
}

// Inicializar busca na página
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.querySelector('.kc-search-bar button');
    const resultsPage = isResultsPage();
    const hasPageFilter = (!resultsPage) && (typeof window.filterPosts === 'function' || (searchInput && searchInput.getAttribute('onkeyup')));


    // Carregar database e, se estiver na página de resultados, renderizar ao carregar
    loadDatabase().then(() => {
        if (resultsPage) {
            const qParam = getQueryParam('q');
            if (searchInput && qParam) searchInput.value = qParam;
            renderResultsToPage(searchInput ? searchInput.value : qParam);
        }
    });
    
    // Configurar input de busca
    if (searchInput) {
        // Busca em tempo real
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value;
            if (resultsPage) renderResultsToPage(query);
            else filterCurrentPageCards(query);
        });
        
        // Busca ao pressionar Enter
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = this.value;
                if (resultsPage) renderResultsToPage(q);
                else globalSearch(q, true);
            }
        });
    }
    
    // Configurar botão de busca
    if (searchButton) {
        searchButton.addEventListener('click', function(e) {
            e.preventDefault();
            const q = searchInput ? searchInput.value : '';
            if (resultsPage) renderResultsToPage(q);
            else globalSearch(q, true);
        });
    }
}

// Auto-inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', initSearch);

// Exportar funções para uso global
window.kcSearch = {
    search: searchAnuncios,
    quickSearch: quickSearch,
    filter: filterCurrentPageCards,
    globalSearch: globalSearch,
    loadDatabase: loadDatabase
};
