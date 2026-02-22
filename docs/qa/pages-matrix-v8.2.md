# Matriz de QA por página — V8.2.0.6 (Kino Campus)

## Objetivo
Esta matriz detalha testes manuais **página a página e botão a botão** para validar interface, navegação, permissões e ações críticas do Kino Campus.

> Use a matriz para varrer UI por página; use o E2E para validar fluxos fim-a-fim completos.

- Checklist E2E de referência: `docs/qa/e2e-checklist.md`
- Referências cruzadas nesta matriz usam o padrão **E2E #N** (ex.: **E2E #4** = criar post).

## Como usar (LOCAL x SUPABASE)
- **LOCAL**: valida comportamento estático/UI/navegação (sem depender de backend funcional).
- **SUPABASE**: valida autenticação, leitura/escrita, upload, comentários, denúncias, moderação e RLS.

## Como registrar evidências
Para cada item, anexar:
1. Print da tela final do teste.
2. URL final exibida no navegador.
3. Print do Console sem erro (ou com erro, quando falhar).
4. Horário aproximado da execução.

## Convenção de status
- **PASSOU**: comportamento bate com o esperado.
- **FALHOU**: resultado divergente do esperado.
- **BLOQUEADO**: não foi possível validar (ex.: ambiente indisponível, conta sem acesso).

## Pré-requisitos
- 1 conta usuário comum.
- 1 conta admin.
- Projeto Supabase acessível (Auth + Database + Storage + políticas RLS).
- URL de preview e/ou produção disponível.
- Navegador Chrome ou Edge atualizado.

---

## Seção 1 — LOCAL (driver local / site estático)

### `index.html` — Feed inicial, navegação e atalhos

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| IDX-01 | index.html | Header/nav | Abrir Home | Não logado | 1) Abrir `index.html`. 2) Conferir topo da página. | Logo, menu principal e área de busca visíveis sem quebrar layout. | Print da dobra inicial + URL `index.html` + console. | PASSOU/FALHOU/BLOQUEADO |
| IDX-02 | index.html | Busca | Pesquisar termo | Não logado | 1) Digitar termo no campo de busca. 2) Acionar botão/Enter. | Navega para `search-results.html` com parâmetro de consulta. (Relacionado ao fluxo de descoberta) | Print antes/depois + URL final + console. | PASSOU/FALHOU/BLOQUEADO |
| IDX-03 | index.html | Card de post | Abrir detalhe | Não logado | 1) Clicar em um card de post. | Abre `product.html` (ou página de detalhe equivalente) sem erro visual. **Ref. E2E #5**. | Print card clicado + URL detalhe + console. | PASSOU/FALHOU/BLOQUEADO |
| IDX-04 | index.html | CTA criar | Ir para criar post | Não logado | 1) Clicar em “Criar post”/CTA equivalente. | Redireciona para `create-post.html` (ou exibe requisito de login de forma clara). **Ref. E2E #4**. | Print CTA + URL final + console. | PASSOU/FALHOU/BLOQUEADO |

### `create-post.html` — Formulário de criação

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| CRP-01 | create-post.html | Formulário | Carregar página | Não logado | 1) Abrir página. | Campos essenciais (título/texto/categoria/imagem) aparecem corretamente. | Print formulário completo + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CRP-02 | create-post.html | Botão publicar | Tentar enviar vazio | Não logado | 1) Deixar campos obrigatórios vazios. 2) Clicar publicar. | Validação impede envio e mostra mensagem clara em linguagem simples. | Print mensagem de validação + console. | PASSOU/FALHOU/BLOQUEADO |
| CRP-03 | create-post.html | Navegação de retorno | Voltar ao feed | Não logado | 1) Clicar “Voltar/Cancelar” (se existir). | Retorna para feed/rota prevista sem quebrar navegação. | Print botão + URL destino. | PASSOU/FALHOU/BLOQUEADO |

