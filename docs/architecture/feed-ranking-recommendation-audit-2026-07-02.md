# Auditoria de ranking, abas e recomendação do feed

**Data:** 2026-07-02  
**Escopo:** `index.html`, feeds públicos dos seis módulos, abas `Destaques` / `Recentes` / `Comentados`, chips de módulos/categorias da home, RPCs Supabase e trilha futura de personalização.

## Resumo executivo

O KinoCampus tem hoje três sistemas diferentes que parecem um só na UI:

1. **Ordenação de posts do feed:** vem da RPC `kc_get_feed_cursor`, com `sortBy=votos|recentes|comentados`. É global, server-side e paginada por cursor.
2. **Recomendação de abas/categorias da home:** vem de `kc_get_personalized_tabs`, combinando afinidade da home com sinal global recente. Ela escolhe chips depois do divisor em `#kc-home-feed-tabs`.
3. **Qualidade dos candidatos publicados:** depende dos formulários, metadados, status/expiração e, para Cadu, da curadoria antes de criar posts.

O problema visual reportado no print era real: o RPC de abas personalizadas retornava categorias como `oportunidades:estagios`, `oportunidades:pesquisa`, `eventos:workshops` e `eventos:academicos`, mas `kc-feed-tabs-personalized.js` não reconhecia várias delas. A UI caía para o rótulo genérico do módulo, gerando `Eventos`, `Eventos`, `Oportunidades`, `Oportunidades`. Isso foi corrigido em 2026-07-02 com normalização de chaves, uso do catálogo compartilhado e dedupe visual.

Também há riscos reais no ranking de posts:

- `Destaques` já protege contra posts encerrados: `closed` tem `highlight_score=0` e fica abaixo de `published`.
- `Recentes` e `Comentados` ainda aceitam `closed`. Isso é coerente se a intenção for histórico público, mas ruim se a expectativa do usuário for “conteúdo acionável agora”.
- Em produção, consulta pública em 2026-07-02 encontrou `56` eventos publicados recentes lidos via REST; `10` tinham `metadata.data_evento` anterior a 2026-07-02 e `4` não tinham data de evento. Parte pode ser evento contínuo, mas o modelo atual não distingue bem `start_date`, `end_date` e prazo real de utilidade.
- A personalização atual não reordena posts por usuário; ela só influencia chips/categorias da home e, separadamente, a busca tem um plano opt-in com teto baixo. Portanto, expectativas como “priorizar hackathons para Yan no feed de eventos” ainda são roadmap, não comportamento atual.

## Mapa de implementação atual

### Superfícies

| Superfície | Arquivos principais | Comportamento |
|---|---|---|
| Home | `index.html`, `assets/js/controllers/public/index.controller.js` | Três panes independentes: `destaques`, `recentes`, `comentados`. Só `destaques` carrega inicialmente; outras abas carregam sob demanda. |
| Módulos públicos | `eventos.controller.js`, `oportunidades.controller.js`, `moradia.controller.js`, `compra-venda-feed.controller.js`, `caronas-feed.controller.js`, `achados-perdidos.controller.js` | Cada página chama `KCFeedPager` com `module`/`pageModule` e `sortBy`. |
| Binding das abas | `assets/js/core/kc-core-widgets.js` | `destaques -> votos`, `recentes -> recentes`, `comentados -> comentados`; hash inicial `#recentes`/`#comentados` é aceito. |
| Pager | `assets/js/controllers/public/kc-feed.controller.js` | Busca via `KCAPI.getFeedCursor`, cache em memória e `sessionStorage`, dedupe de IDs, sem reordenar páginas retornadas. |
| Adapter Supabase | `assets/js/api/kc-supabase.posts.js`, `assets/js/adapters/supabase/supabase.posts-read.adapter.js` | Chama `kc_get_feed_cursor` e normaliza rows para o contrato de post. |
| Abas personalizadas da home | `assets/js/features/kc-feed-tabs-personalized.js` | Hidrata links depois de `.kc-feed-tabs__divider` usando `KCAPI.getPersonalizedTabs`. |
| Afinidade de categorias | `assets/js/features/kc-home-categories.js`, `assets/js/shared/home-categories.shared.js` | Registra/mescla/lista afinidade se houver consentimento de analytics; constrói sidebar de categorias da home. |

