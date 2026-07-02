# V76 — Evidencia do ranking shadow do feed

**Data:** 2026-07-02  
**Escopo:** `eventos` e `oportunidades`, amostra publica via Supabase REST/RPC anon, sem escrita no banco e sem troca da ordenacao publica.

## Objetivo

Validar a primeira politica de ranking v2 do feed contra dados reais sem quebrar a paginacao atual. A ferramenta usada foi:

```powershell
npm run benchmark:feed-ranking-shadow -- --limit 80 --rpc-limit 10 --now 2026-07-02T12:00:00.000Z
```

Ela usa `assets/js/shared/kc-feed-ranking-policy.shared.js`, busca uma amostra REST publica e compara os primeiros itens atuais das abas `votos`, `recentes` e `comentados` pela RPC `kc_get_feed_cursor`.

## Resultado da amostra REST

| Metrica | Valor |
|---|---:|
| posts analisados | 80 |
| eventos | 40 |
| oportunidades | 40 |
| ativos pela politica v2 | 78 |
| `needs-review` | 2 |
| eventos sem data de realizacao | 2 |
| oportunidades sem prazo real normalizado | 40 |

Achados:

- Dois itens publicados como `eventos` foram sinalizados como `needs-review` por falta de `data_evento`: "FANUT Conecta" e "Divulgada lista de alunos contemplados com subsidio alimentacao - Junho 2026".
- As 40 oportunidades da amostra nao tinham prazo real normalizado nos aliases reconhecidos (`deadline_at`, `deadline_date`, `data_limite`, `inscricoes_ate`, etc.). Elas continuam ativas quando existe `expires_at`, mas recebem penalidade e razao `missing-deadline`.
- O campo `expires_at` nao deve ser tratado como prazo real de oportunidade. Ele e uma janela generica de publicacao/expiracao, nao necessariamente o ultimo dia de inscricao.

Follow-up no mesmo dia: `docs/qa/reports/report-v76-cadu-deadline-normalization-2026-07-02.md` implementou a primeira correcao na origem do dado, normalizando `metadata.deadline_date` para oportunidades no publisher Cadu e na Edge Function `cadu-publish`.

## Comparacao com as abas atuais

### `Destaques` / `votos`

Nos 10 primeiros itens da RPC, 8 eram oportunidades com `missing-deadline`. Exemplos:

- `b2171655-7bf7-483a-b251-9908d2377c45` — Mobilidade internacional CEIA/AKCIT.
- `7830d052-7b6b-4a87-a65f-772a889b756c` — UFG adere ao SISU+.
- `19a3f0d1-d78a-45cf-8de3-b59efbff95e9` — CICSIC 2026.

Isso indica que `highlight_score` atual promove oportunidades sem saber o prazo real. O score v2 nao remove automaticamente esses itens, mas reduz qualidade e registra a pendencia.

### `Recentes`

Nos 10 primeiros, 3 oportunidades aparecem com `missing-deadline`; os demais eventos tinham data suficiente para janela ativa. A aba esta menos contaminada por encerrados nessa amostra, mas ainda depende da qualidade dos metadados do Cadu.

### `Comentados`

Nos 3 itens retornados, todos estavam `closed`. Isso confirma novamente que `comentados` hoje funciona como historico comentado, nao como comentarios ativos. Para feed principal, a proxima fase deve separar `comentados_ativos` de `historico`.

## Decisoes confirmadas

1. Nao reordenar no cliente enquanto `kc_get_feed_cursor` continuar sendo cursor-paginado.
2. Eventos sem data de realizacao nao devem competir no feed ativo de eventos.
3. Oportunidades sem prazo real podem aparecer, mas precisam ficar visiveis como pendencia para Cadu/admin.
4. `expires_at` e fallback de janela, nao substituto de `deadline_at`.
5. `Comentados` precisa de variante ativa antes de qualquer troca de comportamento publico.

## Arquivos de suporte

- `assets/js/shared/kc-feed-ranking-policy.shared.js`
- `scripts/analyze-feed-ranking-shadow.js`
- `tests/unit/kc-feed-ranking-policy.test.js`
- `tests/unit/analyze-feed-ranking-shadow.test.js`
- `docs/architecture/feed-ranking-transition-plan-2026-07-02.md`
