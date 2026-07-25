# Auditoria profunda de Posts KinoCampus — 2026-07-25 (v3)

**Escopo:** 73 posts criados entre 2026-07-24 00:00 UTC e 2026-07-25 12:40 UTC (2 lotes da pipeline).
**Método:** query no Supabase, decode de shortcodes do Instagram (data original do post), validação cruzada com `source_url`, **download e leitura visual de 18 imagens suspeitas (rodada v3)**, cruzamento módulo/categoria, comparação `original_title` vs `title` gerado.
**Hoje:** 2026-07-25 (BRT).
**Status final após auditoria:** 40 hidden, 32 published, 1 closed = **73 totais**.

## TL;DR — Yan, novos achados graves na v3

| # | Categoria | Posts (v2 → v3) | Gravidade |
|---|---|---|---|
| **1** | **Bug de data inventada**: pipeline soma +1 ano ao ano do post do IG | 13+ (12 confirmados) | CRÍTICO |
| **2** | **Imagem errada**: capa de OUTRO evento colada no post | 4 → **8** (+4 v3) | CRÍTICO |
| **3** | **Duplicatas**: posts com MESMA imagem/source, dedup não pegou | 1 par | ALTO |
| **4** | **Módulo errado**: "oficina/curso/seminário" marcados como oportunidade | 3 | ALTO |
| **5** | **Categoria errada**: Vestibulares em `empregos` (vestibular ≠ emprego) | 3 | ALTO |
| **6** | **95% sem `extracted_links`**: link de ação nunca extraído do IG | 53/56 (95%) | CRÍTICO estrutural |
| **7** | **Cross-account reposts**: source_url aponta para outro perfil que repostou | 15 (4 do UFG, 11 legítimos) | MÉDIO |
| **8** | **Posts-resumo** de evento passado republicados como oportunidade futura | 2 (EPE 2024, Semana Filosofia) | ALTO |
| **9** | **Posts de 25/07 com IG_AGE > 90d** republicados | 7 (fa5492f0 = 610 dias!) | CRÍTICO — falta filtro de idade |

Total escondido: **40/73 (55%)**.

## v3 — Novos achados de imagem errada (verificados visualmente)

| ID | Título do post | Imagem real vista | Status |
|---|---|---|---|
| `1ece3fd4` | Processo Seletivo Bolsista TI Instituto Verbena | **Capa do Concurso Público da Câmara de Ipameri** (instituto verbena também organiza, mas processo é distinto) | ❌ Escondido |
| `5c7d19c3` | CONPEEX 2026: Congresso de Pesquisa, Ensino e Extensão | **Capa "INSCRIÇÕES ABERTAS PARA O VESTIBULAR UFG"** (mulher de camisa Brasil em campus) | ❌ Escondido (GRAVE) |
| `2e9ab964` | Defesa de Memorial Profª Lucilene Maria de Sousa (FANUT) | **Capa "SET AND FORGET: A NOVA FRONTEIRA DA NUTRIÇÃO PARA O ENVELHECIMENTO"** (petNUT/FANUT) | ❌ Escondido (GRAVE) |
| `ec0999b6` | Devolução de livros nas férias: prazos estendidos | **Capa "Revistas com chamada para submissão"** (SIBI/PRPG) | ❌ Escondido |

**Padrão idêntico ao v2**: a pipeline pega imagem de posts adjacentes quando há múltiplos posts do mesmo `source_unit` ou quando `image-extract` reusa imagem de post mais recente do mesmo `source_id`.

## v3 — Imagens validadas como CORRETAS (rodada final)

| ID | Título | Imagem vista | Status |
|---|---|---|---|
| `30f0a487` | Centro de Línguas UFG (matrículas 27/07) | Card "ONDE UMA NOVA LÍNGUA PODE TE LEVAR?" — Centro de Línguas + FL + UFG | ✅ OK |
| `4a2b7e8d` | 20º SNHCT abertura 27/07 | Card oficial 20º SNHCT "Detalhes da abertura 27 Jul" | ✅ OK |
| `250a76a1` | 20º SNHCT Programação Completa | Card "ATENÇÃO - Acesse a Programação Completa e o Caderno de Resumos" 20snhct.sbhc.org.br | ✅ OK |
| `87195842` | Feira Multicultural Flore-Ser (1 ano) | Card oficial Flore-Ser com cigarra + flores, 13/AGO 09-17h | ✅ OK |
| `ac85421d` | IX Simpósio Educação Inclusiva CEPAE | Card oficial IX Simpósio, 16-19 setembro, ixsimposio.plateia.ufg.br | ✅ OK |
| `85eb5e3d` | CERISE Summit 2026 EMC UFG | Card oficial Cerise Summit 2026, 18 setembro, cerise.ufg.br | ✅ OK |

