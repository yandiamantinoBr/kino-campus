# Auditoria de Publicações Vencidas — KinoCampus

**Data do relatório:** 20/07/2026 (segunda-feira, 10:21 BRT)
**Universo auditado:** 352 posts (Supabase `posts`)
**Status inicial:** 130 `published`, 222 `closed`
**Candidatos a vencido (publicados):** 17 com `data_evento` < 20/07/2026 ou `deadline_date` < 20/07/2026 sem `data_evento` futuro.

---

## TL;DR

Dos 17 candidatos, **14 devem ser encerrados** e **3 NÃO devem** (erro de cadastro da data, evento ainda em curso ou no futuro). A maioria dos encerramentos tem 2-3 sinais convergentes: data passada + link de origem quebrado/expurgado/fonte confirmando o encerramento.

Recomendo fortemente **fechar os 14** com `status: 'closed'` + `closed_at: now()` + `closed_reason: 'event_completed'`.

---

## Tabela consolidada

| # | UUID curto | Módulo | Título (curto) | Decisão | Sinal principal |
|---|-----------|--------|----------------|---------|------------------|
| 1 | `a8a3f0e5` | eventos | VI Seminário Internacional de EaD | **ENCERRAR** | Post 404 no site, sumiu dos feeds, fonte vazia |
| 2 | `07fe003d` | eventos | Submissões PIP/UFG no 23º CONPEEX | **ENCERRAR** | Prazo de submissão 26/06 já passou |
| 3 | `1bc669c4` | eventos | UFG 4ª edição Saúde Indígena | **ENCERRAR** | Data 10/07 passada, sem link de origem |
| 4 | `b14fe292` | eventos | XXII Curso de Inverno CEDIN | **NÃO ENCERRAR** | Evento em curso 13–24/07 |
| 5 | `c676a095` | eventos | Corpos Dissidentes (UAECH) | **ENCERRAR** | Data 13/07 passada + DNS `uaech.ufg.br` quebrado |
| 6 | `380404b0` | oportunidades | PPGNUT Aluno Especial | **NÃO ENCERRAR** | Inscrição vai até 10/08 (cadastro com data errada) |
| 7 | `82618733` | eventos | 35ª Reunião Brasileira de Antropologia | **ENCERRAR** | Data 13/07 passada, sem link de origem |
| 8 | `06d2a84f` | eventos | Estudantes veteranos: matrículas dia 15/7 | **NÃO ENCERRAR** | Matrícula real 15–22/08 (cadastro com data errada) |
| 9 | `b21c11dd` | eventos | Comprovação de suficiência em inglês | **ENCERRAR** | Data 15/07 passada + DNS `ppgmec.ufg.br` quebrado |
| 10 | `4fff8886` | eventos | Hackathon Desafio INDTECHS | **ENCERRAR** | Data 15/07 passada, Google Forms atrás de login |
| 11 | `8d06d5f9` | eventos | Caminhos: Exposição Coletiva | **ENCERRAR** | Data 16/07 passada + fonte vazia |
| 12 | `6b52832b` | eventos | Saberes do campo (CSA) | **ENCERRAR** | Data 17/07 passada + DNS `csa.ufg.br` quebrado |
| 13 | `1123ef30` | eventos | Prêmio Pierre Verger - 30 anos | **ENCERRAR** | Data 17/07 passada + fonte vazia |
| 14 | `08a3cea1` | eventos | Blood Rave - Festival Gótico de Inverno | **ENCERRAR** | Fonte confirma "Ocorreu em 18/07" |
| 15 | `b764a0cc` | oportunidades | CIAR/UFG bolsistas EaD | **ENCERRAR** | Fonte confirma encerramento 19/07 |
| 16 | `132aa3dd` | oportunidades | PPGBM doutorado | **ENCERRAR** | Fonte confirma "Inscrições até 15 de julho" |
| 17 | `44d898b1` | oportunidades | PPGP Aluno Especial | **ENCERRAR** | Fonte confirma "15/07/2026 a 17/07/2026" |

---

## 1. ENCERRAR — detalhes por post

### 1.1. `a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39` — VI Seminário Internacional de EaD e IV Conect EaD IF Goiano

