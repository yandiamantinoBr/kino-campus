# V76.36 — Evidência do pipeline shadow da busca estruturada

**Data:** 2026-06-20

**Escopo:** comparação offline entre busca legada e candidata

**Decisão de runtime:** No-Go; nenhum HTML carrega o novo asset

## Resultado

`KCSearchShadowPipeline` compõe o parser V76.35, o registro de campos V76.33, a
projeção V76.34 e `KCSearchShared`. O resultado candidato é calculado em memória e
comparado ao legado, sem mudar a resposta entregue ao usuário.

O contrato distingue o registro compilado (`registry`) do módulo responsável pela
projeção (`projector`). Dependências ausentes falham de forma explícita, evitando
fallback parcial ou ativação acidental.

## Cobertura funcional

- oportunidade: área e modalidade de trabalho;
- moradia: tipo, teto de preço e localização canônica;
- eventos: gratuidade e localização;
- caronas: origem, destino e horário;
- filtros adicionais suportados: categoria, condição, região, características,
  regime de contratação, preço exato, recompensa mínima e vagas mínimas;
- filtros ainda não implementados, como dia da semana e data relativa, são listados
  em `unsupportedFilters` e não descartam silenciosamente o candidato.

## Privacidade e isolamento

- saída limitada a IDs, pontuações, intenção, nomes dos filtros e diferenças;
- consulta crua, descrição, contato, link e conteúdo do post não são retornados;
- coleção de entrada não é mutada;
- nenhum dado de perfil, sessão, analytics ou preferência é lido;
- o arquivo não aparece em nenhum HTML público ou administrativo.

## Evidência automatizada

`tests/integration/kc-search-shadow-pipeline.test.js`: 10/10 testes focados verdes,
cobrindo UMD/isolamento, dependências, filtros, privacidade, imutabilidade,
determinismo e limite de resultados.

Baseline validado após integração:

- Jest: 185 suites / 3742 testes / 3 snapshots;
- Playwright inventariado: 10 specs / 68 testes;
- `frontendRuntimeVersion=8.6.1` inalterado.

## Próximo gate

PR-E deve implementar semântica temporal/status e benchmark sintético por módulo.
Ativação em `/search-results.html` ou `kcSearchDropdown`, persistência de preferências
e sinais comportamentais continuam bloqueados até gates próprios de qualidade,
consentimento, minimização, retenção e rollback.
