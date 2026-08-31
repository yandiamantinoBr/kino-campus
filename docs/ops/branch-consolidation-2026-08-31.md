# Consolidação de branches — 2026-08-31

## Escopo e critérios

Repositório `yandiamantinoBr/kino-campus`, base inspecionada
`35381695eaddd3bdb087c4055967c860f03bc582`. O repositório separado OpenClaw Cadu
não foi alterado por esta limpeza.

Inventário: 170 branches locais preexistentes, mais a branch isolada deste
hotfix; 76 worktrees. Quinze tinham alterações ou arquivos não rastreados,
incluindo o hotfix durante sua implementação. A ausência de PR aberto ou de
branch remota não foi considerada prova suficiente para apagar trabalho local.

Antes de excluir referências, foram conferidos SHA atual, ancestralidade ou
equivalência, PRs, ocupação e estado do worktree. Um bundle completo de 171 refs
foi criado e validado. Nenhum diretório, arquivo ignorado, evidência, anexo,
segredo local ou modificação não commitada foi apagado.

## Limpeza comprovada

- 157 branches locais revalidadas e excluídas na primeira passagem.
- Em 53 worktrees limpos e integrados, o checkout foi destacado **no mesmo
  SHA**, mantendo todos os arquivos. Somente a referência da branch foi removida.
- Um caso de reactions foi inicialmente preservado porque a prova de patch
  não se confirmou. A revisão demonstrou igualdade dos três blobs finais com
  o PR #627, mais equivalência do segundo commit; não se tratava de patch-id
  igual para os dois commits.
- Quatro propostas antigas foram analisadas semanticamente e aposentadas
  com as decisões registradas abaixo. Não foram mescladas cegamente.
- Total dessas duas passagens: **162 branches locais removidas**, incluindo
  reactions e as quatro propostas. Seus commits continuam recuperáveis.

Remotas obsoletas removidas:

| Branch | Prova de integração |
|---|---|
| `codex/cadu-producer-user-tags-canonical` | patch equivalente a `cd462343`, PR #866 |
| `codex/cadu-ufg-publisher-tags-contract` | patch equivalente a `24a774e4`, PR #866 |
| `kinocampus-V75.0-foundations` | ancestral da main, zero commits exclusivos; 272 atrás na auditoria |
| `site-efg-marketing-vendas-2026` | apontava para `1dc1471f`, consentimento do PR #890 já integrado; não continha trabalho exclusivo de site |

O PR #901, `codex/cadu-covers-dating-20260831`, surgiu e avançou durante a
auditoria. Sua branch/worktree foi preservada como trabalho concorrente, sem
interferência no desenvolvimento ou no merge dessa tarefa.

## Decisões anteriores preservadas

| Branch histórica | Decisão e motivo |
|---|---|
| `codex/audit-phase4-6-2026-07-09` (`0735aaf5`) | Não reaplicar o pinning antigo. Main já fixa Actions por SHA imutável, com versões mais novas e teste de contrato. |
| `codex/technical-audit-continuation-handoff-2026-07-11` (`e859cc43`) | Não restaurar KPIs baseados em denominadores diferentes ou histórico parcial. A ideia útil é um contador diário canônico de publicações verificadas, excluindo simulações e com paginação completa. Isso exige projeto próprio; não é um total confiável a partir das últimas 20 execuções. |
| `codex/ux-pipeline-ttl-2026-08-17` (`e8a11d60`) | Rejeitada a ampliação indiscriminada de 15 para 60 segundos. A validade protege preflight/snapshots/ações; melhorar a renovação do estado sem prolongar autorização antiga. |
| `docs/audit-sync-2026-07-04` (`35b5896d`) | Conservar como proveniência histórica no backup; cobertura canônica já entrou por outra implementação no PR #640. Não importar números antigos como baseline atual. |

Referências dos contratos atuais: `tests/contract/ci-deployment-gates.test.js`,
`tests/integration/cadu-pipeline-snapshot-ttl.test.js`,
`tests/integration/cadu-pipeline-dry-run-contract.test.js` e o catálogo canônico
em `assets/js/controllers/admin/admin-cadu.controller.js`.

## Trabalho local preservado

Não é correto chamar todos os worktrees restantes de branches ativas.
Os checkouts destacados guardam histórico e artefatos; os abaixo também
contêm trabalho local que merece revisão dedicada:

- `codex/cadu-admin-resilience-20260827`: tarefa “Melhorar Pipeline” e
  evidências locais preservadas, embora o commit da branch já esteja integrado.
- `codex/cadu-phase-completion-runbook-2026-07-13`: uma alteração rastreada.
- `codex/cadu-user-tags-contract`: dois arquivos não rastreados.
- `codex/instagram-ocr-shadow-2026-08-13`: quatro arquivos não rastreados;
  nenhuma ativação da funcionalidade shadow foi realizada.
- `codex/script-reference-contract-20260823`: oito alterações rastreadas e
  três arquivos não rastreados; não substituídos pelo baseline novo.
- Worktrees destacados `2343`, `be00` e `kc-wt-main`: alterações de OG/product
  e testes preservadas, sem concluir que sejam idênticas ao PR ativo #901.
- Checkout principal e worktrees `3e9f`, `8bcc`, `96eb`, `b102`, `e2f5`:
  anexos, relatórios e evidências mantidos. Não foram aplicados `clean`, reset
  destrutivo ou remoção recursiva.

## Recuperação e registro detalhado

Na pasta `output/` do worktree `kino-campus-chat-mobile-20260831`:

- `branches-before-cleanup-20260831.bundle`: histórico completo, cerca de 30 MB.
- `branch-audit-20260831.json`: inventário individual com nomes, SHA, PRs,
  equivalência e estados dos worktrees.
- `branch-cleanup-result.json`: resultado efetivo da primeira passagem.

Esses arquivos locais não são publicados. Para recuperar uma branch, consultar
o SHA no inventário/bundle e criar **uma nova referência**, sem resetar checkout
com trabalho pendente. Exemplo: `git branch recovery/nome <SHA>`; se o objeto
não existir mais, importá-lo do bundle com `git fetch <bundle> <ref>:<nova-ref>`.

A documentação de entrada agora usa `main` e resultados de testes datados.
O resultado final de PRs, referências remotas e deploy é reconfirmado ao encerrar
o hotfix, pois outras tarefas podem avançar main durante esta execução.
