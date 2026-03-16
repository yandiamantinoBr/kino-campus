# Padrão de Marcadores Visuais por Módulo

Este documento consolida o padrão adotado para módulos que exibem marcadores específicos em cards, detalhe do anúncio e filtros mobile.

## Objetivo

Manter um mesmo contrato visual e funcional para tags contextuais de cada módulo, evitando soluções isoladas.

## Regras visuais

- Cards usam marcadores compactos com emoji, texto curto, espaçamento reduzido e destaque sutil.
- Os marcadores aparecem antes da descrição do card.
- O detalhe do anúncio reaproveita os mesmos marcadores em uma faixa harmônica dentro de `kc-product-description`.
- Marcadores customizados usam emoji neutro `🏷️`.
- Tags gerais do anúncio continuam podendo aparecer no detalhe, mas os marcadores específicos do módulo vêm primeiro.

## Regras de nomenclatura

- Em Moradia, usar `Características do Ambiente`.
- Evitar o termo `Marcadores` na interface final quando o conteúdo for de atributos do imóvel/ambiente.

## Regras de dados

- O renderer central deve derivar os marcadores pelo `KCUtils`, não por lógica duplicada em cada controller.
- Cada módulo pode expor seus próprios marcadores via helper central.
- Cards e detalhe devem consumir o mesmo conjunto de marcadores derivados.

## Estado atual

- `Moradia`
  - Marcadores: características do ambiente.
  - Cards: até 3 características com emoji.
  - Detalhe: características e tags gerais com estilo alinhado.
  - Create modal: sugestões com emoji e customização com `🏷️`.
  - Sidebar mobile: checklist compacto em 2 colunas.

- `Oportunidades`
  - Marcador: área da oportunidade.
  - Cards: área exibida como tag compacta com emoji.
  - Detalhe: área reaproveitada na descrição do anúncio.

## Próximos módulos

Ao adicionar um novo módulo com marcadores próprios:

1. Definir o marcador e seu emoji no `KCUtils`.
2. Expor o marcador pelo helper central de display.
3. Reaproveitar o mesmo renderer em card e detalhe.
4. Se houver create modal, manter pills com emoji e fallback `🏷️` para itens customizados.
5. Se houver sidebar mobile com checklist, manter versão compacta e legível em 2 colunas quando fizer sentido.
