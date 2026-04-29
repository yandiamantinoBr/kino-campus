# V28 - Auditoria `unaccent`/FTS Pre-Migration

**Versao:** v28.0.0
**Atualizado em:** 2026-04-28
**Escopo:** auditoria estatica; sem executar SQL, sem alterar migrations

---

## 1. Objetivo

Mapear o impacto real de mover `unaccent` para fora de `public` antes de qualquer migration. A V28
nao resolve o advisor `extension_in_public`; ela reduz risco ao identificar os pontos que precisam
ser provados em banco isolado.

---

## 2. Achado Principal

`unaccent` esta acoplado a busca e feed por tres camadas:

| Camada | Evidencia | Risco se mover sem plano |
|---|---|---|
| Extensao | `CREATE EXTENSION IF NOT EXISTS unaccent` em migrations v9.2.x | Recriar em outro schema pode quebrar chamadas existentes |
| Wrapper | `public.kc_unaccent(input_text text)` chama `public.unaccent(...)` | Helper imutavel usado por FTS e filtros pode falhar ou mudar semantica |
| Indice/RPC | `idx_posts_fts` usa `public.kc_posts_search_document(...)`; `kc_search_posts_fts` usa `kc_unaccent` | Busca pode perder indice, quebrar ranking ou retornar resultado divergente |

---

## 3. Arquivos SQL Relevantes

| Arquivo | Linhas | Papel |
|---|---:|---|
| `supabase/migrations/v9.2.0.0_search_posts_fts.sql` | 16, 18-24, 74-78, 86-235 | Cria extensao, wrapper `kc_unaccent`, documento FTS, indice GIN e RPC `kc_search_posts_fts` |
| `supabase/migrations/v9.2.1.1_feed_request_params.sql` | 11, 13-18 | Recria extensao e define `kc_feed_normalize_text` usando `unaccent` direto |
| `supabase/migrations/v9.2.3.0_function_search_path_hardening.sql` | 6-8, 13-20, 23-29 | Mantem local da extensao, fixa `search_path=''` e troca normalizacao do feed para `public.kc_unaccent` |

---

## 4. Dependencias Funcionais

| Funcao/Objeto | Dependencia | Superficie afetada |
|---|---|---|
| `public.kc_unaccent(text)` | `public.unaccent(...)` | Normalizacao base |
| `public.kc_posts_search_document(text,text,text,jsonb)` | `public.kc_unaccent(...)` | Expressao indexada de FTS |
| `idx_posts_fts` | `kc_posts_search_document(...)` | Performance e ranking de busca |
| `public.kc_search_posts_fts(...)` | `kc_unaccent`, `plainto_tsquery`, `ts_rank_cd` | Busca publica server-side |
| `public.kc_feed_normalize_text(text)` | `public.kc_unaccent(...)` apos v9.2.3 | Filtros avancados do feed |

---

## 5. Ordem Segura Para V29+

1. Criar banco isolado com todas as 83 migrations aplicadas em ordem.
2. Confirmar schema atual da extensao com `pg_extension`, `pg_namespace` e `pg_proc`.
3. Medir objetos dependentes de `unaccent`, `kc_unaccent`, `kc_posts_search_document` e `idx_posts_fts`.
4. Testar alternativa sem tocar producao:
   - manter `public.kc_unaccent` como facade estavel;
   - mover apenas a extensao para schema dedicado se o Supabase permitir;
   - atualizar o corpo do wrapper para chamada qualificada nova;
   - recriar/validar indice GIN se necessario.
5. Reexecutar busca com acentos/sem acentos, feed filtrado e admin search.
6. Criar migration idempotente somente depois de prova com rollback.

---

## 6. Checks de Aceite do Spike

| Check | Esperado |
|---|---|
| `kc_unaccent('Goias')` | retorna forma normalizada consistente com estado atual |
| `kc_search_posts_fts('moradia', ...)` | retorna resultados comparaveis antes/depois |
| Busca com acento/sem acento | resultados equivalentes preservados |
| Feed com filtros textuais | filtros continuam normalizados |
| `idx_posts_fts` | indice existe e e usado ou refeito conscientemente |
| Rollback | restaura wrapper/extensao/indice para estado anterior |

---

## 7. Bloqueios

- Nao mover `unaccent` diretamente em producao.
- Nao remover `public.kc_unaccent`; ele e contrato interno para FTS/feed.
- Nao alterar `kc_posts_search_document` sem revisar `idx_posts_fts`.
- Nao tratar warning do advisor como mudanca puramente cosmetica.
- Nao commitar dumps, connection strings, project IDs privados ou saidas com dados reais.
