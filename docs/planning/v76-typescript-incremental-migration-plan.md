# V76 — Plano incremental de TypeScript para o Kino Campus

**Data:** 2026-08-24
**Escopo:** decisão e roteiro técnico; nenhuma mudança de runtime, banco, deploy ou Pipeline Completa
**Decisão atual:** **Go para contratos TypeScript isolados em `types/` com `noEmit`; pilotos JSDoc/checkJs continuam condicionados a uma tranche própria; No-Go para reescrita total e para Rust no núcleo**

**Atualização de execução (2026-08-27):** o pedido explícito do mantenedor autorizou
a revisão estreita da política de stack. A Fase 1 passa a permitir TypeScript
`5.9.3` somente como dependência de desenvolvimento, com configuração dedicada,
tipos Supabase versionados e CI sem emissão. O runtime público, a Pipeline Completa,
as páginas e a esteira Vercel permanecem inalterados por essa adoção.

**Piloto Fase 2 (2026-08-27):** `kc-post-user-tags.shared.js` passou a ser o único
asset público incluído por `tsconfig.umd-pilot.json`. O gate usa `allowJs`,
`checkJs`, `strict` herdado e `noEmit`; mantém o arquivo UMD e sua URL, adiciona
tipos JSDoc para normalização/leitura/validação/patch e valida o consumo por um
type-test. Nenhum outro script do navegador entra implicitamente no projeto.

## 1. Decisão

O próximo ganho de confiabilidade deve vir de TypeScript aplicado gradualmente às
fronteiras que já possuem contratos e cobertura de testes. Não há evidência de que
uma reescrita total, um bundler novo ou Rust resolvam o gargalo atual da plataforma.

O caminho escolhido é:

1. preservar os scripts clássicos, UMD, ordem de carregamento, URLs com revisão e
   artefatos estáticos existentes;
2. introduzir tipos sem emissão de JavaScript e sem converter páginas inteiras;
3. começar por módulos puros que já rodam tanto no navegador quanto no Jest;
4. mover contratos de dados antes de mover implementação;
5. medir erros encontrados, tempo de CI, tamanho de artefatos e regressões antes de
   ampliar o escopo.

Não se deve iniciar conversão de código da Pipeline Completa enquanto houver uma
frente ativa alterando seu contrato de execução. Qualquer tipagem de DTOs de Cadu
deve acontecer depois da estabilização desse fluxo, em uma PR separada.

### Gate de governança da stack

O guia arquitetural foi reconciliado em 2026-08-27 para permitir apenas contratos
em `types/`, validados por `tsconfig.contracts.json` com `noEmit`. A permissão não
se estende a scripts do navegador, JSDoc/checkJs em arquivos publicados, bundlers,
transpilação, alteração de URLs/ordem ou dependência de desenvolvimento no build
da Vercel. Qualquer ampliação exige nova tranche, testes e decisão explícita.

## 2. Evidência do repositório em 2026-08-24

| Área | Evidência local | Consequência para a migração |
|---|---|---|
| Runtime raiz | package.json CommonJS, Node 24, sem tsconfig.json ou jsconfig.json na raiz | TypeScript não pode ser imposto globalmente de uma vez |
| Código | 618 arquivos .js, 6 .cjs, 6 .mjs, 50 .ts e 2 .tsx fora de dependências e dist | A maior parte do produto ainda é JavaScript |
| Frontend | 33 páginas referenciam 175 arquivos em assets/js por cadeias ordenadas de scripts defer | renomear arquivos ou trocar para ESM altera ordem, globais e cache |
| Fronteiras TypeScript existentes | Edge Functions em supabase/functions e app isolado apps/pitch-institucional | há prática TypeScript, mas em runtimes próprios |
| API e servidor | api/package.json e server/package.json são ESM separados | cada runtime precisa de configuração própria |
| Serviço Cadu | services/cadu-ufg-publisher é CommonJS e concentra coleta, IA, PDFs, qualidade, estado e publicação | qualquer piloto futuro fica isolado do browser e só começa após a estabilização operacional da Pipeline |
| Testes | Jest, Playwright, LHCI e npm run check:all já existem | a migração pode ser protegida por gates que já são familiares |
| Módulos puros | kc-search-query-parser.shared.js, kc-post-lifecycle.shared.js, kc-post-user-tags.shared.js e kc-search.shared.js usam UMD e têm testes diretos | são os primeiros candidatos seguros |

