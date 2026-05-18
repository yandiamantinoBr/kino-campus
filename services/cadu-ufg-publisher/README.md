# Cadu UFG Publisher

Servico de curadoria para o Cadu Bot buscar publicacoes relevantes em sites da UFG e preparar/publicar posts no Kino Campus.

## Modos

- `npm run cadu:dry-run`: varre fontes rapidas sem publicar.
- `npm run cadu:dry-run:full`: varre todas as fontes sem publicar.
- `npm run cadu:publish:quick`: prepara itens de alta confianca das fontes rapidas para revisao/aprovacao.
- `npm run cadu:publish:full`: prepara itens de alta confianca de todas as fontes para revisao/aprovacao.

O modo padrao e sempre dry-run. Publicacao real exige `--publish` e credenciais em `services/cadu-ufg-publisher/.env.local` ou variaveis de ambiente. Dry-run nao marca itens publicaveis como ja processados, para nao bloquear uma publicacao real posterior.

## Seguranca Operacional

Antes de instalar no VPS, rotacione as credenciais que foram compartilhadas no chat. Depois:

- crie um usuario Linux nao-root para o servico;
- desative login SSH por senha e use chave SSH;
- mantenha `.env.local` com permissao `600`;
- nao use service role do Supabase no OpenClaw/Cadu;
- use uma conta dedicada do Kino Campus para o Cadu via Supabase Auth.

## Publicacao

O publicador usa Auth REST do Supabase com a conta dedicada do Cadu, sincroniza o profile `Cadu Bot` e insere em `posts` respeitando RLS (`author_id = auth.uid()`). O payload preserva os campos esperados pelo modal:

- `eventos`: local, data/hora detectadas, link oficial e `link_as_cta`;
- `oportunidades`: area, modalidade presencial por padrao, contato e link oficial.
- descricao em Markdown seguro (`**negrito**`, listas e links oficiais essenciais), compatível com o preview/render do Kino;
- imagem de capa quando a fonte oficial expõe `image`, `image_url` ou `og:image`; o Cadu baixa a imagem remota, sobe para o bucket `kino-media` e grava a URL publica em `post_media` como capa. Se o upload falhar, usa a URL remota como fallback e reporta em `media.uploads`.

O Cadu tambem inclui `Datas importantes` em frases com prazo, inscricao, recurso, resultado ou homologacao, evita repetir o cronograma do resumo e usa categoria `pesquisa` para PRPI, PIBIC/PIVIC, Fapeg, iniciacao cientifica e mobilidade academica.

Para reduzir falso positivo, o fluxo e hibrido:

- `review:preview`: score >= 0.78 quando `CADU_REVIEW_BEFORE_PUBLISH` nao for `false`;
- `review`: score entre 0.55 e 0.77;
- `review:quality`: score alto, mas o payload falhou em alguma checagem editorial automatica;
- `discard`: score abaixo de 0.55.

Por padrao, o Cadu envia preview por Telegram/e-mail antes de publicar. Para publicar automaticamente itens de alta confianca, defina `CADU_REVIEW_BEFORE_PUBLISH=false`.

A guarda de qualidade barra auto-publicacao quando encontra resumo institucional generico em item acionavel, falta de contexto para multiplos PDFs, falta de prazo/cronograma, divergencia de link oficial ou imagem invalida. Nesses casos o digest mostra `Avisos de qualidade` para o operador aprovar, rejeitar ou pedir nova extracao.

Para aprovar um item revisado:

```bash
npm run cadu:reviews -- --approve=<codigo>
```

Para rejeitar:

```bash
npm run cadu:reviews -- --reject=<codigo>
```

Prazos vencidos derrubam o item para `discard`, mesmo quando o score textual seria alto. Datas detectadas ficam em `metadata.deadline_date`, `metadata.event_date_detected` e `metadata.temporal_status`.

Itens de revisao ficam no arquivo de estado local para auditoria e podem ser enviados no digest.

`SupabasePublisher.updatePost(postId, payload)` existe para reparar uma publicacao propria pendente sem criar duplicata; ele atualiza `posts` e substitui `post_media`.

Se DNS do container/VPS falhar para alguma fonte, configure `CADU_FETCH_PROXY_TEMPLATE` com uma URL proxy que aceite `{url}` codificado ou `{rawUrl}` literal. Tambem existe `CADU_HOST_ALIASES` em JSON para trocar host antes do fallback.

## Systemd

Use os templates em `systemd/` no VPS, ajustando `WorkingDirectory`, usuario e caminho do Node conforme a instalacao.
