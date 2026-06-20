# V76.32 — Plano de busca orientada ao schema e personalização responsável

**Data:** 2026-06-19  
**Estado:** execução incremental; piloto V76.39 disponível sob duas flags desligadas

**Escopo:** `/search-results.html`, `kcSearchDropdown`, campos de criação, perfil de preferências, ranking e governança  
**Fora do gate V76.39:** HTML, CSS, SQL, migrations, providers, secrets, deploy e alteração de dados reais

> **Execução V76.33 (2026-06-19):** a Fase 0/PR-A foi materializada em
> `assets/js/shared/kc-search-fields.shared.js`, ainda sem carregamento por HTML.
> O contrato deriva módulos, grupos, opções e campos condicionais do schema/builder
> de criação; políticas manuais ficam limitadas a operadores, paths e privacidade.
> O corpus sintético `tests/fixtures/search-golden-queries.v1.json` contém 18
> consultas, três por módulo. O próximo candidato passa a ser PR-B, projeção local
> atrás de flag, sem personalização e sem SQL.

> **Execução V76.34 (2026-06-20):** PR-B implementa a projeção no driver local
> sob `search.schemaFields=false`. O projetor exclui campos restritos, anexa um
> documento imutável e o ranking compartilhado só o considera quando presente.
> A ativação por HTML, parser de intenção, facetas e Supabase continuam bloqueados.

> **Execução V76.35 (2026-06-20):** PR-C adiciona parser determinístico offline,
> sem carregamento por HTML. O corpus principal atingiu 18/18 em módulo, intenção
> e filtros; 22/22 variantes preservaram módulo e intenção. Entrada desconhecida
> não recebe classificação forçada e consultas são limitadas a 240 caracteres.

> **Execução V76.36 (2026-06-20):** PR-D combina parser, registro, projeção e busca
> compartilhada em pipeline shadow offline. A comparação não contém consulta crua,
> contato, link ou conteúdo; filtros não suportados são explicitados e o asset segue
> fora dos HTMLs, sem alterar resultado público, perfil, analytics ou Supabase.

> **Execução V76.37 (2026-06-20):** PR-E aplica intenções canônicas dos grupos,
> semântica temporal de eventos e políticas distintas de encerramento para resultados
> e dropdown. O benchmark sintético cobre dois cenários por módulo e atingiu 12/12,
> recall/precisão/estabilidade de 100% e zero falso positivo. Data de carona e status
> de inscrição permanecem diferidos porque o schema não oferece campo confiável.

> **Execução V76.38 (2026-06-20):** PR-F gera snapshot UMD imutável do registry,
> com hash dos três arquivos-fonte e gate de paridade no `check:all`. `kc-search.js`
> prepara lazy loading sequencial, idempotente e fail-safe sob a nova flag
> `search.structuredRuntime=false`. No estado canônico há zero requisição adicional;
> mesmo com a flag ligada, o pipeline ainda não altera resultados.

> **Execução V76.39 (2026-06-20):** PR-G.1 conecta o pipeline a resultados e
> dropdown somente quando `search.structuredRuntime` e `search.structuredPilot`
> estão ligadas. Sinal estruturado é obrigatório; IDs inconsistentes ou qualquer
> falha restauram a lista legada. E2E confirma rede zero nos defaults e os quatro
> assets locais, dropdown funcional e ausência de erros quando o piloto é ativado.

## 1. Decisão executiva

O KinoCampus deve evoluir a busca em duas trilhas separadas e sequenciais:

1. **Busca orientada ao schema:** compreender os campos estruturados que os seis módulos já coletam, interpretar intenção em português e aplicar filtros/ranking verificáveis.
2. **Personalização responsável:** combinar preferências explícitas e, somente com finalidade própria habilitada, sinais comportamentais mínimos, revogáveis e com influência limitada.

Não há autorização para implantar um modelo opaco ou treinar em todo dado disponível. A consulta e os filtros explícitos continuam dominando a relevância. Perfil acadêmico é contexto opcional; gênero, raça/cor e outros atributos sensíveis jamais entram em busca, recomendação, segmentação ou experimentos.

`Persona` será ferramenta de projeto e QA, não rótulo persistido sobre uma pessoa. O perfil computacional deve ser individual, baseado em características declaradas e afinidades específicas, com origem, confiança, validade e opção de remoção.

## 2. Estado atual auditado

### 2.1 Superfícies e ranking

