# Padrões de Publicação no Kino Campus (referência para o Cadu / OpenClaw)

Documento canônico dos padrões de formatação e publicação que o **Cadu / OpenClaw** deve seguir ao gerar posts no Kino Campus, seja via pipeline automática (cadu-curador → formatador-ia → cadu-publish), seja via comando manual do Yan via Telegram. **Este documento é a fonte de verdade** para o formato de `title`, `description`, metadados, imagens e links — e é atualizado a cada regressão detectada.

> Última revisão: 2026-07-10 (regressão detectada nos posts `b72f0f4c` Fastcamp EMC e `380404b0` PPGNUT/FANUT — enriquecimento profundo + troca de capa + sincronização de metadata.image_url). Mantido por Mavis.

---

## 1. Anatomia de um post bem publicado

Campos críticos observados em posts de referência (`0ac23479` CL UFG, `b72f0f4c` Fastcamp EMC, `380404b0` PPGNUT após enriquecimento de 2026-07-10):

### 1.1 `title` (string, máximo ~80 caracteres)

- **Sem truncamento** com `…` ou `...`. Se o título fonte está truncado, **finalize-o** com o nome completo do evento/edital.
- **Sem prefixo institucional redundante**: NÃO começar com "UFG,", "UFG:", "UFG —", "UFG -", "UFG |", "SECOM:", "PROEX:", "SECOM," etc. O nome da fonte vai automaticamente em `metadata.source_unit`.
- **Capitalização preservada**: "Mamma Mia - O Musical" não "Mamma Mia O Musical"; "XIV Simpósio" não "Xiv Simposio".
- **Foco no objeto** (evento/oportunidade), não na unidade promotora.

**Bom:** "Inscrições abertas para aluno especial no PPGNUT (Nutrição e Saúde) — FANUT/UFG"
**Ruim:** "Inscrições abertas para aluno especial no Programa de Pós-Graduação em"

### 1.2 `description` (Markdown, 400-2000 caracteres)

Estrutura canônica (sempre nesta ordem):

1. 🚨/📢 **Lead chamativo** com emoji + informação principal em **negrito**
2. 📅 **Datas/prazos** — uma linha por data, prazo final em **negrito**
3. 📊/🎯/💰 **Info-chave** (vagas, valores, requisitos, público) — números em **negrito**
4. 📝 **Etapas/requisitos** numeradas (se houver: provas, formulários, etc)
5. 📍 **Local/modalidade** (se aplicável)
6. ✉️ **Contato** (email + telefone institucional)
7. 📄/📝/🌐/🔗 **Bloco de links REAIS** — cada um com label específico
8. 📌 **Fonte:** no final (unidade/UFG)

**Markdown suportado pela plataforma:**
- `**negrito**`, `_itálico_`
- `[label](url)` — links com label
- `#/##/###/####` — headings (h1..h4)
- `- item` / listas numeradas — agrupadas em `<ul>` se consecutivas
- `tel:` e `mailto:` — links diretos
- Quebras de linha via `\n` (NÃO `\\n`)

**Markdown NÃO suportado:** HTML puro, `<details>`, tabelas, code blocks com syntax highlight.

### 1.3 `image_url` e `post_media`

**SEMPRE preferir imagens grandes e nítidas:**

| Origem | URL pattern | Qualidade |
|--------|-------------|-----------|
| Weby UFG (imagem original) | `https://files.cercomp.ufg.br/weby/up/NNN/o/NOME.png` | ✅ Original (alta) |
| Weby UFG (thumbnail 128px) | `https://files.cercomp.ufg.br/weby/up/NNN/l/NOME.png` | ❌ Thumbnail (baixa) |
| Weby UFG (medium 320px) | `https://files.cercomp.ufg.br/weby/up/NNN/m/NOME.png` | ⚠️ Média |
| CDN Instagram | `instagram.frec*.fbcdn.net` | ❌ Temporária (não usar como capa final) |
| Facebook CDN | `scontent*.fbcdn.net` | ❌ Não usar |
| Supabase Storage | `wacyrkwhkvzwkqpolrbg.supabase.co/storage/v1/object/public/kino-media/...` | ✅ Hospedado (preferir) |

**Regra:** ao fazer upload para o bucket `kino-media`, a capa vai como `post_media` com `is_cover=true, sort_order=0`. Demais imagens vão com `sort_order=1, 2, ...` e `is_cover=false`. **MÁXIMO 12 imagens** (limite `KC_CREATE_MAX_IMAGES`).

