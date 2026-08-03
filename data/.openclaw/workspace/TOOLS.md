# TOOLS.md - Cadu Bot (Kino Campus)

> Notas operacionais do Cadu Bot para publicação no Kino Campus.
> **Ler `docs/cadu-publication-standards.md` ANTES de publicar manualmente.**

## Padrões obrigatórios do Kino Campus

### Módulos aceitos

- `eventos` — palestras, oficinas, mostras, eventos culturais/esportivos
- `oportunidades` — monitoria, pesquisa, estágio, voluntariado, empregos, freelancer
- (NÃO usar: `compra-venda`, `moradia`, `caronas`, `achados-perdidos`, `marketplace` — esses têm fluxo próprio)

### Categorias aceitas por módulo

**eventos:** `academicos`, `workshops`, `culturais`, `esportivos`, `sustentabilidade`, `festas`
**oportunidades:** `monitoria`, `pesquisa`, `estagios`, `voluntariado`, `empregos`, `freelancer`

### Limites de caracteres

- `title`: 80 caracteres (sem "..." — finalizar se fonte truncar)
- `description`: 2000 caracteres (alvo 400-800)
- `localizacao`: 120 caracteres

### Markdown suportado (SOMENTE)

- `**negrito**`, `_itálico_`
- `[label](url)` com label descritivo (NUNCA URL solta)
- `[tel:+55...](tel:+55...)`, `[email@ufg.br](mailto:email@ufg.br)`
- `#`, `##`, `###`, `####` headings
- `- item` ou `1. item` (agrupar consecutivos em um único bloco)
- `\n` (newline real, NÃO `\\n`)

### Markdown NÃO suportado

- HTML puro (`<details>`, `<div>`, `<table>`)
- Code blocks com syntax highlight
- Imagens inline (`![alt](url)`) — usar `post_media` separado
- Entities (`&amp;` etc) — usar caracteres reais

## Regra de ouro das imagens

1. **SEMPRE preferir a imagem `og:image` ou primeira imagem da página-fonte** (geralmente `og:image` é a melhor)
2. **NUNCA usar thumb `l/` do Weby UFG** (128px) — usar `o/` (original) substituindo o path
3. **NUNCA usar CDN do Instagram/FB** como capa final — temporária
4. Se a imagem for SVG, gerar capa alternativa (PNG/JPG)
5. Capa: hospedar em Supabase Storage `kino-media/posts/<slug>/`, salvar URL em `posts.image_url` E `metadata.cover_url` E `metadata.image_url` E `metadata.gallery_image_urls[0]` (todas!)

## Como publicar via comando do Yan

Quando Yan enviar URL pelo Telegram:

1. **Saudar:** "Opa, Yan! Vou publicar. Me dá 30s."
2. **Acessar URL** (fetch ou browser)
3. **Identificar módulo** (eventos ou oportunidades) e categoria
4. **Procurar links secundários** (formulários, editais, páginas filhas) e acessar
5. **Construir description** com a estrutura canônica do `cadu-publication-standards.md § 1.2`
6. **Substituir imagens ruins** se houver (l/ do Weby, duplicatas)
7. **Publicar via Edge Function `cadu-publish`** (não direto no Supabase, a menos que seja B8)
8. **Confirmar** com link + resumo do que foi incluído
9. **Sinalizar lacunas** honestamente: "Não achei contato direto no site. Coloquei o link do edital como caminho de esclarecimento."

## Comandos do Telegram que o Cadu conhece

| Comando | Ação |
|---------|------|
| `publique <URL>` | Publica o conteúdo da URL (com enriquecimento profundo) |
| `publique <URL> como evento` | Força módulo `eventos` |
| `publique <URL> como oportunidade` | Força módulo `oportunidades` |
| `republique <post_id>` | Republica com mesmo conteúdo (deleta + republica) |
| `enriqueça <post_id>` | Acessa links secundários do post e adiciona info faltando |
| `capa <post_id> <URL>` | Troca a imagem de capa do post (atualizar TUDO: posts.image_url + metadata.cover_url + metadata.image_url + gallery_image_urls[0] + post_media) |
| `edite <post_id> título="..."` | Edita título do post |
| `edite <post_id> descrição="..."` | Edita descrição |
| `liste últimos 10` | Lista os 10 posts mais recentes do bot |
| `revisão` | Lista posts em revisão (precisam aprovação do Yan) |
| `aprovar <código>` | Aprova item em revisão |

## Integração com o Kino Campus

- **Site:** https://www.kinocampus.com.br
- **API direta:** `https://wacyrkwhkvzwkqpolrbg.supabase.co/rest/v1/posts` (service_role key)
- **Auth REST:** `https://wacyrkwhkvzwkqpolrbg.supabase.co/auth/v1/...` (conta dedicada `cadu@kinocampus.com.br`)
- **Storage:** `kino-media` bucket
- **Edge Functions:** `cadu-publish`, `cadu-ga4-reports`

## VPS

- **Host:** `srv1597083.hstgr.cloud` (Hostinger hPanel)
- **User:** `root` (com chave SSH)
- **Container:** `openclaw-hahq-openclaw-1` (Node 24)
- **Workspace:** `/docker/openclaw-hahq/data/.openclaw/workspace/scripts/`
- **Mirror local:** `C:\Users\yan1n\Documents\GitHub\kino-campus\data\.openclaw\workspace\scripts\`

## Pipeline de 6 estágios (resumo)

1. `cadu-curador-v4.4.js` — varre sites UFG (Tier 1+2+3) e gera candidatos
2. `enrich-duplicates.js` — marca itens já publicados
3. `formatador-ia.js` (DeepSeek V4 Flash) — gera `formattedDescription` Markdown rico
4. `publish_auto_v5.js` — envia pra Edge Function `cadu-publish`
5. `cadu-publish` (Deno) — valida, deduplica, completa metadata, sobe imagem, publica
6. `enrich-images.js` — adiciona imagens complementares aos posts publicados

**Modelo de IA atual:** DeepSeek V4 Flash. A única alternativa permitida é DeepSeek V4 Pro.

## Thresholds de auto-publicação

- **Score >= 0.78:** auto-publica (`review:preview` aceita)
- **Score 0.70-0.77:** revisão do Yan
- **Score 0.55-0.69:** revisão com flag
- **Score < 0.55:** descarta

## Lembretes importantes

- Yan é mestrando PPGADM/UFG, fuso BRT (UTC-3), idioma PT-BR
- Plataforma roda em Vercel + Supabase
- Repo público: https://github.com/yandiamantinoBr/kino-campus
- Cada PR precisa ser mergeado antes de deploy em produção
- Vercel auto-deploy via git push, mas às vezes trava (deploy manual: `vercel --prod`)

## Para ver mais

- `docs/cadu-publication-standards.md` — fonte de verdade de padrões de formatação
- `docs/cadu-operator-guide.md` — guia operacional completo
- `docs/cadu-workflow-hardening-2026-06-01.md` — hardening de 2026-06
- `docs/cadu-technical-feedback-request.md` — bugs pendentes + melhorias
