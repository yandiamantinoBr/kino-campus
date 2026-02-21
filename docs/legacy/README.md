# Legacy Map (`docs/legacy/`)

Este documento centraliza o **mapa de legado** do repositório para os blocos:

- `backend-placeholder/`
- `sql/` (histórico)

> Regra geral: conteúdo em `docs/legacy/` é referência histórica e **não deve** ser usado como fluxo operacional primário.

---

## `backend-placeholder/`

### O que é

`backend-placeholder/` guarda um esqueleto antigo de backend (Node/Express) criado em uma fase inicial de exploração arquitetural.

### Por que está legado

A arquitetura vigente é **front-end estático + Supabase-first** (Auth, Postgres, Storage), com governança de banco em `supabase/schema-*.sql` e `supabase/migrations/*.sql`.

### Status de uso

- Não participa de build.
- Não participa de deploy.
- Não possui papel no caminho operacional atual.

### Mapa de permanência/risco/remoção

| Item legado | Motivo de permanência | Risco de remoção | Critério de remoção futura |
|---|---|---|---|
| `backend-placeholder/` | Preservar contexto técnico de decisões antigas e facilitar auditoria histórica da transição para Supabase-first. | **Baixo** para runtime (não é executado), **médio** para governança documental (perda de contexto histórico). | Remover quando houver decisão explícita de descontinuar retenção de histórico de backend e registro da decisão em changelog/arquitetura. |

---

## `sql/` histórico

### O que é

`sql/` reúne scripts SQL legados (ad hoc, versões intermediárias e validações manuais) mantidos para rastreabilidade.

### Por que está legado

Esses scripts foram substituídos pela esteira oficial versionada em `supabase/schema-*.sql` e `supabase/migrations/*.sql`, ou são artefatos auxiliares não operacionais.

### Status de uso

- Uso **somente leitura** para referência histórica.
- Não usar como deploy/setup/update primário.

### Mapa arquivo → destino oficial / migration correspondente

| Arquivo legado | Destino oficial / migration correspondente | Motivo de permanência | Risco de remoção | Critério de remoção futura |
|---|---|---|---|---|
| `sql/01_bootstrap.sql` | `supabase/schema-bootstrap-v8.1.2.3.sql` | Registrar origem do bootstrap antes da consolidação. | Médio (perda de trilha histórica de bootstrap). | Remover após documentação arquitetural consolidar totalmente a evolução de bootstrap. |
| `sql/02_v8.1.3.3_auto_verify.sql` | `supabase/migrations/v8.1.3.3_auto_verify.sql` | Referência de versão intermediária do mesmo ajuste. | Baixo (conteúdo já oficializado). | Remover quando política de retenção histórica excluir duplicatas já consolidadas. |
| `sql/03_v8.1.5.1_write_path_hardening.sql` | `supabase/migrations/v8.1.5.1_write_path_hardening.sql` | Evidência histórica do hardening em fase de transição. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/04_v8.1.6.1_rls_column_hardening.sql` | `supabase/migrations/v8.1.6.1_rls_column_hardening.sql` | Trilha de auditoria da evolução de RLS/colunas sensíveis. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/05_v8.1.6.2_reports.sql` | `supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql` | Histórico do recorte inicial de reports antes do merge de hardening final. | Baixo. | Remover quando não houver necessidade de auditoria do recorte pré-consolidação. |
| `sql/06_v8.1.7.0_post_status.sql` | `supabase/migrations/v8.1.7.0_post_status.sql` | Rastrear versão histórica equivalente. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/07_v8.1.7.1_report_rate_limit.sql` | `supabase/migrations/v8.1.7.1_report_rate_limit.sql` | Rastrear versão histórica equivalente. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/08_v8.1.7.2_comments_table.sql` | `supabase/migrations/v8.1.7.2_comments_table.sql` | Rastrear versão histórica equivalente. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/09_v8.1.7.3_post_votes_table.sql` | `supabase/migrations/v8.1.7.3_post_votes_table.sql` | Rastrear versão histórica equivalente. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/10_v8.1.7.4_admin_setup.sql` | `supabase/migrations/v8.1.7.4_admin_setup.sql` | Rastrear versão histórica equivalente. | Baixo. | Mesmo critério de duplicatas consolidadas em migration oficial. |
| `sql/11_seed_posts.sql` | Sem migration oficial (seed histórico ligado a `data/database.json`) | Preservar contexto de seed antigo e debugging de dados locais. | Médio (perda de reprodutibilidade histórica de dados de demo). | Remover quando houver dataset/versionamento de seed substituto oficialmente documentado. |
| `sql/12_validacao_rls.sql` | Sem migration oficial (script de validação manual) | Manter roteiro de validação/auditoria pontual. | Médio (perda de checklist histórico de validação). | Remover quando validações equivalentes estiverem automatizadas e documentadas no fluxo oficial. |
| `sql/13_fix_auth_egresso_domain.sql` | `supabase/migrations/v8.1.7.5_auth_egresso_domain.sql` | Guardar histórico do hotfix pré-consolidação. | Baixo. | Remover após janela de auditoria do incidente/ajuste de domínio institucional. |
| `sql/14_fix_votes_anon_read.sql` | Sem migration oficial direta (patch ad hoc histórico) | Preservar contexto de correção emergencial pós-migration. | Médio/alto (perda de contexto de bug e mitigação). | Remover somente após consolidar correção equivalente em migration oficial versionada e registrar pós-mortem. |
| `sql/15_add_display_name_to_profiles.sql` | Sem migration oficial (pendente de promoção para esteira versionada) | Referência do ajuste ainda não incorporado oficialmente. | Alto (pode ocultar requisito pendente). | Remover apenas depois de promover o ajuste para migration oficial e validar rollout. |

---

## Regra operacional

- Trate `docs/legacy/` como **acervo histórico**.
- Para execução real de banco, use apenas `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
