# GA4 e Google Search Console — Auditoria de Medição (2026-07-14)

Este documento consolida a auditoria realizada em 14 de julho de 2026 sobre a coleta do Google Analytics 4 (GA4), a integração com o Google Search Console e a instrumentação do KinoCampus. Ele substitui o relatório de 8 de julho como referência do estado atual, mas preserva aquele documento como histórico da implantação inicial.

Nenhuma credencial, token, chave privada, endereço de conta ou identificador pessoal é registrado aqui. Os números abaixo são agregados.

## Resumo executivo

- A propriedade GA4 está ativa, recebe tráfego e responde normalmente pela Data API. O erro `499 OK` observado no relatório em tempo real está limitado à chamada interna daquela tela do Google e não representa perda geral da coleta.
- Na janela de 28 dias auditada, o GA4 registrou 2.303 visualizações de página, 583 usuários e 878 sessões. Destas visualizações, 2.294 vieram do domínio de produção e 9 de `localhost`, o que confirmou a necessidade de bloquear coleta fora de produção.
- O Search Console já está vinculado ao GA4, e a coleção de relatórios de pesquisa está publicada. Na janela de 16 de junho a 13 de julho, o relatório vinculado mostrou 1.116 impressões, 13 cliques, CTR de 1,16%, posição média de 7,31 e 92 consultas.
- O sitemap foi enviado e processado com sucesso, com 100 páginas descobertas. A cobertura mostrava 75 páginas indexadas e 78 não indexadas, incluindo exclusões intencionais e alguns itens que exigem recrawl ou análise.
- Configurações da propriedade foram ajustadas para evitar duplicidade e excesso de dados: retenção de eventos em 14 meses, desativação de pageviews por histórico do navegador, busca interna automática e interações automáticas de formulário, além de redação de parâmetros de URL.
- A instrumentação em preparação no repositório restringe o GA4 às páginas públicas de produção, envia pageview manual sanitizado, usa User-ID pseudônimo somente após consentimento e elimina parâmetros que poderiam expor texto de busca, conversa ou identidade.

## 1. Diagnóstico do erro em tempo real

A interface do GA4 exibiu a seguinte falha na consulta de tempo real:

```text
Http failure response for .../realtime/.../getData: 499 OK
```

O código 499 foi retornado por uma chamada interna da interface do Google enquanto o relatório em tempo real estava sem usuários ativos. Em paralelo, foram confirmados:

- recebimento de tráfego pelo fluxo da Web nas 48 horas anteriores;
- carregamento normal dos relatórios históricos;
- consultas bem-sucedidas pela GA4 Data API;
- presença consistente de pageviews, sessões, usuários e eventos.

Portanto, a evidência disponível aponta para cancelamento, timeout ou comportamento transitório do backend da tela de tempo real, e não para tag inválida ou interrupção global de dados. A validação pós-deploy deve usar DebugView/tempo real com uma sessão consentida em produção e, se a tela voltar a exibir 499, comparar novamente com a Data API antes de tratar o problema como falha de instrumentação.

## 2. Retrato agregado do GA4

### Volume dos últimos 28 dias

| Métrica | Resultado |
| --- | ---: |
| Visualizações de página | 2.303 |
| Usuários | 583 |
| Sessões | 878 |
| Visualizações no domínio de produção | 2.294 |
| Visualizações em `localhost` | 9 |

### Eventos de produto observados

| Evento/ação | Ocorrências |
| --- | ---: |
| Visualização de publicação | 266 |
| Interação com cupom | 103 |
| Clique de contato | 43 |
| Cadastro | 23 |
| Busca interna | 12 |
| Login | 8 |
| Compartilhamento | 3 |
| Abertura da caixa de conversas | 1 |

Também apareceram eventos automáticos de baixa especificidade, como 465 `form_start`, 452 `scroll`, 224 `click` e 24 `view_search_results`. Esse ruído justificou desligar a captura automática de formulários e busca interna e manter eventos próprios, controlados e semanticamente vinculados às jornadas do KinoCampus.

A aquisição estava fortemente concentrada em tráfego direto: 819 sessões atribuídas a direto, 26 ao Google orgânico e 3 ao Bing. Havia ainda origens de teste. Esses dados devem ser lidos com cautela até a exclusão completa de ambientes não produtivos e a acumulação de uma nova janela limpa.

O User-ID não estava preenchido nos dados auditados. A nova estratégia usa somente um valor pseudônimo calculado no servidor por HMAC-SHA-256 com segredo exclusivo, após login e consentimento de analytics; nunca envia o identificador bruto da conta e remove o vínculo quando a condição deixa de existir.

## 3. Configurações aplicadas no GA4

As seguintes alterações foram feitas na propriedade durante a auditoria:

1. Retenção de dados de eventos alterada de 2 para 14 meses; retenção de dados de usuário mantida em 14 meses.
2. Em Medição otimizada:
   - alteração de página baseada no histórico do navegador desativada;
   - busca no site automática desativada;
   - interações automáticas de formulário desativadas;
   - rolagem, cliques externos, vídeos e downloads mantidos;
   - pageview permanece disponível, mas o código passa a controlar o envio manual com `send_page_view: false`, evitando duplicidade.
3. Redação de e-mail mantida e redação de parâmetros de URL ativada para 27 chaves potencialmente sensíveis, incluindo termos de busca, contatos, tokens, códigos de autenticação e identificadores de conversa.
4. `kc_contact_click`, `kc_sign_up` e `kc_share` marcados como eventos principais. O evento padrão `purchase` foi mantido, embora não exista fluxo de compra ativo.
5. Nove dimensões personalizadas de escopo de evento foram criadas: `module`, `contact_type`, `channel`, `query_length_bucket`, `needs_confirmation`, `is_new`, `search_source`, `publication_status` e `message_type`.
6. O código fixa `allow_google_signals: false` e `allow_ad_personalization_signals: false`; a configuração da propriedade também deve permanecer sem Google Signals para evitar associação publicitária. A exportação para BigQuery ainda não está vinculada e deve ser avaliada apenas quando houver necessidade operacional clara, governança e controle de custo.

Eventos recomendados pelo Google, como `login`, `sign_up`, `share` e `generate_lead`, foram incorporados à estratégia de código. A busca permanece intencionalmente em `kc_search`, com origem controlada e faixa de comprimento, porque o evento recomendado `search` exige o termo bruto que esta integração decidiu não enviar. `sign_up`, `share` e `generate_lead` já foram criados como eventos principais na propriedade.

## 4. Search Console e pesquisa orgânica

### Integração e acesso

- A propriedade de domínio do Search Console está vinculada ao GA4.
- A coleção de relatórios do Search Console está publicada no GA4.
- A Search Console API foi habilitada no projeto de nuvem usado pela integração.
- A integração usa conta técnica exclusiva do Search Console, separada da credencial de runtime do GA4, com acesso de leitura suficiente e sem registrar credenciais no repositório.
- Uma função server-side autenticada foi preparada para consultar métricas, sitemaps e inspeção de URL sem expor credenciais ao navegador.

### Desempenho observado

No relatório do Search Console vinculado ao GA4, entre 16 de junho e 13 de julho de 2026:

| Métrica | Resultado |
| --- | ---: |
| Impressões | 1.116 |
| Cliques | 13 |
| CTR | 1,16% |
| Posição média | 7,31 |
| Consultas distintas | 92 |

O card de visão geral do Search Console mostrou 56 cliques totais em sua própria janela/configuração. Esse número não deve ser comparado diretamente com os 13 cliques do relatório vinculado sem alinhar período, tipo de pesquisa, filtros, fuso e latência de processamento.

Consultas de busca podem conter texto livre e, excepcionalmente, dado pessoal digitado na própria Busca Google. Por isso, a integração é somente leitura, restrita a administradores, não registra consultas em logs, usa resposta `no-store` e cache efêmero de até cinco minutos. A inclusão em CSV acontece somente após ação explícita do administrador; o arquivo exportado deve receber os mesmos controles de acesso e descarte aplicados a outros relatórios administrativos.

### Sitemap, indexação e dados estruturados

- `https://www.kinocampus.com.br/sitemap.xml` foi enviado e processado com sucesso em 14 de julho, com 100 URLs descobertas.
- A cobertura mostrava 75 páginas indexadas e 78 não indexadas.
- Entre as exclusões estavam 25 URLs com `noindex`, 19 duplicadas sem canonical escolhido pelo usuário, 13 redirecionamentos, 7 bloqueadas por `robots.txt` e 7 alternativas com canonical. Parte relevante é esperada, mas cada grupo deve ser revisado após o próximo rastreamento.
- Três URLs antigas foram classificadas como soft 404 e quatro como rastreadas, mas não indexadas. Os exemplos observados eram antigos ou já haviam recebido correções; a decisão deve ser tomada após recrawl, não apenas pelo histórico.
- Havia uma ocorrência de dado estruturado não interpretável por “caractere Unicode truncado”. A página ao vivo respondeu com JSON-LD válido no momento da auditoria, sugerindo dado antigo ou falha transitória. É necessário solicitar nova validação e acompanhar o relatório.
- Os aprimoramentos mostravam 24 breadcrumbs válidos, 2 eventos válidos e 3 anúncios de emprego válidos.

## 5. Alterações preparadas no repositório

As mudanças abaixo estavam no worktree desta intervenção e ainda precisam passar pela validação completa e pelo fluxo de deploy:

