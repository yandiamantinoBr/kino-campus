# Agenda: fim exclusivo de eventos sem horário

## Evidência e causa

Na QA pública do post PPGLL `7538492f-aabb-4737-b25d-518669f15986`, a descrição informa evento de 13 a 16/10/2026. O DOM de produção gerava Google `dates=20261013/20261016` e ICS `DTSTART:20261013` / `DTEND:20261016`.

O código já pretendia adicionar um dia, mas misturava `new Date('YYYY-MM-DD')` (UTC) com `setDate/getDate/getFullYear` locais. Em America/Sao_Paulo, a data vira a véspera antes da soma, anulando o acréscimo. Em UTC esse erro ficava escondido. Eventos de um dia também podiam resultar em início e fim iguais.

Fontes primárias consultadas em 31/08/2026:

- [RFC 5545 §3.6.1](https://datatracker.ietf.org/doc/html/rfc5545#section-3.6.1): DTSTART é inclusivo, DTEND exclusivo; eventos de dia inteiro usam `VALUE=DATE`. O exemplo de festival inclusivo 28/06–08/07 exporta DTEND em 09/07.
- [Google Calendar — Events](https://developers.google.com/workspace/calendar/api/v3/reference/events): `end` é exclusivo, com `end.date` para eventos sem horário.
- [Google Apps Script — Calendar.createAllDayEvent](https://developers.google.com/apps-script/reference/calendar/calendar#createAllDayEvent(String,Date,Date)): o fim de eventos de dia inteiro é exclusivo.

## Mudança delimitada

- Mantém a escolha existente de exportação: intervalos multi-dia já tratados como all-day continuam assim; eventos de um dia com horário preservam integralmente o ramo e a duração legados.
- Valida datas civis ISO reais no ramo all-day, rejeitando datas impossíveis, fim anterior ao início, formato não canônico e estouro do ano de quatro dígitos.
- Adiciona um dia ao fim inclusivo apenas com operações UTC, sem converter a data civil para o fuso da máquina.
- Google, Outlook e ICS recebem o mesmo fim exclusivo; ICS all-day explicita `DTSTART;VALUE=DATE` e `DTEND;VALUE=DATE`.
- Não modifica post, descrição, CTA, publicação, regras de expiração, autorizações ou dados de produção.
- Não altera o cálculo de eventos com horário, inclusive seu fallback legado de uma hora. Reformas de fuso/horário/VEVENT além desse contrato não fazem parte deste patch.

## Regressões executáveis

`product.calendar-civil-dates.test.js` executa o renderer real em JSDOM, em subprocessos Node com UTC, America/Sao_Paulo, America/New_York e Pacific/Kiritimati. O fixture cobre o post PPGLL, um dia, fim igual, alias legado, viradas de mês/ano, fevereiro bissexto, transição DST, evento BC às 20h, datas inválidas, módulo não evento e evento encerrado. Também verifica que o post e o CTA permanecem inalterados.

Baseline antes da correção: 84 falhas e 12 sucessos em 96 casos. A regressão específica São Paulo/PPGLL reproduziu `20261013/20261016` no lugar de `20261013/20261017`. Após a correção: 96/96 casos civis e 119/119 incluindo os contratos existentes de agenda/popovers.
