# Pipeline Completa (openclaw-cadu) — referência cruzada para este repo

> **Para humanos e IAs que estão no kino-campus:** o mapeamento canônico da Pipeline
> Completa (a que PUBLICA neste site) vive no repo openclaw-cadu:
> **docs/PIPELINE-ATLAS.md** (fluxo, topologia, contratos, anatomia de run, segredos,
> protocolos de manutenção) e **docs/engineering/PROBLEMS-PRIORITIZED-2026-09-22.md**
> (problemas abertos por prioridade — PROB-001..013, com issues #562-#573).

## O que importa deste lado

1. **Edge Function supabase/functions/cadu-publish/** é a fronteira server-side da
   publicação: valida payload (schema.ts), mapeia para rows (mapper.ts), aplica gates de
   qualidade (evaluateCaduPublishQuality em index.ts) e honra diretivas da Central
   (directive.ts). **Espelhos de contrato em lockstep com o JS** (gates e diretivas) —
   mudou um lado, muda os outros no MESMO PR (ver PROB-009 sobre paridade não verificada).
2. **Proxies /api/cadu/* e admin/cadu.html** são o consumo da Central de Revisões e do
   cadu-api (token do sidecar só no servidor; JWT Supabase no navegador).
3. **Contratos de publicação**: EVENTO (título, descrição 80-5000, categoria, datas, local,
   CTA, até 6 imagens re-hospedadas em kino-media) e OPORTUNIDADE (+ prazo, área, tipo,
   workMode, regime, remuneração). Fonte canônica: docs/cadu-publication-standards.md e
   docs/api-contract.md deste repo + schema/mapper da Edge.
4. **Problemas deste lado que afetam a publicação**: PROB-003 (TLS AIA perde eventos de
   unidades), PROB-004 (conteúdo IG antigo não republicado), PROB-001/002 (eficiência da
   Central). Acompanhar as issues no openclaw-cadu.

## Regras de ouro ao mexer aqui

- Nunca relaxar gates server-side sem o espelho JS e teste de paridade.
- Supabase: migrations reversíveis; RPCs CAS para escrita concorrente (kc_unit_meta etc.).
- Deploy de Edge: automático via workflow 'Deploy Edge Functions' após CI verde em main.
- Segredos nunca em código/log: nomes em kino-campus/.env.example.