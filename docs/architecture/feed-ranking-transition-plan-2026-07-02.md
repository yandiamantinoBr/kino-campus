# Plano de transicao do ranking e recomendacao do feed

**Data:** 2026-07-02  
**Estado:** Fase 1 implementada em modo puro/shadow; sem mudanca de ordem publica do feed.

## Decisao executiva

O feed do KinoCampus nao deve trocar a ordenacao atual diretamente no cliente. A fonte de verdade operacional continua sendo a RPC `kc_get_feed_cursor`, porque ela controla filtros, RLS, cursor, cache e paginacao incremental. Reordenar paginas ja retornadas no navegador quebraria a semantica do cursor e poderia duplicar, omitir ou deslocar posts entre `Carregar mais`.

A transicao segura passa por uma camada de politica pura, testada e sem efeitos colaterais:

- arquivo implementado: `assets/js/shared/kc-feed-ranking-policy.shared.js`;
- diagnostico implementado: `scripts/analyze-feed-ranking-shadow.js` / `npm run benchmark:feed-ranking-shadow`;
- testes implementados: `tests/unit/kc-feed-ranking-policy.test.js`;
- escopo atual: elegibilidade ativa, score global, boost pessoal com teto, dedupe e ranking sombra;
- escopo excluido nesta fase: migration, alteracao de `kc_get_feed_cursor`, storage pessoal novo, UI de preferencia e coleta comportamental.

## Contrato atual que nao pode quebrar

| Ponto | Contrato atual | Risco se alterar sem cuidado |
|---|---|---|
| `KCAPI.getFeedCursor` | recebe `module`, `sortBy`, `limit`, `cursor`, filtros por modulo e retorna posts + `nextCursor` | reordenacao client-side quebra cursor e cache |
| `KCFeedPager` | deduplica IDs, usa cache em memoria/session e invalida por identidade de filtros | mudar ordem sem mudar cursor causa itens repetidos ou sumidos |
| `sortBy=votos` | `status_priority DESC`, `highlight_score DESC`, votos, criacao, id | e o comportamento atual de `Destaques` |
| `sortBy=recentes` | `coalesce(bumped_at, created_at) DESC` | e tambem historico de posts encerrados hoje |
| `sortBy=comentados` | `last_comment_at DESC`, exige comentario | hoje pode trazer `closed` no topo |
| abas da home | cada pane tem pager proprio; so `destaques` carrega no inicio | trocar carregamento pode aumentar rede e tempo inicial |
| chips personalizados | `kc_get_personalized_tabs` + `kc-feed-tabs-personalized.js` | ja corrigido para dedupe visual, nao reordena posts |

## O que foi implementado agora

### 1. Elegibilidade ativa

`KCFeedRankingPolicy.resolveActiveWindow(post, { now })` normaliza o estado de utilidade do post antes de pontuar:

- `closed` nunca entra como ativo e ganha score zero;
- `eventos` exigem data de realizacao; prazo sozinho deve virar oportunidade, inscricao ou revisao, nao evento ativo;
- evento pontual fica ativo ate o fim do dia da data do evento;
- evento continuo fica ativo ate `event_end` / `data_fim`;
- `oportunidades` respeitam `deadline_at`, `data_limite`, `inscricoes_ate`, `active_until` ou `expires_at`;
- `caronas` podem expirar por `departure_at`, `ride_date` ou `data_carona`;
- os demais modulos usam `active_until` / `expires_at` quando existir.

Aliases aceitos nesta fase:

| Conceito | Aliases lidos |
|---|---|
| modulo | `module`, `modulo`, `pageModule`, aliases `compra_venda`, `achados_perdidos` |
| status | `status`, `state`; ativos aceitos: `published`, `publicado`, `active` |
| evento inicio | `event_start`, `starts_at`, `data_evento`, `dataEvento`, `event_date`, `date`, `data` |
| evento fim | `event_end`, `ends_at`, `data_fim`, `dataFim`, `active_until`, `expires_at` |
| prazo | `deadline_at`, `deadline`, `data_limite`, `inscricoes_ate`, `application_deadline`, `active_until`, `expires_at` |
| fonte | `source_url`, `official_url`, `url`, `link`, `external_url`, `metadata.source_url` |

### 2. Score global auditavel

`KCFeedRankingPolicy.scoreGlobal(post, { now })` produz `score`, `components`, `eligibility` e `reasons`.

Pesos v1:

| Componente | Peso | Intencao |
|---|---:|---|
| `quality` | 0.28 | titulo, descricao, categoria/tags, midia, fonte e metadado temporal |
| `temporal` | 0.27 | evento futuro/proximo, oportunidade com prazo aberto, frescor para demais modulos |
| `engagement` | 0.20 | votos, comentarios, compartilhamentos, saves e CTA com `log1p`/saturacao |
| `sourceTrust` | 0.12 | dominio `ufg.br`, fonte verificada ou URL HTTPS |
| `community` | 0.13 | importancia comunitaria declarada, `major_event` e eventos UFG amplos como CONPEEX |

Penalidades:

- denuncias reduzem ate 0.25;
- evento sem data reduz/zera elegibilidade ativa;
- oportunidade sem prazo perde qualidade, mas nao e excluida automaticamente porque pode ser continua;
- expirado e encerrado recebem score zero no feed ativo.

### 3. Personalizacao responsavel

`KCFeedRankingPolicy.blendPersonalScore(globalResult, post, options)` so altera score quando:

- `preferences.mode === 'personalized'`;
- `preferences.consent.granted === true`;
- o post ja e ativo e pontuavel.

Tetos:

- preferencia explicita: ate 7%;
- afinidade local opt-in: ate 3%;
- influencia pessoal total: ate 10%.

Sinais aceitos nesta camada:

- modulo;
- categoria;
- tags;
- fonte.

Nao ha storage novo, coleta nova, sincronizacao com conta, uso de mensagens privadas, denuncias, dados sensiveis, genero, raca/cor, saude, religiao, politica, localizacao exata ou qualquer inferencia de atributo protegido.

### 4. Ranking sombra e dedupe

`KCFeedRankingPolicy.rankForShadow(posts, options)` existe para avaliacao offline/admin:

- deduplica por `id`, URL canonica ou titulo normalizado;
- calcula score global + score final pessoal quando houver opt-in sintetico;
- aplica diversificacao simples para evitar sequencias longas do mesmo modulo;
- retorna entradas explicaveis, sem alterar posts reais.

Esse metodo nao deve ser ligado ao feed publico antes de existir RPC/cursor compativel.

## Por que isso melhora o desenho anterior

O `highlight_score` atual mistura engajamento bruto, idade e alguns eventos de salvamento. Ele e util como baseline, mas tem limites:

- nao entende janela real de evento;
- nao diferencia evento futuro, em andamento, encerrado e noticia sobre evento passado;
- comentarios e votos entram quase lineares;
- fonte oficial e completude de metadados nao entram de modo explicito;
- nao ha explicacao legivel do score;
- nao ha camada pessoal com consentimento separado.

A nova politica separa:

1. **elegibilidade dura:** pode aparecer no feed ativo ou nao;
2. **score comunitario:** utilidade global para a comunidade;
3. **personalizacao limitada:** gosto do usuario so desempata/ajusta, nao ressuscita item ruim;
4. **explicacao:** componentes e motivos retornam junto do score.

## Estrutura alvo por superficie

| Superficie | Candidatos v2 | Ordenacao v2 proposta |
|---|---|---|
| Home `Destaques` | publicados ativos de todos os modulos | score global v2 + diversidade |
| Home `Recentes` | publicados ativos, salvo filtro de historico | `effective_at` com gate ativo |
| Home `Comentados` | publicados ativos com comentario recente | comentario recente + gate ativo |
| Modulo `eventos` | eventos futuros/em andamento | proximidade temporal + qualidade + fonte + engajamento |
| Modulo `oportunidades` | oportunidades com prazo aberto ou continuas verificadas | prazo aberto + area/tipo + fonte + engajamento |
| Busca | candidatos filtrados por query/schema | relevancia textual/estruturada domina preferencia |
| Recomendados pessoais | candidatos ativos | score global + boost pessoal com teto |

## Fases seguintes

### Fase 2 - avaliacao shadow com dados reais

Sem mudar a UI:

1. coletar uma amostra publica de posts via `KCAPI.getFeedCursor` ou Supabase anon;
2. rodar `KCFeedRankingPolicy.rankForShadow`;
3. comparar topo atual vs topo v2 por modulo;
4. listar posts que seriam excluidos por evento passado, prazo encerrado ou falta de data;
5. revisar manualmente falsos positivos antes de qualquer migration.

Metricas minimas:

