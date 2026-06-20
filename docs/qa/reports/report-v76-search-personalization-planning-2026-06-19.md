# Report V76.32 — planejamento de busca e personalização responsável

**Data:** 2026-06-19  
**Escopo:** auditoria e planejamento; sem alteração de runtime, HTML, CSS, SQL, migrations, dados, secrets ou deploy  
**Runtime frontend:** `8.6.1` inalterado

## Resultado

Foi criado o plano canônico para evoluir `/search-results.html` e `kcSearchDropdown` sem misturar busca estruturada, perfilamento, migration e redesign em uma única entrega.

A decisão principal é executar primeiro a indexação dos campos já produzidos pelos seis formulários. Personalização passa a ser trilha posterior, opt-in, explicável, com finalidade separada de analytics e teto de influência no ranking.

Fonte canônica: `docs/planning/v76-search-personalization-architecture-plan.md`.

## Evidência local

| Área | Achado |
|---|---|
| busca atual | FTS/fuzzy usa principalmente título, descrição, categoria, subcategoria e tags |
| criação | formulários coletam rota, região, preço, datas, horário, modalidade, área, condição, vagas e marcadores |
| página | filtros atuais são módulo, ordenação e encerrados; faltam facetas orientadas ao schema |
| dropdown | até oito resultados; combobox e controle de concorrência ainda incompletos |
| perfil | afiliação existe; câmpus/curso/interesses não formam modelo de preferência |
| sensíveis | gênero e raça/cor foram expressamente proibidos no ranking |
| afinidade | home/abas possuem afinidade, mas isso não autoriza busca personalizada |

## Pesquisa incorporada

- LGPD e guia da ANPD para princípios, direitos, decisões automatizadas, necessidade, balanceamento e salvaguardas;
- documentação PostgreSQL para FTS, ranking e `pg_trgm`;
- W3C APG para combobox acessível;
- NIST Privacy Framework e AI RMF para governança de risco;
- trabalhos primários sobre dois estágios, wide/deep, contextual bandits, DLRM e viés de popularidade;
- página oficial da UFG para catálogo versionado de câmpus/localidades.

O PDF oficial da ANPD, com 53 páginas, foi extraído e teve a capa renderizada para verificação. Os arquivos temporários não fazem parte do repositório.

## Gates

| Item | Estado |
|---|---|
| alterar ranking em produção | No-Go nesta etapa |
| nova coleta comportamental | No-Go sem finalidade/opt-in/retenção |
| usar gênero, raça ou inferir atributo protegido | proibido |
| embeddings/deep learning/contextual bandit | No-Go inicial |
| índice orientado ao schema | primeiro candidato funcional |
| registro + corpus dourado + testes | próxima entrega segura |

## Validação técnica

| Verificação | Resultado |
|---|---|
| `git diff --check` | aprovado |
| `npm run check:structure` | aprovado; 169 itens + raiz JS limpa |
| `npm run check:hygiene` | aprovado; runtime `8.6.1` |
| `npm run check:all` | aprovado; 182 suites / 3.643 testes / 3 snapshots |

Como o pacote é exclusivamente documental, não houve smoke visual, Playwright funcional, acesso ao Supabase ou deploy.

## Rollback

Reverter o plano, o índice documental e esta evidência. Não há asset, migration, dado ou serviço de produção para restaurar.
