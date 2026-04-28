# Legacy Map (`docs/legacy/`)

Este diretório concentra materiais históricos que **não fazem parte do fluxo operacional atual**.

## Regra de ouro (operação de banco)

Use **somente**:

- `supabase/schema-*.sql`
- `supabase/migrations/*.sql`

Não existe caminho operacional por `sql/` na raiz.

---

## O que é legado e por que está aqui

### `docs/legacy/backend-placeholder/`

- **O que é:** esqueleto antigo de backend Node/Express.
- **Por que foi legado:** arquitetura atual é front estático + Supabase-first.
- **Quando pode remover:** após decisão explícita de descontinuar retenção histórica de backend e registro dessa decisão em changelog/arquitetura.

### `docs/legacy/sql/`

- **O que é:** scripts SQL históricos (ad hoc, versões intermediárias e validações manuais).
- **Por que foi legado:** a esteira oficial foi consolidada em `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
- **Quando pode remover:** quando cada item tiver histórico/documentação equivalente no fluxo oficial e não houver necessidade de auditoria.

### `docs/legacy/patches/`

- **O que é:** patches de referência e rascunhos técnicos antigos.
- **Por que foi legado:** não são fonte de verdade para runtime, deploy ou banco.
- **Quando pode remover:** quando o conteúdo estiver totalmente absorvido no código/documentação oficial ou perder valor histórico verificável.

---

## Regras de governança do legado

1. Tudo em `docs/legacy/` é **somente leitura histórica**.
2. Não executar SQL de `docs/legacy/sql/` como setup/deploy/update.
3. Se surgir script/patch fora do fluxo oficial, mover para `docs/legacy/` e registrar contexto mínimo (origem, motivo e destino oficial quando existir).
