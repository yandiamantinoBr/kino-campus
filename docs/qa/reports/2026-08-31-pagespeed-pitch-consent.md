# Performance — telemetria da apresentação institucional (2026-08-31)

## Achado e correção limitada

A varredura pública das 25 páginas encontrou uma tag direta para
`/_vercel/insights/script.js` na apresentação institucional. Ela iniciava a
requisição antes de uma escolha de consentimento; o comportamento era anterior
aos lotes de performance. O teste novo reproduziu a falha antes da correção.

Somente o HTML desse host muda: remove a tag direta do head e usa o boot
compartilhado `kc-speed-insights.js` imediatamente depois de `kc-consent.js`.
Nenhum script compartilhado, estilo, URL de iframe, link, permissão, regra de
revogação ou configuração Vercel é alterado. Posicionar depois do consentimento
também mantém o aceite salvo funcionando quando os scripts defer executam com
document.readyState interactive.

Sem consentimento, recusa ou armazenamento inválido: nenhuma conexão de
telemetria. Após aceite de analytics: Web Analytics e Speed Insights carregam
uma vez, conforme o padrão já usado na plataforma. Speed Insights passa a medir
também esse host **somente após autorização**, usando a infraestrutura existente;
não se adiciona SDK, plano ou novos campos de dados na implementação alterada.
Nenhuma telemetria real foi enviada durante os testes de aceitar/rejeitar.

## Verificação

- Duas regressões de integração protegem ausência de tag direta, ordem do boot,
  recursos de acessibilidade, iframe e controles do host.
- Cinco E2E verificam primeira visita, rejeição, aceite, aceite salvo, recusa
  salva e armazenamento inválido; mantêm dimensões, URL/read/hash do frame,
  links de nova aba e controle dentro de um iframe de teste determinístico.
- Falhas e requisições externas são controladas por fixtures; isso verifica o
  host, não o conteúdo completo nem controles privados da aplicação incorporada.
- JavaScript/CSS existentes não foram reescritos. Validadores de versão, cadeia
  de scripts e rotas passaram; validações finais e integração constarão na PR.
- Revisão independente: 48 testes em sete suítes e os cinco cenários completos
  em Chrome e Edge nativos (10/10) passaram, sem P1/P2 pendentes.

Esta correção não muda o código da home medido no terceiro lote. Resultados,
variações do PageSpeed e limites de evidência estão no relatório de CSS/avatares
da mesma data. Screenshots e logs de execução ficam locais/ignorados.