### Ordenação dos posts

A fonte de verdade é a RPC `kc_get_feed_cursor`, presente nas migrations consolidadas e documentada em `docs/rpc-catalog.md` e `docs/architecture/content-cache-freshness-map.md`.

| Aba | `sortBy` | Ordem atual | Observação |
|---|---|---|---|
| `Destaques` | `votos` | `status_priority DESC`, `highlight_score DESC`, `votos DESC`, `created_at DESC`, `id DESC` | `published` fica acima de `closed`. |
| `Recentes` | `recentes` | `effective_at = coalesce(bumped_at, created_at) DESC`, `created_at DESC`, `id DESC` | Bump sobe post nesta aba. Aceita `closed`. |
| `Comentados` | `comentados` | `last_comment_at DESC`, `created_at DESC`, `id DESC`; exige comentário | Aceita `closed`, então comentários antigos de posts encerrados podem dominar se o universo de comentados ativos for pequeno. |

O `highlight_score` atual é:

```text
(votos*10 + salvos_destaque*8 + salvos_favorito*5 + comentarios*3
 + bonus_comentario + cliques_cupom*4 + compartilhamentos*2)
/ (1 + idade_em_semanas)
```

`kc_compute_highlight_score` retorna `0` quando `status <> 'published'`. `kc_refresh_highlight_scores` recalcula publicados recentes e zera encerrados. A documentação menciona cron horário para manter decaimento, mas esta auditoria não conseguiu verificar cron admin via chave pública.

### Elegibilidade de status

Hoje os feeds públicos aceitam `published` e `closed`. Excluem `legacy_id` e dependem de `kc_can_read_post(...)`. Isso preserva histórico público, mas mistura dois conceitos:

- **Feed ativo:** coisas em que ainda faz sentido clicar, comprar, se inscrever, comparecer ou responder.
- **Arquivo público:** conteúdo encerrado, útil para histórico, transparência ou perfil do autor.

Recomendação: preservar `closed` no detalhe/perfil/arquivo, mas introduzir modo explícito de feed ativo. `Destaques`, por padrão, já se comporta quase assim. `Recentes` e `Comentados` ainda não.

### Filtros por módulo

Os controllers enviam `requestParams` para `kc_get_feed_cursor`, e a RPC aplica filtros server-side:

| Módulo | Params relevantes |
|---|---|
| `eventos` | `datePreset` (`today`, `next7d`, `thisMonth`, `past`) |
| `oportunidades` | `oppType`, `oppMode`, `oppArea`, `priceMin`, `priceMax`, `datePreset` |
| `moradia` | `housingFeatures`, `housingRegion`, `priceMin`, `priceMax`, `datePreset` |
| `compra-venda` | `marketCats`, `marketConds`, `marketVerified`, `priceMin`, `priceMax`, `datePreset` |
| `caronas` | `rideType`, `rideCampus`, `ridePeriod`, `rideFeatures`, `rideVerified`, origem/destino, preço, data |
| `achados-perdidos` | `lfStatus`, `lfType`, `lfLocation`, `datePreset` |

Ponto crítico: para `eventos`, `kc_feed_event_local_date` lê `metadata.data_evento`, `metadata.dataEvento` ou `metadata.data`; se faltar, cai para `created_at`. Isso permite que posts com metadado incompleto passem por filtros temporais de evento usando data de publicação, não data do evento.

## Evidência viva de produção

Como o `.env` local continha placeholders para Supabase, a validação viva foi feita com a configuração pública já injetada em `https://www.kinocampus.com.br/assets/js/boot/kc-env.js`. A chave usada foi anon/public.

### Abas personalizadas

