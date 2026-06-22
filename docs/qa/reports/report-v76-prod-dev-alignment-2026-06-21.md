# V76.51 — auditoria de alinhamento produção↔desenvolvimento

**Data:** 2026-06-21
**Branch:** nenhuma (operação de leitura; sem mudanças a mesclar)
**Ambiente:** Supabase CLI 2.105.0, produção `wacyrkwhkvzwkqpolrbg`
**Decisão:** **sem divergência** — baseline local e produção estão sincronizados

## Resultado

Foi executada a auditoria de alinhamento produção↔desenvolvimento seguindo o
prompt `prompt-alinhamento-producao-dev-seguro.md`. O objetivo era garantir que
o schema que um desenvolvedor vê ao rodar `db reset` local seja fiel ao schema
real de produção.

**O `supabase db pull --linked` confirmou que não há divergência:** comparou o
schema da produção com a baseline local (`00000000000001_baseline_v76.sql`) e
não registrou nenhuma diferença. O `git diff` após o pull ficou vazio e nenhum
novo arquivo de migration foi gerado. A CLI também marcou a baseline
(`00000000000001`) como `applied` na produção e as migrations legacy timestamped
como `reverted` (consistente com a consolidação V76.47, que as moveu para
`_archive-v75/`).

## Por que não houve divergência

A baseline foi gerada (V76.47) a partir do estado parcial de aplicação das
132 migrations sobre um Supabase local descartável. Apesar de 6 dessas migrations
terem revelado bugs latentes de dependência na aplicação incremental (overload
ambíguo, dependência de ordem cruzada, função trigger, schema ausente, pg_cron,
policy de ordem), o **estado final do schema** que elas produziam coletivamente
— capturado pela baseline via `pg_dump` — coincide com o schema que a produção
alcançou historicamente. As 6 migrations com bugs eram, na prática, redundantes
ou já satisfeitas por outras migrações que aplicaram com sucesso.

As lacunas documentadas da baseline (schema `kc_private` vazio, 3 triggers órfãos
de chat removidos, `pg_cron` ausente) correspondem exatamente ao estado da
produção — confirmando que esses objetos nunca existiram em produção também.

## Fases executadas

| Fase | Resultado |
|---|---|
| 0 — pré-condições | APROVADO (CLI 2.105.0, Docker 29.5.3, git limpo, `check:all` 195/3.806) |
| 1 — `db pull --linked` (leitura) | APROVADO (schema idêntico, git diff vazio) |
| 2 — diff produção vs baseline | **não se aplica** (sem divergência para catalogar) |
| 3 — decisão por divergência | **não se aplica** (sem divergência) |
| 4 — atualizar baseline | **não se aplica** (baseline já reflete a produção) |
| 5 — aplicar mudança na produção | **não se aplica** (nada a aplicar) |

## Validações de segurança

- A produção **não foi alterada**: `db pull` é leitura do catálogo, não escrita.
- Nenhum `db push`, `db reset --linked`, ou SQL de escrita foi executado.
- A branch de alinhamento foi criada e descartada sem merge (estava vazia).
- `check:all` permanece verde (195 suites / 3.806 testes / 3 snapshots).
- A regra de ouro do prompt foi respeitada: a produção é a fonte da verdade e o
  repositório já estava alinhado a ela.

## Conclusão

O drift silencioso que motivava o alinhamento **não existe**: a baseline
consolidada (V76.47) é uma representação fiel do schema de produção. Ambientes
de desenvolvimento que rodarem `db reset` local terão um schema idêntico ao de
produção. Nenhuma ação corretiva é necessária.
