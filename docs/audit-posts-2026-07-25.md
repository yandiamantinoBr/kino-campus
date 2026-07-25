# Auditoria profunda de Posts KinoCampus — 2026-07-25 (v2)

**Escopo:** 56 posts criados entre 2026-07-24 00:00 UTC e 2026-07-25 09:00 UTC.
**Método:** query no Supabase, decode de shortcodes do Instagram (data original do post), validação cruzada com `source_url`, **download e leitura visual de 12 imagens suspeitas**, cruzamento módulo/categoria, comparação `original_title` vs `title` gerado.
**Hoje:** 2026-07-25 (BRT).

## TL;DR — Yan, achei problemas ainda piores do que a 1ª passagem

| # | Categoria | Posts | Gravidade |
|---|---|---|---|
| **1** | **Bug de data inventada**: pipeline soma +1 ano ao ano do post do IG | 13+ (12 confirmados) | CRÍTICO |
| **2** | **Imagem errada**: capa de OUTRO evento colada no post | 4 confirmados visualmente | CRÍTICO |
| **3** | **Duplicatas**: 2 posts sobre IX SIPACV com MESMA imagem, mesmo source, dedup não pegou | 1 par | ALTO |
| **4** | **Módulo errado**: "oficina/curso/seminário" marcados como oportunidade (são eventos) | 3 | ALTO |
| **5** | **Categoria errada**: Vestibulares em `empregos` (vestibular ≠ emprego) | 3 | ALTO |
| **6** | **95% sem `extracted_links`**: link de ação nunca extraído do IG | 53/56 | CRÍTICO estrutural |
| **7** | **Cross-account reposts**: source_url aponta para outro perfil que repostou | 15 (4 do UFG, 11 legítimos) | MÉDIO |
| **8** | **Posts-resumo** de evento passado republicados como oportunidade futura | 2 (EPE 2024, Semana Filosofia) | ALTO |

Total: **27/56 posts escondidos após auditoria (48%)**.

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

## 2. Imagens erradas — verificadas visualmente

| ID | Título | Imagem real | Status |
|---|---|---|---|
| `15ad7604` | Seminário de Estágio CEPAE (24-25/11/2026) | **IX Simpósio de Educação Inclusiva (16-19/09)** | ❌ Escondido |
| `b9d80395` | Curso Introdução ao Raspberry Pi | **CERISE Summit 2026 (18/set)** | ❌ Escondido |
| `b0e67827` | Entrega título Emérito ICB | **Convite 21/10/2025** (data errada, post fala 2026) | ❌ Escondido |
| `67b697a1` | I SIERGO | **Ateliê Geográfico (revista do IESA, não do SIERGO)** | ❌ Escondido |
| `85b1bfc5` | Estudo microempreendedores PIB | Banner da Live Todos Podem Empreender (correto) | ✅ Mantido |
| `3d500db4` | IX SIPACV encontro/diálogo | Banner oficial IX SIPACV FAV/UFG (correto) | ✅ Mantido |
| `c14bcf38` | IX SIPACV arte/cultura visual | **MESMO banner do 3d500db4** (duplicata) | ❌ Escondido |
| `7553d8bd` | 20º SNHCT | Banner oficial SNHCT (correto) | ✅ Mantido |
| `83e31bfb` | 4ª Feira Livro Cidade Ocidental | Banner oficial Prefeitura (correto) | ✅ Mantido |
| `aec57197` | Palestra Colgate | Foto 4 alunas UFG (correto) | ✅ Mantido |
| `447659fe` | Neuromielite Óptica HGG | Banner oficial exposição (correto) | ✅ Mantido |
| `a327935d` | Vestibular 2026 (defeso) | Card "Defeso Eleitoral" Reitoria (correto, mas post fala vestibular) | ❌ Escondido |
| `7553d8bd` | 20º SNHCT | Banner oficial | ✅ |

**Padrão claro**: a pipeline pega a imagem ERRADA quando há múltiplos posts do mesmo source_unit ou quando o `image-extract` reusa imagem de post adjacente. Falta validação de imagem-pertence-ao-post.

