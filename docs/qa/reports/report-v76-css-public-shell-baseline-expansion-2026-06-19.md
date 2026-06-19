# Report V76.28 — CSS-B.1 do public shell completo

**Data:** 2026-06-19
**Escopo:** tooling e documentação de baseline; sem alterar CSS, HTML, JS runtime, banco, provider ou `future-split/`
**Runtime frontend:** `8.6.1` inalterado

## Decisão

Após CSS-C.5, o overlap público remanescente foi revisado. Os seletores ainda
classificados nesse bucket pertencem principalmente ao modal de autenticação,
header, menu de conta e dropdown global, todos usados também fora das páginas
que carregam `kc-public-shell.css`. Não existe outro micro-split pequeno com
ownership fechado equivalente aos blocos legal e ranking de perfil.

Antes de novo split, foi fechada a lacuna de cobertura: quatro das doze páginas
consumidoras de `kc-public-shell.css` ainda não estavam no baseline canônico.

## Rotas adicionadas

| Rota | Estado capturado | Observação |
|---|---|---|
| `/404.html` | erro institucional completo | também carrega `kc-error-page.css` |
| `/ajuda.html` | central pública completa | não exige sessão |
| `/auth-callback.html` | callback sem token | cobre card e mensagens do shell |
| `/account-setup.html` | onboarding autenticado local | fixture determinística sem credencial real |

O baseline passa de 17 rotas / 34 screenshots para 21 rotas / 42 screenshots.
As doze páginas que carregam `kc-public-shell.css` agora estão representadas.

## Fixture do onboarding

Sem usuário, `account-setup.html` redireciona corretamente para a home. Para
cobrir seu layout sem usar credenciais, o capturador instala antes da navegação
uma fixture local com `USER_01`, perfil mínimo em `kc_local_profile` e métodos
`getUser`/`getCurrentUser` determinísticos. A fixture:

- existe somente no contexto Playwright descartável;
- não contém senha, token, sessão ou chave Supabase;
- não altera runtime, HTML nem armazenamento do navegador do usuário;
- mantém o URL final em `/account-setup.html` nos dois viewports.

## Rodadas

- `v76-css-b1-public-shell-expanded-2026-06-19`;
- `v76-css-b1-public-shell-expanded-repeat-2026-06-19`;
- `v76-css-b1-public-shell-expanded-final-2026-06-19`.

Cada rodada produziu 42 screenshots, sem resposta HTTP falha, overflow
horizontal, erro de página ou carregamento de `future-split/`. Nas oito novas
capturas desktop/mobile, sete hashes foram idênticos entre as duas primeiras
rodadas; apenas o callback desktop oscilou quando Font Awesome externo falhou.
Os bounds de main/header permaneceram idênticos.

A rodada final registrou também `finalUrl` no manifesto e confirmou as quatro
rotas sem redirecionamento. Os erros de console restantes são oscilações externas
`ERR_CONNECTION_RESET`; não produziram erro de página nem mudança de layout.

## Navegador

A inspeção local sem fixture confirmou 404, ajuda e callback no URL correto,
com `kc-public-shell.css`, main visível e ausência de overflow. Também confirmou
que onboarding sem sessão redireciona para login; por isso o baseline usa uma
fixture explicitamente identificada, em vez de simular credenciais.

## Contrato estrutural

`tests/structure/structural-validators.test.js` agora garante que:

- as doze páginas consumidoras carregam `kc-public-shell.css` após `styles.css`;
- as quatro rotas faltantes permanecem no baseline;
- o onboarding usa fixture local explícita, registra `finalUrl` e não contém
  `service_role`.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `node --check scripts/capture-css-visual-baseline.js` | aprovado |
| Jest focado | 1 suite / 88 testes aprovados |
| `npm run audit:css` | sem alteração CSS; 1.728 regras / 1.945 seletores |
| `npm run seo:audit` | aprovado; 0 warnings / 0 errors |
| `npm run check:all` | 180 suites / 3.625 testes / 3 snapshots aprovados |
| Baseline final | 21 rotas / 42 capturas; 0 HTTP fail, overflow, page error ou `future-split` |
| CI do PR | pendente na criação deste relatório |

## Limites e próxima etapa

A fixture local prova layout/cascade do onboarding, mas não substitui QA real de
login, sessão ou escrita Supabase. CSS-B admin autenticado continua pendente até
haver uma sessão controlada. Outro split público só deve avançar com ownership
fechado; auth/header/dropdown permanecem globais.

## Rollback

Remover as quatro rotas, a fixture `authenticated-local-user`, o campo
`finalUrl` e os três contratos estruturais. Não há rollback de produção, dados,
CSS ou runtime.
