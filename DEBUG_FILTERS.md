# Debug de Filtros - KinoCampus V5.1

## Problema Identificado
Os cards estão desaparecendo quando se clica nas tabs de categoria (Móveis, Eletrônicos, etc). A área de conteúdo fica vazia.

## Causa Provável
O problema parece estar na função `applyFilters()` que está escondendo todos os cards. Possíveis causas:

1. A verificação de `selectedCategories.length > 0` pode estar falhando
2. Os checkboxes podem não estar sendo desmarcados corretamente
3. A lógica de filtro pode estar conflitando

## Solução
Preciso revisar a lógica de filtro para garantir que:
- Quando uma categoria é selecionada, apenas ela fica marcada
- Os filtros de condição (Novo/Seminovo) não interferem
- Os cards com a categoria correspondente são exibidos

## Próximo Passo
Reescrever a função de filtro com lógica mais simples e direta.
