# Kino Campus Platform Map For Cadu

## Paginas Publicas Principais

- `index.html`: home e feed geral.
- `eventos.html`: eventos academicos, culturais, esportivos, workshops e sustentabilidade.
- `oportunidades.html`: monitoria, estagio, emprego, voluntariado e freelancer.
- `create-post.html`: fallback de criacao de post.
- `product.html`: detalhe de publicacao.
- `search-results.html`: busca.

## Criacao De Posts

A superficie canonica e `KCAPI.createPost(body)`.

Contrato essencial:

```js
{
  modulo: 'eventos' | 'oportunidades',
  titulo: '...',
  descricao: '...',
  categoria: 'academicos',
  categoriaKey: 'academicos',
  localizacao: '...',
  visibility: 'public',
  tags: ['UFG', 'PROGRAD'],
  imagens: [],
  metadata: {
    source_url: 'https://...',
    link: 'https://...',
    link_as_cta: true
  }
}
```

O servico `cadu-ufg-publisher` publica via REST Supabase usando a mesma estrutura de dados que o modal monta.

## Moderacao E Limites

O banco tem trigger anti-spam:

- mais de 3 posts/hora por autor: hard block `flood_limit_exceeded`;
- mais de 3 URLs externas no titulo/descricao: post pode ficar `pending`;
- conta nova com 0 posts aprovados: post pode ficar `pending`.

Por isso:

- use uma URL oficial principal na descricao;
- deixe outros links no `metadata` se necessario;
- publique poucos itens por execucao;
- confira se a conta `Cadu Bot` ja e confiavel/verificada.

## Como Explicar Ao Yan

Use linguagem objetiva:

- `publicados`: itens enviados ao Kino.
- `revisao`: itens bons, mas com incerteza.
- `descartados`: itens sem relevancia suficiente.
- `fontes desabilitadas`: sites inacessiveis ou sem permissao de crawling naquela execucao.
- `duplicados`: itens ja vistos pelo state local.

Nunca diga que algo foi publicado se o comando retornou dry-run.