- `/search-results.html` oferece consulta, seis filtros de módulo, ordenação por relevância/recência/engajamento e opção de ocultar encerrados.
- `assets/js/features/kc-search.js` atende a página e o `kcSearchDropdown`, usa `KCAPI.searchPosts` quando disponível e fallback local.
- O dropdown retorna até oito posts e usa `role="listbox"`, mas ainda não implementa o contrato completo de combobox, navegação por teclado, cancelamento de resposta obsoleta ou sugestões por intenção.
- A telemetria de busca depende de `KCConsent.hasConsent('analytics')` e grava termos em `search_queries`.
- O fallback em `KCSearchShared` normaliza acentos, expande sinônimos, aplica similaridade fuzzy e pontua título, descrição, categoria, subcategoria e tags.
- O RPC `kc_search_posts_fts` usa PostgreSQL FTS, `ts_rank_cd` e `pg_trgm`, também centrado nesses campos.
- A busca não interpreta preço, orçamento, gratuidade, datas, horário, origem/destino, vagas, região, modalidade de trabalho, regime, área, condição ou outros campos do formulário.
- A busca não é personalizada hoje. A afinidade existente é da home/abas, não do ranking de consulta.

### 2.2 Perfil e afinidade existentes

- `profiles` aceita afiliação opcional: graduação, pós-graduação, docente, técnico/servidor, egresso, intercambista, pesquisador visitante, outro vínculo UFG e “prefiro não dizer”.
- O perfil também possui campos de gênero e raça/cor. Eles são proibidos para personalização.
- Não existe catálogo canônico de câmpus, curso/programa ou interesses acadêmicos associado às preferências de busca.
- `home_category_affinity` e `kc_get_personalized_tabs` registram afinidade por usuário/sessão. Esse mecanismo não deve ser reutilizado automaticamente como consentimento para busca personalizada.

## 3. Contrato entre criação e busca

A primeira entrega funcional deve criar um contrato único entre `kc-create-group`/`kc-create-fields` e o índice. Hoje o conteúdo existe, mas grande parte dele não é recuperável de modo estruturado.

| Módulo | Intenções e campos a projetar no índice |
|---|---|
| Compra e venda | vendo/compro, categoria, preço/orçamento, condição, localização |
| Caronas | ofereço/procuro, origem, destino, horário, contribuição, vagas, marcadores |
| Moradia | tipo, região/zona, preço/orçamento, referência, detalhes, marcadores |
| Eventos | subtópico, local, início/fim, horário, inscrição, gratuito/preço |
| Achados e perdidos | perdido/encontrado, tipo, local, recompensa, retirada/entrega |
| Oportunidades | tipo, área, modalidade, regime, cidade/câmpus, remuneração, inscrição |

### 3.1 Registro canônico proposto

Criar `KCSearchFieldRegistry`, derivado do schema de criação e não duplicado em controllers. Para cada campo, registrar:

- chave canônica e chaves legadas;
- módulo, tipo e operadores permitidos;
- label e aliases em português;
- normalizador e representação local/Supabase;
- permissão de indexar, exibir, filtrar, agregar e usar em preferência;
- classificação de privacidade e regra de expiração.

O registro deve gerar ou validar três projeções equivalentes: documento textual FTS/fuzzy, campos estruturados e facetas da página. É `No-Go` criar taxonomia exclusiva do dropdown ou copiar listas para SQL sem teste de paridade.

## 4. Corpus dourado de consultas

O conjunto inicial deve conter, no mínimo:

- `quarto até 900 perto do samambaia`;
- `república feminina setor universitário`;
- `carona samambaia centro amanhã 18h`;
- `procuro carona para cidade de goiás sexta`;
- `estágio remoto computação`;
- `bolsa pesquisa pós graduação`;
- `evento gratuito sábado campus colemar`;
- `workshop inscrições abertas`;
- `carteira perdida biblioteca`;
- `achei documento bloco b`;
- `notebook usado até 2000`;
- `procuro livro de cálculo`.

Cada consulta precisa de julgamentos de relevância por níveis, filtros esperados, resultado proibido e variantes com acento, abreviação, erro de digitação e alias. O corpus não pode conter mensagens privadas, contato, denúncias ou texto sensível real.

## 5. Arquitetura-alvo

```text
consulta + filtros + contexto permitido
        -> normalização e parser de intenção
        -> candidatos (FTS + trigram + campos estruturados)
        -> visibilidade, segurança e validade
        -> ranking lexical/estruturado
        -> reranking pessoal limitado e opt-in
        -> diversidade, exploração e explicação
        -> dropdown / página de resultados
```