### `product.html` — Detalhe do post

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| PRD-01 | product.html | Conteúdo do post | Abrir detalhe direto | Não logado | 1) Abrir `product.html` com ID válido. | Título, conteúdo e metadados básicos renderizam sem erro. **Ref. E2E #5**. | Print conteúdo + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| PRD-02 | product.html | Votos | Clicar hot/cold | Não logado | 1) Clicar botões de voto, quando visíveis. | UI responde (feedback visual) sem travar tela. **Ref. E2E #7**. | Print antes/depois + console. | PASSOU/FALHOU/BLOQUEADO |
| PRD-03 | product.html | Comentários | Focar campo comentário | Não logado | 1) Clicar no campo de comentário. | Campo acessível e mensagens de bloqueio/login (se houver) são claras. **Ref. E2E #6**. | Print área comentário + console. | PASSOU/FALHOU/BLOQUEADO |
| PRD-04 | product.html | Denúncia | Abrir ação denunciar | Não logado | 1) Clicar “Denunciar”. | Modal/fluxo abre ou solicita login de forma explícita. **Ref. E2E #8**. | Print botão/fluxo + URL + console. | PASSOU/FALHOU/BLOQUEADO |

### `search-results.html` — Resultado de busca

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SRC-01 | search-results.html | Lista de resultados | Abrir com query | Não logado | 1) Acessar com termo de busca. | Página mostra estado “resultados” ou “nenhum resultado” sem erro técnico. | Print lista/estado vazio + URL com query + console. | PASSOU/FALHOU/BLOQUEADO |
| SRC-02 | search-results.html | Card de resultado | Abrir detalhe | Não logado | 1) Clicar item retornado. | Abre detalhe correspondente do post. **Ref. E2E #5**. | Print clique + URL destino + console. | PASSOU/FALHOU/BLOQUEADO |

### `profile.html` — Perfil do usuário

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| PRF-01 | profile.html | Cabeçalho do perfil | Abrir página | Não logado | 1) Abrir `profile.html`. | Página carrega sem quebrar; se exigir login, mensagem orienta próximo passo. | Print topo perfil + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| PRF-02 | profile.html | Ações de sessão | Ver botões de login/logout | Não logado | 1) Inspecionar ações visíveis. | Botões de sessão são consistentes com estado não autenticado. | Print ações visíveis + console. | PASSOU/FALHOU/BLOQUEADO |

### `auth-callback.html` — Retorno de autenticação

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| ACB-01 | auth-callback.html | Tela de callback | Abrir rota callback | Não logado | 1) Abrir `auth-callback.html` com hash/query simulada. | Página processa retorno sem tela branca ou erro fatal. **Ref. E2E #2**. | Print callback + URL completa + console. | PASSOU/FALHOU/BLOQUEADO |
| ACB-02 | auth-callback.html | Redirecionamento pós-callback | Aguardar navegação | Não logado | 1) Após abrir callback, aguardar redirecionamento. | Usuário é direcionado para página esperada (home/perfil). **Ref. E2E #2/#3**. | Print destino final + URL + console. | PASSOU/FALHOU/BLOQUEADO |

### `moradia.html`, `eventos.html`, `oportunidades.html`, `achados-perdidos.html`, `compra-venda-feed.html`, `caronas-feed.html` — Feeds por categoria

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| CAT-01 | moradia.html | Lista feed | Abrir página | Não logado | 1) Abrir `moradia.html`. | Cards/lista e filtros visíveis; layout íntegro. | Print lista + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CAT-02 | eventos.html | Lista feed | Abrir página | Não logado | 1) Abrir `eventos.html`. | Componentes principais renderizam corretamente. | Print lista + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CAT-03 | oportunidades.html | Lista feed | Abrir página | Não logado | 1) Abrir `oportunidades.html`. | Cards e ações de navegação funcionam sem erro visual. | Print lista + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CAT-04 | achados-perdidos.html | Lista feed | Abrir página | Não logado | 1) Abrir `achados-perdidos.html`. | Página carrega conteúdo esperado da categoria. | Print lista + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CAT-05 | compra-venda-feed.html | Lista feed | Abrir página | Não logado | 1) Abrir `compra-venda-feed.html`. | Feed aparece e links para detalhe estão clicáveis. | Print feed + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CAT-06 | caronas-feed.html | Lista feed | Abrir página | Não logado | 1) Abrir `caronas-feed.html`. | Feed aparece e links para detalhe estão clicáveis. | Print feed + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| CAT-07 | (todas acima) | Card de item | Abrir detalhe do item | Não logado | 1) Clicar em um card de cada página de categoria. | Navega para detalhe correto sem quebrar rota. **Ref. E2E #5**. | Print card + URL final por categoria + console. | PASSOU/FALHOU/BLOQUEADO |

