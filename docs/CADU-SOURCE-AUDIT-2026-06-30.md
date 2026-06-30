# Auditoria de Fontes Cadu/UFG - 2026-06-30

Escopo: revisar sites oficiais, `news.json`/`events.json` e perfis Instagram usados pelo Cadu para alimentar eventos e oportunidades no KinoCampus.

## Fontes oficiais usadas

- Pagina oficial UFG de unidades e orgaos: https://ufg.br/p/27412-unidades-e-orgaos
- IAC: https://iac.ufg.br
- CEROF: https://cerof.ufg.br
- Centro Cultural UFG: https://centrocultural.ufg.br
- SEACULT: https://seacult.ufg.br
- CSA/Campus Goias: https://csa.goias.ufg.br
- UAECH/Campus Goias: https://uaech.goias.ufg.br
- CEFIS/Firminopolis: https://firminopolis.ufg.br

## Achados principais

- O IAC e uma fonte nova e relevante: `iac.ufg.br/news.json` e `iac.ufg.br/events.json` funcionam. Havia edital real de monitoria 2026-2 e eventos/oficinas culturais.
- CEROF e fonte real: `cerof.ufg.br/news.json` funciona e o site linka `@cerofufg`; CDP encontrou 10 posts novos, 3 relevantes.
- Centro Cultural UFG e fonte forte para eventos: `centrocultural.ufg.br/news.json` e `events.json` retornaram 20 itens cada; site linka `@centroculturalufg`.
- Campus Goias estava com handle errado no mapa/scanner: o site de CSA aponta `@campusgoiasufg`; `@campusgoias.ufg` nao rendeu conteudo.
- EECA e IME tinham IG ausente/antigo: sites oficiais apontam `@eeca_ufg` e `@ime_ufg`; ambos foram validados por CDP com posts relevantes.
- CEFIS/Firminopolis e fonte real: `firminopolis.ufg.br/news.json` funciona e `@firminopolis_ufg` trouxe posts relevantes.
- `cultura.ufg.br` e `secult.ufg.br` nao resolvem DNS. Para cultura, usar `centrocultural.ufg.br` e `seacult.ufg.br`.
- `mat.ufg.br`, `cienciassociais.ufg.br`, `eec.ufg.br` e `www2.emc.ufg.br` nao devem ser usados; usar `ime.ufg.br`, `fcs.ufg.br`, `eeca.ufg.br` e `emc.ufg.br`.

## Mudancas aplicadas

### Entram no curador `--daily` (Tier 2)

- `iac` -> `https://iac.ufg.br`
- `cerof` -> `https://cerof.ufg.br`, IG `@cerofufg`
- `centrocultural` -> `https://centrocultural.ufg.br`, IG `@centroculturalufg`
- `csa` -> `https://csa.goias.ufg.br`, IG `@campusgoiasufg`
- `uaech` -> `https://uaech.goias.ufg.br`

### Entram como fontes suplementares (Tier 3/full)

- `cefis` -> `https://firminopolis.ufg.br`, IG `@firminopolis_ufg`
- `cpa` -> `https://cpa.secplan.ufg.br`
- `cidarq` -> `https://cidarq.ufg.br`
- `cegraf` -> `https://cegraf.ufg.br`
- `hospitalveterinario` -> `https://hospitalveterinario.evz.ufg.br`
- `seacult` -> `https://seacult.ufg.br`

### IGs corrigidos/adicionados

- `agro`: `@ea.ufg`
- `direito`: `@direitoufg`
- `fefd`: `@fefdufg`
- `eeca`: `@eeca_ufg`
- `ime`: `@ime_ufg`
- `campusgoias`: `@campusgoiasufg`
- novos: `@cerofufg`, `@centroculturalufg`, `@firminopolis_ufg`, `@lacena_ufg`

## Validacao CDP Instagram

- `@cerofufg`: 10 posts novos, 3 relevantes.
- `@eeca_ufg`: 6 posts novos, 2 relevantes.
- `@ime_ufg`: 11 posts novos, 6 relevantes.
- `@campusgoiasufg`: 9 posts novos, 5 relevantes.
- `@firminopolis_ufg`: 9 posts novos, 6 relevantes.
- `@centroculturalufg`: 11 posts novos, 1 relevante.
- `@lacena_ufg`: 7 posts novos, 1 relevante.

## Arquivos alterados

- OpenClaw: `data/.openclaw/workspace/scripts/cadu-curador-v4.4.js`
- OpenClaw: `data/.openclaw/workspace/scripts/scan-ig-browser.js`
- OpenClaw: `data/.openclaw/workspace/scripts/site-structure-scan.js`
- OpenClaw: `data/.openclaw/workspace/ufg-sites-map.md`
- OpenClaw: `data/.openclaw/skills/cadu-api/server.py`
- KinoCampus: `services/cadu-ufg-publisher/config/sources.json`

## Validacao operacional no VPS

- Backup remoto antes do deploy: `/docker/openclaw-hahq/backups/source-audit-20260630-140850`.
- `node --check` passou no container `openclaw-hahq-openclaw-1` para `cadu-curador-v4.4.js`, `scan-ig-browser.js` e `site-structure-scan.js`.
- `cadu-api` foi recriado com `docker compose up -d --no-deps --force-recreate cadu-api`.
- `GET /api/sites` autenticado no container `openclaw-hahq-cadu-api` retornou 65 fontes.
- O parser de `/api/sites` foi corrigido para:
  - nao reclassificar linhas de fonte como heading quando aparecem palavras como "Centro", "Secretaria" ou "Hospital";
  - preservar o Tier explicito de `## TIER X`;
  - aceitar subdominios profundos como `cpa.secplan.ufg.br` e `hospitalveterinario.evz.ufg.br`;
  - tratar `(confirmed)` como status de Instagram, nao como observacao da unidade.
- Override Supabase `kc_unit_meta` de `CSA` foi corrigido via `PATCH /api/sites/CSA/meta`: Tier 3 -> Tier 2, alinhando admin, mapa e curador diario.

## Smoke test de `news.json`/`events.json`

- `iac.ufg.br`: news=17, events=4 via `curl.exe` (Node fetch local falhou por `TypeError`, comportamento ja observado antes).
- `cerof.ufg.br`: news=20, events=0.
- `centrocultural.ufg.br`: news=20, events=20.
- `csa.goias.ufg.br`: news=20, events=9.
- `uaech.goias.ufg.br`: news=20, events=16.
- `firminopolis.ufg.br`: news=20, events=2.
- `cpa.secplan.ufg.br`: news=3, events=1.
- `cidarq.ufg.br`: news=30, events=25.
- `cegraf.ufg.br`: news=25, events=13.
- `hospitalveterinario.evz.ufg.br`: news=20, events=3.
- `seacult.ufg.br`: news=0, events=0.

## Riscos e proximas verificacoes

- O IAC ainda aponta no footer para `emacufg`, mas esse handle nao trouxe posts via CDP. Por enquanto o valor principal e o site Weby `iac.ufg.br`.
- Alguns handles com 0 posts podem existir, mas o scanner antigo nao distinguia claramente perfil vazio de perfil inexistente. Foi adicionada deteccao basica de `profile_unavailable`.
- O aumento do `--daily` e moderado: +5 fontes Tier 2. A proxima run deve confirmar impacto de tempo e qualidade.