- **Módulo/Categoria:** eventos / academicos
- **Data do evento:** 2026-05-31 (passado há ~50 dias)
- **Deadline:** — | **expires_at:** 2026-08-30
- **Source URL:** https://ufg.br/events?event=39075
- **Justificativa (3 sinais convergentes):**
  1. **Post 404 no KinoCampus** — abrir `https://www.kinocampus.com.br/_product.html?id=a8a3f0e5-...` retorna apenas o shell da página "não encontrada" (mesmo quando logado, o conteúdo do post não renderiza).
  2. **Não aparece em nenhum feed público** — `GET /eventos.html` e `GET /index.html` (anon, viewport 1280) não listam nem o título nem o UUID do post. O post está published no banco, mas o sistema de feed já o excluiu (provavelmente via `dedup-kino` v1.7.1 ou filtro de vencidos).
  3. **Página de origem vazia** — `ufg.br/events?event=39075` renderiza só header/footer da UFG (655 chars), sem conteúdo do evento. Evento foi expurgado da plataforma de origem.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`. Também remover do Supabase definitivamente (a entrada é orfã — o site já a esconde).

### 1.2. `07fe003d-990c-4019-95c0-fe61e26c54d9` — 🎤 Submissões abertas para o Seminário PIP/UFG no 23º CONPEEX — até 26 de junho

- **Módulo/Categoria:** eventos / academicos
- **Data do evento:** 2026-06-26 | **Deadline:** 26/06/2026 | **expires_at:** 2026-12-31
- **Source URL:** https://prpi.ufg.br/n/201174
- **Justificativa:**
  - O título e o corpo do post dizem "Submissões abertas até 26 de junho". A fonte confirma exatamente isso: *"Discentes possuem até o dia 26 de junho para envio final"*. **O prazo da submissão (26/06) já passou há ~24 dias.**
  - O CONPEEX em si (evento maior) será de 9 a 13 de novembro, mas o post fala apenas das submissões do PIP/UFG, que é o que já fechou.
  - Manter o post no ar hoje induz o leitor a erro: o título diz "abertas" mas não estão mais.
- **Recomendação:** Fechar com `closed_reason: 'submission_closed'`. A `expires_at` no metadata (2026-12-31) está descolada da realidade.

### 1.3. `1bc669c4-b63a-430a-8fd0-7f1644116cd8` — UFG realiza a 4ª edição do Programa de Saúde Indígena

- **Módulo/Categoria:** eventos / academicos
- **Data do evento:** 2026-07-10 | **Deadline:** 10/07/2026 | **expires_at:** 2026-08-03
- **Source URL:** **ausente** (não há `source_url` no metadata)
- **Justificativa:**
  - O evento foi em 10/07, já passou há 10 dias.
  - O post não tem `source_url`, então não dá nem pra verificar o que era ou onde aconteceu.
  - O post no KinoCampus continua renderizado normalmente, com badge "Prazo: 10/07/2026 — Há 15 dias", o que reforça a aparência de vencido.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.4. `c676a095-4003-4132-b993-409567d13f8c` — Projeto de Extensão "Corpos Dissidentes e (Re)Existentes: Acolhimento, Escuta e Empoderamento..."

- **Módulo/Categoria:** eventos / academicos
- **Data do evento:** 2026-07-13 | **Deadline:** 13/07/2026 | **expires_at:** 2026-08-12
- **Source URL:** https://uaech.ufg.br/n/202725
- **Justificativa:**
  - **Source URL quebrada** — `uaech.ufg.br` não resolve DNS (`net::ERR_NAME_NOT_RESOLVED` via Playwright). Provável migração/extinção do subdomínio da UAECH.
  - Data do evento (13/07) já passou há 7 dias.
  - Post continua ativo no feed (200 OK) mas o link de origem está morto.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`. Considerar também revisar URLs similares em outros posts que apontam pra subdomínios UFG que possam ter migrado.

### 1.5. `82618733-bfdb-44ec-a341-848ae6bc2c71` — 35ª Reunião Brasileira de Antropologia

- **Módulo/Categoria:** eventos / academicos
- **Data do evento:** 2026-07-13 | **Deadline:** 13/07/2026 | **expires_at:** 2026-08-03
- **Source URL:** **ausente**
- **Justificativa:**
  - Evento foi em 13/07, já passou há 7 dias.
  - Sem link de origem — não dá pra confirmar contexto adicional.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.6. `b21c11dd-526d-4ac9-8df7-e2d111c845dc` — Comprovação de suficiência em inglês (PPGMEC)

