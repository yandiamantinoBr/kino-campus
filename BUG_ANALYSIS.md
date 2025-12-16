# Análise de Bug - Filtros Compra e Venda

## Problema Identificado
Os cards estão desaparecendo quando se clica nos filtros de categoria. O problema está na lógica do filtro:

1. Os cards têm os data-attributes corretos:
   - `data-category="eletronicos"` 
   - `data-category="livros"`
   - `data-category="moveis"` (Cama Box está correta)
   - `data-category="vestuario"`
   - `data-category="outros"`

2. O problema está na lógica de filtro que verifica condição (novo/seminovo):
   - Quando `filterNovo` está checked, ele filtra APENAS cards com `data-condition="novo"`
   - Quando `filterSeminovo` está checked, ele filtra APENAS cards com `data-condition="seminovo"`
   - Isso causa conflito porque ambos estão marcados por padrão

## Solução
Mudar a lógica para:
- Se NENHUM filtro de condição estiver marcado, mostrar todos
- Se algum filtro estiver marcado, mostrar apenas os que correspondem

## Correção Necessária
Linhas 777-783 do compra-venda-feed.html precisam ser corrigidas.