### 5.1 Parser de intenção

O parser produz objeto auditável e nunca SQL montado a partir de texto:

```json
{
  "text": "quarto",
  "module": "moradia",
  "intent": "procurando",
  "filters": { "priceMax": 900, "locationAliases": ["campus-samambaia"] },
  "temporal": null,
  "confidence": 0.86
}
```

Operadores iniciais: módulo, categoria/subcategoria, ação, faixa de preço, gratuidade, local/câmpus/região, data relativa/intervalo, horário, origem/destino, modalidade, regime, área, condição e disponibilidade. Em baixa confiança, conservar o termo na busca textual e sugerir o filtro; não restringir silenciosamente.

### 5.2 Recuperação

- Preservar PostgreSQL FTS + `unaccent` + `pg_trgm` como primeira camada.
- Adicionar projeção estruturada por migration aditiva, com índices medidos em banco isolado.
- Manter paridade determinística no driver local.
- Aplicar visibilidade, expiração, bloqueio/moderação e autorização antes do reranking.
- Não adicionar embeddings, busca vetorial ou modelo generativo na fase inicial.

### 5.3 Ranking inicial

Os pesos são hipótese de experimento offline, não constantes aprovadas:

| Família de sinal | Faixa inicial |
|---|---:|
| correspondência lexical e frase | 45–60% |
| intenção/campos estruturados | 20–30% |
| validade temporal e recência | 8–15% |
| qualidade/confiabilidade do conteúdo | 5–10% |
| preferência explícita | 0–7% |
| afinidade comportamental | 0–5% |
| diversidade/exploração | ajuste final de 0–5% |

Regras:

- consulta exata e filtros explícitos não podem ser vencidos pelo perfil;
- personalização em busca terá teto inicial de 10–15% e será zero quando desligada;
- descoberta sem consulta usa endpoint e métricas separados;
- engajamento bruto requer saturação, correção por idade e limite por autor;
- conteúdo expirado, privado, bloqueado ou moderado é exclusão dura;
- resultados carregam fatores de explicação sem revelar sinais privados.

### 5.4 Zero resultados

Aplicar escada visível: exato; correção/aliases; ampliação de data/local; remoção sugerida de um filtro; relacionados em seção separada; e, futuramente, busca salva com consentimento. Nunca misturar resultados relaxados ao conjunto exato sem rótulo.

## 6. `kcSearchDropdown`

- debounce de 120–180 ms e cancelamento com `AbortController`;
- `requestId` para impedir resposta antiga de alterar o DOM;
- até oito itens, agrupando intenção, resultados e “ver todos” quando útil;
- destaque seguro da correspondência;
- módulo e um atributo contextual, como preço, data, rota ou modalidade;
- histórico/recentes somente com finalidade Personalização habilitada;
- cache curto segregado por modo personalizado/não personalizado;
- meta inicial de p95 percebido até 200 ms em cache, com orçamento separado para rede fria.

### 6.1 Acessibilidade

Implementar WAI-ARIA combobox: input com `role="combobox"`, `aria-autocomplete`, `aria-controls`, `aria-expanded` e `aria-activedescendant`; lista/opções com IDs estáveis; setas, Enter, Escape e Tab; foco visível; região viva para estado/quantidade; sem armadilha de foco ou dependência de hover.

## 7. `/search-results.html`

- facetas geradas pelo registro e variáveis por módulo;
- URL como fonte compartilhável do estado, sem perfil/identificador;
- ordenações `Mais relevantes`, `Mais recentes` e `Para você` explícita;
- chips removíveis dos filtros interpretados;
- explicações como “corresponde a remoto + tecnologia” ou “até R$ 900”;
- paginação/cursor estável e aviso de personalização;
- ação “usar resultados sem personalização” no contexto;
- preservar política SEO/noindex da rota e evitar combinações infinitas indexáveis.

## 8. Perfis de uso: personas de QA, não segmentos persistidos

