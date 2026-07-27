# Auditoria dos estágios Cadu e deduplicação global — 2026-07-27

## Escopo e fontes de evidência

Esta auditoria confronta o painel `/admin/cadu.html`, o código implantado no
OpenClaw, o `cadu-api`, os relatórios de execução e o estado publicado no
Supabase. Documentos antigos foram tratados como histórico, não como fonte de
verdade.

Fontes observadas:

- OpenClaw `main` no commit
  `2b0ca22cdd9751521234b60f191550f009d90e5d`;
- `cadu-api` 0.5.11 saudável no VPS;
- preflight profundo autenticado dos nove estágios;
- run completa `b6c75272-ab61-4584-b06c-f45036ecc921`;
- simulações globais `5eaadbbb-fa13-4d15-882a-ea24d3596182` e
  `dfc30e45-7e39-444c-af24-de971446f941`;
- relatório JSON schema 2 ligado ao run `dfc30e45`;
- consultas read-only aos posts ativos no Supabase;
- testes locais e CI dos repositórios OpenClaw e KinoCampus.

## Estado executável dos nove estágios

Em 2026-07-27, o preflight profundo retornou:

- `total=9`;
- `runnable=9`;
- `blocked=0`;
- `with_warnings=0`.

| Estágio | Comando efetivo padrão | Escrita possível | Dependências principais | Estado |
|---|---|---:|---|---|
| `curator` | `pipeline-kino.js --stage=curator` | artefato/caches | Node, Supabase | executável |
| `ig` | `scan-ig-browser.js` | artefato/cursor conforme modo | Node, Chrome/CDP | executável |
| `duplicates` | `pipeline-kino.js --stage=duplicates` | posts existentes no modo real | Supabase, login Kino, `_truly_new` válido | executável |
| `format` | `pipeline-kino.js --stage=format` | `_formatted` | DeepSeek, `_truly_new` válido | executável |
| `publish` | `pipeline-kino.js --stage=publish` | criação/merge de posts | Supabase, login Kino, `_formatted` válido | executável |
| `enrich` | `enrich-images.js --from-recent 20` | mídia/metadados | Supabase, login Kino | executável |
| `dedup` | `dedup-kino.js --all-active --report --no-auto-close --emit-cadu-markers --dry-run` | nenhuma no padrão; `hidden`/flags no modo real | Supabase, login Kino, IA opcional | executável |
| `sigaa` | `sigaa/sync_calendar.js` | Google Agenda | SIGAA, Calendar, CapSolver | executável |
| `all` | `pipeline-kino.js` com sete `--stage` e `--full` | pipeline completa | Node, Supabase, login Kino, IA, CDP | executável |

O campo `node:unchecked` ainda aparece no preflight, mas
`node_dependencies:ok` importou os entrypoints no runtime. Não foi encontrado
bloqueio de dependência.

## Run completa B6C75-272

Identificador completo:
`b6c75272-ab61-4584-b06c-f45036ecc921`.

Resultado confirmado pelo `cadu-api`:

- status terminal e efetivo: `success`;
- execução real, `exit_code=0`;
- duração: `2.106,5 s` (35 min 6,5 s);
- 157 fontes configuradas e 142 tentadas;
- 3.405 itens coletados;
- 26 candidatos do Curador;
- 1 item já persistido;
- 25 itens realmente novos;
- 17 enviados para revisão de qualidade;
- 8 avaliados pelo publisher;
- 1 post criado;
- 7 posts mesclados;
- 8 persistências no total;
- 8 posts atualizados pelo enriquecimento de duplicatas;
- 1 post recebeu imagem complementar;
- dedup inline: 58 posts recentes, 4 candidatos textuais, 2 pares de imagem
  similar e zero pares enviados à IA.

### Instagram no run

- 76 perfis esperados;
- 75 coletados;
- uma falha;
- 1.025 posts únicos;
- 442 ocorrências relevantes únicas;
- 72 detalhes solicitados, 71 prontos e um parcial;
- 953 detalhes adiados pelo limite deliberado de hidratação.

A falha de `@praeufg` foi degradada para leitura durável da grade, que ainda
entregou seis posts. Não há evidência de perfil ausente ou de colapso geral do
scanner.

