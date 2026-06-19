# Report V76.27 — CSS-C.5 do ranking no perfil público

**Data:** 2026-06-19
**Escopo:** CSS e tooling de baseline; sem alterar HTML, JS runtime, banco, provider ou `future-split/`
**Runtime frontend:** `8.6.1` inalterado

## Decisão

O bloco `.kc-profile-rank-badges*` foi escolhido como o menor recorte público
remanescente com ownership fechado. Ele é criado por `kc-ranking.js` somente ao
decorar `.kc-profile-avatar-wrap`; `profile.html` já carrega
`kc-public-shell.css` depois de `styles.css`.

A tentativa de priorizar CSS-B admin autenticado foi interrompida corretamente:
a sessão disponível era anônima e `/admin/index.html` redirecionou para a home.
Nenhuma credencial foi simulada. O recorte público previsto como fallback no
inventário foi então executado.

## Correção do baseline

O cenário anterior usava `/profile.html` sem usuário e podia redirecionar para a
home. O capturador agora usa `/profile.html?id=USER_01` e prepara uma fixture
determinística exclusiva de QA:

- avatar SVG inline estável;
- um badge de ranking com a mesma estrutura criada pelo runtime;
- espera explícita por fontes e imagens;
- métricas de posição, tamanho e flexbox no manifesto.

Essa fixture não altera produção nem os HTMLs da aplicação.

## Métricas

| Métrica | Antes | Depois |
|---|---:|---:|
| `styles.css` | 12.005 linhas / 280.551 bytes | 11.982 linhas / 279.971 bytes |
| `kc-public-shell.css` | 1.053 linhas / 22.343 bytes | 1.078 linhas / 22.959 bytes |
| Regras/seletores em `styles.css` | 1.731 / 1.948 | 1.728 / 1.945 |
| Bucket público | 119 regras / 117 seletores / 752 linhas | 116 regras / 115 seletores / 733 linhas |
| CSS de produção total | 18.323 linhas / 436.169 bytes | 18.325 linhas / 436.205 bytes |

## Baseline visual

Rodadas canônicas:

- `v76-css-c5-profile-rank-before-deterministic-2026-06-19`;
- `v76-css-c5-profile-rank-after-deterministic-2026-06-19`;
- `v76-css-c5-profile-rank-after-deterministic-repeat-2026-06-19`.

Cada rodada produziu 34 screenshots em 17 rotas × 2 viewports, sem resposta
HTTP falha, overflow horizontal ou carregamento de `future-split/`.

| Perfil | Antes | Depois estável | Resultado |
|---|---|---|---|
| desktop 1366×900 | `x=301`, `y=172`, `29×19`, coluna | mesmos valores | equivalente |
| mobile 390×844 | `x=49`, `y=189`, `29×19`, linha | mesmos valores | equivalente |

Nos dois viewports também permaneceram idênticos `gap: 3px`, `flex-shrink: 0`
e alinhamento (`center` no desktop, `flex-start` no mobile). A captura mobile
antes/depois estável manteve o mesmo SHA-256. No desktop, ruído dinâmico externo
alterou o hash full-page, mas não as métricas do componente.

Os erros de console contabilizados pelo capturador são falhas externas já
conhecidas em recursos/serviços indisponíveis no servidor estático; variaram
entre repetições e não envolvem CSS, overflow ou a fixture do perfil.

## Navegador

O navegador interno confirmou `Rafael Almeida — Perfil KinoCampus` na rota
local pública, com hero visível e `kc-public-shell.css` carregado. As três regras
que citam `.kc-profile-rank-badges` — base, badge interno e breakpoint de 600 px —
foram encontradas exclusivamente nesse arquivo.

## Contrato estrutural

`tests/structure/structural-validators.test.js` garante que:

- `profile.html` carrega `kc-public-shell.css` depois de `styles.css`;
- `.kc-profile-rank-badges*` existe somente no CSS público dedicado;
- o baseline usa o perfil público determinístico e registra métricas do badge.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `node --check scripts/capture-css-visual-baseline.js` | aprovado |
| Jest focado | 1 suite / 85 testes aprovados |
| `npm run audit:css` | 1.728 regras / 1.945 seletores no monólito |
| `npm run seo:audit` | aprovado; 0 warnings / 0 errors |
| `npm run check:all` | 180 suites / 3.622 testes / 3 snapshots aprovados |
| Navegador desktop/mobile | ownership e métricas equivalentes; sem overflow |
| CI do PR | pendente na criação deste relatório |

## Rollback

Recolocar as três regras `.kc-profile-rank-badges*` no ponto original de
`styles.css`, removê-las de `kc-public-shell.css` e restaurar a rota anterior no
capturador se a fixture precisar ser retirada. Não há rollback remoto ou de dados.