| Grupo | Necessidade | Risco a evitar |
|---|---|---|
| Graduação | materiais, moradia, caronas, eventos, estágio | presumir curso/câmpus ou expor rotina |
| Pós-graduação | pesquisa, bolsas, eventos científicos | confundir vínculo com interesse permanente |
| Docentes | eventos, pesquisa, oportunidades | ranquear cargo como “mais importante” |
| Técnicos/servidores | mobilidade, eventos e comunidade | inferir local de trabalho/jornada |
| Egressos | eventos, oportunidades e comunidade | manter vínculo desatualizado |
| Intercambistas/visitantes | linguagem clara, locais, eventos | depender de jargão local |
| Comunidade externa/outras IES | conteúdo público permitido | vazar conteúdo restrito |
| Organizadores autorizados | publicar e alcançar interesse | segmentação invasiva |
| Anônimo/curioso | busca pública sem cadastro | perfil durável por padrão |
| Robô legítimo | conteúdo público determinístico | criar afinidade |
| Bot abusivo/scraper | nenhuma preferência | poluir métricas/causar carga |

### 8.1 Câmpus e localidades

A UFG informa presença em Goiânia, Caldas Novas, Firminópolis, Aparecida de Goiânia, Cidade Ocidental e Cidade de Goiás e lista os câmpus Cidade de Goiás, Cidade Ocidental, Colemar Natal e Silva, Samambaia e Aparecida. Criar catálogo versionado `academic_locations`, com ID, nome oficial, aliases, cidade, tipo e vigência. Não codificar enum fechado. Local exato e trajetória não serão coletados.

## 9. Preferência individual

| Camada | Exemplos | Origem | Regra |
|---|---|---|---|
| explícita | módulos, temas, câmpus de interesse, preço, remoto | usuário | maior peso, editável/exportável |
| contextual | consulta, filtros, página, horário aproximado | requisição | efêmera; não vira perfil automaticamente |
| comportamental | salvar, abrir utilmente, ocultar, recorrência | opt-in | agregada, decaída, removível |
| operacional | visibilidade, moderação, expiração, bloqueio | sistema | regra dura, não preferência |

Vínculo acadêmico não implica interesse. Câmpus/curso/programa e interesses são independentes e opcionais, sempre com “prefiro não informar”.

### 9.1 Sinais permitidos

- interesse explicitamente selecionado;
- busca e filtro aplicados;
- salvar/seguir conteúdo ou busca;
- abertura com tempo mínimo somente após aprovação da medição;
- contato/inscrição como evento binário, sem destinatário/conteúdo;
- ocultar, “não tenho interesse” e limpar histórico.

Impressão isolada não cria afinidade. Clique acidental tem peso baixo. Todo sinal comportamental decai e tem limite por origem.

### 9.2 Dados proibidos

- gênero, identidade de gênero, raça/cor, deficiência/saúde, religião, política e orientação sexual;
- mensagens privadas, contato, denúncias, ajuda e moderação;
- endereço/local exato, trajetória, IP/user-agent brutos, tokens e credenciais;
- inferência de atributo protegido por curso, texto, local ou comportamento;
- score de valor, empregabilidade, risco, influência ou “qualidade” da pessoa;
- exportação de perfis para anúncios ou terceiros.

## 10. Consentimento, transparência e direitos

Criar finalidade **Personalização** separada de **Analytics** e documentar a base legal antes da migration.

- afinidade comportamental nova desligada por padrão;
- preferências explícitas salvas após ação inequívoca;
- modo local/não personalizado para anônimo;
- sincronização com conta somente após opt-in;
- revogação interrompe uso e agenda exclusão/anonimização;
- “Por que estou vendo isto?” mostra sinais compreensíveis;
- titular pode ver, corrigir, exportar, limpar e desligar;
- decisões automatizadas relevantes têm canal de revisão;
- versão, fonte e instante do consentimento são auditáveis, sem copiar query para esse log.

Antes de produção, preencher teste de finalidade, necessidade, balanceamento e salvaguardas conforme a ANPD. Perfilamento em escala ou alto risco exige gate de RIPD e revisão jurídica independente.

## 11. Modelo de dados proposto

| Objeto provisório | Finalidade | Retenção proposta |
|---|---|---|
| `search_content_projection` | texto + campos normalizados do post | vida do post |
| `academic_locations` | catálogo público versionado | histórico versionado |
| `user_preference_profile` | escolhas explícitas/finalidade | até alteração/exclusão |
| `user_interest_affinity` | afinidade agregada por feature | decaimento; poda até 180 dias |
| `personalization_events` | eventos mínimos | hipótese de 90 dias |
| `search_impressions` | amostra de avaliação | opt-in; até 90 dias |
| `recommendation_experiments` | configuração/agregados | até 180 dias |

