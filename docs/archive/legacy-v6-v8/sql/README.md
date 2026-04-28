# SQL legado (histórico)

Esta pasta preserva scripts SQL antigos usados em etapas anteriores do projeto.

## Objetivo da pasta

- Manter **histórico técnico e rastreabilidade** de mudanças antigas.
- Permitir consulta de contexto em auditorias, debugging e revisão de decisões.
- Evitar uso acidental de scripts fora da esteira oficial.

## Motivo de legado por arquivo

| Arquivo | Motivo de legado |
|---|---|
| `01_bootstrap.sql` | Bootstrap antigo consolidado no fluxo oficial de schema (`supabase/schema-bootstrap-v8.1.2.3.sql`). |
| `02_v8.1.3.3_auto_verify.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.3.3_auto_verify.sql`). |
| `03_v8.1.5.1_write_path_hardening.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.5.1_write_path_hardening.sql`). |
| `04_v8.1.6.1_rls_column_hardening.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.6.1_rls_column_hardening.sql`). |
| `05_v8.1.6.2_reports.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.6.2_reports_privacy_hardening.sql`). |
| `06_v8.1.7.0_post_status.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.7.0_post_status.sql`). |
| `07_v8.1.7.1_report_rate_limit.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.7.1_report_rate_limit.sql`). |
| `08_v8.1.7.2_comments_table.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.7.2_comments_table.sql`). |
| `09_v8.1.7.3_post_votes_table.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.7.3_post_votes_table.sql`). |
| `10_v8.1.7.4_admin_setup.sql` | Consolidado em migration oficial (`supabase/migrations/v8.1.7.4_admin_setup.sql`). |
| `11_seed_posts.sql` | Seed de bootstrap antigo baseado em `data/database.json`; fora do fluxo operacional atual. |
| `12_validacao_rls.sql` | Script de validação manual pontual (apoio de auditoria), não migration operacional. |
| `13_fix_auth_egresso_domain.sql` | Ajuste histórico já consolidado em `supabase/migrations/v8.1.7.5_auth_egresso_domain.sql`. |
| `14_fix_votes_anon_read.sql` | Patch ad hoc pós-migration, mantido apenas para referência histórica. |
| `15_add_display_name_to_profiles.sql` | Patch de bootstrap antigo ainda não promovido à esteira versionada oficial; mantido como histórico. |

## Regra de não uso operacional

- **Não usar** scripts desta pasta como caminho primário de deploy, setup ou atualização.
- O caminho oficial é aplicar apenas arquivos versionados em `supabase/migrations/` e schema oficial em `supabase/`.
- Em caso de dúvida, trate qualquer arquivo desta pasta como **somente leitura / referência histórica**.
