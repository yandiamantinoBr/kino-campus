# Contratos pendentes de rollout

Os arquivos desta pasta não fazem parte da cadeia ativa de migrations e não
podem ser executados pelo `supabase db push`.

O contrato `help_privacy_guest_gateway_contract.template.sql` só pode ser
promovido depois que a Edge Function e o frontend Turnstile estiverem ativos,
o canário de produção tiver passado e a janela definida para assets antigos em
cache tiver terminado. A promoção deve ocorrer em um commit posterior:

1. consulte a maior versão já presente no histórico remoto;
2. escolha um timestamp novo de 14 dígitos, posterior a essa versão;
3. renomeie e mova o template para
   `supabase/migrations/<timestamp>_help_privacy_guest_gateway_contract.sql`;
4. no mesmo commit, atualize as listas de migrations obrigatórias do workflow
   e do script de deploy, e converta o contrato Jest de rollout para a fase
   final (template ausente, uma única migration ativa);
5. execute reset local, pgTAP, verificador de schema, Jest, dry-run e os canários
   documentados.

Não copie o arquivo e não reutilize a data em que o template foi criado. Essas
duas regras evitam fontes concorrentes e uma migration fora de ordem.
