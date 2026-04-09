# KinoCampus - Schemas dos Modulos (`KC_CREATE_SCHEMA`)

## Como funciona

Cada modulo tem um schema em `assets/js/kc-create-post.js`, dentro de `KC_CREATE_SCHEMA`.

Esse schema define:
- `categoryGroupId`: qual `tagGroup` representa a categoria principal do post
- `tagGroups`: chips obrigatorios/opcionais mostrados no modal de criacao
- regras condicionais de campos adicionais conforme modulo e selecao atual

O schema e usado para:
1. renderizar os chips de selecao no modal de criacao
2. validar grupos obrigatorios antes do submit
3. mapear categoria/subcategoria/tags para o payload persistido
4. decidir quais campos ficam ativos no payload final

## `CATEGORY_GROUP_MAP`

Esse mapa e usado em `product.controller.js` para pre-preencher o modal "Criar parecido".

```js
const CATEGORY_GROUP_MAP = {
  'compra-venda': 'categoria',
  'moradia': 'tipo',
  'eventos': 'topico',
  'achados-perdidos': 'status',
  'oportunidades': 'tipo',
  'caronas': 'tipo',
};
```

---

## Compra e Venda (`compra-venda`)

**Icone:** `fas fa-shopping-bag`
**Expiracao:** 30 dias

### TagGroups

| GroupId | Label | Obrigatorio | Multipla selecao | Opcoes |
|---|---|---|---|---|
| `categoria` | Categoria | Sim | Nao | Eletronicos, Livros, Ingressos, Moveis, Vestuario, Outros |
| `acao` | Voce quer | Sim | Nao | Vendo, Compro |

### Campos adicionais

- `titulo`
- `descricao`
- `localizacao` (opcional)
- `preco`
- `condicao` somente quando `acao = vendo`
- `visibility`
- `sustentavel`
- imagens (ate 5, com 1 capa)

### Regras condicionais

- quando `acao = vendo`, `preco` e `condicao` ficam ativos
- quando `acao = compro`, `preco` continua ativo como orcamento opcional e `condicao` deixa de integrar o payload final

---

## Caronas (`caronas`)

**Icone:** `fas fa-car`
**Expiracao:** 7 dias

### TagGroups

| GroupId | Label | Obrigatorio | Multipla selecao | Opcoes |
|---|---|---|---|---|
| `tipo` | Tipo | Sim | Nao | Ofereco carona, Procuro carona |

### Campos adicionais

- `titulo`
- `descricao`
- `origem`
- `destino`
- `horario` (opcional)
- `contribuicao` (opcional)
- `vagas` somente quando `tipo = ofereco`
- `marcadoresCarona` (opcional)
- `visibility`
- `sustentavel`
- imagens (opcionais)

---

## Moradia (`moradia`)

**Icone:** `fas fa-home`
**Expiracao:** 30 dias

### TagGroups

| GroupId | Label | Obrigatorio | Multipla selecao | Opcoes |
|---|---|---|---|---|
| `tipo` | Tipo | Sim | Nao | Republicas, Quartos, Apartamentos, Casas, Procurando |

### Campos adicionais

- `titulo`
- `descricao`
- `regiao`
- `marcadoresMoradia` (opcional)
- `orcamento` somente quando `tipo = procurando`
- `localizacao`, `preco` e `detalhes` quando `tipo != procurando`
- `visibility`
- `sustentavel`
- imagens (ate 5, com 1 capa)

---

## Eventos (`eventos`)

**Icone:** `fas fa-calendar`
**Expiracao:** 30 dias

### TagGroups

| GroupId | Label | Obrigatorio | Multipla selecao | Opcoes |
|---|---|---|---|---|
| `topico` | Subtopico | Sim | Nao | Sustentabilidade, Academicos, Culturais, Esportivos, Workshops, Festas |

### Campos adicionais

- `titulo`
- `descricao`
- `localizacao`
- `data` (opcional)
- `hora` (opcional)
- `link` (opcional)
- `link_as_cta` (opcional)
- `gratuito`
- `preco` somente quando `gratuito` nao esta marcado
- `visibility`
- `sustentavel`
- imagens (opcionais)

---

## Achados e Perdidos (`achados-perdidos`)

**Icone:** `fas fa-search`
**Expiracao:** 30 dias

### TagGroups

| GroupId | Label | Obrigatorio | Multipla selecao | Opcoes |
|---|---|---|---|---|
| `status` | Status | Sim | Nao | Perdidos, Encontrados |

### Campos adicionais

- `titulo`
- `descricao`
- `localizacao`
- `recompensa` somente quando `status = perdidos`
- `entrega` somente quando `status = encontrados`
- `visibility`
- `sustentavel`
- imagens (opcionais)

---

## Oportunidades (`oportunidades`)

**Icone:** `fas fa-briefcase`
**Expiracao:** 30 dias

### TagGroups

| GroupId | Label | Obrigatorio | Multipla selecao | Opcoes |
|---|---|---|---|---|
| `tipo` | Tipo | Sim | Nao | Estagio, Emprego, Freelancer, Monitoria, Voluntariado |

### Campos adicionais

- `titulo`
- `descricao`
- `areaAtuacao`
- `modalidadeTrabalho`
- `regimeContratacao` somente quando `tipo = emprego`
- `localizacao` (opcional)
- `remuneracao` (opcional)
- `contato`
- `link` (opcional)
- `link_as_cta` (opcional)
- `visibility`
- `sustentavel`
- imagens (opcionais)

---

## Validacoes relevantes da `v11.12.0`

O submit do modal agora deriva explicitamente os campos ativos antes de montar o payload final.

Isso evita vazamento de valores condicionais antigos quando o usuario muda a configuracao do formulario, por exemplo:
- `condicao` nao vaza de `vendo` para `compro`
- `vagas` nao vaza de `ofereco` para `procuro`
- `preco` nao vaza quando `gratuito` esta marcado em eventos
- `recompensa`, `entrega`, `orcamento` e `regimeContratacao` so seguem para o payload quando o campo ainda esta ativo

O rascunho continua preservado no estado do modal para permitir que o usuario volte atras sem perder o que digitou.