- percentual de eventos ativos/futuros no top 20;
- percentual de posts encerrados no top 20 de `Comentados`;
- diversidade por modulo/fonte;
- media de completude dos metadados;
- diferenca de CTR util quando houver experimento futuro.

Evidencia inicial de 2026-07-02: uma amostra publica de 80 posts recentes (`status=published`) retornou 40 eventos e 40 oportunidades. Com a politica em modo shadow, 2 itens de Cadu classificados como `eventos` mas sem `data_evento` foram sinalizados como `needs-review` em vez de ranquearem como evento ativo: "FANUT Conecta" e a lista de subsidio alimentacao da PRPG. Uma inspeção complementar em eventos encontrou o mesmo padrao em noticia do Projeto Rondon/ICB e curso CIAR com inscricao. O padrao confirma a critica de produto: parte do acervo que parece noticia, canal institucional ou inscricao deve ser reclassificada pela pipeline, nao competir com eventos futuros.

Na mesma amostra, as 40 oportunidades foram sinalizadas com `missing-deadline`. Isso nao significa que todas devam sair do feed: significa que a pipeline ainda nao esta preenchendo prazo real (`deadline_at`, `deadline_date`, `data_limite`, `inscricoes_ate`) de forma confiavel. `expires_at` fica como janela generica de publicacao e nao substitui prazo de inscricao.

Comando reproduzivel:

```powershell
npm run benchmark:feed-ranking-shadow -- --limit 80 --rpc-limit 10 --now 2026-07-02T12:00:00.000Z
```

### Fase 3 - normalizacao na pipeline Cadu

A pipeline deve produzir metadados equivalentes ao contrato:

- eventos: `event_start`, `event_end` quando existir, `deadline_at` se houver inscricao;
- oportunidades: `deadline_at`, `oppType`, `area`, `mode`, `source_url`;
- todos: `source_url`, `source_label`, `source_verified` quando a fonte for oficial;
- eventos passados/noticias: nao publicar como `eventos` ativos; enviar para revisao ou outro tipo editorial.

### Fase 4 - RPC v2 aditiva

Criar uma RPC nova, sem substituir a atual:

```sql
kc_get_feed_cursor_v2(
  p_modules text[],
  p_sort_by text default 'destaques_v2',
  p_active_only boolean default true,
  p_limit integer default 20,
  p_cursor jsonb default null
)
```

Regras:

- manter RLS/`kc_can_read_post`;
- calcular janela ativa no banco ou usar colunas normalizadas;
- cursor precisa incluir todos os criterios de ordenacao do v2;
- `votos`, `recentes` e `comentados` legados continuam disponiveis ate comparacao;
- fallback automatico para `kc_get_feed_cursor` se a RPC v2 falhar.

### Fase 5 - UI e transparencia

So depois de prova shadow:

- adicionar filtro `Ativos` / `Historico` em `Recentes` e `Comentados`;
- criar "Por que estou vendo?" no card/detalhe;
- criar modo "Ordem padrao" e "Para voce" explicitamente separados;
- criar painel de preferencias de feed, separado da busca e de analytics;
- permitir reset/exportacao/exclusao das preferencias.

## Gatilhos de No-Go

Nao avancar para producao se ocorrer qualquer item abaixo:

- cliente reordenando paginas cursor-paginadas;
- personalizacao sem consentimento proprio;
- evento expirado subindo por engajamento;
- `closed` no topo de feed ativo;
- score sem explicacao ou sem teste de teto pessoal;
- migration que substitui `kc_get_feed_cursor` sem RPC paralela e rollback;
- uso de dados sensiveis, mensagens privadas, denuncias ou localizacao exata como preferencia.

## Evidencia de teste

Comando executado em 2026-07-02:

```powershell
npm test -- tests/unit/kc-feed-ranking-policy.test.js tests/unit/kc-feed-tabs-personalized.test.js tests/integration/home-categories.shared.test.js --runInBand
```

Resultado: 3 suites, 15 testes, todos passando.

## Relacao com documentos existentes

- Auditoria base: `docs/architecture/feed-ranking-recommendation-audit-2026-07-02.md`.
- Plano de busca/personalizacao que serviu de referencia de privacidade: `docs/planning/v76-search-personalization-architecture-plan.md`.
- Contratos de feed/cache: `docs/architecture/content-cache-freshness-map.md`.
- Catalogo RPC atual: `docs/rpc-catalog.md`.