### `compra-venda.html` e `caronas.html` — Páginas de redirect

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| RED-01 | compra-venda.html | Redirect automático | Abrir página | Não logado | 1) Abrir `compra-venda.html`. | Redireciona para `compra-venda-feed.html` (ou rota definida) sem loop. | Print URL inicial e final + console. | PASSOU/FALHOU/BLOQUEADO |
| RED-02 | caronas.html | Redirect automático | Abrir página | Não logado | 1) Abrir `caronas.html`. | Redireciona para `caronas-feed.html` (ou rota definida) sem loop. | Print URL inicial e final + console. | PASSOU/FALHOU/BLOQUEADO |

### `admin/reports.html` — Área de moderação (visão local de UI)

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| ADM-01 | admin/reports.html | Tela admin | Abrir rota admin | Não logado | 1) Abrir `admin/reports.html`. | A página não quebra; se não autorizado, mostra bloqueio/mensagem adequada. **Ref. E2E #9**. | Print tela + URL + console. | PASSOU/FALHOU/BLOQUEADO |

---

## Seção 2 — SUPABASE (auth + storage + RLS)

### `index.html` e navegação inicial com sessão

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBX-01 | index.html | Auth (cadastro) | Criar conta | Não logado | 1) Abrir home. 2) Ir para cadastro. 3) Criar conta com e-mail institucional. | Cadastro concluído (ou instrução de confirmação de e-mail). **Ref. E2E #1**. | Print confirmação + URL + console + horário. | PASSOU/FALHOU/BLOQUEADO |
| SBX-02 | auth-callback.html | Callback | Confirmar e-mail | Link de confirmação recebido | 1) Clicar no link do e-mail. | Callback processado e sessão pronta para login/uso. **Ref. E2E #2**. | Print callback + URL completa + console. | PASSOU/FALHOU/BLOQUEADO |
| SBX-03 | index.html/profile.html | Sessão | Fazer login | Conta confirmada | 1) Entrar com credenciais válidas. | Estado logado visível no app. **Ref. E2E #3**. | Print pós-login + URL + console. | PASSOU/FALHOU/BLOQUEADO |

### `create-post.html` — criação com persistência

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBP-01 | create-post.html | Formulário | Criar post só texto | Logado (usuário comum) | 1) Preencher título/texto. 2) Publicar. | Post salvo e aparece em feed. **Ref. E2E #4**. | Print formulário + print feed com post + console. | PASSOU/FALHOU/BLOQUEADO |
| SBP-02 | create-post.html | Upload imagem | Criar post com imagem | Logado (usuário comum) | 1) Selecionar imagem válida. 2) Publicar. | Upload concluído e imagem visível no feed/detalhe. **Ref. E2E #4**. | Print seleção + print resultado + console. | PASSOU/FALHOU/BLOQUEADO |
| SBP-03 | create-post.html | Permissão | Tentar criar sem login | Não logado | 1) Abrir criar post. 2) Enviar formulário. | Operação bloqueada com mensagem amigável de autenticação. | Print erro amigável + console + URL. | PASSOU/FALHOU/BLOQUEADO |

### `product.html` — interação social e moderação do usuário

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBD-01 | product.html | Detalhe | Abrir post recém-criado | Logado | 1) Abrir o post criado no teste anterior. | Dados do post batem com o que foi publicado. **Ref. E2E #5**. | Print detalhe + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBD-02 | product.html | Comentário | Publicar comentário | Logado | 1) Digitar comentário único. 2) Enviar. | Comentário aparece na lista e persiste no refresh. **Ref. E2E #6**. | Print antes/depois + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBD-03 | product.html | Voto hot/cold | Alternar voto | Logado | 1) Clicar hot. 2) Clicar cold (se aplicável). | Estado/contador atualiza de forma consistente. **Ref. E2E #7**. | Print antes/depois + console + horário. | PASSOU/FALHOU/BLOQUEADO |
| SBD-04 | product.html | Denúncia | Enviar denúncia | Logado | 1) Clicar denunciar. 2) Informar motivo. 3) Confirmar. | Denúncia criada com confirmação visual, sem expor dados de terceiros. **Ref. E2E #8**. | Print confirmação + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBD-05 | product.html | Regra antiabuso | Repetir denúncia do mesmo post | Logado | 1) Tentar denunciar novamente o mesmo post. | Sistema bloqueia duplicidade com mensagem clara. (Complementa E2E #8) | Print erro amigável + console + horário. | PASSOU/FALHOU/BLOQUEADO |