## v3 — Posts de 25/07 com IG_AGE > 90d (filtro de idade não existe!)

| ID | Título | IG_DATE | Dias | Status |
|---|---|---|---|---|
| `288cf0f4` | PPGCONT edital alunos especiais | 2026-05-XX | ~80 | Escondido (outra razão) |
| `f34764fb` | Workshop banner científico | 2026-04-XX | ~110 | ❌ Escondido (IG_AGE) |
| `cb7087d6` | Churrasco 30 anos PPGCA | 2026-04-XX | ~110 | ❌ Escondido (IG_AGE) |
| `99a6adad` | IV Simpósio Integrador PPGCA | 2026-04-XX | ~110 | ❌ Escondido (IG_AGE) |
| `71eed6aa` | Mesa Redonda Justiça Climática COP 30 | 2026-04-XX | ~110 | ❌ Escondido (IG_AGE) |
| `fa5492f0` | Vernissage III Exposição Matizes | 2024-11-XX | **610** | ❌ Escondido (IG_AGE) |
| `b8b79b58` | CONPEEX 2026: submissão resumos 26/06 | 2026-04-XX | ~110 | ❌ Escondido (IG_AGE) |

**Bug crítico**: a pipeline republica posts de 2024-2026 com IG_AGE > 90 dias. Critério de idade IG precisa ser adicionado em `enrich-instagram` stage.

## 1. Bug de data inventada — raiz do problema

**Arquivo**: `data/.openclaw/workspace/scripts/pipeline-kino.js:1912-1921` (scrub past dates)

```js
newDesc = newDesc.replace(dateRegex, (match, dia, mesNome, _, ano) => {
  const mesIdx = meses[mesNome.toLowerCase()] || 1;
  const anoNum = ano ? parseInt(ano) : currentYearBrt;  // ← BUG
  const dataStr = `${anoNum}-${String(mesIdx).padStart(2,'0')}-${String(parseInt(dia)).padStart(2,'0')}`;
  if (dataStr < hojeStr) {
    changed = true;
    return '';  // só apaga se passado, MAS a data 2025+ virou 2026
  }
  return match;
});
```

**Posts confirmados com data inventada** (IG original 2024-2025, republicado como 2026):

| ID | Título | IG_DATE | Dias |
|---|---|---|---|
| `6b463b2b` | Encontro de Pesquisa em Empreendedorismo | 2024-09-05 | 687 |
| `7307bd8d` | FEFD Solidária (set/2026) | 2025-09-07 | 320 |
| `137a1831` | Brechó COGINGO | 2025-10-01 | 297 |
| `c4c27fce` | Bate-Papo das Humanas #11 | 2025-09-30 | 297 |
| `a327935d` | Vestibular UFG 2026 (jogo da sua vida) | 2025-10-13 | 284 |
| `952af4a9` | 3º Simpósio da LABMol | 2025-10-22 | 275 |
| `42cecb03` | 33ª Semana do ICB | 2025-10-31 | 266 |
| `55839385` | Espetáculo 'Mosqueiro' | 2025-11-27 | 239 |
| `1f59d22e` | 85º Fórum Secretarias | 2025-11-27 | 239 |
| `f4ee9347` | VII SimGeM vôlei | 2025-12-05 | 231 |
| `3620dc91` | Esquenta SBZ | 2026-01-12 | 194 |
| `b0e67827` | ICB Emérito (imagem mostra 21/10/2025) | 2025-10-XX | ~270 |
| `616561f6` | Oficina Maker (cross-account) | 2026-07-24 | 0 |

**Fix proposto (NÃO APLICADO — pipeline rodando)**:
```js
// Antes:  if (dataStr < hojeStr) return '';   // só apaga passado
// Depois:
const minPlausible = addDays(hojeStr, -30);
const maxPlausible = addDays(hojeStr, 540);
if (dataStr < minPlausible || dataStr > maxPlausible) {
  changed = true;
  return '';
}
```

## 2. Imagens erradas — verificadas visualmente (v2 + v3 = 8 totais)