`kc_get_personalized_tabs(p_session_id=null, p_limit=30)` retornou, entre outros:

```json
[
  "oportunidades:estagios",
  "oportunidades:pesquisa",
  "eventos:workshops",
  "oportunidades:empregos",
  "eventos:culturais",
  "oportunidades:bolsas",
  "eventos:academicos",
  "oportunidades:monitoria",
  "eventos:esportivos",
  "eventos:tecnologia",
  "oportunidades:emprego"
]
```

Antes da correção, várias dessas chaves não existiam no catálogo do componente e viravam rótulos genéricos. Depois da correção:

- `home-categories.shared.js` reconhece `pesquisa`, `bolsa`, `mobilidade`, `tecnologia` e plurais relevantes.
- `kc-feed-tabs-personalized.js` tenta o catálogo compartilhado primeiro.
- Fallback desconhecido usa key do módulo (`eventos`, `oportunidades`) para permitir dedupe.
- Dedupe ocorre por chave e por destino/rótulo visual.

### Feeds

Em `Destaques`, os primeiros resultados eram todos `published`, como esperado. Em `Comentados`, os primeiros resultados retornados eram `closed`, incluindo evento e posts de compra/venda encerrados. Isso confirma que `closed` é um risco real em `Comentados`, não em `Destaques`.

Em `Eventos`, entre `56` posts publicados consultados em produção:

- `10` tinham data de evento anterior a 2026-07-02.
- `4` não tinham data de evento explícita.

Isso não prova que todos estejam errados, pois exposições e agendas semanais podem ter intervalo. Prova que o modelo atual é insuficiente para distinguir:

- evento pontual;
- evento contínuo;
- prazo de inscrição;
- data final de utilidade;
- notícia sobre evento passado.

## Problemas classificados

### Reais e corrigidos nesta iteração

1. **Chips repetidos na home:** real. Causado por divergência entre chaves do RPC e catálogo local. Corrigido em `kc-feed-tabs-personalized.js` e `home-categories.shared.js`.
2. **Catálogo incompleto:** real. `pesquisa`, `bolsa`, `mobilidade`, `tecnologia` e pluralizações usadas em produção não estavam completas no catálogo compartilhado. Corrigido parcialmente.

### Reais, ainda não resolvidos

1. **`Comentados` dominado por encerrados:** real em produção. Precisa decisão de produto: `comentados ativos` por padrão e `histórico comentado` separado.
2. **Eventos publicados com data passada ou ausente:** real/potencial. Precisa modelagem temporal mais rica e saneamento da pipeline Cadu.
3. **Personalização de posts inexistente:** real como lacuna. Hoje não há ranking por usuário nos posts do feed, só personalização de chips/categorias e busca opt-in separada.
4. **Transparência insuficiente:** usuários não veem por que um post/chip apareceu, nem conseguem ajustar diretamente o peso de módulos/fontes/tags no feed.
5. **Score de destaque vulnerável a volume bruto:** comentários, votos, salvos e shares entram quase lineares; falta saturação por usuário, limites de abuso, diversidade de autores/fontes e penalidades de reclamação.

### Potenciais

1. **Score stale se refresh não rodar:** o contrato prevê refresh horário, mas esta auditoria só confirmou código/migrations, não o cron ativo em produção.
2. **Filtro temporal de evento por `created_at`:** quando metadado de evento falta, o fallback pode dar aparência de evento futuro/recente sem ser.
3. **Categorias sem seção real:** `eventos:tecnologia` pode ser útil como recomendação, mas a página de eventos não tem seção formal correspondente. O href `#tecnologia` deve ser complementado por UI ou filtro real em etapa futura.

### Equívocos comuns

1. **“Destaques mostra encerrados no topo”:** pelo contrato atual, não deveria. `closed` tem prioridade menor e score zero. Se aparecer, investigar score/status inconsistente ou cache.
2. **“A home já personaliza posts para cada usuário”:** não. A home personaliza principalmente chips/categorias; posts continuam ordenados globalmente pelo `sortBy`.
3. **“Recentes é só data de criação”:** não. Usa `bumped_at` quando existe.

