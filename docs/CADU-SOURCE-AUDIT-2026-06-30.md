# Auditoria de Fontes Cadu/UFG - 2026-06-30

Escopo: revisar sites oficiais, `news.json`/`events.json` e perfis Instagram usados pelo Cadu para alimentar eventos e oportunidades no KinoCampus.

## Fontes oficiais usadas

- Pagina oficial UFG de unidades e orgaos: https://ufg.br/p/27412-unidades-e-orgaos
- IAC: https://iac.ufg.br
- CEROF: https://cerof.ufg.br
- Centro Cultural UFG: https://centrocultural.ufg.br
- SEACULT: https://seacult.ufg.br
- CSA/Campus Goias: https://csa.goias.ufg.br
- UAECH/Campus Goias: https://uaech.goias.ufg.br
- CEFIS/Firminopolis: https://firminopolis.ufg.br

## Achados principais

- O IAC e uma fonte nova e relevante: `iac.ufg.br/news.json` e `iac.ufg.br/events.json` funcionam. Havia edital real de monitoria 2026-2 e eventos/oficinas culturais.
- CEROF e fonte real: `cerof.ufg.br/news.json` funciona e o site linka `@cerofufg`; CDP encontrou 10 posts novos, 3 relevantes.
- Centro Cultural UFG e fonte forte para eventos: `centrocultural.ufg.br/news.json` e `events.json` retornaram 20 itens cada; site linka `@centroculturalufg`.
- Campus Goias estava com handle errado no mapa/scanner: o site de CSA aponta `@campusgoiasufg`; `@campusgoias.ufg` nao rendeu conteudo.
- EECA e IME tinham IG ausente/antigo: sites oficiais apontam `@eeca_ufg` e `@ime_ufg`; ambos foram validados por CDP com posts relevantes.
- CEFIS/Firminopolis e fonte real: `firminopolis.ufg.br/news.json` funciona e `@firminopolis_ufg` trouxe posts relevantes.
- `cultura.ufg.br` e `secult.ufg.br` nao resolvem DNS. Para cultura, usar `centrocultural.ufg.br` e `seacult.ufg.br`.
- `mat.ufg.br`, `cienciassociais.ufg.br`, `eec.ufg.br` e `www2.emc.ufg.br` nao devem ser usados; usar `ime.ufg.br`, `fcs.ufg.br`, `eeca.ufg.br` e `emc.ufg.br`.

## Mudancas aplicadas

### Entram no curador `--daily` (Tier 2)

- `iac` -> `https://iac.ufg.br`
- `cerof` -> `https://cerof.ufg.br`, IG `@cerofufg`
- `centrocultural` -> `https://centrocultural.ufg.br`, IG `@centroculturalufg`
- `csa` -> `https://csa.goias.ufg.br`, IG `@campusgoiasufg`
- `uaech` -> `https://uaech.goias.ufg.br`

### Entram como fontes suplementares (Tier 3/full)

- `cefis` -> `https://firminopolis.ufg.br`, IG `@firminopolis_ufg`
- `cpa` -> `https://cpa.secplan.ufg.br`
- `cidarq` -> `https://cidarq.ufg.br`
- `cegraf` -> `https://cegraf.ufg.br`
- `hospitalveterinario` -> `https://hospitalveterinario.evz.ufg.br`
- `seacult` -> `https://seacult.ufg.br`

### IGs corrigidos/adicionados

- `agro`: `@ea.ufg`
- `direito`: `@direitoufg`
- `fefd`: `@fefufg` (tentative; rodape antigo ainda cita `@fefdufg`)
- `eeca`: `@eeca_ufg`
- `ime`: `@ime_ufg`
- `campusgoias`: `@campusgoiasufg`
- novos: `@cerofufg`, `@centroculturalufg`, `@firminopolis_ufg`, `@lacena_ufg`

## Validacao CDP Instagram