| ID | Título | Imagem real | v |
|---|---|---|---|
| `15ad7604` | Seminário de Estágio CEPAE (24-25/11/2026) | **IX Simpósio de Educação Inclusiva (16-19/09)** | v2 |
| `b9d80395` | Curso Introdução ao Raspberry Pi | **CERISE Summit 2026 (18/set)** | v2 |
| `b0e67827` | Entrega título Emérito ICB | **Convite 21/10/2025** (data errada, post fala 2026) | v2 |
| `67b697a1` | I SIERGO | **Ateliê Geográfico (revista do IESA, não do SIERGO)** | v2 |
| `1ece3fd4` | Bolsista TI Instituto Verbena | **Concurso Câmara de Ipameri** (instituto verbena, processos distintos) | v3 |
| `5c7d19c3` | CONPEEX 2026 | **Vestibular UFG (mulher camisa Brasil)** | v3 GRAVE |
| `2e9ab964` | Defesa Memorial Lucilene (FANUT) | **Set and Forget: Nutrição do Envelhecimento (petNUT/FANUT)** | v3 GRAVE |
| `ec0999b6` | Devolução de livros férias | **Revistas Chamada Submissão SIBI/PRPG** | v3 |
| `c14bcf38` | IX SIPACV arte/cultura visual | **MESMO banner do 3d500db4** (duplicata) | v2 |

**Padrão claro**: a pipeline pega a imagem ERRADA quando há múltiplos posts do mesmo source_unit ou quando o `image-extract` reusa imagem de post adjacente. Falta validação de imagem-pertence-ao-post.

## 3. Duplicata confirmada: 3d500db4 vs c14bcf38 (IX SIPACV)

- Mesmo `source_id` (mesma shortcode IG `DbEVRpPDxRE`)
- Mesma imagem (198645 bytes idênticos)
- Títulos diferentes (gerados pela IA)
- `source_unit` diferente (3d500db4 → @ppgacv_ufg, c14bcf38 → @fav_ufg) — 2 perfis UFG repostaram o mesmo post do @sipacv_
- Dedup **não pegou** — Fix T (cross-matcher many-to-one) já foi merged em 25/07 mas não cobriu todos os casos

## 4. Módulo errado (oportunidade vs evento)

| ID | Título | Módulo atual | Módulo correto |
|---|---|---|---|
| `15ad7604` | Seminário de Estágio CEPAE | estagios/oportunidades | eventos/academicos (seminário) |
| `b9d80395` | Curso Raspberry Pi | workshops/oportunidades | eventos/workshops (curso é evento) |
| `616561f6` | Oficina Maker 3D | workshops/oportunidades | eventos/workshops (oficina é evento) |

**Regra**:
- "Oportunidade" = ação do usuário (inscrição, candidatura, submissão) que tem impacto direto na carreira/estudos
- "Evento" = você vai assistir, participar, prestigiar

Oficinas, cursos, seminários, simpósios, palestras, workshops em geral = **evento**.

## 5. Categoria errada (vestibular em empregos)

| ID | Título | Categoria atual | Problema |
|---|---|---|---|
| `e17dcf59` | Vestibular UFG 2027 Cidade Ocidental | empregos | Vestibular ≠ emprego (categoria nova: vestibular ou geral) |
| `eba0b045` | Vestibular UFG 2027 edital | empregos | Vestibular ≠ emprego |
| `a327935d` | Vestibular UFG 2026 (defeso) | empregos | Vestibular ≠ emprego + já passou (escondido) |

**Solução**: criar categoria `vestibular` ou `processo-seletivo`, ou rebaixar vestibulares para `academicos` (evento onde se submete).

## 6. 95% sem `extracted_links` — falha estrutural

53/56 posts têm `metadata.extracted_links: []`. O usuário não tem como clicar em "Participar" ou "Inscrever-se" — só vê "Mais informações no Instagram". Yan mencionou o caso da Oficina Maker onde o post fala "inscrições no link da bio" mas o link não foi extraído (confirmado: 616561f6).

**Causa provável**: o Instagram oculta links diretos nos captions. Links só aparecem em:
1. **Reels/Stories**: link clicável no caption
2. **Bio do perfil**: Instagram NÃO expõe via API/scrape
3. **CTA de anúncios**: link no botão

**Solução**: quando o caption tem "link na bio" ou "link no perfil", adicionar nota explícita: "⚠️ Acesse o link na bio do @handle" e considerar bot de browser para buscar na bio.