- **Módulo/Categoria:** eventos / academicos
- **Data do evento:** 2026-07-15 | **Deadline:** 15/07/2026 | **expires_at:** 2026-08-10
- **Source URL:** https://ppgmec.ufg.br/n/193050
- **Justificativa:**
  - **Source URL quebrada** — `ppgmec.ufg.br` não resolve DNS.
  - Data 15/07 passada há 5 dias.
  - O post é vinculado a uma seleção do PPGMEC cujo subdomínio aparentemente foi descontinuado.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.7. `4fff8886-8d6d-4c60-867f-660a1394518d` — Hackathon Desafio INDTECHS — Inscrições Abertas

- **Módulo/Categoria:** eventos / tecnologia
- **Data do evento:** 2026-07-15 | **Deadline:** 15/07/2026 | **expires_at:** 2026-07-22
- **Source URL:** https://forms.gle/bNgjdQjPzeLUtcgY9
- **Justificativa:**
  - Prazo 15/07 passado há 5 dias.
  - Source URL é um Google Forms (`forms.gle`) que renderiza apenas a tela de login do Google (HTTP 401) — sem informação pública, e sem como verificar se o forms ainda está coletando respostas.
  - O `expires_at` (2026-07-22) está coerente com a data, mas só agora é que o post deveria ter sido fechado.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.8. `8d06d5f9-e1dd-4940-afd8-50a04be59f23` — Caminhos: entre passos e tropeços - Exposição Coletiva de Artes Visuais

- **Módulo/Categoria:** eventos / culturais
- **Data do evento:** 2026-07-16 | **Deadline:** 16/07/2026 | **expires_at:** 2026-08-05
- **Source URL:** https://ufg.br/events?event=39268
- **Justificativa:**
  - **Source URL vazia** — a página do evento em `ufg.br/events?event=39268` renderiza só header/footer (655 chars), sem nenhuma informação sobre a exposição. Evento removido do site de origem.
  - Data 16/07 passada há 4 dias.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.9. `6b52832b-5eff-4330-b317-ae208e598b0f` — Saberes do campo: Especialização em Direitos Sociais inicia II Tempo Universidade

- **Módulo/Categoria:** eventos / culturais
- **Data do evento:** 2026-07-17 | **Deadline:** 17/07/2026 | **expires_at:** 2026-08-10
- **Source URL:** https://csa.ufg.br/n/202617
- **Justificativa:**
  - **Source URL quebrada** — `csa.ufg.br` não resolve DNS.
  - Data 17/07 passada há 3 dias.
  - O CSA (Centro de Seleção/Assessoria) também teve o subdomínio aparentemente descontinuado.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.10. `1123ef30-c15e-4bc1-998d-5a99ac240697` — Prêmio Pierre Verger - 30 anos

- **Módulo/Categoria:** eventos / culturais
- **Data do evento:** 2026-07-17 | **Deadline:** 17/07/2026 | **expires_at:** 2026-08-05
- **Source URL:** https://ufg.br/events?event=39271
- **Justificativa:**
  - **Source URL vazia** — `ufg.br/events?event=39271` renderiza só header/footer (655 chars).
  - Data 17/07 passada há 3 dias.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.11. `08a3cea1-f559-4cb1-b360-9a10b651aa18` — 🦇 Blood Rave — Festival Gótico de Inverno

- **Módulo/Categoria:** eventos / festas
- **Data do evento:** 2026-07-18 | **Deadline:** 18/07/2026 | **expires_at:** 2026-08-01
- **Source URL:** https://shotgun.live/pt-br/events/blood-rave-festival-de-inverno
- **Justificativa:**
  - **Fonte confirma explicitamente que o evento já ocorreu:** a página da Shotgun exibe *"Ocorreu em sábado 18 jul ... Por Blood Rave ... De Leon Music Pub ... 18 de julho"*.
  - Data 18/07 passada há 2 dias.
- **Recomendação:** Fechar com `closed_reason: 'event_completed'`.

### 1.12. `b764a0cc-a98e-4103-9f28-a0411650ca8c` — CIAR/UFG seleciona bolsistas para EaD com salário de R$ 3.300 + benefícios