## 3. Duplicata confirmada: 3d500db4 vs c14bcf38 (IX SIPACV)

- Mesmo `source_id` (mesma shortcode IG `DbEVRpPDxRE`)
- Mesma imagem (198645 bytes idênticos)
- Títulos diferentes (gerados pela IA)
- `source_unit` diferente (3d500db4 → @ppgacv_ufg, c14bcf38 → @fav_ufg) — 2 perfis UFG repostaram o mesmo post do @sipacv_
- Dedup **não pegou** porque a comparação de `content_hash` (SHA256 da imagem) foi aplicada mas depois o `stage15_content_hash_dedup` mostrou que **na rodada do run 13288c00 só 10 pares foram auto-hidden, esse caso escapou** (talvez os IDs não estavam no mesmo batch)

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

## Casos Yan validados nesta v2

| Caso Yan | Veredito |
|---|---|
| "FEFD Solidária — setembro 2026 mas original 7/9/2025" | ✅ Confirmado (escondido) |
| "Espetáculo Mosqueiro" | ✅ Confirmado (escondido) |
| "Semana de Filosofia já passou" | ❌ Errado: evento 11-14/08 (futuro), mas submissão fechou 10/07 (escondido) |
| "ITBP" (Oficina Fundos Europeus) | ✅ Cross-account + sem link (já estava hidden) |
| "SIERGO com imagem do Ateliê Geográfico" | ✅ Confirmado (escondido) |
| "Oficina Maker Tinkercad — link da bio" | ✅ Confirmado (escondido) |

**Achados NOVOS (não estavam na v1)**:
- 🆕 **Seminário de Estágio CEPAE** com imagem do Simpósio de Educação Inclusiva
- 🆕 **Curso Raspberry Pi** com imagem do CERISE Summit
- 🆕 **ICB Emérito** com convite de 2025 republicado como 2026
- 🆕 **3 Vestibulares** em categoria `empregos` (deveria ser outra)
- 🆕 **IX SIPACV** post duplicado (dedup falhou)
- 🆕 **3 posts com módulo errado** (evento marcado como oportunidade)
- 🆕 **Posts eventos com módulo "monitoria"** (31715ae7, "Publicações sumiram" não é monitoria)

## Ações aplicadas nesta v2

| Ação | # | Posts |
|---|---|---|
| Hidden por imagem errada | 4 | 15ad7604, b9d80395, b0e67827, 67b697a1, c14bcf38 |
| Hidden por duplicata | 1 | c14bcf38 (manter 3d500db4) |
| Marcado com cross-account | 1 | 447659fe (faltava) |

Total após v2: **27/56 escondidos (48%)**.

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
   Salvar em `metadata.ig_posted_at` (ISO string). **Sem isso, o bug da data inventada é INVISÍVEL** (já implementei em `.tmp-audit-2026-07-25/decode-shortcodes.py`).
2. **Fix do scrub past dates em `pipeline-kino.js:1912-1921`**. Usar janela plausível (30 dias atrás a 18 meses à frente). Apaga data fora da janela em vez de só passada.
3. **Filtrar posts com `ig_posted_at > 90 dias` da data atual** no `enrich-instagram` (adicionar `rejection: ig_too_old`).
4. **Extração de links do IG**: investigar por que `extracted_links` está vazio. Se "link na bio" detectado no caption, salvar como `metadata.has_bio_link = true` e usar bot de browser para buscar bio.

### Prioridade ALTA
5. **Validação imagem-pertence-ao-post**: rodar `image-text-similarity` ou hash perceptual (pHash) entre `image_url` do post e a imagem do shortcode original do IG. Se dissimilar, marcar `image_mismatch=true` e não publicar.
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

## Próximos passos

1. **Yan aplica os fixes prioritários** quando a pipeline terminar de rodar.
2. **Rodar nova auditoria** em 1 semana com os mesmos critérios.
3. **Acompanhar** se os vestibulares / oportunidades ainda têm módulo errado.
4. **Auditar periodicamente** com o script `decode-shortcodes.py` para detectar novos posts com data inventada.
