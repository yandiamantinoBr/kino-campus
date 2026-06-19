# Report V76.26 — CSS-C.4 das páginas legais

**Data:** 2026-06-18  
**Escopo:** CSS e tooling de baseline; sem alterar HTML, JS runtime, banco, provider ou `future-split/`  
**Runtime frontend:** `8.6.1` inalterado

## Decisão

O bloco `.kc-legal-*` foi escolhido por ter ownership fechado: aparece somente em
`sobre.html`, `editorial.html`, `transparencia.html`, `privacidade.html` e
`termos.html`. As cinco páginas já carregam `kc-public-shell.css` depois de
`styles.css`, portanto o movimento não exige novo asset nem mudança de ordem.

As regras desktop e o breakpoint de 760 px foram movidos integralmente para o
CSS dedicado. O baseline canônico passou a incluir as cinco rotas legais, de
modo que próximos micro-splits tenham cobertura explícita dessas superfícies.

## Métricas

| Métrica | Antes | Depois |
|---|---:|---:|
| `styles.css` | 12.112 linhas / 282.468 bytes | 12.005 linhas / 280.551 bytes |
| `kc-public-shell.css` | 943 linhas / 20.456 bytes | 1.053 linhas / 22.343 bytes |
| Regras/seletores em `styles.css` | 1.748 / 1.968 | 1.731 / 1.948 |
| Bucket público | 136 regras / 133 seletores / 842 linhas | 119 regras / 117 seletores / 752 linhas |
| Baseline visual | 12 rotas / 24 capturas | 17 rotas / 34 capturas |

## Baseline visual

Rodadas:

- `v76-css-c4-legal-before-2026-06-18`;
- `v76-css-c4-legal-after-2026-06-18`;
- `v76-css-c4-legal-after-repeat-2026-06-18`.

Cada rodada produziu 34 screenshots, sem resposta falha, overflow horizontal,
erro de console/página ou carregamento de `future-split/`. As dez comparações das
cinco páginas legais em desktop/mobile mantiveram hashes idênticos antes/depois.

Houve três oscilações globais antes/depois (`profile` mobile e
`admin/privacy-analytics` nos dois viewports); duas oscilações admin reapareceram
na repetição e nenhuma envolve seletor ou rota legal. Elas foram tratadas como
ruído dinâmico, não como evidência do split.

## Navegador

Em 390×844, `sobre.html` manteve uma coluna, raios de 14 px e ausência de
overflow. Em 1366×900, `transparencia.html` manteve duas colunas, main de 1.040 px,
padding superior de 28 px e raios de 18/16 px. Ambas carregaram
`kc-public-shell.css` e não emitiram erros ou alertas no console.

## Contrato estrutural

`tests/structure/structural-validators.test.js` agora garante que:

- as cinco páginas carregam `kc-public-shell.css` depois de `styles.css`;
- os seletores legais existem no CSS dedicado e não retornam ao monólito;
- o capturador visual mantém as cinco rotas no baseline.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `node --check scripts/capture-css-visual-baseline.js` | aprovado |
| Jest focado | 1 suite / 82 testes aprovados |
| `npm run audit:css` | 1.731 regras / 1.948 seletores no monólito |
| `npm run seo:audit` | aprovado; 0 warnings / 0 errors |
| `npm run check:all` | 180 suites / 3.619 testes / 3 snapshots aprovados |
| Navegador desktop/mobile | layout preservado; sem overflow ou erros de console |
| CI do PR #589 | validadores/Jest/lista Playwright, Lighthouse, Vercel e preview aprovados |

## Rollback

Recolocar o bloco `.kc-legal-*` e suas três regras responsivas no mesmo ponto de
`styles.css`, remover o bloco equivalente de `kc-public-shell.css` e retirar as
cinco rotas adicionais do capturador. Não há rollback remoto ou de dados.