**Regressão conhecida 2026-07-10:** o cadu-curador às vezes insere a thumb `l/` (128px) como segunda imagem em `post_media`. Antes de publicar, **remover** qualquer imagem de `post_media` que:
- tenha URL contendo `/l/` do Weby UFG
- tenha resolução < 600px de largura
- seja repetida (mesma origem que a capa em resolução menor)
- tenha `is_cover=false` mas visualmente idêntica à capa

### 1.4 Metadados obrigatórios (campos normalizados)

| Campo | Tipo | Onde vai | Quem preenche |
|-------|------|----------|----------------|
| `metadata.source_url` | string | metadata | cadu-curador (sempre) |
| `metadata.source_id` | string | metadata | cadu-curador (formato `<unidade>:<url>`, ex: `emc:https://emc.ufg.br/n/202672`) |
| `metadata.source_host` | string | metadata | cadu-curador (ex: `emc.ufg.br`) |
| `metadata.source_unit` | string | metadata | cadu-curador (ex: `emc`) |
| `metadata.link` | URL ação | metadata | cadu-curador (URL **acionável** — formulário, edital, página de inscrição) |
| `metadata.actionLabel` | string | metadata | cadu-ufg-publisher ou fallback |
| `metadata.actionKey` | slug | metadata | cadu-ufg-publisher ou fallback |
| `metadata.contato` | email | metadata | extrator (só colocar se REAL) |
| `metadata.deadline_date` | YYYY-MM-DD ou DD/MM/YYYY | metadata | extrator (SEMPRE) |
| `metadata.data_evento` | YYYY-MM-DD | metadata | extrator (se evento) |
| `metadata.hora_evento` | HH:mm | metadata | extrator (se aplicável) |
| `metadata.local` | string | metadata | extrator |
| `metadata.categoria` / `categoriaKey` / `categoryKey` | string | metadata | extrator (sempre preenchido) |
| `metadata.gratuito` | boolean | metadata | default `true` |
| `metadata.image_url` / `cover_url` | URL | metadata | cadu-publish (sincronizado com posts.image_url) |
| `metadata.gallery_image_urls` | array | metadata | cadu-publish (lista das URLs do post_media) |
| `metadata.enrichment_sources` | array | metadata | cadu-curador (fontes consultadas — oficial, instagram, web) |
| `metadata.cadu_published` | boolean | metadata | true (sempre, em posts via cadu) |
| `metadata.cadu_run_id` | string | metadata | cadu-publish (B7: hoje vem vazio por bug — ver § 5) |
| `metadata.content_hash` | hex 8 chars | metadata | dedup (pode divergir para mesma source se enrichment muda) |
| `metadata.pdfLinks` | array | metadata | extrator (PDFs oficiais — editais, retificações) |
| `metadata.formattedTitle` | string | metadata | formatador-ia (espelho de posts.title) |
| `metadata.formattedDescription` | string | metadata | formatador-ia (espelho de posts.description) |

---

## 2. Enriquecimento profundo (PROBLEMA ATUAL — REGRESSÃO 2026-07-10)

### 2.1 Comportamento esperado

Quando o post vem da curadoria automática, o **cadu-curador** deve:

1. Abrir a `source_url` principal
2. Identificar **links secundários** na página (editais, formulários, páginas do programa, PDFs)
3. Acessar **cada link secundário** e extrair:
   - Cronograma completo (datas, prazos, horários)
   - Contato (email + telefone reais)
   - Local/endereço completo
   - Lista de documentos/link para download (PDFs)
4. Adicionar tudo isso à `description` formatada e em `metadata.pdfLinks` / `metadata.enrichment_sources`
5. Trocar a capa se a imagem oficial do programa for melhor que a `og:image` capturada

### 2.2 Comportamento atual (insuficiente)

A pipeline automática, em muitos casos, **publica com base apenas na página de NOTÍCIA**, sem acessar a página do PROCESSO SELETIVO / EVENTO detalhada. Resultado: posts com `description` superficial ("Modalidade e local: consulte o edital oficial" — placeholder genérico em vez de info real).

**Caso real observado 2026-07-10:**

