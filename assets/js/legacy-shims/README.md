# assets/js/legacy-shims/

Shims e compatibilidade retroativa para fluxos legados ainda suportados.

## Regras de entrada
- Entradas devem ser pequenas, isoladas e justificadas por compatibilidade.
- Nao absorver logica nova de produto neste diretorio.
- Qualquer shim carregado em HTML precisa de cobertura em `validate-script-chains` ou documentacao equivalente.

## Status
**Consolidado desde V15.** O diretorio contem `kc-migrate.myposts.js`, mantido como compatibilidade para migracao de dados antigos de "Meus posts".
