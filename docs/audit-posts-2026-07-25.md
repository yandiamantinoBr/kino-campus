# Auditoria de Posts KinoCampus — 2026-07-25

**Escopo:** 56 posts criados entre 2026-07-24 00:00 UTC e 2026-07-25 12:13 UTC (dois últimos dias).
**Método:** query no Supabase, decode de shortcodes do Instagram (data original do post), validação cruzada com o `source_url` da fonte.
**Hoje:** 2026-07-25 12:13 UTC (= 2026-07-25 09:13 BRT).

## Resumo executivo

| Categoria | # | Status |
|---|---|---|
| Posts publicados no período | 56 | 33 published, 22 hidden, 1 closed |
| Posts com data do IG original em 2025-2024 (republicados como 2026) | **12** | **TODOS escondidos** |
| Cross-account reposts (source_url ≠ source_unit) | 15 | 14 marcados, 9 já escondidos |
| Posts sem `extracted_links` (link de ação perdido) | **53/56 (95%)** | Falha sistêmica da pipeline |
| Posts sem imagem | 1 | FEFD Solidária (sem cover no IG original) |
| Imagem errada (não bate com o conteúdo) | 1 | SIERGO (imagem do Ateliê Geográfico) |

## Decodificação de shortcode

A data original do post no Instagram foi recuperada com:

```
media_id = base64_decode(shortcode)   # alfabeto 64
ts_ms = (media_id >> 23) + 1314220021000
ig_date = datetime.fromtimestamp(ts_ms / 1000)
```

Posts com `ig_date` entre 2024-09 e 2026-01 são **posts antigos republicados** com data futura
inventada pela pipeline. Esse é o bug crítico #1.

## Posts escondidos nesta auditoria (12)

| ID | Título | IG_DATE | Motivo |
|---|---|---|---|
| `6b463b2b-07c5-4bec-9d3a-142f5e452c33` | Encontro de Pesquisa em Empreendedorismo | 2024-09-05 | Resumo de evento passado; 687 dias de idade |
| `7307bd8d-aec4-4d8f-83ee-2e1ab8badd27` | FEFD Solidária (set/2026) | 2025-09-07 | Post original 7/9/2025 republicado como 10/9/2026 (data inventada) |
| `137a1831-79f2-44b0-8635-1c6e7c8efc4f` | Brechó COGINGO | 2025-10-01 | Post original 1/10/2025 republicado como 1/10/2026 |
| `c4c27fce-b55a-40d6-854d-9c6a2cce984d` | Bate-Papo das Humanas #11 | 2025-09-30 | Post original 30/9/2025 republicado como 3/10/2026 |
| `a327935d-1b19-4ea1-a7f3-723537f4b53b` | Vestibular UFG 2026 | 2025-10-13 | Post original 13/10/2025 republicado como 19/10/2026 (vestibular 2026 já passou) |
| `952af4a9-cd14-46fa-846b-b9a1f0407d4c` | 3º Simpósio da LABMol | 2025-10-22 | Post original 22/10/2025 republicado como 5-7/11/2026 |
| `42cecb03-e5de-4ffe-8f17-b4c0b7637dd4` | 33ª Semana do ICB | 2025-10-31 | Post original 31/10/2025 republicado como 3/11/2026 |
| `55839385-0f0f-42b6-a552-507d7ef53cd6` | Espetáculo 'Mosqueiro' | 2025-11-27 | Post original 27/11/2025 republicado como 29/11/2026 |
| `1f59d22e-fbee-4a4c-af93-f77f766d52c9` | 85º Fórum Secretarias | 2025-11-27 | Post original 27/11/2025 republicado como 27-28/11/2026 |
| `f4ee9347-1e8e-4f08-bfeb-016f73e1430e` | VII SimGeM vôlei | 2025-12-05 | Post original 5/12/2025 republicado como 11/12/2026 |
| `3620dc91-2111-430f-bc31-ad3327e3fe3d` | Esquenta SBZ | 2026-01-12 | Workshop pré-evento SBZ 2026 (evento em 27/7 - data do post é 12/1, 6 meses antes) |
| `616561f6-0f29-41c4-be02-3d6c3b509b70` | Oficina Maker IPElab | 2026-07-24 | (NÃO É ANTIGO) Cross-account + extracted_links vazio + post fala "inscrições no link da bio" sem link |

## Posts escondidos por outros motivos (2)

| ID | Título | Motivo |
|---|---|---|
| `0ca57b78-1391-4f91-821c-287362ab852c` | Paulo Meirelles Série Allegro 2026 | Data do evento 25/07/2026 = HOJE; já acabou |
| `58f50d22-5933-4850-8aac-a47cab2ded95` | XXX Semana de Filosofia FAFIL | Evento em 11-14/08, MAS prazo de submissão era 10/07 (já passou) |

## Cross-account reposts detectados (15)

| ID | source_unit (autor do post) | URL real aponta para |
|---|---|---|
| `7307bd8d` | @fefufg | @prof.claudiolira |
| `55839385` | @fefufg | @danca.ufg |
| `616561f6` | @pesquisaeinovacaoufg | @ipelab.ufg |
| `f4ee9347` | @ppggmp.ufg | @grupoeugem |
| `3d500db4` | @ppgacv_ufg | @sipacv_ |
| `7553d8bd` | @poshistoriaufg | @sbhciencia |
| `137a1831` | @fefufg | @p (handle curto, ver caso) |
| `813e0f5f` | @posufg | @pesquisaeinovacaoufg |
| `3620dc91` | @ppgzufg | @reel (URL anômala) |
| `83e31bfb` | @campusocidentalufg | @prefeituracidadeocidental |
| `aec57197` | @odontologia.ufg | @jordana.estudante |
| `a327935d` | @institutoverbenaufg | @reitoriaufg |
| `d5cffac4` | @fav_ufg | @sipacv_ |
| `6b463b2b` | @ppgadm.ufg | (auto, mesmo perfil) |
| `7553d8bd` | @poshistoriaufg | @sbhciencia |