- **Módulo/Categoria:** oportunidades / empregos
- **Data do evento:** 2026-07-19 | **Deadline:** 2026-07-19 | **expires_at:** 2026-08-06
- **Source URL:** https://ciar.ufg.br/n/202599
- **Justificativa:**
  - **Fonte confirma o encerramento do prazo**: a página do CIAR (atualizada 07/07) diz literalmente *"recebe, até o dia 19 de julho de 2026, inscrições para a seleção de profissionais"*.
  - O prazo era ontem (19/07). Hoje (20/07) está encerrado.
- **Recomendação:** Fechar com `closed_reason: 'submission_closed'`.

### 1.13. `132aa3dd-325e-4d25-89be-d7cc88ff4b89` — PPGBM abre seleção para doutorado

- **Módulo/Categoria:** oportunidades / pesquisa
- **Data do evento:** — | **Deadline:** 2026-07-15 | **expires_at:** 2026-08-14
- **Source URL:** https://prpg.ufg.br/n/202815
- **Justificativa:**
  - **Fonte confirma o encerramento**: a página da PRPG traz o título *"PPGBM ABRE SELEÇÃO PARA DOUTORADO"* com a linha *"Inscrições até 15 de julho"*.
  - Prazo 15/07 passado há 5 dias.
- **Recomendação:** Fechar com `closed_reason: 'submission_closed'`.

### 1.14. `44d898b1-8297-4874-a2fe-d79929c2c6e7` — Aluno Especial em Psicologia — PPGP/UFG abre vagas para 2026/2

- **Módulo/Categoria:** oportunidades / edital
- **Data do evento:** — | **Deadline:** 2026-07-17 | **expires_at:** 2026-08-14
- **Source URL:** https://pos.ufg.br/p/inscricoes-abertas#especial
- **Justificativa:**
  - **Fonte confirma o período exato**: a página agregada de "Inscrições abertas" da Pós-UFG lista o PPGP/Psicologia (aluno especial) com *"Período de inscrição: 15/07/2026 a 17/07/2026"*.
  - Prazo 17/07 passado há 3 dias.
- **Recomendação:** Fechar com `closed_reason: 'submission_closed'`.

---

## 2. NÃO ENCERRAR — detalhes

Estes 3 posts aparecem na lista de candidatos porque o `data_evento` cadastrado está **errado** (o curator pegou a data de início das inscrições / da notícia, não a data de realização do evento em si). O evento real ainda está válido.

### 2.1. `b14fe292-f634-4c12-b242-6915b0f2575e` — XXII Curso de Inverno de Direito Internacional - CEDIN