### Conclusão sobre a pipeline completa

A pipeline completa está funcional. O baixo número de posts criados não
representa falha: sete dos oito itens avaliados foram absorvidos por merge. O
gargalo dominante foi a coleta:

- Instagram: aproximadamente 711 s;
- Curador full: aproximadamente 1.065 s;
- formatação: aproximadamente 147 s.

O ETA implantado de 1.500 s ainda pode ser excedido em runs com hidratação
Instagram ampla. O painel deve mostrar duração real e não tratar o ETA como
prazo garantido.

## Deduplicação global

### Escopo

O estágio isolado não reutiliza o lookback de sete dias da pipeline completa.
Ele lê todos os posts com `status=published` e executa:

1. URL canônica, slug Weby e similaridade textual;
2. hash byte a byte da imagem;
3. pHash perceptual;
4. política determinística de identidade e conflitos;
5. IA somente nos pares ambíguos restantes;
6. relatório por run;
7. no modo real, `status=hidden` ou flag de revisão, nunca exclusão física.

O dedup inline da pipeline completa permanece separado:

```text
--no-llm --days=7 --auto-apply
```

Ele não recebe `--emit-cadu-markers`; assim, o resultado do processo filho não
sobrescreve o resultado estruturado da pipeline completa.

### Guardrails confirmados

- imagem idêntica, isoladamente, não autoriza ocultação;
- URL idêntica exige corroboração adicional;
- conflito de data, edição, programa, curso, processo ou ciclo de vida bloqueia
  ocultação;
- IA não escolhe o post canônico;
- o post mais antigo é preservado quando a identidade foi confirmada;
- o post ocultado recebe `merged_into_post_id`, método e evidências;
- execução padrão no Admin é simulação;
- execução real não executa auto-close;
- não existe hard delete nesse estágio.

### Correção do vínculo simulação → aplicação

As runs `ab28086c-d7c4-48a3-8a34-0dc7a2098d05` (simulação) e
`51ae52ed-31ae-45d3-a2a7-5cb494e23971` (real) usaram os mesmos 137 posts e
três pares semânticos. Ainda assim, uma nova inferência mudou a recomendação
do par CASLE de `hide_a` para `manter_ambos`. A execução real aplicou zero
hides, portanto não houve perda de conteúdo, mas ficou comprovado que o botão
real recalculava a proposta.

No cadu-api 0.5.14, a execução real isolada:

1. exige `--apply-latest-preview`;
2. aceita somente prévia dry-run com até 30 minutos;
3. compara SHA-256 do snapshot dos posts;
4. exige os mesmos pares e decisões semânticas;
5. compara SHA-256 do plano completo de ações;
6. relê o feed imediatamente antes da primeira escrita;
7. falha sem mutação se qualquer contrato divergir.

O dedup inline da pipeline completa continua
`--no-llm --days=7 --auto-apply` e não depende dessa prévia.

### Correção do contrato de datas

O artefato formatado do caso CASLE continha
`dates.applicationDeadline=2026-07-24`, mas a Edge Function ignorava esse
campo e podia extrair `2026-08-13`, data final das provas, como prazo de
inscrição. O mapper agora:

- prioriza `applicationDeadline` para oportunidades;
- prioriza `eventStartsAt`/`eventEndsAt` para eventos;
- preserva somente datas semânticas válidas em `metadata.dates`;
- bloqueia `applicationDeadline` tipado já vencido com
  `application_deadline_past`, sem reendurecer a heurística textual genérica;
- mantém aliases e fallbacks legados quando os campos tipados não existem.

Os dois posts CASLE já expirados foram encerrados, sem exclusão, pelo RPC
autenticado `kc_close_post`, com razão
`prazo_inscricao_encerrado_2026-07-24`.

### Validação após o deploy

O cadu-api 0.5.14 foi promovido pelo sincronizador oficial do VPS. O par de
runs abaixo validou o contrato:

| Modo | Run | IA | Prévia reutilizada | Resultado |
|---|---|---:|---:|---|
| Simulação | `eee06899-a327-40e9-b23a-e31807d72e0b` | 2 pares | 0 | 0 hides, 3 revisões planejadas |
| Real | `471755f2-126b-4fea-95a0-13f56cbc952a` | 0 pares | 1 | 0 hides, 3 flags, 0 falhas |

