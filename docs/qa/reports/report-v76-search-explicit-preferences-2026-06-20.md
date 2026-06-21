# V76.43 — preferências explícitas e controle local de busca

**Data:** 2026-06-20  
**Branch:** `codex/v76-search-explicit-preferences`  
**Escopo:** PR-J do plano de busca/personalização

## Resultado

A busca passa a ter uma finalidade de personalização própria, desligada por padrão e
separada de analytics, cookies, notificações e perfil público. A configuração fica no
navegador e está disponível também para visitantes sem conta.

Entregas:

- modo não personalizado como padrão e falha segura;
- seleção explícita dos seis módulos;
- assuntos derivados em runtime dos `kc-create-group` canônicos marcados como
  `preferenceEligible` no registry gerado;
- consentimento separado para futura afinidade local;
- exportação JSON e exclusão integral das preferências/afinidade locais;
- revogação que interrompe a finalidade e remove o store de afinidade;
- nenhum armazenamento de query, identidade, texto livre, contato, link, câmpus
  inferido ou atributo sensível;
- UI responsiva, acessível por teclado e disponível sem autenticação.

## Contrato de dados local

| Chave | Finalidade | Conteúdo permitido | Retenção |
|---|---|---|---|
| `kc_search_preferences_v1` | escolhas explícitas | modo, módulos e opções canônicas | até revogação/exclusão |
| `kc_search_affinity_v1` | reservada à afinidade local opt-in | agregados categóricos mínimos | removida ao revogar |

O propósito é versionado como `search-personalization-v1`. A normalização usa lista
positiva do snapshot canônico e descarta propriedades desconhecidas. Sem consentimento
ativo, módulos, assuntos e afinidade são normalizados para vazio.

## Validação

- Jest focado: 3 suites, 15 testes, 15 aprovados;
- contrato do snapshot gerado íntegro e ainda lazy (não carregado estaticamente);
- validação da cadeia de scripts: 28 HTMLs aprovados;
- Playwright Chromium focado: 2/2 aprovados;
- fluxo real: salvar, recarregar, exportar e revogar;
- mobile 390×844: sem overflow horizontal e ações com largura adequada;
- captura real desktop/mobile: zero `pageerror`;
- baseline Jest completo: 193 suites, 3.793 testes e 3 snapshots aprovados;
- baseline Playwright completo: 80/80 aprovados em Chromium com um worker;
- benchmark estruturado: 12/12, recall/precision/stability = 1;
- `git diff --check`: aprovado.

O primeiro baseline E2E revelou um defeito preexistente e reproduzível no header a
769 px: o colapso progressivo removia todos os rótulos textuais, contrariando seu
próprio contrato. O algoritmo agora preserva a primeira âncora textual e mantém o
overflow horizontal previsto. O teste isolado passou 6/6 e o baseline final 80/80.

## Rollback

1. remover os dois scripts adicionados em `settings.html`;
2. remover a seção `settingsSearchPreferences` e seus estilos;
3. remover `kc-search-preferences.shared.js` e o controller;
4. opcionalmente limpar `kc_search_preferences_v1` e `kc_search_affinity_v1`.

Não há migration, tabela, RPC, chamada remota ou alteração de ranking neste PR.

## Próximo gate

PR-K pode consumir este consentimento para afinidade local somente se mantiver:
consulta/filtros dominantes, teto pequeno e determinístico, TTL/decaimento, explicação,
ausência de query bruta e limpeza imediata no opt-out.
