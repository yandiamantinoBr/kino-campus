# D2: contrato para consolidação atômica de posts Cadu

Estado em 24/09/2026: **proposta local, sem rota de escrita, RPC ou migration**. O avaliador `scripts/cadu-atomic-dedup-preview.js` só identifica bloqueios óbvios em snapshots sintéticos. Mesmo `review_only` exige revisão e uma futura transação oficial. Nenhum par histórico foi ocultado por este trabalho.

## Por que a implementação genérica está bloqueada

- `kc_cadu_correct_post_integrity` compara e bloqueia um post; `kc_cadu_quarantine_source_conflict` recolhe um post de uma revisão específica. Nenhum dos dois consolida dois posts e duas galerias numa transação.
- A mesma URL pode conter uma compilação e itens individuais. O próprio `dedup-kino.js` exige confirmação além da URL. Similaridade de título, imagem ou `autoHide` não prova que instruções, prazo e finalidade sejam iguais.
- `posts` contém fatos públicos e campos operacionais; `post_media` contém IDs, capa e ordem. Antes de ocultar, a transação deve demonstrar que todo fato e mídia exclusivo do redundante foi preservado ou que não existe diferença factual. O contrato inicial abaixo só admite **cópias exatas**; qualquer diferença de texto, data, metadata ou mídia retorna para revisão editorial.
- O `audit_log` é apagado após um ano pela rotina de privacidade. Ele não é uma before-image durável para rollback. Uma nova ledger com snapshots integrais requer decisão explícita de retenção e apagamento de dados; criar uma tabela sem essa decisão seria incompatível com o ciclo de privacidade.
- Os marcadores `manual_edits_lock` e `manual_description` são locais ao post. O conflito `manual_distinct_pair` pode surgir do motor de deduplicação e não há, neste repositório, uma autoridade persistente transacional que o RPC possa consultar. Um booleano enviado pelo cliente não é prova suficiente.

## Escopo inicial admissível

Somente dois posts distintos de `eventos` ou `oportunidades`, do mesmo publisher confiável, ambos `published/public`, com o canônico mais antigo e ainda válido, mesma identidade de fonte (`source_id`, `source_url`, `source_registry_id`) **e** fatos públicos, metadata e conteúdo lógico de mídia exatamente iguais. `source_url` por si só nunca autoriza consolidação. Posts com lock manual, tombstone, conflito manual-distinct, validade incerta, mídia diferente ou qualquer campo factual divergente ficam bloqueados. A revisão deve verificar que o canônico mais antigo é realmente o registro válido, não apenas o menor `created_at`.

O preview atual verifica 15 campos canônicos e as seis colunas de cada mídia por post, sem fazer chamadas de rede. A ordem de criação conserva microssegundos, e datas semânticas de inscrição/evento vencidas bloqueiam o par mesmo se `expires_at` ainda for futuro. Ele retorna `review_only`, nunca `approved` nem `apply`. Seus 29 casos sintéticos são executados por `tests/contract/cadu-atomic-dedup-preview.test.js` na suíte `npm test` usada pela CI. O banco futuro precisa comparar **todas** as colunas relevantes após adquirir locks, incluindo precisão de microssegundos, e preservar os campos operacionais não editados.

## Interface proposta, ainda ausente

Entrada da Edge Function autenticada `cadu-publish`, rota exclusiva `action: "consolidate-duplicate"`:

```json
{
  "action": "consolidate-duplicate",
  "contract": "cadu-atomic-dedup-v1",
  "operationId": "UUID inédito",
  "canonicalId": "UUID do post mais antigo e válido",
  "redundantId": "UUID do post duplicado",
  "expectedCanonical": "snapshot integral retornado pelo GET autenticado",
  "expectedRedundant": "snapshot integral retornado pelo GET autenticado",
  "expectedCanonicalMedia": "todas as seis colunas de cada linha",
  "expectedRedundantMedia": "todas as seis colunas de cada linha",
  "evidence": {
    "decisionVersion": "versão de regra revisada",
    "sourceEvidenceDigest": "SHA-256 de evidência de fonte retida",
    "manualDistinctRegistryDigest": "snapshot verificável da regra de distinção manual",
    "reason": "justificativa específica do par"
  }
}
```

A Edge Function deve autenticar a sessão e o publisher, rejeitar chaves extras e combinações com `edit`/`publish`, validar tamanho e tipos, obter ambos os posts e mídias, e usar a mesma identidade de operação no único RPC. Falha de rede depois do envio retorna `MUTATION_UNCERTAIN` sem retry automático: reler ledger, posts e mídias pelo `operationId`. `EDIT_CONFLICT` implica nenhuma mutação. Sucesso só depois de validar o recibo integral.

## Banco proposto, ainda ausente

Uma migration revisada deve criar `kc_private.cadu_dedup_operations` (não exposta à Data API) com `operation_id uuid primary key`, `kind` (`consolidate`/`rollback`), par ordenado, `actor_id`, `rollback_of`, digest da solicitação/evidência, snapshots **antes e depois** de ambos os posts e mídias, hashes canônicos e `created_at`. Eventos são imutáveis; uma reversão gera novo evento. A política de retenção deve reconciliar rollback durável com exclusão de dados pessoais. O `audit_log` público pode receber um resumo sem substituir a ledger.