- correção da chamada server-side à GA4 Data API e normalização das respostas consumidas pelo dashboard;
- filtros de domínio de produção e exclusão de rotas administrativas nos relatórios;
- bloqueio central da tag em `localhost`, previews e páginas `/admin`;
- pageview manual único, com URL e referenciador sanitizados e títulos genéricos nas páginas que podem conter conteúdo de usuário;
- User-ID pseudônimo por HMAC-SHA-256 com segredo exclusivo no servidor somente para usuário autenticado com consentimento de analytics, com remoção quando a sessão, a conta ou o consentimento muda;
- endurecimento de `KCEvents`, com fila privada e lista controlada de eventos/parâmetros;
- remoção de texto bruto de busca e de identificadores de conversa/usuário dos eventos;
- uso de eventos recomendados do GA4 em paralelo aos eventos legados necessários para continuidade histórica;
- centralização do evento de criação de publicação, sem disparo duplicado;
- instrumentação agregada de envio de mensagem sem conteúdo ou identificadores dos participantes;
- headers e metadados `noindex` para rotas administrativas, além de correções no `robots.txt`;
- nova Edge Function autenticada e somente leitura para Search Console, com CORS, validação, cache, limites e mensagens de erro seguras.

Nenhuma dessas mudanças deve ser considerada em produção até o deploy ser concluído e verificado.

## 6. Privacidade e minimização

A coleta do GA4 é opcional e depende de consentimento. O desenho atualizado aplica as seguintes garantias:

- nenhuma coleta do GA4 em páginas administrativas, ambiente local ou URLs de preview;
- nenhuma query arbitrária/sensível ou fragmento enviado em URL ou referenciador de pageview; somente ID validado de publicação pública pode permanecer;
- nenhum texto bruto de busca, conteúdo de mensagem, e-mail, telefone, token ou identificador de conversa nos eventos;
- User-ID enviado apenas como pseudônimo HMAC calculado no servidor e nunca como identificador interno bruto;
- títulos genéricos em contextos que podem conter conteúdo pessoal ou criado pelo usuário;
- credenciais das APIs mantidas exclusivamente no servidor e fora do repositório;
- eventos opcionais bloqueados quando não há consentimento de analytics.

HMAC é pseudonimização, não anonimização. Por isso, o User-ID pseudônimo continua sujeito aos controles de finalidade, acesso, retenção e revogação descritos na política de privacidade. A rotação do segredo interrompe deliberadamente a continuidade dos pseudônimos.

## 7. Plano de validação

### Antes do deploy

1. Executar testes unitários, de integração, contrato, SEO e privacidade.
2. Executar verificação sintática dos JavaScripts modificados e checagem/lint/testes das Edge Functions.
3. Confirmar que nenhuma chave, token, e-mail de conta técnica ou dado pessoal entrou no diff.
4. Confirmar que cada evento é disparado uma única vez e somente depois do sucesso real da jornada.
5. Validar que páginas públicas continuam funcionando com analytics aceito, recusado e ainda não escolhido.

### Depois do deploy

1. Em produção, aceitar analytics em uma sessão de teste e validar um pageview e as jornadas de login, cadastro, busca, visualização, contato, compartilhamento, criação e mensagem.
2. Repetir os mesmos acessos sem consentimento e confirmar ausência de coleta opcional.
3. Abrir páginas em `localhost`, preview e `/admin` e confirmar que a tag não é carregada nem envia eventos.
4. Comparar DebugView/tempo real, relatório histórico e Data API. Um novo `499` isolado na interface não deve invalidar dados confirmados pelas outras duas fontes.
5. Verificar a disponibilidade das nove dimensões personalizadas e marcar eventos recomendados como principais quando começarem a receber dados.
6. Validar o endpoint autenticado do Search Console com um administrador e confirmar que um usuário comum recebe bloqueio.
7. Acompanhar por pelo menos 28 dias uma janela limpa, sem tráfego local/admin/preview, antes de redefinir baselines ou alertas.
8. No Search Console, acompanhar o sitemap, solicitar validação do erro de Unicode e revisar soft 404/crawled-not-indexed após recrawl.

## 8. Próximas decisões recomendadas

- Avaliar uma dimensão/filtro de tráfego interno em modo de teste antes de ativá-lo permanentemente.
- Definir metas operacionais para tráfego orgânico, CTR, criação de publicações, contato e compartilhamento após a nova janela limpa.
- Considerar BigQuery somente se os relatórios agregados deixarem de atender às perguntas do produto.
- Revisar trimestralmente eventos, dimensões e retenção para evitar coleta sem uso real.
- Documentar qualquer nova categoria de dado antes de adicioná-la à instrumentação.