Prazos são propostas, não autorização. Tabelas pessoais exigem RLS, `security invoker` por padrão, RPC mínima, `search_path=''`, grants explícitos, export/delete e teste contra acesso cruzado.

Cada afinidade deve registrar `feature_key`, `source`, `score`, `confidence`, `first_seen_at`, `updated_at`, `expires_at`, `purpose_version` e `is_explicit`. Não guardar query bruta em tabela de perfil.

## 12. Bots, abuso, diversidade e equidade

- crawlers recebem busca pública, determinística e não personalizada;
- automação não cria afinidade;
- rate limit, orçamento de consulta, tamanho máximo e timeout;
- impedir enumeração privada/moderada por diferença de resposta;
- telemetria de segurança separada de preferência;
- falha de personalização degrada para ranking comum;
- limitar concentração por autor e repetição;
- medir módulos, localidades, cauda longa, novidade e conteúdo novo;
- exploração pequena apenas para conteúdo elegível;
- não produzir dashboards de microcoortes;
- moderação/confiança independentes do engajamento.

O viés de popularidade tende a sobre-expor itens populares mesmo quando não correspondem ao interesse. A mitigação deve existir no baseline.

## 13. Métricas

### Offline

- `NDCG@10`, `MRR`, `Recall@20`;
- precisão da intenção por operador;
- paridade local/Supabase e estabilidade com acento/erro/alias;
- zero-result rate, relaxamento e cobertura de campos;
- nenhuma violação de visibilidade.

### Produção controlada

- p50/p95/p99 de dropdown, resultados e RPC;
- clique útil, salvamento/contato permitido, reformulação e abandono;
- diversidade, novidade, cauda longa e concentração por autor;
- resultados com explicação válida;
- desligamento/limpeza e cumprimento de exclusão;
- denúncias, ocultações, erros, timeouts e fallback.

CTR isolada não é objetivo. Experimento só avança se melhorar relevância sem piorar privacidade, segurança, latência, diversidade ou conteúdo problemático.

## 14. Execução por fases

### Fase 0 — contrato e governança

Congelar campos/aliases/corpus; mapear finalidade/base legal/retenção/direitos; decidir consentimento/revogação; threat model/RIPD gate; baseline de qualidade/latência; flags e kill switches.

**Go:** corpus revisado, dados proibidos testados e rollback escrito.  
**No-Go:** reutilizar analytics como consentimento implícito ou iniciar coleta.

### Fase 1 — índice orientado ao schema, sem personalização

Introduzir `KCSearchFieldRegistry`; testar paridade com criação/metadata; projetar campos local/banco isolado; migration aditiva; comparar em shadow; flag `KC_SEARCH_SCHEMA_FIELDS`.

### Fase 2 — intenção, facetas e dropdown

Parser determinístico, filtros visíveis, facetas, combobox, cancelamento, cache, zero-results e explicações; flag `KC_SEARCH_QUERY_PLANNER`.

### Fase 3 — preferências explícitas

UI opcional, finalidade Personalização, exportação/exclusão e reranking explícito com teto. Sem comportamento.

### Fase 4 — afinidade local opt-in

Sinais mínimos no navegador, decaimento e limpeza. Sem sincronização automática; teste de dispositivo compartilhado; flag `KC_SEARCH_PERSONALIZATION`.

### Fase 5 — sincronização opt-in

Tabelas/RLS/RPC após banco isolado; migração explícita local→conta; pruning/export/delete; A/B controlado.

### Fase 6 — aprendizado/exploração

Contextual bandit, learning-to-rank, embeddings ou rede neural somente após volume, rótulos, revisão de viés, observabilidade, custo e rollback. Dois estágios é referência, não justificativa para deep learning agora.

## 15. Flags e rollback

| Flag | Unidade | Falha segura |
|---|---|---|
| `KC_SEARCH_SCHEMA_FIELDS` | índice estruturado | busca atual |
| `KC_SEARCH_QUERY_PLANNER` | parser/facetas | texto atual |
| `KC_SEARCH_PERSONALIZATION` | reranking opt-in | score pessoal zero |
| `KC_SEARCH_EXPLORATION` | diversidade experimental | ordem determinística |

Rollout: canário interno, percentual pequeno e expansão por gate; migration aditiva; RPC/índice anterior preservado; kill switch sem deploy; backfill idempotente/paginado; rollback de personalização interrompe coleta e limpa fila local; nunca restaurar dado pessoal já excluído.

## 16. Matriz mínima de testes