Os dois relatórios contêm 135 posts, os mesmos dois pares semânticos, snapshot
`799901ac854abe8c8bb0e47a34f3f3170717f3f51901725d73c995ae8aeb4a9f` e
plano `f4af1df197176ba9ad598903c55e2047ac0c00ad530925ee7b8493622508f00d`.
A releitura imediatamente anterior à escrita produziu o mesmo snapshot.

## Simulação global `dfc30e45`

Run:
`dfc30e45-7e39-444c-af24-de971446f941`.

Resultado:

- `status=finished`;
- `effective_status=success`;
- `outcome_status=success`;
- etapa estruturada `dedup`, `required=true`, `exit_code=0`;
- duração medida pelo estágio: `99.487 ms`;
- relatório schema 2 com 191.211 bytes;
- relatório marcado como `produced_during_run=true` e `stale_for_run=false`;
- nenhum write no Supabase.

Métricas:

| Métrica | Valor |
|---|---:|
| Posts ativos analisados | 137 |
| Candidatos textuais | 36 |
| Grupos de imagem byte a byte idêntica | 1 |
| Pares de imagem perceptualmente similar | 7 |
| Capas institucionais suspeitas | 0 |
| Pares elegíveis após filtros | 2 |
| Pares avaliados pela IA | 2 |
| Ocultações planejadas | 0 |
| Revisões planejadas | 4 |

Seleção semântica:

- 12 pares únicos foram considerados;
- 10 foram excluídos por conflito determinístico;
- 30 candidatos textuais ficaram abaixo do limiar;
- nenhum candidato determinístico de auto-hide consumiu tokens;
- não houve truncamento do lote de IA.

## O que parecia duplicata, mas não era

As quatro publicações SRI abaixo têm cursos, shortcodes e prazos diferentes:

- Compreensão oral — estratégias, prazo 30/07;
- Estratégias de leitura, prazo 31/07;
- Compreensão oral — palestras e aulas, prazo 31/07;
- Comunicação intercultural, prazo 30/07.

Elas compartilham os mesmos bytes de uma capa de “defeso eleitoral”. Isso é um
erro de capa, não prova de duplicidade textual. A política correta foi manter
todos os posts e gerar revisão.

Os posts do 20º SNHCT também são complementares: programação geral, abertura,
lançamentos e atividades específicas. Mesma identidade visual de campanha não
significa mesmo post.

## Estado read-only dos posts ativos

Na leitura auditada de 137 posts publicados:

- zero grupos de título normalizado exatamente igual;
- zero grupos de descrição com hash exatamente igual;
- zero grupos de URL de origem exatamente igual;
- zero URLs de imagem exatamente iguais.

O último item não contradiz o grupo de imagem idêntica: quatro arquivos têm
URLs diferentes, mas os bytes e o `content_hash` são iguais.

## Decisão operacional

Não executar o modo real após o run `dfc30e45`.

Motivo: não há `hide` confirmado. O modo real apenas gravaria quatro flags de
revisão sobre o mesmo problema de capa e não reduziria o número de posts.
Executar escrita sem ganho de deduplicação aumentaria ruído de metadados.

## Melhorias de observabilidade

OpenClaw PRs #103, #104 e #105:

- `cadu-api` 0.5.11;
- `--emit-cadu-markers` somente no estágio isolado do Admin;
- etapa e resultado estruturados em sucesso e falha;
- falha de configuração/autenticação é fail-closed;
- contadores `errors: 0` e `failed: 0` não viram avisos falsos; contadores
  positivos e falhas textuais continuam visíveis;
- cobertura Instagram degradada identifica o perfil, o motivo técnico e quantos
  itens vieram do retry durável. No B6: `@praeufg`,
  `grid_observed_items_invalid`, 6 itens recuperados;
- 55/55 arquivos de teste Node;
- 155 testes Python aprovados, 28 ignorados por plataforma/dependência;
- 167/167 scripts aprovados no syntax check;
- 442 arquivos verificados pelo scanner de segredos.

KinoCampus:

- resumo do run mostra métricas específicas de dedup;
- revisões e falhas ganham destaque;
- modal separa artefatos produzidos no run de arquivos antigos usados como
  contexto;
