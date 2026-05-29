-- v9.3.5.17_schedule_highlight_score_refresh.sql
--
-- Agenda a atualizacao HORARIA do highlight_score (nota de relevancia da aba
-- "Destaques" da home). A funcao public.kc_refresh_highlight_scores() ja existe:
-- recalcula a nota com decaimento por idade
--   (votos*10 + salvos + comentarios*3 + cliques + shares) / (1 + idade_em_semanas)
-- e zera posts encerrados.
--
-- Problema corrigido: o score so era recalculado pelo gatilho de engajamento
-- (kc_trigger_update_highlight_score), nunca por tempo. Assim o decaimento por
-- idade "congelava" e a aba Destaques ficava desatualizada (posts antigos com
-- score alto antigo, e posts encerrados com score residual, no topo).
--
-- Idempotente: remove o job se ja existir antes de reagendar.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'kc-refresh-highlight-scores') then
    perform cron.unschedule('kc-refresh-highlight-scores');
  end if;
end $$;

select cron.schedule(
  'kc-refresh-highlight-scores',
  '0 * * * *',  -- de hora em hora (minuto 0)
  $$ select public.kc_refresh_highlight_scores(); $$
);
