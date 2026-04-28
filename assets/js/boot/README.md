# assets/js/boot/

Módulos de inicialização e infraestrutura global. Carregados primeiro em todos os 22 HTMLs, na ordem exata:

1. `kc-constants.js` — constantes globais imutáveis
2. `kc-env.js` — variáveis de ambiente (injetadas via scripts/inject-env.js no build)
3. `kc-feature-flags.js` — feature flags (window.KCFF)
4. `kc-sw-register.js` — registro do Service Worker
5. `kc-telemetry.js` — error boundary + telemetria

## Regras
- Sem dependência entre si exceto pela ordem acima
- Sem referência a módulos de `core/`, `api/`, `utils/` ou `adapters/`
- Todos devem funcionar com `window.KCFF` potencialmente undefined

## Status
**Consolidado desde V15.** Os arquivos ja residem em `assets/js/boot/`; `kc-theme-boot.js` tambem faz parte do grupo de boot e deve permanecer compatível com carregamento antecipado.
