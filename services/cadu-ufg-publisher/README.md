# Cadu UFG Publisher

Servico de curadoria para o Cadu Bot buscar publicacoes relevantes em sites da UFG e preparar/publicar posts no Kino Campus.

## Modos

- `npm run cadu:dry-run`: varre fontes rapidas sem publicar.
- `npm run cadu:dry-run:full`: varre todas as fontes sem publicar.
- `npm run cadu:publish:quick`: publica itens de alta confianca das fontes rapidas.
- `npm run cadu:publish:full`: publica itens de alta confianca de todas as fontes.

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
- descricao em Markdown seguro (`**negrito**`, listas e link oficial unico), compatível com o preview/render do Kino;
- imagem de capa quando a fonte oficial expõe `image`, `image_url` ou `og:image`; a URL entra em `post_media` como capa.

Para reduzir falso positivo, o fluxo e hibrido:

- `publish`: score >= 0.78;
- `review`: score entre 0.55 e 0.77;
- `discard`: score abaixo de 0.55.

Prazos vencidos derrubam o item para `discard`, mesmo quando o score textual seria alto. Datas detectadas ficam em `metadata.deadline_date`, `metadata.event_date_detected` e `metadata.temporal_status`.

Itens de revisao ficam no arquivo de estado local para auditoria e podem ser enviados no digest.

## Systemd

Use os templates em `systemd/` no VPS, ajustando `WorkingDirectory`, usuario e caminho do Node conforme a instalacao.