Os módulos UMD são deliberadamente compartilhados entre browser e Node. O ciclo de
vida, as tags de usuário e a busca expõem a mesma definição tanto em window quanto
em module.exports. Esse contrato não deve ser quebrado durante os primeiros pilotos.

## 3. Por que TypeScript, e por que agora

TypeScript ataca os riscos mais visíveis sem trocar o runtime:

- payloads heterogêneos de post, metadata e respostas Supabase;
- dependências de ordem entre scripts globais;
- nomes de campos que cruzam API, adaptadores, renderização e testes;
- contratos de Cadu, revisões e funil que precisam permanecer explícitos;
- refactors de módulos compartilhados, nos quais um parâmetro ou retorno incorreto
  hoje só aparece em teste ou em produção.

O compilador deve iniciar como verificador sem emissão, e não como uma nova esteira
de bundling. A primeira métrica não é quantidade de arquivos convertidos, mas
quantidade de incompatibilidades reais detectadas sem regressão de execução.

## 4. Por que Rust não é a próxima mudança

Rust seria uma escolha inadequada para o núcleo atual porque o trabalho dominante
é browser, I/O de APIs, Supabase, Edge Functions e orquestração de conteúdo. Uma
introdução prematura criaria:

- outro toolchain e artefatos binários ou WASM para suportar em Windows, CI e deploy;
- fronteiras de serialização adicionais para dados de post e de pipeline;
- maior custo de depuração em fluxos já escritos em JavaScript e TypeScript;
- risco de alterar o comportamento de browser, cache ou Edge Functions sem uma
  hipótese de desempenho comprovada.

Rust só volta à pauta se uma medição reproduzível provar um gargalo CPU-bound
isolado, por exemplo hashing de mídia ou ranking puramente determinístico, e se o
componente tiver entrada e saída versionadas, benchmark comparativo e fallback
JavaScript. Mesmo nesse cenário, deve ser um worker ou biblioteca isolada, nunca
uma reescrita da plataforma.

## 5. Arquitetura-alvo de baixo risco

~~~
HTML + scripts defer existentes
          |
          +-- UMD e globais: mesmos nomes e ordem, JavaScript clássico
          |       +-- JSDoc documental; typecheck somente após exceção específica
          |
          +-- Adaptadores, APIs e Cadu: runtimes Node separados
          |       +-- projeto de tipos isolado por runtime, sem emissão e condicionado
          |
          +-- Supabase Edge Functions: TypeScript do runtime próprio
          |       +-- tipos versionados por contrato explícito
          |
          +-- Cadu e Pipeline: somente após estabilização do fluxo atual
                  +-- contratos de artefato e funil antes de implementação
~~~

O objetivo inicial não é transformar os scripts em módulos ESM. Tipos podem ser
adicionados via JSDoc e arquivos .d.ts enquanto os scripts continuam servidos
diretamente. Uma eventual conversão para módulos só pode ser considerada depois de
uma prova específica de que a cadeia de scripts, o Service Worker, as revisões de
URL e o comportamento offline permanecem idênticos.

## 6. Fases propostas

### Fase 0 — baseline documental

- registrar topologia, fronteiras e critérios de decisão;
- não adicionar dependência, tsconfig, bundler ou alteração de produção;
- não tocar na Pipeline Completa.

**Gate:** diff somente documental e git diff --check limpo.

### Fase 1 — infraestrutura de typecheck isolada (em execução)

Pré-condição cumprida em 2026-08-27 por decisão explícita do mantenedor e revisão
versionada do guia de stack. A primeira tranche escolhe contratos de dados, sem
criar um `tsconfig.json` global:

- adicionar TypeScript apenas como dependência de desenvolvimento na raiz;
- para um piloto Node/Cadu, manter dependência e configuração limitadas ao
  serviço ou runtime correspondente, depois da estabilização da Pipeline;
- criar configuração dedicada com `noEmit` e inclusão exclusiva de `types/**/*.ts`;
  nunca incluir `assets/js`, Edge Functions e o app de pitch no mesmo projeto;
- manter checkJs fora desta tranche, evitando alterar bytes públicos ou abrir uma
  avalanche de erros legados;
- adicionar um comando CI independente, sem substituir Jest, Playwright ou
  npm run check:all.

**Gate:** zero artefato JavaScript gerado; npm test, testes estruturais e cadeia de
scripts continuam verdes; nenhuma página muda suas tags script.

### Fase 2 — tipos para módulos UMD puros (piloto de Tags em execução)

Ordem recomendada:

1. assets/js/shared/kc-search-query-parser.shared.js, cujo corpo é puro e o
   wrapper UMD pode ser preservado;
2. assets/js/shared/kc-post-lifecycle.shared.js;
3. assets/js/shared/kc-post-user-tags.shared.js;
4. assets/js/shared/kc-search.shared.js;
5. assets/js/utils/kc-utils.taxonomy.js, somente depois de declarar os globais
   _KCU e KC_CONSTANTS.

O primeiro piloto autorizado priorizou `kc-post-user-tags.shared.js` antes dessa
fila por já possuir contrato crítico de persistência, limites 6/12, compatibilidade
legada e testes diretos. A exceção é deliberadamente nominal: ampliar o `include`
continua exigindo uma tranche própria e as mesmas provas de não regressão.

Para cada módulo:

- documentar entradas, retornos, chaves de metadata e valores nulos;
- manter o wrapper UMD, window.KC e module.exports;
- adicionar casos negativos quando o typecheck revelar uma ambiguidade real;
- não renomear para .ts enquanto o arquivo for dependência direta de HTML.

**Gate:** testes diretos de cada módulo e contratos de ordem de script passam; o
HTML preserva caminho e revisão pública.

### Fase 3 — contratos de dados transversais

Criar tipos versionados, inicialmente só para desenvolvimento, para:

- Post, PostMetadata, mídia e datas semânticas;
- filtros e resultados de busca;
- identidade canônica de post e atualização;
- PipelineRun, funil, outcome e item de revisão;
- envelopes de erro que atravessam API, proxy e adaptador.

Os tipos não substituem validação em runtime. Limites de payload, RLS, aprovação
assinada, deduplicação e validação de artefatos continuam obrigatórios.

**Gate:** contratos declarados correspondem a fixtures e testes existentes; nenhum
tipo faz dados não confiáveis parecerem validados.

### Fase 4 — adaptadores e clientes

Converter em fatias verticais os adaptadores de leitura e escrita, começando por
interfaces usadas em testes e sem dependência de DOM complexo. A conversão deve
preservar o adaptador local, Supabase e a seleção de backend.

**Gate:** testes de integração de API, sessão, feed e normalização; revisão de
privacidade; comparação de payload serializado antes e depois.

Um piloto alternativo de baixo acoplamento é api/_lib/supabase-public-request.js:
ele já é ESM e não roda no browser. Porém, o vercel.json instala dependências com
npm ci --omit=dev e o build atual não roda tsc. Logo, a conversão desse arquivo
só pode acontecer junto de uma prova de build Vercel que não deixe TypeScript como
dependência de runtime.

### Fase 5 — Cadu e Pipeline, após estabilização

Somente quando não houver alteração concorrente no fluxo:

- começar pelos JSON de artefato, resultado de preflight e funil;
- gerar tipos a partir de schemas validados, não a partir de suposição;
- quando houver projeto de tipos, mantê-lo separado de browser, Edge Functions e
  pitch; iniciar por folhas puras de utilitários, XML, robots, qualidade e
  mapeamento, nunca por runner, CLI, publisher ou jobs de sistema;
