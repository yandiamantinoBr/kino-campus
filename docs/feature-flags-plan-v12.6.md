# Feature Flags formais - v12.6

## Objetivo

Formalizar uma camada unica de leitura de feature flags no frontend Vanilla JS, preservando `KC_ENV` como fonte de configuracao e expondo uma API pequena e congelada em `window.KCFF`.

Esta iteracao cria a fundacao. Ela nao substitui configuracoes sensiveis como `driver`, Supabase, auth ou buckets de storage por flags booleanas.

## Contrato publico

Arquivo runtime:

```txt
assets/js/kc-feature-flags.js
```

Namespace:

```js
window.KCFF
```

Exports:

```js
Object.freeze({
  get,
  getAll,
  isEnabled
})
```

## Fontes de leitura

Ordem de precedencia:

1. `window.KC_ENV.featureFlags`
2. `window.KC_ENV.flags`
3. derivados seguros `env.*`

`KC_ENV.flags` e a fonte canonica para novas flags. `KC_ENV.featureFlags` existe como alias compat para overrides manuais.

## Flags iniciais

Defaults declarados em `kc-env.js`:

```js
flags: {
  'sw.enabled': false,
  'telemetry.enabled': false
}
```

Essas flags antecipam as trilhas de resiliência da v12 sem ativar Service Worker ou telemetria nesta entrega.

## API

`KCFF.get(name, fallback)`:

- aceita nomes planos (`sw.enabled`)
- aceita dot path em objetos aninhados (`telemetry.enabled`)
- aceita leitura explicita de ambiente via prefixo `env.`
- retorna clone defensivo de objetos/arrays

`KCFF.isEnabled(name, fallback)`:

- normaliza booleanos, numeros e strings
- considera `true`, `1`, `on`, `yes`, `enabled`, `sim` como verdadeiro
- considera `false`, `0`, `off`, `no`, `disabled`, `nao` como falso

`KCFF.getAll()`:

- retorna snapshot congelado
- inclui flags declaradas e derivados seguros
- nao retorna referencia mutavel para `KC_ENV`

## Ordem de carregamento

Todos os 22 HTMLs canonicos carregam:

```html
<script defer src="assets/js/kc-env.js"></script>
<script defer src="assets/js/kc-feature-flags.js"></script>
```

Em paginas admin, o prefixo e `../assets/js/`.

O `scripts/hygiene-check.js` falha se a cadeia `kc-env.js -> kc-feature-flags.js` estiver ausente, duplicada ou fora de ordem.

## Fora de escopo

- Migrar todo uso de `ENV.*` para `KCFF.*`
- Trocar `KCAPI.ENV` por `KCFF`
- Ativar Service Worker
- Ativar telemetria cliente
- Criar flags remotas ou persistidas em banco

## Validacao

- `node --check assets/js/kc-feature-flags.js`
- `node --check assets/js/kc-env.js`
- `node --check scripts/hygiene-check.js`
- `node scripts/hygiene-check.js`
- `npm test -- tests/kc-feature-flags.test.js`
- `npm test`
