# Auditoria SWR Residual — v11.29

**Data:** 15 de abril de 2026  
**Escopo:** todos os 22 controllers + kc-api-client  
**Objetivo:** confirmar estado de KCSessionStore/SWR após v11.28.2 e identificar residuos

---

## 1. Estado atual por controller

### Module feed controllers (feed público)

| Controller | SWR | O que cacheia | Status |
|-----------|-----|---------------|--------|
| `achados-perdidos.controller.js` | ✅ 8 refs | snapshot de posts (KCAPI.getPosts) | **Completo** |
| `compra-venda-feed.controller.js` | ✅ 8 refs | snapshot de posts (KCAPI.getPosts) | **Completo** |
| `moradia.controller.js` | ✅ 8 refs | snapshot de posts (KCAPI.getPosts) | **Completo** |
| `oportunidades.controller.js` | ✅ 8 refs | snapshot de posts (KCAPI.getPosts) | **Completo** |
| `eventos.controller.js` | ✅ 8 refs | eventos do calendário (Supabase direto, v11.28.2) | **Completo** |
| `caronas-feed.controller.js` | ✅ 7 refs | localizações populares Supabase (v11.28.2) | **Completo** |

**Conclusão:** todos os 6 module controllers com SWR implementado. Escopo original de v11.29.x concluído antecipadamente em v11.28.2.

### Controladores de utilidade com SWR

| Controller | SWR | Observação |
|-----------|-----|------------|
| `kc-feed.controller.js` | ✅ 12 refs | SWR extenso para feed principal (anti-duplicate, session state) |

### Controladores sem SWR — análise de necessidade

| Controller | Fetches | SWR necessário? | Raciocínio |
|-----------|---------|-----------------|------------|
| `product.controller.js` | 61 | **Candidato — alto valor** | Detalhe de produto consultado repetidamente; SWR reduziria latência em back-navigation; mas arquivo é monolito ~139KB (candidato v11.30.2) — SWR deve vir APÓS o split |
| `profile.controller.js` | 45 | **Candidato — médio valor** | Dados de perfil (user posts, bio) são estáveis em sessão; back-navigation comum; candidato para v11.29.1 |
| `my-posts.controller.js` | 15 | **Candidato — médio valor** | Lista de posts do usuário; raramente muda durante sessão; candidato para v11.29.1 |
| `settings.controller.js` | 29 | Baixo valor | Settings sempre precisam de dados frescos para evitar inconsistências; SWR não recomendado |
| `account-setup.controller.js` | 20 | Não aplicável | Fluxo de cadastro; dados sempre frescos obrigatórios |
| `create-post.controller.js` | 10 | Não aplicável | Fluxo de criação; dados sempre frescos |
| `index.controller.js` | 7 | Baixo valor | Página inicial; dados de ranking/feed recarregam por design |
| `help.controller.js` | 7 | Baixo valor | Conteúdo de ajuda; pouco benefício de SWR |
| `ods.controller.js` | 0 | Não aplicável | Sem fetches diretos identificados |

### Controllers admin

| Grupo | Fetches | SWR necessário? |
|-------|---------|-----------------|
| admin-banners | 13 | Não — admin sempre precisa de dados frescos |
| admin-dashboard | 33 | Não — métricas em tempo real |
| admin-help-requests | 7 | Não — moderação requer freshness |
| admin-invite | 7 | Não — fluxo transacional |
| admin-moderation | 23 | Não — moderação requer freshness |
| admin-reports | 29 | Não — relatórios requerem freshness |

---

## 2. Conclusão e plano

### Escopo v11.29.x: concluído vs. pendente

| Item | Estado |
|------|--------|
| SWR para 6 module feed controllers | ✅ Concluído em v11.28.2 |
| SWR para kc-feed | ✅ Já existia antes de v11.29.x |
| SWR para `product.controller.js` | ⏸️ Adiado para pós v11.30.2 (refactor do monolito vem antes) |
| SWR para `profile.controller.js` | 📋 Candidato para v11.29.1 |
| SWR para `my-posts.controller.js` | 📋 Candidato para v11.29.1 |
| SWR para admins | ✅ Não necessário (padrão intencional) |

### Plano v11.29.1 (opcional)

Se aprovado: adicionar SWR em `profile.controller.js` e `my-posts.controller.js`:
- Modelar conforme padrão de `achados-perdidos.controller.js`
- `getSessionStore()`, `SECTION_CACHE_KEY`, `SECTION_CACHE_MAX_AGE_MS`
- `restoreCachedPosts()` + `persistCachedPosts()` + `fetchAll()` ou integração com fetch existente
- Testes de contrato estático nos arquivos de teste correspondentes

### Decisão arquitetural

`product.controller.js` (fetch:61, ~139KB) é simultaneamente:
1. O controller com maior benefício de SWR (navegação frequente para produto)
2. O arquivo candidato ao refactor em v11.30.2

**Sequência recomendada:** v11.30.1 (supabase.adapter.js split) → v11.30.2 (product.controller.js split) → v11.30.3 (SWR em product após split).  
Adicionar SWR a um arquivo monolítico de 139KB antes do split desperdiçaria esforço caso a extração mova os fetch calls para um submódulo.

---

## 3. Impacto na trilha v11.30.x

| Arquivo | Tamanho aprox. | Linhas aprox. | Candidato a |
|---------|---------------|---------------|------------|
| `assets/js/adapters/supabase.adapter.js` | ~162 KB | ~1800+ | v11.30.1 (split adapters) |
| `assets/js/controllers/product.controller.js` | ~139 KB | ~1600+ | v11.30.2 (split controller) |

Após v11.30.x: `product` terá fetches distribuídos em submódulos → SWR será adicionado no local correto.
