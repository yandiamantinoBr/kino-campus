# Pendências Pós-PR #747 (LGPD/DSR/Erasure)

Esta página lista itens identificados durante o trabalho da PR #747 mas que **não foram fechados** pela PR. Cada item é um candidato a uma PR separada.

## P0 (bloqueia deploy em prod)

### 1. CI "Prove Phase-A upgrade from linked schema fingerprint" falhando

- **Sintoma:** o check `Supabase reset, lint and pgTAP` falha no step "Prove Phase-A upgrade from linked schema fingerprint" com `CADU_METADATA_CONTRACT_NOT_READY_AFTER_RECONCILIATION`.
- **Reprodução:** CI atual falha; localmente (Windows + Docker) o teste passa depois da fix `20260730120000`.
- **Causa raiz:** a migration `20260728230000_reconcile_cadu_contract_with_privacy_guards.sql` (do Codex) altera o body do probe `kc_cadu_metadata_contract()` pra reconhecer os guards de privacidade (`kc_active_session_write_guard` trigger, `kc_active_session_restrictive` policy). O resultado: o body tem hash `f62be6380d7b0b663aa7901cc64bd017`, que não bate nem com o legacy `a74ae7c...` nem com o migrated `21d2a9c...` que o `20260714224000` espera.
- **Tentativa de fix (commit `c05323be`):** migration `20260730120000_align_cadu_metadata_probe_with_phase_a_compat.sql` força o body do probe pro estado "migrated" (hash `21d2a9c...`). **Funciona localmente**, mas o CI continua falhando — provavelmente diferença sutil entre Linux (CI) e Windows (local).
- **Próximo passo:** investigar por que o `git show` retorna o mesmo conteúdo nos dois ambientes mas o `psql` se comporta diferente. Possível causa: encoding do `psql` (UTF-8 vs UTF-16 LE) ou diferença de versão do `docker exec`.

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