- `@cerofufg`: 10 posts novos, 3 relevantes.
- `@eeca_ufg`: 6 posts novos, 2 relevantes.
- `@ime_ufg`: 11 posts novos, 6 relevantes.
- `@campusgoiasufg`: 9 posts novos, 5 relevantes.
- `@firminopolis_ufg`: 9 posts novos, 6 relevantes.
- `@centroculturalufg`: 11 posts novos, 1 relevante.
- `@lacena_ufg`: 7 posts novos, 1 relevante.

## Arquivos alterados

- OpenClaw: `data/.openclaw/workspace/scripts/cadu-curador-v4.4.js`
- OpenClaw: `data/.openclaw/workspace/scripts/scan-ig-browser.js`
- OpenClaw: `data/.openclaw/workspace/scripts/site-structure-scan.js`
- OpenClaw: `data/.openclaw/workspace/ufg-sites-map.md`
- OpenClaw: `data/.openclaw/skills/cadu-api/server.py`
- KinoCampus: `services/cadu-ufg-publisher/config/sources.json`

## Validacao operacional no VPS

- Backup remoto antes do deploy: `/docker/openclaw-hahq/backups/source-audit-20260630-140850`.
- `node --check` passou no container `openclaw-hahq-openclaw-1` para `cadu-curador-v4.4.js`, `scan-ig-browser.js` e `site-structure-scan.js`.
- `cadu-api` foi recriado com `docker compose up -d --no-deps --force-recreate cadu-api`.
- `GET /api/sites` autenticado no container `openclaw-hahq-cadu-api` retornou 65 fontes.
- O parser de `/api/sites` foi corrigido para:
  - nao reclassificar linhas de fonte como heading quando aparecem palavras como "Centro", "Secretaria" ou "Hospital";
  - preservar o Tier explicito de `## TIER X`;
  - aceitar subdominios profundos como `cpa.secplan.ufg.br` e `hospitalveterinario.evz.ufg.br`;
  - tratar `(confirmed)` como status de Instagram, nao como observacao da unidade.
- Override Supabase `kc_unit_meta` de `CSA` foi corrigido via `PATCH /api/sites/CSA/meta`: Tier 3 -> Tier 2, alinhando admin, mapa e curador diario.

## Smoke test de `news.json`/`events.json`

- `iac.ufg.br`: news=17, events=4 via `curl.exe` (Node fetch local falhou por `TypeError`, comportamento ja observado antes).
- `cerof.ufg.br`: news=20, events=0.
- `centrocultural.ufg.br`: news=20, events=20.
- `csa.goias.ufg.br`: news=20, events=9.
- `uaech.goias.ufg.br`: news=20, events=16.
- `firminopolis.ufg.br`: news=20, events=2.
- `cpa.secplan.ufg.br`: news=3, events=1.
- `cidarq.ufg.br`: news=30, events=25.
- `cegraf.ufg.br`: news=25, events=13.
- `hospitalveterinario.evz.ufg.br`: news=20, events=3.
- `seacult.ufg.br`: news=0, events=0.

## Riscos e proximas verificacoes

- O IAC ainda aponta no footer para `emacufg`, mas esse handle nao trouxe posts via CDP. Por enquanto o valor principal e o site Weby `iac.ufg.br`.
- Alguns handles com 0 posts podem existir, mas o scanner antigo nao distinguia claramente perfil vazio de perfil inexistente. Foi adicionada deteccao basica de `profile_unavailable`.
- O aumento do `--daily` e moderado: +5 fontes Tier 2. A proxima run deve confirmar impacto de tempo e qualidade.

# Complemento v2 - foco em eventos futuros/oportunidades (2026-06-30)

> Contexto: Yan apontou corretamente que a curadoria estava parecendo uma pipeline de noticias. A regra de produto do KinoCampus e mais estreita: dois modulos, `eventos` e `oportunidades`. Evento deve ser futuro/ongoing ou pelo menos ter acao clara; oportunidade deve ser edital/chamada/bolsa/inscricao/processo seletivo com utilidade real para estudantes, tecnicos e docentes.

