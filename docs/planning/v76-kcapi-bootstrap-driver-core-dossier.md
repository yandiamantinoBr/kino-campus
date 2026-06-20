# V76 JS-I.4 — Dossiê de `bootstrap-driver-core`

**Versão:** v76.29.0
**Data:** 2026-06-19
**Escopo:** investigação documental e auditoria automatizada; sem alterar runtime, HTML, CSS, adapters, SQL, secrets ou deploy

## 1. Decisão

`bootstrap-driver-core` permanece na fachada `assets/js/api/kc-api.client.js`.
A análise mostra que o bucket não é uma unidade coesa pronta para extração: suas
12 funções / 131 linhas atravessam cinco domínios, seis membros públicos, estado
mutável, política de produção, rede, fallback estático e seleção de driver.

Decisão canônica: `no-go-runtime-extraction`.

O objetivo desta etapa é substituir o rótulo genérico “alto risco” por uma
matriz reproduzível de funções, sinais de risco e gates necessários antes de
qualquer mudança futura.

## 2. Matriz medida

Fonte: `npm run audit:kcapi-residual`.

| Domínio | Risco | Funções | Linhas | Exportadas |
|---|---|---:|---:|---|
| `environment-policy` | crítico | 3 | 69 | — |
| `transport-config` | alto | 4 | 26 | `setConfig`, `fetchJSON`, `apiURL` |
| `error-contract` | médio | 1 | 3 | — |
| `static-database-fallback` | alto | 2 | 25 | `getDatabaseRaw`, `getDatabaseNormalized` |
| `adapter-registry` | crítico | 2 | 8 | `registerAdapter` |
| **Total** | — | **12** | **131** | **6** |

`bootstrapConfig`, `kcApiError`, `enforceSupabaseOnProduction`, `withTimeout`,
`readEnv` e `getActiveDriver` são privados, mas estão diretamente acoplados aos
membros públicos e aos wrappers da fachada.

## 3. Domínios e contratos

### `environment-policy`

Funções: `readEnv`, `bootstrapConfig`, `enforceSupabaseOnProduction`.

Responsabilidades inseparáveis hoje:

- merge de defaults e `window.KC_ENV`;
- normalização de `APP_ENV`/`environment` e `DATA_DRIVER`/`driver`;
- aliases Supabase e fallback placeholder;
- política fail-closed `PRODUCTION_REQUIRES_SUPABASE`.

### `transport-config`

Funções: `setConfig`, `withTimeout`, `fetchJSON`, `apiURL`.

Este é o primeiro domínio a reavaliar no futuro por ser o menor recorte com
limites reconhecíveis. Ainda assim, três funções são públicas e `fetchJSON`
depende de `cfg.timeoutMs`, portanto não há extração aprovada nesta etapa.

### `error-contract`

Função: `kcApiError`.

É pequena, mas o formato `{ ok:false, error:{ message } }` é consumido por
wrappers de mutação. Extraí-la isoladamente não reduz risco ou tamanho de forma
material.

### `static-database-fallback`

Funções: `getDatabaseRaw`, `getDatabaseNormalized`.

`getDatabaseNormalized` ainda é usado por busca e quatro controllers de módulo;
preserva fallback `data/database.json`, `normalizePost` e autores mock. Qualquer
movimento exige paridade de dados e ordem de URLs.

### `adapter-registry`

Funções: `registerAdapter`, `getActiveDriver`.

`registerAdapter` é chamado pelos adapters local e Supabase e por vários testes.
`getActiveDriver` é privado, mas alimenta wrappers em toda a fachada. A ordem
Supabase → local → fail-fast é contrato transversal e mantém risco crítico.

## 4. Chamadas externas observadas

- adapters local e Supabase chamam `KCAPI.registerAdapter`;
- adapters locais leem `KCAPI.fetchJSON` e `KCAPI.apiURL`;
- busca e controllers de compra/venda, moradia, oportunidades e achados/perdidos
  chamam `KCAPI.getDatabaseNormalized` como fallback;
- testes de contrato e integração registram adapters diretamente.

Não foi encontrado uso externo direto de `KCAPI.setConfig`, mas ele continua
público e não pode ser removido sem decisão de contrato.

## 5. Gates obrigatórios

O auditor registra 15 gates:

1. paridade de ambiente local/Supabase;
2. política fail-closed de produção;
3. aliases de `KC_ENV`;
4. contrato público de `setConfig`;
5. rejeição por timeout;
6. mapeamento de erro HTTP;
7. resolução relativa de `baseURL`;
8. formato público de erro;
9. ordem do fallback `database.json`;
10. paridade de `normalizePost`;
11. paridade de autores mock;
12. ordem de registro dos adapters;
13. fallback para driver local;
14. seleção do driver Supabase;
15. falha explícita sem adapter.

## 6. Próxima ação permitida

Antes de qualquer extração, adicionar testes comportamentais específicos de
paridade. O primeiro domínio que pode ser reavaliado é `transport-config`, mas
somente após cobrir `setConfig`, timeout, erros HTTP e resolução de URL.

Continuam bloqueados:

- criar `kc-api.bootstrap.js` movendo as 12 funções de uma vez;
- retirar `registerAdapter` ou os fallbacks públicos da fachada;
- alterar ordem local/Supabase;
- misturar essa investigação com CSS, migrations ou providers.

## 7. Rollback

Remover `bootstrapCore` do JSON/Markdown do auditor e os contratos estruturais
correspondentes. Como não há alteração de runtime, não existe rollback remoto.