| Camada | Cobertura |
|---|---|
| schema | todos os campos/opções mapeados uma vez |
| parser | acento, typo, alias, negação, faixa, data e baixa confiança |
| ranking | consulta domina preferência, saturação e desempate |
| drivers | fixtures idênticas local/Supabase isolado |
| SQL/RLS | grants, acesso cruzado, exclusão, timeout e explain |
| privacidade | opt-in/out, revogação, export/delete e dado proibido |
| a11y | teclado, foco, screen reader, vazio/erro/loading |
| E2E | dropdown→resultados→filtro→detalhe; desktop/mobile |
| desempenho | concorrência, resposta obsoleta, cache, p95/p99 |
| abuso/equidade | rate limit, bots, moderação, concentração e diversidade |

## 17. Manifesto de PRs

1. **PR-A — executado:** registro, inventário gerado, golden set e testes; sem SQL.
2. **PR-B — executado:** projeção/filtros no driver local; sem personalização.
3. **PR-C — executado:** parser determinístico offline; sem ativação.
4. **PR-D — executado:** composição shadow e saída sanitizada.
5. **PR-E — executado:** intenção, tempo/status e benchmark sintético por módulo.
6. **PR-F — executado:** snapshot gerado do registry e lazy loading sob flag desligada.
7. **PR-G.1 — executado:** piloto em busca/dropdown sob duas flags, com fallback integral para o legado.
8. **PR-G.2:** chips removíveis, facetas e zero-results sob as mesmas flags.
9. **PR-H:** dossiê SQL/RPC isolado, RLS, explain e rollback R3.
10. **PR-I:** dropdown combobox, cancelamento e performance real.
11. **PR-J:** preferências explícitas, consentimento e direitos.
12. **PR-K:** afinidade local opt-in; sincronização somente após gates.

Não misturar migration, perfil, ranking e redesign no mesmo PR.

## 18. Registro de decisões

| ID | Decisão |
|---|---|
| SEARCH-PERS-01 | schema-aware antes de personalização |
| SEARCH-PERS-02 | personas somente para projeto/QA |
| SEARCH-PERS-03 | consulta e filtros dominam o ranking |
| SEARCH-PERS-04 | Personalização separada de Analytics |
| SEARCH-PERS-05 | atributos sensíveis e inferidos são proibidos |
| SEARCH-PERS-06 | FTS/trigram antes de modelos complexos |
| SEARCH-PERS-07 | vetor/deep learning/bandit em No-Go inicial |
| SEARCH-PERS-08 | câmpus em catálogo versionado |
| SEARCH-PERS-09 | explicação e modo não personalizado |
| SEARCH-PERS-10 | nenhuma mudança runtime na V76.32 |

## 19. Fontes primárias

### Privacidade e governança

- [LGPD — Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm): princípios, dados sensíveis, direitos e decisões automatizadas.
- [ANPD — Guia sobre legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse): finalidade, necessidade, balanceamento e salvaguardas.
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) e [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework): gestão de risco.

### Busca e acessibilidade

- [PostgreSQL — Text Search Controls](https://www.postgresql.org/docs/current/textsearch-controls.html) e [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html).
- [WAI-ARIA APG — Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

### Recomendação e ranking

- [Deep Neural Networks for YouTube Recommendations](https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/): candidatos + ranking.
- [Wide & Deep Learning](https://research.google/pubs/wide-deep-learning-for-recommender-systems/): memorização/generalização.
- [Contextual-bandit news recommendation](https://www.microsoft.com/en-us/research/publication/a-contextual-bandit-approach-to-personalized-news-article-recommendation-3/): referência para fase madura.
- [The Unfairness of Popularity Bias](https://arxiv.org/abs/1907.13286): exposição e cauda longa.
- [Deep Learning Recommendation Model](https://arxiv.org/abs/1906.00091): custo de modelos categóricos.

### Contexto institucional

- [UFG — Câmpus](https://ufg.br/p/27153-campus): cidades, câmpus e escala; atualizada em 17/06/2026.

## 20. Próxima ação segura

Executar **PR-G.2** sem migration: expor os filtros interpretados como chips
removíveis, facetas coerentes e zero-results explicável somente quando
`search.structuredRuntime=true` e `search.structuredPilot=true`. O piloto V76.39
já integra `/search-results.html` e `kcSearchDropdown`, preserva o retorno legado
em qualquer falha e mantém rede zero com as flags desligadas. Coleta comportamental,
perfil, SQL pessoal e reranking seguem bloqueados.