## Confirmacoes novas de fontes citadas por Yan

- FEF: `https://fefd.ufg.br` redireciona para `https://fef.ufg.br`. O rodape oficial ainda cita `@fefdufg`, mas a busca/Instagram indicou `@fefufg`; por isso o curador passou a usar `https://fef.ufg.br` e `@fefufg` como tentativa ate validacao CDP.
- EM: `https://emac.ufg.br` redireciona para `https://em.ufg.br`. O rodape oficial ainda cita `@emacufg`, mas a busca/Instagram indicou `@em.ufg`; por isso o curador passou a usar `https://em.ufg.br` e `@em.ufg` como tentativa.
- ICB: site `https://icb.ufg.br`; handle tentativo `@icb.ufg`.
- FCT/Campus Aparecida: site `https://fct.ufg.br`; handle tentativo `@campusaparecidaufg`.
- FO/Odontologia: site `https://odonto.ufg.br`; handle tentativo `@odontologia.ufg`.
- Centro Cultural UFG: `https://centrocultural.ufg.br` e `@centroculturalufg`; forte para `events.json`.
- CECAS: canal sem site Weby dedicado; entrou como Instagram-only `@cecasufg` e agora aparece em `/api/sites` com `url=null`.

## Mudanca funcional aplicada

- `cadu-curador-v4.4.js` agora busca `events.json` local de cada fonte antes de `news.json`. Antes, somente `https://ufg.br/events.json` era lido na etapa global; eventos especificos de unidades ficavam perdidos ou competiam com noticias.
- Eventos Weby locais sao marcados com `sourceKind="event"`, `eventSource`, `place`, `externalUrl` e link canonico `/e/{id}` da unidade. O bug que gerava URL `[object Object].../e/{id}` no calendario global foi corrigido.
- Noticia classificada como `eventos` sem data futura/prazo nao pode mais virar `publish`. Se tiver link de inscricao mas nenhuma data extraida, fica no maximo em `review` com reason `news_event_without_future_date`.
- Resultados/homologacoes/cancelamentos agora sao descartados se qualquer sinal terminal aparecer em `updateSignals`, mesmo quando o tipo principal ficou como `prorrogacao_prazo`.
- Foi adicionada deduplicacao dentro da propria rodada (`run_link_duplicate`/`run_title_duplicate`), evitando publicar o mesmo evento quando ele aparece no calendario local e no calendario central.
- O artefato da curadoria agora persiste `reasons` em cada registro, para a aba/admin e futuras IAs entenderem por que um item foi publicado, revisado ou descartado.

## Validacao operacional v2

- Backup remoto antes do deploy incremental: `/docker/openclaw-hahq/backups/events-first-20260630-153418`.
- `node --check` passou localmente e no container `openclaw-hahq-openclaw-1` para o curador e scripts correlatos; `python -m py_compile` passou para `cadu-api/server.py`.
- `cadu-api` recriada com `docker compose up -d --no-deps --force-recreate cadu-api`; `/health` interno retornou `version="0.4.6"`.
- `/api/sites` autenticado passou de 65 para 73 fontes porque o parser agora aceita fontes Instagram-only sem URL. Amostras confirmadas: `@fefufg`, `@em.ufg`, `@icb.ufg`, `@campusaparecidaufg`, `@odontologia.ufg`, `@cecasufg`.
- `curator --daily` no VPS gerou `curadoria-v4.4-daily-2026-06-30.json` com: 35 `news.json`, 35 calendars locais, 22 eventos locais futuros, 762 itens, 13 `publish`, 30 `review`, 719 descartes.
- Casos de controle:
  - `[FEF SOLIDARIA] ... mulher atleta` saiu de `publish` e ficou em `review` com `news_event_without_future_date`.
  - `PIEmp/UFG - resultado preliminar` foi para `discarded` com `update:*`.
  - `XIX Seminario de Integracao do PPGECM` apareceu uma vez em `publish`; a copia do calendario global foi descartada com `run_link_duplicate`.
  - URLs corrompidas com `[object Object]`: 0.