### `search-results.html` e feeds de categoria com dados reais

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBF-01 | search-results.html | Busca com backend | Buscar post criado | Logado | 1) Pesquisar termo único do post de teste. | Resultado inclui o post recém-criado. | Print resultado + URL com query + console. | PASSOU/FALHOU/BLOQUEADO |
| SBF-02 | moradia/eventos/oportunidades/achados-perdidos | Filtro por categoria | Ver post em categoria correta | Logado | 1) Abrir feed da categoria usada no post. | Post aparece somente na categoria esperada. | Print feed categoria + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBF-03 | compra-venda-feed/caronas-feed | Card + detalhe | Abrir detalhe a partir do feed | Logado | 1) Abrir feed. 2) Clicar card. | Navegação e leitura do detalhe funcionam sem erro de permissão. **Ref. E2E #5**. | Print feed e detalhe + URLs + console. | PASSOU/FALHOU/BLOQUEADO |

### `profile.html` — dados do usuário autenticado

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBP-04 | profile.html | Identidade/sessão | Abrir perfil logado | Logado | 1) Abrir perfil após login. | Nome/e-mail/estado da sessão aparecem corretamente (sem vazar dados sensíveis). | Print perfil + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBP-05 | profile.html | Logout | Encerrar sessão | Logado | 1) Clicar logout. 2) Reabrir perfil/home. | Sessão encerrada; UI volta para estado não autenticado. | Print antes/depois + URL + console. | PASSOU/FALHOU/BLOQUEADO |

### `admin/reports.html` — moderação com privilégios admin

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBA-01 | admin/reports.html | Controle de acesso | Abrir admin com usuário comum | Logado (usuário comum) | 1) Fazer login comum. 2) Tentar abrir admin. | Acesso negado de forma segura e amigável. **Ref. E2E #9**. | Print bloqueio + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBA-02 | admin/reports.html | Lista de denúncias | Abrir admin com conta admin | Logado (admin) | 1) Fazer login admin. 2) Abrir admin reports. | Denúncias abertas são listadas com dados necessários para ação. **Ref. E2E #9**. | Print lista + URL + console. | PASSOU/FALHOU/BLOQUEADO |
| SBA-03 | admin/reports.html | Moderação | Fechar/moderar denúncia | Logado (admin) | 1) Selecionar denúncia aberta. 2) Executar ação de fechar/moderar. | Status muda (aberta→fechada) e persiste após atualizar. **Ref. E2E #9**. | Print antes/depois + URL + console + horário. | PASSOU/FALHOU/BLOQUEADO |
| SBA-04 | admin/reports.html | Persistência | Recarregar página | Logado (admin) | 1) Atualizar página após moderação. | Último status permanece salvo no backend. **Ref. E2E #9**. | Print pós-refresh + console. | PASSOU/FALHOU/BLOQUEADO |

### Redirects com ambiente real

| ID | Página | Componente | Ação/Botão | Pré-condição | Passos | Resultado esperado | Evidência | Status |
|---|---|---|---|---|---|---|---|---|
| SBR-01 | compra-venda.html | Redirect | Abrir rota antiga | Logado ou não logado | 1) Abrir `compra-venda.html`. | Redirecionamento mantém usabilidade no ambiente real. | Print URL origem/destino + console. | PASSOU/FALHOU/BLOQUEADO |
| SBR-02 | caronas.html | Redirect | Abrir rota antiga | Logado ou não logado | 1) Abrir `caronas.html`. | Redirecionamento mantém usabilidade no ambiente real. | Print URL origem/destino + console. | PASSOU/FALHOU/BLOQUEADO |

---

## Tabela-resumo para execução da rodada

| Data | Ambiente | Escopo executado | Total PASSOU | Total FALHOU | Total BLOQUEADO | Link da pasta de evidências |
|---|---|---|---:|---:|---:|---|
| AAAA-MM-DD | Local / Preview / Produção | LOCAL / SUPABASE / Ambos | 0 | 0 | 0 | Inserir link |

## Observação de manutenção
Sempre que surgir nova página, novo botão crítico ou mudança de fluxo de auth/moderação, adicionar linha nova na matriz com ID incremental e referência ao passo E2E correspondente (quando existir).
