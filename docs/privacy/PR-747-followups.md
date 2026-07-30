# Pendências Pós-PR #747 (LGPD/DSR/Erasure)

Esta página lista itens identificados durante o trabalho da PR #747 mas que **não foram fechados** pela PR. Cada item é um candidato a uma PR separada.

## P0 (bloqueia deploy em prod)

### 1. CI "Prove Phase-A upgrade from linked schema fingerprint" falhando ✅ RESOLVIDO em [PR #756](https://github.com/yandiamantinoBr/kino-campus/pull/756)

Issue: [#748](https://github.com/yandiamantinoBr/kino-campus/issues/748) (closed)

- **Sintoma:** o check `Supabase reset, lint and pgTAP` falha no step "Prove Phase-A upgrade from linked schema fingerprint" com `CADU_METADATA_CONTRACT_NOT_READY_AFTER_RECONCILIATION`.
- **Causa raiz (NÃO era Windows vs Linux):** o fixture `tests/sql/cadu-phase-a-linked-schema-fixture.sql` foi escrito para um schema pré-privacy (FK sem `ON DELETE SET NULL`, 1 policy `kc_unit_meta_select_public`, sem `kc_active_session_write_guard` trigger, sem `kc_active_session_restrictive` policy). Mas o `supabase db reset` deixa o schema no estado PÓS-privacy (PR #747 adicionou `ON DELETE SET NULL` na FK, adicionou o trigger e a policy de active-session). O fixture dropava `revision` e o trigger `kc_unit_meta_touch`, mas **não** limpava os artefatos de privacy. Resultado: o probe `20260713184500` (escrito para o estado pré-privacy) avaliava o schema híbrido e retornava `ready: false`. Reproduzia idêntico no Windows + Docker Desktop e no Linux CI.
- **Fix:** o fixture agora limpa o estado privacy antes de aplicar as 4 Cadu legacy:
  - `drop trigger if exists kc_active_session_write_guard on public.kc_unit_meta`
  - `drop policy if exists kc_active_session_restrictive on public.kc_unit_meta`
  - `drop+recreate` da FK sem `ON DELETE SET NULL`
  - remove as 3 policies admin temporárias (a `20260713183000` as dropa de qualquer forma)
- **Por que o `20260730120000` (fix anterior) não resolvia:** ela assume que o probe tem `'7326c7...'` no body para fazer o replace. Quando o schema já está pós-privacy, o probe já tem `'0b786e3...'` (via `20260714224000` ou via `20260728230000`) e o replace vira no-op. A fix continua válida para o caminho `supabase db reset` → `20260714224000`, mas o test Phase-A precisa do fixture limpo para simular o upgrade legacy corretamente.
- **Validação:** `npm run test:cadu:phase-a-upgrade` + `test:cadu:phase-a-postgrest` passam localmente. Doc: `docs/ops/cadu-phase-a-test-runbook-2026-07-30.md`.

## P1 (não-bloqueia, mas deveria ser feito)

### 2. FAQ de LGPD na Central de Ajuda

- **Sintoma:** o caminho de LGPD na Central de Ajuda ainda exige 3 cliques aninhados. Não tem FAQ dedicado.
- **Onde:** `ajuda.html` (categoria `Conta e acesso > Onboarding > Exclusão`).
- **Próximo passo:** criar uma FAQ `category=account_access&topic=lgpd_basics` com perguntas como "Como pedir exclusão da conta?", "Posso cancelar o pedido?", "O que acontece com minhas mensagens de chat?".

### 3. i18n dos textos de privacidade ✅ RESOLVIDO em [PR #755](https://github.com/yandiamantinoBr/kino-campus/pull/755)

Issue: [#750](https://github.com/yandiamantinoBr/kino-campus/issues/750) (closed)

- **Sintoma:** os textos de privacidade em `settings.html` (seção `settingsPrivacyData`) estavam hard-coded em pt-BR e não passavam pelo `KCi18n.t()`.
- **Onde:** 14 elementos sob `#settingsPrivacyData` (3 com `data-i18n-params` para links inline).
- **Solução aplicada:**
  - 18 novas chaves adicionadas em `assets/js/core/kc-i18n.js` sob o namespace `privacy.*` (todas respeitando o formato `categoria.nome` exigido pelo test B2-gate).
  - Nova função `applyTexts()` em `kc-i18n.js` que resolve `data-i18n-text="chave"`, interpola `{placeholder}` a partir de `data-i18n-params` (JSON) e escreve em `innerHTML` por default (ou `textContent` se `data-i18n-text-escape="true"`).
  - `applyTexts()` é chamado por `applyRuntimeI18n()` e exposto em `window.KCi18n.applyTexts`.
  - 10 novos tests em `tests/unit/kc-i18n.test.js`.
  - `tests/a11y/i18n-b2-gate.test.js` e `tests/a11y/i18n-metadata.test.js` atualizados (10 métodos públicos em vez de 9).
- **Validação:** `node --check` OK; `npm run check:hygiene` OK; `npm run check:structure` OK (174 itens); Jest 4919/4919 OK (no CI).
- **Pendência correlata:** o FAQ de LGPD em `ajuda.html` (item #2) ainda tem textos hard-coded; será tratado em uma PR separada quando o item #2 for puxado.

### 4. Service Worker cache-bust ✅ RESOLVIDO em [PR #754](https://github.com/yandiamantinoBr/kino-campus/pull/754)

Issue: [#751](https://github.com/yandiamantinoBr/kino-campus/issues/751) (closed)

- **Sintoma:** o `kc-public-shell.css` foi modificado (+45 linhas: widget de Turnstile) na PR, mas o `?v=8.6.13` em todos os 13 HTMLs não foi bumpado.
- **Impacto:** usuários com SW ativo vão continuar com a versão antiga do CSS (sem o widget de Turnstile).
- **Onde:** 13 HTMLs referenciam `kc-public-shell.css?v=8.6.13`.
- **Próximo passo:** o build de produção (Vercel) roda `static-cache-revision.js` automaticamente. Mas o working tree tem a versão antiga. Bumpar manualmente pra `?v=8.6.14` antes do próximo release.

## P2 (nice-to-have)

### 5. Auto-redirect visitante → autenticado após login

- **Sintoma:** um visitante (não autenticado) que preenche o form de LGPD com Turnstile, depois faz login, perde o estado.
- **Onde:** `kc-create-privacy-help-guest` (EXPAND phase).
- **Próximo passo:** guardar o payload do form em `localStorage` antes do login e re-aplicar depois.

### 6. Cobertura do diagnóstico de erasure

- **Sintoma:** algumas tabelas não estão 100% cobertas pela redação. Itens não tratados: curtidas de comentários, reações de chat, outbox, afinidade, bloqueios, avaliações, aceites legais, antifraude, views, consultas de busca, convites com e-mail bruto, logs de auditoria.
- **Onde:** `20260729007000_atomic_erasure_dsr_and_auth_delete_recovery.sql`.
- **Próximo passo:** auditar tabela por tabela e adicionar redação explícita em cada uma.

## P3 (informacional)

### 7. Hard-coded text em `settings.html`

- O texto "Atualizar protocolos" e "Limpar dados deste navegador" estão em HTML estático. Se mudar o idioma, não acompanha.

### 8. Documentação do CONTRACT phase (deferred)

- O template em `supabase/contracts/pending/help_privacy_guest_gateway_contract.template.sql` está pronto mas **NÃO** deve ser executado até o canário documentado.
- Próximo passo: criar `docs/privacy/contract-phase-rollout.md` com o procedimento passo-a-passo.

## Como contribuir

Cada item acima pode virar uma PR separada. Padrão:
1. Branch: `fix/<item-id>-<slug-descritivo>` (ex: `fix/p1-lgpd-faq-help-center`)
2. PR contra `kinocampus-V75.0-foundations`
3. Mesma estrutura de 3 commits (se envolver migrations): chore → feat → fix
4. Re-rodar CI completo