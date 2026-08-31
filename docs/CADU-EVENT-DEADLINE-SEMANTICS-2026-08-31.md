# Datas de evento e prazo de inscrição

A QA pública de Fabriny, PROSA e Café com Ciência em 31/08/2026 mostrou a
data inicial do evento repetida sob o rótulo Prazo. O mapper de publicação
gravava incondicionalmente `deadline_date = data_evento`, mesmo quando não
havia inscrição. Também substituía um prazo de inscrição explícito pela data
do evento.

Correção: eventos mantêm início/término nos campos próprios; `deadline_date`
recebe somente `applicationDeadline` semântico normalizado. Sem esse papel,
fica vazio. A expiração continua no fim do evento, em America/Sao_Paulo;
encerramento de inscrições não encerra o evento. Oportunidades não mudam.

Três grupos de regressão falharam antes da mudança: evento sem inscrição,
prazo distinto ou coincidente com início e aliases/valores legados. Os testes
conferem também início, término e expiração. Não há migração de posts antigos
nem inferência retroativa de prazo; os três posts usados na QA permanecem
evidência da apresentação legada, não prova de uma edição que não ocorreu.