## Bloqueio ainda real

- Validacao CDP dos handles novos citados por Yan nao foi concluida nesta rodada: `scan-ig-browser.js --handle ... --dry-run` falhou com `connect ECONNREFUSED 127.0.0.1:18800`. Ha processo Chrome no VPS, mas a porta CDP nao estava ouvindo. Os handles marcados como `(tentative)` devem ser confirmados quando o CDP/browser do OpenClaw voltar a aceitar conexao.

# Complemento v3 - Run 4cb7fc43 e aliases Instagram (2026-06-30)

> Contexto: Yan pediu revisao aprofundada dos problemas do Run `4cb7fc43`, especialmente perfis nao encontrados, duplicados e ausentes.

## Diagnostico do run

- Run: `4cb7fc43-6207-4eac-89b9-0bbbd250f79a`, stage `all`, `exit_code=0`, duracao ~580s.
- Resultado final: 760 itens, 0 publicaveis novos, 22 revisao, 730 descartados, 0 publicados.
- Instagram: 58 perfis, 51 OK, 7 `profile_unavailable`, 545 posts pulados por cache, 9 posts novos de `@cecasufg`, 0 relevantes pelas regras antigas.
- As 7 falhas nao indicavam queda geral do IG nem fonte essencial ausente; eram aliases/handles legados ou canais substituidos:
  - `@icbufg` -> usar `@icb.ufg`;
  - `@emacufg` -> usar `@em.ufg`;
  - `@fct.ufg` -> usar `@campusaparecidaufg`;
  - `@odontologiaufg` -> usar `@odontologia.ufg`;
  - `@fefdufg` -> usar `@fefufg`;
  - `@culturaufg` -> usar `@centroculturalufg`;
  - `@esportesufg` -> usar `@cecasufg`.

## Mudanca funcional aplicada

- `scan-ig-browser.js` agora canoniza handles, deduplica a lista operacional e registra `sourceAudit` no JSON de Instagram.
- `seen-posts.json` agora grava `relevanceVersion`, termos encontrados, termos de exclusao, modulo/categoria estimados, datas futuras e motivo de descarte. Isso permite reavaliar posts antigos uma vez quando a taxonomia editorial mudar.
- `--dry-run` do scanner nao altera mais `seen-posts.json`.
- O scanner extrai datas futuras simples da legenda (`DD/MM`, `DD de mes`) e o curador parou de usar a data da postagem como data futura do evento.
- A `cadu-api` passou a incluir artefatos `ig-browser-YYYY-MM-DD.json` em `/api/pipeline/{run}/artifacts` e a extrair metricas IG para os chips da aba Pipeline.
- Validacao viva: run `d4b5829e-ba01-4b2e-8413-a0f5687f31c5` (`ig`) terminou `exit_code=0`, 51 perfis OK, 0 falhas, 523 posts avaliados, 136 relevantes, 23 ja vistos; o artefato `ig-browser-2026-06-30.json` foi produzido durante o run.

## Estado editorial

- Problema real: o cache antigo era superprotetor e escondia reavaliacoes apos mudanca de criterio.
- Problema real: a pipeline confundia data de postagem do Instagram com data futura do evento.
- Problema real: o resumo da run nao deixava claro que `0 relevantes` vinha de cache/filtros e aliases, nao de ausencia absoluta de fontes.
- Problema reclassificado: os perfis `profile_unavailable` do Run `4cb7fc43` eram majoritariamente cadastro legado, nao novas fontes oficiais que precisavam ser adicionadas.
