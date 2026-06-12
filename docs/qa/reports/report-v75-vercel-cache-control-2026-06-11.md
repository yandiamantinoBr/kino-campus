# Report V75 - Vercel Cache-Control e X-Vercel-Cache

**Data:** 2026-06-11 America/Sao_Paulo
**Escopo:** verificacao do achado M4 de cache para sitemap e Open Graph
**Mudanca remota:** nao
**Dados sensiveis:** nenhum valor sensivel registrado; IDs de posts usados no probe foram redigidos

---

## 1. Objetivo

Confirmar se o achado de auditoria "sitemap/OG sem cache" ainda se sustenta no estado real do
codigo e da producao.

---

## 2. Estado Local Verificado

- `api/sitemap.js` define `Cache-Control: s-maxage=900, stale-while-revalidate=3600`.
- `api/og-product.js` define:
  - `s-maxage=300, stale-while-revalidate=600` para produto publicado resolvido;
  - `s-maxage=60, stale-while-revalidate=300` para fallback/noindex.
- `api/og-image.js` define `public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800`.

Referencias oficiais Vercel consultadas:

- https://vercel.com/docs/caching/cache-control-headers
- https://vercel.com/docs/caching/cdn-cache

A documentacao oficial indica que `s-maxage` e `stale-while-revalidate` podem ser consumidos pelo
CDN da Vercel e nao necessariamente aparecem no `Cache-Control` entregue ao browser. Por isso, o
probe deve observar tambem `X-Vercel-Cache`.

---

## 3. Producao Verificada

Comando-base usado em Windows:

```powershell
curl.exe --ssl-no-revoke -sSI <url>
```

Resultados observados, sem imprimir IDs de posts:

| Alvo | Status | Cache-Control visivel | X-Vercel-Cache |
|---|---:|---|---|
| `https://www.kinocampus.com.br/sitemap.xml` | 200 | `public, max-age=0, must-revalidate` | `HIT` |
| `https://www.kinocampus.com.br/api/sitemap` | 200 | `public, max-age=0, must-revalidate` | `MISS` no primeiro probe |
| `https://www.kinocampus.com.br/api/og-image?type=home` | 200 | `public, max-age=86400` | `MISS` inicial, `HIT` em repeticao |
| primeiro `product.html?id=...` vindo do sitemap | 200 | `public, max-age=0, must-revalidate` | `MISS` inicial, `HIT` em repeticao |

---

## 4. Conclusao

O achado M4, como "sem cache", esta desatualizado para o estado atual.

Ha cache efetivo no CDN para sitemap, OG product e OG image, confirmado por `X-Vercel-Cache: HIT`
apos aquecimento. O `Cache-Control` visivel ao browser nao deve ser usado isoladamente para concluir
ausencia de cache na Vercel, porque a plataforma pode consumir diretivas CDN como `s-maxage` e
`stale-while-revalidate`.

---

## 5. Fora de Escopo

- Nenhuma alteracao em `vercel.json`.
- Nenhuma alteracao em `api/sitemap.js`, `api/og-product.js` ou `api/og-image.js`.
- Nenhum deploy manual.
- Nenhum purge de cache.

Melhoria futura opcional: se for necessario separar explicitamente cache de browser e cache de CDN,
avaliar `Vercel-CDN-Cache-Control` ou `CDN-Cache-Control` em PR dedicado.