- manter dry-run, locks, aprovação e publicação como comportamentos de runtime
  independentes do typecheck;
- executar dry-run e análise de outcome conforme o runbook de produção.

**Gate:** testes de contrato da Pipeline, preflight, artefatos e uma simulação
controlada; nenhuma execução real apenas para validar tipagem.

## 7. Critérios de priorização

Uma fatia só entra na migração se cumprir todos:

1. fronteira clara e pequena;
2. testes automatizados já existentes ou adicionáveis sem mock frágil;
3. sem mudar ordem de script, cache ou URL pública;
4. sem exigir acesso administrativo ao Supabase;
5. rollback trivial por reversão de uma PR;
6. benefício concreto: DTO ambíguo, campo recorrente, erro histórico ou refactor
   bloqueado por falta de contrato.

Conversões em massa, renomeios globais, novo framework de frontend e compilação de
todo o repositório são explicitamente não priorizados.

## 8. Riscos e controles

| Risco | Controle |
|---|---|
| Quebrar globais UMD | preservar wrapper e adicionar declarations, não reescrever para ESM |
| Quebrar ordem de carregamento | manter caminhos e ordem HTML; executar testes estruturais |
| Tipos divergirem da base | derivar contratos de fixtures e schema e manter validação runtime |
| CI ficar lenta | typecheck com escopo explícito, medir antes de ampliar |
| Confundir runtimes | configs separadas para raiz, APIs ESM, Edge Functions e app de pitch |
| Falhar em build Vercel | provar que o typecheck e a transpiração não dependem de devDependencies no runtime |
| Converter Pipeline durante incidente | congelar a frente até a estabilização atual |
| Usar Rust sem ganho | exigir benchmark, fronteira versionada e fallback antes de protótipo |

## 9. Áreas explicitamente fora da primeira onda

- assets/js/controllers/admin/admin-cadu.controller.js, por tamanho e criticidade;
- proxies Cadu, rotas de Pipeline e services/cadu-ufg-publisher;
- Edge Functions que já são TypeScript: nelas, a necessidade é modularização e
  testes, não migração de linguagem;
- páginas HTML, Service Worker, versões de asset e configuração de cache.

## 10. Primeiro ticket implementado após o gate de governança

**Título:** chore(types): validar contrato UMD de Tags com checkJs

**Escopo máximo:**

- configuração `noEmit` e `checkJs` limitada a
  `assets/js/shared/kc-post-user-tags.shared.js`;
- declaration mínima apenas para a bifurcação CommonJS do wrapper UMD;
- JSDoc para os contratos públicos de normalização, leitura, limites e metadata;
- type-test negativo para opções e papéis inválidos;
- comando de typecheck separado na CI.

**Fora do escopo:**

- renomear scripts;
- incluir Vite ou Webpack no site estático;
- alterar Service Worker;
- mudar Supabase, Vercel ou Pipeline;
- converter controladores, páginas ou HTML.

**Pré-condição cumprida:** a decisão de stack foi alterada em tranche própria e o
build Vercel continua usando `npm ci --omit=dev`, sem TypeScript em runtime.

**Prova de aceitação:**

1. typecheck sem emissão aprovado;
2. Jest direcionado ao módulo e comparação diferencial de 15 cenários aprovados;
3. npm run check:all aprovado;
4. testes de estrutura confirmam as mesmas cadeias de script;
5. os 16 exports e os resultados serializados permanecem idênticos;
6. aumento medido de 681 bytes gzip no único asset público modificado.

## 11. Próxima decisão

O piloto de Tags reduz risco de refactor sem exigir transpilação ou bundler, mas
seu custo de bytes deve permanecer explícito. A próxima ampliação só deve ocorrer
em uma tranche independente, com comparação diferencial equivalente e benefício
concreto. A Pipeline Completa permanece fora dessa migração enquanto seu contrato
operacional estiver em estabilização. Caso esses critérios não sejam atendidos,
manter JavaScript bem testado é preferível a migrar apenas por tecnologia.