- **Post `380404b0` (PPGNUT/FANUT)** publicado às 22:59 BRT 2026-07-09 com base apenas em `https://fanut.ufg.br/n/202651` (página de notícia). Quando o Cadu acessou a página real do processo seletivo (`https://ppgnut.fanut.ufg.br/n/202545-processo-seletivo-ppgnut-2026-2-aluno-especial`), descobriu:
  - **Formulário de Inscrição** (`docs.google.com/forms/.../viewform?usp=publish-editor`)
  - **Solicitação de GRU** (`docs.google.com/forms/.../viewform`)
  - **Edital 002/2026 (PDF oficial)** no Weby UFG
  - **Retificação 01/2026 (PDF)**
  - **Email oficial** (`ppgnut.fanut@ufg.br`)
  - **Endereço completo** (Rua 227, Qd. 68, s/nº, Setor Leste Universitário, CEP 74.605-080)
  - **Telefone** ((62) 3209-6270)
  - **Card/Capa oficial** do processo seletivo (`Card_Processo_Seletivo.png`)
  - **Horário de atendimento** (SEG a SEX 07h–18h)

Nenhum desses dados chegou ao post original. Só após o Mavis (intervenção manual) pegar `https://ppgnut.fanut.ufg.br/n/202545` o post ficou completo.

**Correção implementada 2026-07-10:** enriquecimento manual via Mavis para os 2 posts do dia (Fastcamp EMC + PPGNUT). **Correção sistemática pendente** no `cadu-curador` para que a próxima vez a pipeline visite o link secundário automaticamente.

### 2.3 Como o Cadu deve proceder quando o Yan pedir manualmente

Quando o Yan enviar uma URL pelo Telegram e disser "publique isso" / "publique e formate" / "publique igual o do Fulano":

1. **Acessar a URL fornecida** (fetch ou browser)
2. **Procurar links secundários** na página: `forms.gle`, `docs.google.com/forms`, links para páginas filhas (ex: `ppgnut.fanut.ufg.br/n/...` quando o post é de `fanut.ufg.br`), PDFs de editais
3. **Acessar cada link secundário** em paralelo e extrair cronograma, contatos, local
4. **Procurar imagem oficial** maior que a capa atual (`og:image` ou primeira imagem da página)
5. **Construir `description`** com TODOS os dados extraídos, na ordem canônica (§ 1.2)
6. **Substituir imagens em `post_media`** se houver thumb `l/` (128px) ou duplicata de baixa resolução
7. **Publicar via `kc-publish` Edge Function** com `enrichment_sources` preenchido e `pdfLinks` se houver PDF
8. **Confirmar ao Yan** com o link final do post, lista do que foi incluído, e avisar se faltou algo

---

## 3. Bug conhecido: `metadata.image_url` dessincronizado de `posts.image_url`

### 3.1 Sintoma

Após substituir a imagem de capa via UPDATE em `posts.image_url`, a página renderiza a imagem ANTIGA.

### 3.2 Causa

A Edge Function `og-product.js` (e a UI frontend via `product.render.js`) lêem **vários campos de imagem** em ordem de prioridade:

```js
// api/og-product.js, função getPostImage(), linhas 196-217
post.image_url, post.imageUrl, post.cover_url, post.coverUrl,
metadata.cover_url, metadata.coverUrl, metadata.image_url, metadata.imageUrl,
metadata.og_image, metadata.ogImage, metadata.thumbnailUrl,
post.images, post.imagens, post.image_urls, post.gallery_image_urls,
metadata.images, metadata.imagens, metadata.image_urls,
metadata.gallery_image_urls, metadata.galleryImageUrls,
mediaCandidates  // ← vem de post_media com is_cover=true
```

Se `metadata.cover_url` ou `metadata.image_url` ainda apontam para a imagem ANTIGA, ela ganha prioridade sobre `posts.image_url` (mesmo que atualizado).

### 3.3 Workaround atual

Sempre que trocar a imagem de capa, atualizar **TODOS estes campos** em `metadata`:

```sql
UPDATE posts SET metadata = jsonb_set(metadata, '{cover_url}', '"<NEW_URL>"') WHERE id = '<POST_ID>';
UPDATE posts SET metadata = jsonb_set(metadata, '{image_url}', '"<NEW_URL>"') WHERE id = '<POST_ID>';
-- (e imageUrl, gallery_image_urls[0])
```

E substituir a row de `post_media` com `is_cover=true, sort_order=0`.

### 3.4 Fix correto (pendente)

Modificar `api/og-product.js` para que `post.image_url` tenha prioridade ABSOLUTA sobre `metadata.cover_url` quando ambos estão presentes e diferentes (assumir `posts.image_url` como fonte de verdade). Ou: ao salvar, propagar `posts.image_url` → `metadata.cover_url` automaticamente.

---

## 4. Imagens — regras de qualidade

### 4.1 Resolução mínima aceitável

- Capa: ≥ 800x600px (mínimo), ideal 1200x720 ou maior
- Imagens de galeria: ≥ 600px de largura
- Thumbs `l/` (128px) do Weby UFG: **NUNCA usar como capa ou galeria** — só servem para preview no card da home