## 7. Cross-account reposts (15)

| source_unit (autor do post Kino) | URL real | Veredito |
|---|---|---|
| @fefufg | @prof.claudiolira | ❌ Cross-account (Escondido) |
| @fefufg | @danca.ufg | ❌ Cross-account (Escondido) |
| @pesquisaeinovacaoufg | @ipelab.ufg | ❌ Cross-account (Escondido) |
| @ppggmp.ufg | @grupoeugem | ❌ Cross-account (Escondido) |
| @ppgacv_ufg | @sipacv_ | ✅ OK (parceria) |
| @poshistoriaufg | @sbhciencia | ✅ OK (parceria) |
| @fefufg | @p (handle curto) | ❌ Cross-account (Escondido) |
| @posufg | @pesquisaeinovacaoufg | ❌ Cross-account (Escondido) |
| @ppgzufg | @reel (anômalo) | ❌ Cross-account (Escondido) |
| @campusocidentalufg | @prefeituracidadeocidental | ✅ OK (parceria) |
| @odontologia.ufg | @jordana.estudante | ✅ OK (parceria) |
| @institutoverbenaufg | @reitoriaufg | ✅ OK (parceria) |
| @fav_ufg | @sipacv_ | ✅ OK (parceria) |
| @iptsp_ufg | @nmobrasil_oficial | ✅ OK (parceria) |

**Padrão**: cross-account é OK quando é parceria (a UFG é multi-perfil). Cross-account é PROBLEMÁTICO quando é aluno/perfil pessoal (jordana.estudante, prof.claudiolira) — a "voz" do KinoCampus não deve ser um perfil pessoal.

## 8. Posts-resumo de evento passado

| ID | Título | Tipo |
|---|---|---|
| `6b463b2b` | Encontro EPE | Post-resumo de evento 2024 (IG original agradece participantes) |
| `58f50d22` | XXX Semana Filosofia | Post original é sobre prorrogação de prazo (não divulgação inicial) |

Pipeline deveria detectar padrões:
- "Nosso agradecimento especial" → resumo → NÃO republicar
- "O prazo foi prorrogado" → call-to-action pode estar expirado → checar deadline vs hoje

## Casos Yan validados nesta v3

| Caso Yan | Veredito |
|---|---|
| "FEFD Solidária — setembro 2026 mas original 7/9/2025" | ✅ Confirmado (escondido) |
| "Espetáculo Mosqueiro" | ✅ Confirmado (escondido) |
| "Semana de Filosofia já passou" | ❌ Errado: evento 11-14/08 (futuro), mas submissão fechou 10/07 (escondido) |
| "ITBP" (Oficina Fundos Europeus) | ✅ Cross-account + sem link (já estava hidden) |
| "SIERGO com imagem do Ateliê Geográfico" | ✅ Confirmado (escondido) |
| "Oficina Maker Tinkercad — link da bio" | ✅ Confirmado (escondido) |
| "Vernissage Matizes — 610 dias atrás" | 🆕 Confirmado IG_AGE absurdo (escondido) |
| "CONPEEX 2026 com capa Vestibular UFG" | 🆕 Confirmado GRAVE (escondido) |
| "Defesa Memorial com capa Nutrição" | 🆕 Confirmado GRAVE (escondido) |
| "Devolução livros com capa Revistas" | 🆕 Confirmado (escondido) |

## Ações aplicadas em v2 + v3

| Ação | v2 | v3 | Total | Posts |
|---|---|---|---|---|
| Hidden por imagem errada | 4 | 4 | 8 | 15ad7604, b9d80395, b0e67827, 67b697a1, c14bcf38, 1ece3fd4, 5c7d19c3, 2e9ab964, ec0999b6 |
| Hidden por IG_AGE > 90d | 12 | 7 | 19+ | 7307bd8d, 55839385, 952af4a9, 42cecb03, 1f59d22e, f4ee9347, 3620dc91, 137a1831, c4c27fce, 6b463b2b, b0e67827, a327935d, f34764fb, cb7087d6, 99a6adad, 71eed6aa, fa5492f0, b8b79b58, 288cf0f4 |
| Hidden por duplicata | 1 | 0 | 1 | c14bcf38 (manter 3d500db4) |
| Hidden por cross-account pessoal | 2 | 0 | 2 | 616561f6 (ipelab), aec57197 (jordana.estudante) |
| Hidden por evento passado | 2 | 0 | 2 | 0ca57b78 (Paulo Meirelles HOJE), 58f50d22 (submissão XXX Filosofia) |
| Closed | 1 | 0 | 1 | 754e2f50 (Ação social 4º Congresso — evento já aconteceu) |

