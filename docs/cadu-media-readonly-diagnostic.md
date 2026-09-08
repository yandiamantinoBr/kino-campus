# Diagnóstico de mídia sem mutação

O endpoint existente `cadu-publish` aceita a ação explícita `diagnose-media`.
Ela verifica um pedido de seleção de mídia no mesmo runtime e pelos mesmos
helpers de rede, raster e SHA256 da correção, sem executar a correção. Não usar
a ação `edit` como diagnóstico ou acrescentar um campo que uma versão antiga
possa ignorar. Versões antigas recusam `diagnose-media` como `UNKNOWN_ACTION`.

Envelope fechado:

```json
{
  "action": "diagnose-media",
  "postId": "UUID do post",
  "mediaDiagnostic": {
    "contract": "cadu-media-verification-diagnostic-v1",
    "selection": "objeto mediaCorrection completo, com operation deduplicate"
  }
}
```

`selection` é o objeto exato do contrato `cadu-edit-media-selection-v1`:
contract, operation, operationId, expected (15 campos), expectedRows (6 campos
por associação), reason e pairs. O exemplo acima descreve o objeto; a string
ilustrativa não é um pedido válido. Não há itens, patches, provas fornecidas
pelo cliente, rollback, upload ou seleção de URLs fora do snapshot. O
identificador da seleção é somente vinculação do diagnóstico, sem reservar nem
executar uma operação.

A autenticação continua no entrypoint: JWT verificado por `auth.getUser`, sessão
ativa e publisher confiável. A checagem de sessão usa a RPC de leitura existente
`kc_is_current_session_active`; não foi eliminada. O diagnóstico exige o UID
canônico do Cadu e propriedade do post. Seu módulo recebe apenas dois leitores e
não recebe cliente com RPC, Storage, auditoria ou métodos de escrita. O envelope
diagnóstico em qualquer outra ação é recusado antes do despacho, inclusive se
combinado com `edit` ou `publish`.

O diagnóstico confere post e galeria antes dos downloads e os relê após a
verificação. Uma alteração observada provoca409. Isso não é um lock transacional
nem autoriza uma mutação posterior: toda correção real continua obrigada a fazer
nova verificação e seu CAS próprio. Limites e garantias originais permanecem:1–3
pares, até6 objetos/24MiB, até2 downloads simultâneos,4MiB e8s por objeto,
apenas os hosts/paths existentes permitidos, HTTPS sem
credenciais/porta/redirect, DNS público verificado nas duas famílias, raster
reconhecido e SHA256 completo de ambos os objetos. O transporte existente
verifica DNS mas não fixa a conexão ao IP resolvido; este diagnóstico não amplia
essa garantia.

Sucesso tem código `MEDIA_DIAGNOSTIC_VERIFIED`, `read_only:true`,
`mutation_dispatched:false`, hashes da seleção e snapshot, e pares com
IDs/SHA256/bytes. Não retorna URL, texto de post, metadados, corpo de imagem ou
credenciais. Não significa `MEDIA_DEDUPLICATED`, não produz recibo de mutação e
não satisfaz o verificador de operação aplicada.

Falhas preservam estágio fechado (`request`, `snapshot`, `selection`, `plan`,
`verification`, `snapshot_recheck`) e razão fechada. Entre as razões de rede
estão `remote_dns_unavailable`, `remote_dns_not_public`,
`remote_transport_failed`, `remote_resource_aborted`, `image_download_timeout`,
`remote_body_too_large`, `image_download_http_error`, `image_redirect_blocked`,
`image_raster_unverified` e `image_sha256_mismatch`. Mensagens arbitrárias de
exceção, URLs e headers nunca são copiados. Erro desconhecido de verificação usa
`media_verification_failed`; falhas de SELECT usam `snapshot_unavailable`/503 e
mudanças de snapshot `snapshot_changed`/409. A resposta discrimina a família da
falha; não inventa subcausa que os helpers existentes já descartaram.

Uso operacional depende de implantação oficial verificada e autorização do
operador. Executar no máximo uma leitura diagnóstica do par revisado, salvar o
recibo e investigar a razão. Nenhum retry automático e nenhuma correção como
forma de teste. A criação deste recurso não autoriza implantação, chamada Edge
ou repetição da mutação.

Teste local sem rede/credenciais:
`deno test --cached-only --no-lock --node-modules-dir=none --allow-read supabase/functions/cadu-publish/media-diagnostic-http_test.ts`.
A suíte atravessa o entrypoint real com auth/sessão/allowlist HTTP simulados e
usa o verificador real com transporte controlado. Não usa permissão de rede nem
lê variáveis de segredo.
