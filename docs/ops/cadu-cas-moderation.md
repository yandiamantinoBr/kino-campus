# Moderação editorial reversível do Cadu

`cadu-moderation-cas-v1` permite recolher um post do próprio Cadu já publicado e
público, nos módulos `eventos` ou `oportunidades`, após revisão factual. O caso
motivador foi um evento de Cuiabá/MT atribuído automaticamente à UFG sem evidência
de vínculo com o campus. O contrato não decide sozinho se outro evento é elegível.

## Implantação

1. Aplicar a migration `20260925124649_cadu_cas_moderation.sql` pelo fluxo oficial
   de migrations. Confirmar a assinatura de oito argumentos e grant exclusivo
   `service_role` da função `kc_cadu_moderate_post_cas`.
2. Implantar `cadu-publish` da mesma revisão de Git. A Edge revalida JWT, sessão
   ativa e allowlist do Cadu; o RPC repete o vínculo com a conta confiável e a
   propriedade do post. O probe `capabilities` deve anunciar
   `canonicalModeration: "cadu-moderation-cas-v1"`.
3. Não usar o `edit` genérico nem `kc_admin_set_post_status` para esta correção;
   esses caminhos legados não têm este contrato de snapshot e recibo.

## Pedido de ocultação

Obter os 16 campos de `MODERATION_COLUMNS` em leitura fresca por API autenticada
do Supabase. Preservar os seis microssegundos de `created_at` e `updated_at`; a
função normaliza somente esses timestamps e `expires_at`. Enviar à Edge:

```json
{
  "action": "moderate",
  "postId": "<UUID do post>",
  "moderation": {
    "operation": "hide",
    "operationId": "<UUID novo>",
    "expected": { "<16 campos completos>": "<valores lidos>" },
    "reason": "<justificativa editorial específica, 24 a 1000 caracteres>",
    "evidence": [{
      "url": "<URL primária exata de metadata.source_url>",
      "title": "<título da fonte>",
      "dates": "<datas comprovadas>",
      "venue": "<local comprovado>"
    }]
  }
}
```

O RPC trava a linha, compara **todos** os 16 campos e só então muda `status`
de `published` para `hidden`. Preserva ID, `visibility`, módulo, fonte, conteúdo,
validade, mídia e comentários. `moderation_reason` vira
`audit-cadu-editorial:<operationId>`; motivo e evidências completos ficam em
`metadata.cadu_moderation_history` e `audit_log`. O gatilho de status registra
também a transição. Uma edição concorrente retorna `MODERATION_CONFLICT` sem
escrita. Em timeout ou ausência de recibo, ler post e auditoria antes de repetir;
o resultado é **incerto**, não falha confirmada.

Posts com lock/edição manual, tombstone, moderação anterior, falta de fonte ou
propriedade divergente são rejeitados. A API exige evidência ligada à fonte
primária, mas a veracidade editorial da evidência requer revisão humana.

## Rollback

Após nova revisão editorial, usar outro `operationId`, `operation: "rollback"`,
`rollbackOf` igual ao último ID de ocultação, snapshot fresco completo, motivo e
evidência. O RPC só restaura `published` se o post ainda estiver exatamente
oculto por aquela operação, sem alterações concorrentes, e `expires_at` ainda
for futuro. Ele acrescenta uma segunda entrada auditada; não apaga a primeira.
Se a validade expirou ou qualquer estado mudou, o rollback é bloqueado. Não
reativar por SQL direto.

## Verificação

Local: `deno test --no-lock --node-modules-dir=none --allow-env --allow-read
supabase/functions/cadu-publish/moderation_test.ts` e
`supabase test db --local supabase/tests/cadu_cas_moderation_test.sql` após
aplicar a migration em banco descartável. Os testes cobrem snapshot obsoleto,
propriedade, fonte, locks, perda de recibo, grant, preservação de mídia,
auditoria e rollback. Na produção, verificar estado no banco e invisibilidade
anônima do post, além de ler os dois recibos se houver reversão.