Total após v3: **40/73 escondidos (55%)**.

## Mapeamento de correções (prompt para próxima iteração)

### Prioridade CRÍTICA (fazer primeiro)
1. **Decodificar shortcode → `ig_posted_at`** no stage `enrich-instagram`. Usar:
   ```js
   const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
   function shortcodeToDate(sc) {
     let id = 0; for (const c of sc) id = id * 64 + alphabet.indexOf(c);
     const ts = (id >> 23) + 1314220021;
     return new Date(ts * 1000);
   }
   ```
   Salvar em `metadata.ig_posted_at` (ISO string). **Sem isso, o bug da data inventada é INVISÍVEL**.
2. **Fix do scrub past dates em `pipeline-kino.js:1912-1921`**. Usar janela plausível (30 dias atrás a 18 meses à frente). Apaga data fora da janela em vez de só passada.
3. **Filtrar posts com `ig_posted_at > 90 dias` da data atual** no `enrich-instagram` (adicionar `rejection: ig_too_old`). Caso `fa5492f0` = 610 dias é absurdo.
4. **Extração de links do IG**: investigar por que `extracted_links` está vazio. Se "link na bio" detectado no caption, salvar como `metadata.has_bio_link = true` e usar bot de browser para buscar bio.

### Prioridade ALTA
5. **Validação imagem-pertence-ao-post**: rodar `image-text-similarity` ou hash perceptual (pHash) entre `image_url` do post e a imagem do shortcode original do IG. Se dissimilar, marcar `image_mismatch=true` e não publicar. Caso `5c7d19c3` (CONPEEX com capa Vestibular) é o exemplo mais gritante.
6. **Dedup de cross-account**: antes de publicar, comparar `source_url` (extraído do shortcode) com `source_unit` (perfil UFG). Se não bater, marcar `cross_account=true`. Se for perfil pessoal (@jordana.estudante, @prof.claudiolira) → rejeitar. Se for parceria UFG (outro org UFG) → aceitar mas marcar.
7. **Filtrar posts-resumo**: heurística no caption ("nosso agradecimento", "foi um sucesso", "esta semana nos dias X e Y") → marcar como `is_post_summary=true` e rejeitar.
8. **Reforçar dedup de cross-source**: o caso 3d500db4 vs c14bcf38 mostra que o dedup por `content_hash` (SHA256) não foi suficiente. Adicionar dedup por `source_id` (shortcode) — se 2 posts referenciam o mesmo shortcode, marcar como duplicata.

### Prioridade MÉDIA
9. **Fix taxonomia**:
   - Criar categoria `vestibular` (ou rebaixar para `academicos`)
   - Regras claras de oportunidade vs evento: "oficina/curso/seminário/simpósio/palestra" → evento; "inscrição/candidatura/submissão/vaga" → oportunidade
10. **Re-tagging automático de módulo**: depois de classificar, se o título contém "oficina|workshop|curso|seminário|painel|mesa-redonda" → forçar módulo=eventos.
11. **Buscar `extracted_links` via Playwright para perfis com "link na bio"**: criar script que abre o perfil do @handle e extrai o link da bio.

### Prioridade BAIXA
12. **Dicionário de abreviaturas** (ITBP, etc) no formatador para exibir nome completo.
13. **Validação de vestibular como não-emprego**: warning se `category=empregos` mas título contém "vestibular".

## Script de decodificação (reutilizável)

Salvo em `.tmp-audit-2026-07-25/decode-shortcodes.py`. Pode ser integrado como
`scripts/decode-instagram-shortcode.js` no stage `enrich-instagram` para preencher
`metadata.ig_posted_at` antes do scrub.

## Status final dos 73 posts (resumo)

