# Cadu: custo desconhecido não significa gratuidade

## Evidência

A leitura pública e a consulta do post `101372a7-075e-4bf6-ab0a-4f7e1aa4b7c3`
em 30/08/2026 mostraram `status=published`, `price=0` e
`metadata.gratuito=true`, embora a descrição informasse taxa de inscrição de
R$ 100,00. A fonte Instituto Verbena/UFG, artigo 203903, confirma a taxa e
separadamente a remuneração de R$ 5.521,88.

O mapper da Edge Function usava `true` quando `item.gratuito` não era enviado,
tanto para oportunidades quanto para eventos. O runner e publisher OpenClaw
também atribuíam `true` a todos os eventos; esse produtor exige correção no
repositório correspondente. Não basta ajustar a descrição.

## Contrato corrigido

- Campo ausente: não criar `metadata.gratuito` nem valor zero artificial.
- Booleano explícito: preservar `true` ou `false`; `false` sem valor não inventa
  uma taxa. O preço informado continua sendo preservado.
- Tipos inválidos, incluindo strings e `null`: rejeitar na validação e no
  mapper, sem coerção por truthiness.
- Remuneração estruturada continua no seu campo e no contrato existente de
  preço das oportunidades; não prova ausência ou presença de taxa de inscrição.
- Não inferir custo de palavras soltas, salário, isenção ou negação no texto.
  Não alterar posts existentes em lote, layout, mídia, fonte ou moderação.

O teste focal reproduziu sete falhas antes da mudança. Depois da correção,
os 14 novos testes e os 31 testes existentes do mapper passaram. A validação
completa das Edge Functions também passou com 100 testes.

## Operação

A correção exige implantação da Edge Function e do produtor OpenClaw antes de
considerar corrigido o caminho completo. Editar um post já existente deve usar
`caduEditPost`, com comparação prévia e verificação posterior, nunca PATCH
editorial direto no REST nem substituição integral de metadata.