> 14 foram marcados com `cross-account` no `moderation_reason`. O `6b463b2b` foi marcado também, embora tecnicamente o source_unit bata com o source_url — está incluso porque o post é de set/2024 republicado como 2026.

## Posts com problemas conhecidos (ainda published)

| ID | Título | Problema |
|---|---|---|
| `67b697a1-7b48-4943-9d78-19e4d74e34cf` | I SIERGO | Imagem do "Ateliê Geográfico" (revista do IESA), não do evento SIERGO |
| `7553d8bd-c54b-4d33-a8fa-eb0c2d74b6fb` | 20º SNHCT | Cross-account + sem extracted_links |
| `83e31bfb-25e2-46c5-8f7e-6993b2e82a06` | 4ª Feira do Livro de Cidade Ocidental | Cross-account + sem extracted_links |
| `3d500db4-bb75-4f09-ac0b-a9d0ec6123a4` | IX SIPACV | Cross-account (3 posts do mesmo evento - dedup?) |
| `aec57197-5f59-468b-8e62-00413eebb0fb` | Palestra Colgate | Cross-account (jordana.estudente) + sem extracted_links |

> 53/56 posts têm `extracted_links: []`. Isso é um problema **estrutural** da pipeline, não pontual.

## Casos do Yan (validados)

| Caso Yan | Veredito |
|---|---|
| "FEFD Solidária — setembro de 2026, mas o post original é de 7/9/2025" | **Confirmado**: 7307bd8d, escondido |
| "Espetáculo Mosqueiro" | **Confirmado**: 55839385, post original 27/11/2025, escondido |
| "Semana de Filosofia já passou" | **Errado do Yan**: evento é em 11-14/08/2026 (futuro). Escondido mesmo assim porque submissão fechou 10/07 |
| "ITBP já passou" | ITBP = Oficina Estratégica de Acesso a Fundos Europeus (813e0f5f). Evento é 17-20/08/2026 (futuro), mas cross-account + sem link de inscrição. Já estava hidden antes desta auditoria |
| "SIERGO com imagem do Ateliê Geográfico" | **Confirmado**: 67b697a1, marcado com problema de imagem (ainda published) |
| "Oficina Maker Tinkercad — link da bio" | **Confirmado**: 616561f6, source fala "inscrições no link da bio" mas `extracted_links` está vazio. Escondido |

## Ações aplicadas

- 12 posts `hidden` com motivo `audit-2026-07-25: IG post original de 2025-2024 republicado com data inventada`
- 1 post `hidden` por evento passado (HOJE) — Paulo Meirelles
- 1 post `hidden` por submissão expirada — XXX Semana de Filosofia
- 1 post `hidden` por cross-account + extracted_links vazio — Oficina Maker IPElab
- 14 posts marcados com `audit-2026-07-25-cross-account` no `moderation_reason`
- 1 post marcado com `audit-2026-07-25-imagem` — SIERGO

Total: **22/56 posts escondidos após auditoria** (39% do total).

## Próximos passos (mapeamento de correções para a pipeline)

1. **CRÍTICO — Filtro de idade do post IG**: bloquear publicação de posts com `ig_date > 90 dias` da data de hoje. (Hoje: 2026-07-25, bloquear tudo antes de 2026-04-25.) Implementar no `enrich-instagram` stage comparando `ig_taken_at` com NOW().
2. **CRÍTICO — Decodificar shortcode → data**: armazenar `ig_posted_at` na metadata no momento do `ig_official_source` (já temos o shortcode, é só decodificar). Sem isso, filtros temporais são impossíveis.
3. **CRÍTICO — Extração de links do IG**: 95% dos posts têm `extracted_links: []`. Verificar por que o `extract_links` não está funcionando — provável que o html scraping do IG não pegue o "link in bio" do caption (Instagram esconde em CTA nos stories/reels). Implementar fallback: se caption tem "link na bio", adicionar nota "ver bio do @handle" e buscar via `fetch-ig-img-X.js`.
4. **ALTO — Filtro de "evento passado"**: comparar `data_evento` do post gerado com `ig_posted_at`. Se o evento já passou (> 7 dias), não publicar.
5. **ALTO — Imagem correta**: garantir que `cover_url` (image) venha do MESMO post do IG, não de posts adjacentes. Investigar caso SIERGO: o `ig_official_source` ou `image-extract` está pegando imagem errada.
6. **MÉDIO — Cross-account detection**: no `format-kino.js` (ou similar), comparar `source_id` (handle do IG) com a URL real. Se o handle na URL não bate com `source_unit`, **re-buscar** o post original do source_unit.
7. **MÉDIO — Posts-resumo de evento**: 6b463b2b (Encontro de Pesquisa) é um post de agradecimento ("Nosso agradecimento especial a todos os participantes"). Esses posts devem ser filtrados como `is_post_summary = true` via heurística de palavras-chave no `original_title`.
8. **BAIXO — ITBP**: catalogar abreviações incomuns (ITBP = ?) num dicionário para exibir nome completo.