### Publicados (32) — validados
| ID | Título | Imagem OK | Links OK | Relevante | Categoria |
|---|---|---|---|---|---|
| `30f0a487` | Centro de Línguas (27/07) | ✅ | ❌ | ✅ | academicos/eventos |
| `250a76a1` | 20º SNHCT Programação | ✅ | ❌ | ✅ | pesquisa/oportunidades |
| `4a2b7e8d` | 20º SNHCT Abertura | ✅ | ❌ | ✅ | pesquisa/eventos |
| `87195842` | Feira Flore-Ser (13/08) | ✅ | ❌ | ✅ | culturais/eventos |
| `ac85421d` | IX Simpósio Educação Inclusiva | ✅ | ❌ | ✅ | workshops/eventos |
| `85eb5e3d` | CERISE Summit (18/09) | ✅ | ✅ (cerise.ufg.br) | ✅ | pesquisa/oportunidades |
| `1b88b83a` | Editais PIP 2026/2027 | (não auditada) | ❌ | ✅ | bolsas/oportunidades |
| `b4af34f8` | Centro de Línguas (21/08) | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `3d500db4` | IX SIPACV encontro | ✅ | ❌ | ✅ | academicos/eventos |
| `7553d8bd` | 20º SNHCT lançamentos | ✅ | ❌ | ✅ | pesquisa/eventos |
| `858c8b0b` | Lapig Escola voluntários | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `f2ff9855` | Revista Pensar a Prática | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `ecca41c1` | Monitores Matemática MBM | (não auditada) | ❌ | ✅ | monitoria/oportunidades |
| `e2374c2d` | Letras especialização/mestrado | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `83e31bfb` | 4ª Feira Livro Cidade Ocidental | ✅ | ❌ | ✅ | culturais/eventos |
| `ebb3c886` | Monitoria 2026/2 Filosofia | (não auditada) | ❌ | ✅ | estagios/oportunidades |
| `af5aa701` | Lançamento 'Pensar como historiadora' | (não auditada) | ❌ | ✅ | workshops/eventos |
| `170b6b15` | Lançamento 'Pensar como historiadora' Livraria | (não auditada) | ❌ | ✅ (duplicata) | workshops/eventos |
| `4a1e5874` | Programação férias Planetário | (não auditada) | ❌ | ✅ | academicos/eventos |
| `31715ae7` | Publicações sumiram (defeso) | (não auditada) | ❌ | ⚠️ categoria=monitoria (errado) | oportunidades |
| `eba0b045` | Vestibular UFG 2027 edital | (não auditada) | ❌ | ✅ (categoria empregos errada) | empregos/oportunidades |
| `a8a66d60` | Concurso Câmara Ipameri | (não auditada) | ❌ | ✅ | empregos/oportunidades |
| `5a98dacf` | Concurso São Miguel Araguaia | (não auditada) | ❌ | ✅ | empregos/oportunidades |
| `cc13f596` | 23º CONPEEX Ciência Delas | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `b3918530` | Diálogos Pesquisa Inovação | (não auditada) | ❌ | ✅ | pesquisa/eventos |
| `447659fe` | Neuromielite Óptica HGG | ✅ | ❌ | ✅ | culturais/eventos |
| `2af0a1dd` | PPGBRPH mestrado/doutorado | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `1e7ad3ed` | CAPES Desenvolvimento Acadêmico Indígena | (não auditada) | ❌ | ✅ | bolsas/oportunidades |
| `a64b9482` | Oficina Bom Professor Medicina | (não auditada) | ❌ | ✅ | workshops/eventos |
| `85b1bfc5` | Microempreendedores PIB | ✅ | ❌ | ✅ | palestras/eventos |
| `680de838` | 33º Jornadas Jovens Pesquisadores AUGM | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |
| `cce405e1` | Matrículas SIGAA 2026/2 | (não auditada) | ❌ | ✅ | pesquisa/oportunidades |

### Escondidos (40) — razões
Ver tabela detalhada acima (IG_AGE > 90d, imagem errada, evento passado, cross-account pessoal, vestibular-em-empregos já passado, etc).

### Closed (1)
- `754e2f50` Ação social 4º Congresso Contabilidade (evento já aconteceu, participantes celebrados)

## Próximos passos

1. **Yan aplica os fixes prioritários** quando a pipeline terminar de rodar.
2. **Rodar nova auditoria** em 1 semana com os mesmos critérios.
3. **Acompanhar** se os vestibulares / oportunidades ainda têm módulo errado.
4. **Auditar periodicamente** com o script `decode-shortcodes.py` para detectar novos posts com data inventada.
5. **Bloquear o bug imagem-errada em produção** — adicionar pre-flight check que compara `image_url` do post com a imagem do shortcode antes de publicar.