- relatório `dedup_report` usa ícone e status próprios;
- o modal de detalhes cobre a viewport inteira e reorganiza metadados longos no
  mobile, sem cortar nome, tamanho ou origem temporal do artefato;
- catálogo estático foi reclassificado como snapshot documental e alinhado ao
  runtime.

Validação de interface:

- teste unitário do funil de métricas e escape dos artefatos;
- Playwright em `1440x1000` e `390x844`;
- backdrop com largura igual à viewport;
- modal e artefato sem overflow horizontal;
- contexto anterior recolhido por padrão.

## Próximo estágio: integridade imagem ↔ publicação

Este estágio ainda não deve aparecer como botão executável. O contrato proposto
para a próxima iteração é:

### Nome e modo

- ID sugerido: `image-audit`;
- padrão: dry-run;
- escopo padrão: todos os posts ativos;
- execução real separada, com canário e confirmação por item;
- nunca ocultar post por divergência de imagem.

### Fase barata

1. validar URL HTTPS e disponibilidade;
2. rejeitar placeholder, favicon, avatar e logo genérica;
3. calcular `content_hash` e pHash;
4. agrupar imagens reutilizadas;
5. comparar unidade, source shortcode, título, descrição e datas;
6. conferir se a imagem veio do asset do post solicitado, não de recomendação
   adjacente do Instagram.

### Fase OCR

- extrair texto visível;
- comparar entidades, curso/programa, data, prazo e unidade;
- marcar conflito forte quando a arte apresenta evento/ano/data incompatível;
- não interpretar ausência de texto como erro.

### Fase VLM

Enviar somente casos ambíguos após filtros determinísticos. Resposta
estruturada:

```json
{
  "corresponde": true,
  "confianca": 0.0,
  "conflitos": [],
  "evidencias": [],
  "recomendacao": "manter|buscar_na_fonte|revisar_manual"
}
```

### Relatório

O artefato deve incluir:

- `run_id`, modo, escopo e versão do contrato;
- post, source URL e imagem atual;
- hash/pHash;
- texto OCR limitado;
- evidência determinística;
- resposta VLM;
- candidato de substituição com origem verificável;
- ação planejada;
- antes/depois para rollback.

### Aplicação controlada

1. buscar a imagem na fonte oficial exata;
2. provar vínculo com shortcode/event ID;
3. exibir prévia no Admin;
4. aplicar primeiro a um post;
5. verificar `posts.image_url`, `post_media` e compartilhamento social;
6. só então liberar lote pequeno;
7. preservar URL anterior e evidência em metadados.

Casos canário conhecidos:

- quatro cursos SRI com capa de defeso eleitoral;
- Planetário UFG “programação de férias”, cuja capa publicada mostra uma sessão
  específica distinta.

## Próximos passos seguros

1. concluído: corrigir as cinco capas conhecidas por fluxo autenticado e auditável;
2. concluído: validar visualmente antes/depois;
3. implementar `image-audit` em dry-run;
4. expor relatório e prévia no Admin;
5. só depois discutir aplicação em lote;
6. quando o plano vinculado estiver vazio, concluir o `dedup` real como no-op
   auditado, sem escrita e sem nova inferência.

## Atualização operacional após a auditoria inicial

Os cinco casos canário de capa foram reparados e verificados. A auditoria global
posterior passou a observar 138 posts ativos, sem URL, referência oficial ou
hash de imagem exatamente repetido.

A simulação `310b9de3` revelou um falso positivo semântico entre dois cursos SRI
distintos. O plano não foi aplicado. Como consequência, a classificação da IA
passou a ser estritamente consultiva: uma recomendação de hide não produz
autoridade de escrita sem `autoHide=true` na política determinística.

A simulação segura `3dd292dc` e a execução real vinculada `efc25352` usaram o
mesmo snapshot e o mesmo plano vazio. O modo real não repetiu inferência, não
ocultou, não marcou e não alterou qualquer publicação.

O resumo do estágio agora distingue pares selecionados por identidade de
programa, classificados como distintos, ambíguos e recomendações de hide
bloqueadas. Isso permite auditar tanto a cobertura quanto a contenção do modelo
sem abrir o relatório JSON bruto.