## Referências externas úteis

As referências abaixo orientam princípios, não devem ser copiadas literalmente:

- TikTok explica que recomendações combinam interações, informação do vídeo e configurações de conta/dispositivo; também destaca feedback negativo, diversidade e redução de repetição: https://newsroom.tiktok.com/how-tiktok-recommends-videos-for-you
- TikTok permite “refresh” do feed e evita servir conteúdo repetido demais: https://newsroom.tiktok.com/introducing-a-way-to-refresh-your-for-you-feed-on-tiktok-us
- O paper do YouTube separa recomendação em geração de candidatos e ranking: https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/
- Algolia trata ranking textual como critérios sequenciais/tie-breakers e recomenda A/B test antes de mudar ordem: https://www.algolia.com/doc/api-reference/api-parameters/ranking
- BM25 usa frequência de termo, raridade do termo e normalização por tamanho do campo, útil para busca textual antes de personalização: https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables
- Reddit hot ranking combina score e tempo em uma fórmula simples de decaimento temporal: https://raw.githubusercontent.com/reddit-archive/reddit/master/r2/r2/lib/db/_sorts.pyx
- Hacker News divide pontos por potência do tempo e aplica flags/anti-abuse/demotions/moderação: https://news.ycombinator.com/newsfaq.html
- DSA/Art. 27 é uma referência de transparência: explicar parâmetros principais e opções para modificar/influenciar recomendações. Fonte acessível consultada: https://www.eu-digital-services-act.com/Digital_Services_Act_Article_27.html

## Arquitetura recomendada para o KinoCampus

### 1. Gate de elegibilidade antes de score

Antes de qualquer ranking:

- status permitido;
- visibilidade/RLS;
- duplicidade e denúncias;
- módulo coerente;
- metadados mínimos por módulo;
- validade temporal ativa.

Para eventos e oportunidades, o post precisa de uma janela de utilidade:

```text
active_from
active_until
event_start
event_end
deadline_at
source_verified
closed_reason
```

Regras iniciais:

- Evento pontual: ativo até `event_end` ou `event_start + tolerância curta`.
- Evento contínuo/exposição: ativo até `event_end`.
- Oportunidade com inscrição: ativa até `deadline_at`.
- Conteúdo sem data crítica: fica em revisão ou entra como notícia/editorial, não como evento/oportunidade acionável.

### 2. Candidatos por superfície

Separar geração de candidatos do ranking:

| Superfície | Candidatos |
|---|---|
| Home `Destaques` | publicados ativos de todos os módulos, com diversidade por módulo e fonte |
| Home `Recentes` | publicados ativos recentes/bumped; encerrados só em modo histórico |
| Home `Comentados` | publicados ativos com atividade recente de comentários; encerrados só em modo histórico |
| Módulo `eventos` | eventos ativos, futuros ou em andamento; opção `passados` separada |
| Módulo `oportunidades` | oportunidades com prazo aberto ou verificadamente sem prazo |
| Busca | candidatos filtrados por query/schema; ranking textual domina personalização |
| Recomendados personalizados | candidatos ativos + afinidade explícita/opt-in + exploração |

### 3. Score v2 para `Destaques`

Proposta inicial, auditável:

```text
score =
  0.30 * qualidade_do_candidato
+ 0.20 * frescor_ou_proximidade_temporal
+ 0.20 * engajamento_saturado
+ 0.10 * confiabilidade_da_fonte
+ 0.10 * diversidade/exploração
+ 0.10 * afinidade_pessoal_opt_in
- penalidades
```

Detalhes:

- `engajamento_saturado`: usar `log1p` ou caps por tipo para evitar que poucos comentários dominem tudo.
- `comentários`: considerar comentaristas únicos, recência e qualidade, não só contagem bruta.
- `frescor`: eventos futuros próximos sobem; eventos passados caem ou saem do feed ativo.
- `fonte`: Cadu/site oficial/autor verificado recebe boost leve, mas não deve superar prazo expirado.
- `afinidade`: no máximo 5-10% no feed geral; preferências explícitas > comportamento implícito.
- `penalidades`: denúncias, ocultar, “não tenho interesse”, duplicidade, baixa completude de metadados.

### 4. `Recentes` e `Comentados` ativos

Criar duas variantes:

- `recentes_ativos`: `published` + janela útil ativa, ordenado por `effective_at`.
- `comentados_ativos`: `published` + janela útil ativa + comentário recente, ordenado por `last_comment_at` com decaimento.

Manter histórico em:

- filtro “Encerrados/arquivo”;
- perfil do usuário;
- detalhe do post por link direto;
- possível aba admin/curadoria.

### 5. Personalização transparente

Separar claramente:

- **Analytics:** métricas agregadas e melhoria do produto.
- **Personalização:** influência direta no que o usuário vê.

Controles recomendados:

- botão “Por que estou vendo?” em post/chip;
- “Ordem padrão” sem personalização, semelhante ao plano da busca;
- reset do perfil de recomendações;
- preferências explícitas por módulo/tag/fonte;
- opção “ver menos como este”;
- exportação/exclusão dos sinais de personalização;
- teto visível de influência pessoal.

### 6. Diversidade e dedupe

Aplicar sempre:

- dedupe por `post.id`;
- dedupe por URL/fonte quando Cadu publica a mesma oportunidade de canais diferentes;
- dedupe visual por chip de categoria;
- limite de posts consecutivos do mesmo módulo/fonte;
- exploração controlada para evitar bolha.

O fix de 2026-07-02 aplica essa lógica no nível dos chips da home. Ainda falta aplicar diversidade equivalente no ranking de posts.

## Plano por fases

### Fase 1 — Concluída nesta iteração

- Corrigir chips repetidos da home.
- Ampliar catálogo compartilhado de categorias.
- Adicionar testes de regressão para chaves reais de produção.
- Registrar auditoria do estado atual e riscos.

### Fase 2 — Elegibilidade ativa

- Criar helper/RPC `kc_post_active_window` ou campos normalizados equivalentes.
- Popular `event_start`, `event_end`, `deadline_at`, `active_until`.
- Ajustar pipeline Cadu para não publicar notícia passada como evento/oportunidade ativa.
- Adicionar dashboard admin para “eventos publicados com data passada/ausente”.

### Fase 3 — Feeds ativos vs histórico

- Alterar `Recentes` e `Comentados` para padrão ativo.
- Adicionar toggle/aba de histórico quando fizer sentido.
- Atualizar testes `closed-posts-contract` para refletir a decisão final.

### Fase 4 — Score v2 auditável

- Criar score com saturação, diversidade e penalidades.
- Manter explicação dos componentes por post para admin e usuário.
- Rodar avaliação offline antes de migration.
- Comparar com fórmula atual em shadow mode.

### Fase 5 — Personalização opt-in

- Criar finalidade separada de personalização.
- Preferências explícitas por módulo/tag/fonte.
- Afinidade comportamental com TTL e teto.
- “Ordem padrão” por sessão e opção persistente.
- Métricas: CTR útil, saves, hides, reports, diversidade, freshness, latência.

## Testes e evidências adicionados

- `tests/unit/kc-feed-tabs-personalized.test.js`
  - garante que categorias reais do RPC não caiam para `Eventos`/`Oportunidades` repetidos;
  - garante dedupe visual quando categorias desconhecidas caem no módulo.
- `tests/integration/home-categories.shared.test.js`
  - garante resolução de `estagios`, `pesquisa` e `bolsas`.

Comando executado:

```powershell
npm test -- tests/unit/kc-feed-tabs-personalized.test.js tests/integration/home-categories.shared.test.js --runInBand
```

Resultado: 2 suites, 7 testes, todos passando.
