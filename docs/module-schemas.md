# KinoCampus — Schemas dos Módulos (KC_CREATE_SCHEMA)

## Como funciona

Cada módulo tem um schema em `KC_CREATE_SCHEMA` dentro de `kc-create-post.js`. O schema define:
- `categoryGroupId`: qual tagGroup define a categoria principal do post
- `tagGroups`: chips de seleção obrigatórios/opcionais na criação

O schema é usado para:
1. Renderizar os chips de seleção no modal de criação
2. Validar se todos os campos obrigatórios foram preenchidos
3. Mapear a seleção para o campo `category` e `metadata` do post no banco

## Constante CATEGORY_GROUP_MAP

Mapeia `moduleKey → groupId` para a categoria principal. Usada em `product.controller.js` para pré-preencher o modal "Criar parecido".

```javascript
CATEGORY_GROUP_MAP = {
  'compra-venda':     'categoria',
  'moradia':          'tipo',
  'eventos':          'topico',
  'achados-perdidos': 'status',
  'oportunidades':    'tipo',
  'caronas':          'tipo',
}
```

---

## Módulo: Compra e Venda (`compra-venda`)

**Ícone:** `fas fa-shopping-bag` | **Expiração:** 30 dias

### TagGroups

| GroupId | Label | Obrigatório | Múltipla seleção | Opções |
|---------|-------|-------------|-----------------|--------|
| `categoria` | Categoria | ✅ | ❌ | Eletrônicos, Livros, Móveis, Vestuário, Outros |
| `acao` | Ação | ✅ | ❌ | Vendo, Compro |

### Campos adicionais
- `preco` (número em BRL)
- Imagens (até 5, 1 capa)

### Exemplo de post criado
```javascript
{
  module: 'compra-venda',
  category: 'Eletrônicos',       // label da opção selecionada em 'categoria'
  metadata: {
    acao: 'Vendo',                // seleção em 'acao'
    categoriaKey: 'eletronicos',  // slug da categoria
  },
  price: 350.00,
}
```

---

## Módulo: Caronas (`caronas`)

**Ícone:** `fas fa-car` | **Expiração:** 7 dias

### TagGroups

| GroupId | Label | Obrigatório | Múltipla seleção | Opções |
|---------|-------|-------------|-----------------|--------|
| `tipo` | Tipo | ✅ | ❌ | Ofereço carona, Procuro carona |

### Campos adicionais
- Origem e destino (campos texto em `metadata`)
- Data/hora da carona
- Imagens opcionais

---

## Módulo: Moradia (`moradia`)

**Ícone:** `fas fa-home` | **Expiração:** 30 dias

### TagGroups

| GroupId | Label | Obrigatório | Múltipla seleção | Opções |
|---------|-------|-------------|-----------------|--------|
| `tipo` | Tipo | ✅ | ❌ | Repúblicas, Quartos, Apartamentos, Casas, Procurando |

### Campos adicionais
- `preco` (aluguel mensal em BRL)
- Região (sugestões automáticas: setores de Goiânia)
- Imagens (até 5, 1 capa)

---

## Módulo: Eventos (`eventos`)

**Ícone:** `fas fa-calendar-alt` | **Expiração:** 30 dias

### TagGroups

| GroupId | Label | Obrigatório | Múltipla seleção | Opções |
|---------|-------|-------------|-----------------|--------|
| `topico` | Tópico | ✅ | ❌ | Sustentabilidade, Acadêmicos, Culturais, Esportivos, Workshops, Festas |

### Campos adicionais
- Data e hora do evento (`metadata.dataEvento`, `metadata.horaEvento`)
- Local do evento (`metadata.localEvento`)
- Link externo (`metadata.linkEvento`)
- Flag `sustentavel`: true automático quando tópico = Sustentabilidade

---

## Módulo: Achados e Perdidos (`achados-perdidos`)

**Ícone:** `fas fa-search` | **Expiração:** 30 dias

### TagGroups

| GroupId | Label | Obrigatório | Múltipla seleção | Opções |
|---------|-------|-------------|-----------------|--------|
| `status` | Status | ✅ | ❌ | Perdidos, Encontrados |
| `tipo` | Tipo do Item | ✅ | ❌ | Documentos, Eletrônicos, Outros |

### Campos adicionais
- Local onde perdeu/encontrou (`metadata.local`)
- Data (`metadata.dataOcorrencia`)
- Imagens opcionais

---

## Módulo: Oportunidades (`oportunidades`)

**Ícone:** `fas fa-briefcase` | **Expiração:** 30 dias

### TagGroups

| GroupId | Label | Obrigatório | Múltipla seleção | Opções |
|---------|-------|-------------|-----------------|--------|
| `tipo` | Tipo | ✅ | ❌ | Estágio, Emprego, Freelancer, Monitoria, Voluntariado |

### Campos adicionais
- Área de atuação (sugestões automáticas)
- Remuneração (opcional, `metadata.remuneracao`)
- Presencial/Remoto (`metadata.modalidade`)
- Link de candidatura (`metadata.linkCandidatura`)

---

## Como adicionar um novo módulo

1. Adicionar em `MODULES` em `kc-constants.js`:
   ```javascript
   'novo-modulo': {
     icon: 'fa-xxx',
     label: 'Novo Módulo',
     expires: 30,
   }
   ```

2. Adicionar schema em `KC_CREATE_SCHEMA` em `kc-create-post.js`:
   ```javascript
   'novo-modulo': {
     categoryGroupId: 'tipo',
     tagGroups: [
       {
         id: 'tipo',
         label: 'Tipo',
         required: true,
         multiple: false,
         options: ['Opção A', 'Opção B'],
       }
     ],
   }
   ```

3. Adicionar em `CATEGORY_GROUP_MAP` em `product.controller.js`:
   ```javascript
   'novo-modulo': 'tipo',
   ```

4. Seguir o checklist em `docs/architecture.md` — seção "Criar novo módulo".

---

## Validação de Schema

O `kc-create-post.js` valida:
- Todos os tagGroups com `required: true` têm pelo menos 1 opção selecionada
- `titulo` não está vazio
- Se `preco` está presente, é um número válido

Retorna array de erros por campo: `[{ field: 'categoria', message: 'Selecione uma categoria' }]`
