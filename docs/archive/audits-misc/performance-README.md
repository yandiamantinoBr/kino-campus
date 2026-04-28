# docs/audits/performance/

Auditorias de performance do KinoCampus.

## Status

**Vazio em V14.** Diretório criado como placeholder para auditorias de performance futuras.

## Escopo planejado

- Relatórios de Lighthouse CI (perf, a11y, best-practices, SEO)
- Análise de bundle size de CSS (styles.css ~240KB)
- Auditoria de carga de scripts (ordem e deferimento)
- Análise de Core Web Vitals (LCP, CLS, FID/INP) em produção
- Oportunidades de caching via Service Worker

## Referências existentes

- `.lighthouserc.js` — thresholds Lighthouse CI
- `sw.js` — Service Worker de caching
- `docs/audits/css-split-plan.md` — plano para reduzir 240KB de CSS
