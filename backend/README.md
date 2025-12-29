# Backend (placeholder) - KinoCampus V6.0.0

Este diretório foi criado para preparar a migração do protótipo estático para uma fase com Backend.

## Estrutura sugerida
- `src/app.js`: servidor HTTP (Express) + static do Frontend
- `src/routes/*`: rotas da API
- `src/controllers/*`: controladores
- `src/services/*`: regras de negócio
- `src/db/*`: camada de acesso ao banco (Prisma/Knex/Mongoose)

## Endpoints recomendados (primeiro corte)
- `GET /api/v1/posts?module=&q=&category=&page=&limit=`
- `GET /api/v1/posts/:id`
- `POST /api/v1/posts` (criar anúncio/evento/moradia)
- `POST /api/v1/auth/login` / `POST /api/v1/auth/register`

## Integração no Front
No Front, o arquivo `frontend/assets/js/kc-api.client.v600.js` centraliza chamadas.
Quando o backend existir, configure:

```js
KCAPI.setConfig({ baseURL: '/api/v1' })
```