Esboço de schema para revisão; **não executar como migration** antes da decisão de privacidade e dos testes de transação:

```sql
create table kc_private.cadu_dedup_operations (
  operation_id uuid primary key,
  kind text not null check (kind in ('consolidate', 'rollback')),
  canonical_post_id uuid not null,
  redundant_post_id uuid not null,
  actor_id uuid not null,
  rollback_of uuid,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  source_evidence_sha256 text not null check (source_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  before_sha256 text not null check (before_sha256 ~ '^[a-f0-9]{64}$'),
  after_sha256 text not null check (after_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (canonical_post_id <> redundant_post_id),
  check ((kind = 'consolidate' and rollback_of is null) or
         (kind = 'rollback' and rollback_of is not null))
);
create unique index cadu_dedup_one_rollback_per_operation
  on kc_private.cadu_dedup_operations(rollback_of)
  where kind = 'rollback';
```

Os UUIDs do par e do ator ficam sem FK neste esboço para não impedir fluxos de apagamento existentes; o RPC deve provar existência, propriedade e publisher confiável sob lock. Antes de converter o esboço em migration, verificar privilégios do schema/tabela, RLS, política de imutabilidade, limite de tamanho e o mecanismo de apagamento de dados. A ledger não deve ficar acessível a `anon` ou `authenticated`, nem ser usada como novo conteúdo público.

O RPC `public.kc_cadu_consolidate_duplicate(...)` deve ser `SECURITY INVOKER`, `search_path = ''`, `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`, concedido apenas a `service_role`, e validar `current_user` mais `kc_trusted_publishers`. O RPC de rollback tem a mesma fronteira. A documentação atual do Supabase confirma que funções recebem `EXECUTE` para `PUBLIC` por padrão e recomenda revogação explícita e atenção a `SECURITY INVOKER`: https://supabase.com/docs/guides/database/functions .

Sequência obrigatória dentro de **uma transação PostgreSQL**:

1. Validar formato fechado, limites e unicidade do `operationId`; replay com mesmo digest retorna o mesmo recibo, digest diferente retorna conflito.
2. Trancar os dois `posts` em ordem determinística de UUID; trancar as duas galerias por `(post_id,id)`. Aguardar locks com timeout finito.
3. Recalcular `clock_timestamp()`, ler autoridade de `manual_distinct_pair` e as provas de fonte. Comparar snapshots completos e mídias após os locks. Bloquear reativação, mudança de categoria, data, finalidade ou mídia.
4. Na V1, aceitar somente par factualmente idêntico. Acrescentar ao metadata canônico uma referência de linhagem ao redundante com seu ID, origem, digest e operação. Ocultar o redundante com `merged_into_post_id` e `cadu_reactivation_blocked`; manter sua linha e mídia intactas. Nenhuma cópia especulativa de texto ou mídia.
5. Gravar before/after e hashes na ledger e um resumo no audit log. Recarregar as duas linhas e mídias **após triggers**. Qualquer efeito lateral fora do contrato lança exceção e reverte toda a transação.
6. Retornar recibo fechado com `operationId`, IDs, status, hashes, contagem de mídias e prova da mesma transação. A Edge Function compara o recibo ao plano e faz releitura autenticada; publicação real se confirma ainda por visibilidade pública, separadamente.

Rollback exige novo `operationId`, referência ao último evento aplicado e CAS integral dos dois estados posteriores, inclusive mídias. Se houve edição manual, mudança de prazo, fechamento, expiração ou moderação, retorna conflito e exige revisão; não republica automaticamente. Uma reversão bem-sucedida restaura apenas os campos alterados pela operação e registra novo evento, sem apagar a história nem estender validade.

## Provas exigidas antes de habilitar aplicação

1. Fixtures com fonte compilatória × item individual, edição manual, divergência de prazo, instrução, preço/local, mídia, microssegundos e par factualmente idêntico. O preview sintético cobre 29 casos; isso **não** prova o RPC.
2. Banco local descartável: dois workers disputando o mesmo par; um commit e outro `EDIT_CONFLICT`; replay idempotente; `operationId` reaproveitado com payload diferente; mídia inserida ou alterada durante lock; timestamps com microssegundos; trigger que modifica terceiro campo; falha na ledger/audit que reverte os dois posts.
3. ACL/RLS: `anon` e `authenticated` sem `EXECUTE`; apenas sessão oficial de Cadu e publisher confiável, via Edge autenticada. Revisão da política de retenção e erasure da nova ledger.
4. Rollback local sob CAS e bloqueio explícito após mudanças de validade, locks ou moderação. Recibo Edge verifica os dois posts e galerias.
5. Somente após CI, migration revisada e deploy controlado: preview fresco ligado ao hash exato, canário único em lote seguro, contagens e visibilidade pública. Nenhuma recomendação `autoHide` histórica é autorização para aplicar.

**Decisão atual:** manter D2 bloqueada para escrita. O contrato e o teste local impedem tratar detecção de duplicidade como permissão de ocultação enquanto as provas transacionais e a política de retenção não existirem.