### 4.2 Quando o site-fonte só oferece thumb pequena

Baixar a versão `o/` (original) do Weby UFG diretamente. O caminho é `https://files.cercomp.ufg.br/weby/up/NNN/o/<nome>` (substituir `l/` por `o/`).

### 4.3 Quando o site não oferece imagem usável

- Tentar `og:image` da página (sempre vale a pena)
- Tentar Instagram oficial do programa (via `scan-ig-browser.js` autenticado)
- Em último caso, gerar capa com a logo do programa + título do evento (placeholder visual aceitável)

### 4.4 Storage no Supabase

- Bucket: `kino-media`
- Pasta: `posts/<slug-curto>/` (ex: `posts/cl-ufg-2026-2/`)
- Content-type: `image/png` ou `image/jpeg`
- Cache-Control: `3600` (1h) — a UI usa o `?v=<commit-sha>` para cache-bust, então 1h está OK
- Filename kebab-case: `ppgnut-card.png`, `tabela-alemao.png`, `whatsapp-matriculas-2026.jpeg`

---

## 5. Bugs conhecidos da pipeline (open issues 2026-07-10)

| ID | Severidade | Bug | Workaround |
|----|------------|-----|------------|
| B7 | Médio | `metadata.cadu_run_id` vem vazio em todos os posts publicados pelo bot | Não bloqueia, mas dificulta auditoria. Investigar `cadu-publish/index.ts` linha ~XX |
| B8 | Crítico | `cadu-publish` Edge Function retorna HTTP 500 (`module is not defined`) desde 2026-07-08 | Fallback para INSERT direto via service_role + bot JWT. Funcional mas perde auditoria |
| B9 | Médio | Dedup escolhe `status='deleted'` em vez de `status='hidden'` — quebra URLs compartilhadas | Trocar `delete` por `update({status:'hidden'})` em `dedup-kino.js` |
| B10 | Baixo | `content_hash` muda entre runs do mesmo `source_id` quando há enrichment | Verificar `quality-gate.js` para não incluir timestamps no hash |

---

## 6. Comportamento esperado do Cadu (bot Telegram)

Quando o Yan enviar mensagem no Telegram com conteúdo de post:

### 6.1 Saudação inicial obrigatória

> "Opa, Yan! Vou publicar isso no Kino. Me dá 30s que eu volto com o link."

### 6.2 Fluxo de enriquecimento (§ 2.3)

### 6.3 Confirmação final (sempre com transparência)

> "Publiquei! [link] — incluí X links reais, Y imagens, Z documentos. Se quiser ajustar X, é só falar."

Se algo ficou faltando, listar explicitamente: "Não achei [contato / cronograma / edital] no site. Achei [alternativa]. Posso complementar com [fonte]?"

### 6.4 Padrões de Markdown que o Cadu DEVE conhecer

| Suportado | Não suportado |
|-----------|---------------|
| `**negrito**`, `_itálico_` | HTML puro (`<div>`, `<details>`) |
| `[label](url)` | Tabelas Markdown |
| `# ## ### ####` headings | Code blocks com syntax highlight |
| `- item`, `1. item` | Imagens inline (`![alt](url)`) — não renderiza, usar post_media |
| `[tel:+556235211135](tel:...)` | HTML entities (`&amp;`) — usar caracteres reais |
| `[email@ufg.br](mailto:...)` | |

---

## 7. Referências

- `docs/cadu-operator-guide.md` — guia operacional do Cadu Bot
- `docs/cadu-workflow-hardening-2026-06-01.md` — ajustes de workflow
- `docs/cadu-technical-feedback-request.md` — pauta técnica
- `docs/platform-map.md` — módulos e contrato de publicação
- `services/cadu-ufg-publisher/src/formatador-ia.js` (VPS) — implementa SYSTEM_PROMPT
- `services/cadu-ufg-publisher/src/publisher.js` (VPS) — implementa publish
- `api/og-product.js` — Edge Function que gera HTML canônico do post
- `api/cadu-publish/index.ts` — Edge Function que recebe itens do publisher e insere no Supabase
- `assets/js/controllers/public/product.render.js` — UI que renderiza posts (cliente)
- `assets/js/controllers/public/product.edit.js` — UI de edição manual (admin)

---

**Mantido por:** Mavis (Yan + Mavis workflow)
**Quando atualizar:** a cada regressão detectada, antes de PR ou commit relevante.
**Última regressão documentada:** 2026-07-10 (enriquecimento FANUT/EMC + capa trocada + metadata sync).