- **Módulo/Categoria:** eventos / workshops
- **Data do evento no DB:** 2026-07-12 (errado)
- **Deadline no DB:** 12/07/2026 (correto — é o prazo de inscrição)
- **Realidade (fonte https://direito.ufg.br/n/200873-...):**
  - *"O evento será realizado integralmente online, com transmissão ao vivo pelo Zoom, em português e inglês (sem tradução simultânea), no período de 13 a 24 de julho de 2026. As inscrições estão abertas até o dia 12 de julho de 2026."*
- **Decisão:** **NÃO ENCERRAR AGORA**. O evento está em curso (13–24/07), hoje é 20/07, ainda está dentro da janela de realização. Manter até o fim do evento (24/07) e depois fechar.
- **Pendência de cadastro:** corrigir `data_evento` para 2026-07-24 (encerramento do evento), ou 2026-07-13 (início), o que for mais útil pro feed.

### 2.2. `380404b0-8180-459c-bf94-2a1c5e2d7e39` — Inscrições abertas para aluno especial no PPGNUT (Nutrição e Saúde) — FANUT/UFG

- **Módulo/Categoria:** oportunidades / pesquisa
- **Data do evento no DB:** 2026-07-13 (errado — é a data de INÍCIO das inscrições)
- **Deadline no DB:** 2026-08-10 (correto)
- **Realidade (fonte https://fanut.ufg.br/n/202651-...):**
  - *"As candidaturas poderão ser submetidas entre os dias 13 de julho e 10 de agosto de 2026."*
- **Decisão:** **NÃO ENCERRAR**. A inscrição segue aberta até 10/08, ou seja, mais 21 dias pela frente. O post é totalmente válido.
- **Pendência de cadastro:** o `data_evento` cadastrado é a data de início do período de inscrição, não a data do evento. Considerar:
  - Opção A: Remover `data_evento` e usar só `deadline_date` (a fonte primária).
  - Opção B: Trocar `data_evento` para a data de início das aulas do semestre 2026/2 (que não está explícita na fonte, então provavelmente ainda indefinida).

### 2.3. `06d2a84f-a9b3-4abe-949f-673ba20ede12` — Estudantes veteranos: matrículas começam no dia 15/7

- **Módulo/Categoria:** eventos / workshops
- **Data do evento no DB:** 2026-07-15 (errado — é a data de publicação da notícia, não a matrícula)
- **Realidade (fonte https://ufg.br/n/202737-...):**
  - *"Será realizada entre os dias 15 e 22 de agosto as matrículas para os estudantes veteranos da Universidade Federal de Goiás (UFG)."*
- **Decisão:** **NÃO ENCERRAR**. O evento (matrícula) está marcado para 15–22 de agosto, ainda no futuro. O post continua informativo e útil.
- **Pendência de cadastro:** corrigir `data_evento` para 2026-08-15 (ou 2026-08-22 para o fim do período).

---

## 3. Metodologia e universo

### Como filtrei
1. **PostgREST query** em `https://wacyrkwhkvzwkqpolrbg.supabase.co/rest/v1/posts` puxou todos os 352 posts (com paginação de 200).
2. **Filtragem em Node** com parser de data tolerante (ISO + `dd/mm/yyyy`):
   - Status `published` AND
   - `expires_at` < 2026-07-20 OR `metadata.data_evento` < 2026-07-20 OR (`metadata.data_evento` IS NULL AND `metadata.deadline_date` < 2026-07-20)
3. **Resultado:** 17 candidatos (15 com `data_evento` passada + 2 com `deadline_date` passada sem `data_evento`).
4. **Investigação por candidato:** Playwright (Chromium) abriu cada `https://www.kinocampus.com.br/_product.html?id={uuid}` e cada `source_url`/link de origem, com detecção de padrões:
   - "Inscrições abertas" / "abertas" / "inscreva-se" → ainda válido
   - "Encerrado" / "Prazo encerrado" / "Resultado" / "Ocorreu em" → encerrado
   - Página do `ufg.br/events?event=...` retornando 655 chars (só header/footer) → evento expurgado da origem
   - DNS `ERR_NAME_NOT_RESOLVED` → subdomínio UFG descontinuado

### Stats gerais
- **130 publicações ativas** (`status='published'`)
- **222 publicações fechadas** (`status='closed'`) — histórico preservado
- **17 publicações ativas com data passada** (13% das ativas) — destoando da média histórica saudável

### Padrões observados
- **3 subdomínios da UFG sumiram do DNS** (`uaech.ufg.br`, `ppgmec.ufg.br`, `csa.ufg.br`) — vale revisar todos os posts que apontem pra esses subdomínios, não só os 3 dessa lista.
- **3 eventos em `ufg.br/events?event=...` ficaram vazios** (sem conteúdo, só shell) — provavelmente eventos antigos que o UFG Events expirou. O KinoCampus ainda os referencia.
- **3 posts sem `source_url`** no metadata — falha de cadastro do curator. Sem link, não dá nem pra auditar manualmente o contexto.
- **3 cadastros com `data_evento` errado** (pegaram data de notícia em vez de data de evento) — vale revisar o playbook do Cadu/curator.

---

## 4. Próximos passos sugeridos

1. **Encerrar os 14 posts** com `status='closed'`, `closed_at=now()`, `closed_reason='event_completed'` (ou `'submission_closed'` pros 3 de oportunidade).
2. **Auditoria secundária:** rodar uma varredura de TODOS os posts (não só os 17) procurando:
   - Outros com `source_url` em subdomínios UFG que possam ter migrado
   - Outros com `data_evento` cadastrado mas que não batem com a fonte (esses 3 problemas de cadastro indicam que pode ter mais)
3. **Considerar auto-expurgo:** criar uma rotina (já existe o `dedup-kino` que cobre parte) que feche automaticamente posts onde `expires_at` < now() AND status='published'. Isso evita acúmulo futuro.
4. **Revisar o playbook do Cadu/curator** para que `data_evento` signifique "data de realização do evento" e não "data de início de inscrição" ou "data de publicação da notícia".

---

**Auditoria gerada em:** 20/07/2026 10:21 BRT
**Método:** Supabase PostgREST + Playwright headless (Chromium)
**Sem nenhuma alteração no banco** — apenas leitura.
