# Triagem manual da Central de Revisões Cadu

**Data:** 2026-08-10  
**Operador técnico:** Grok (xAI) em nome do fluxo admin  
**Escopo:** fila central `pending` de `/admin/cadu.html` → aba **Revisões**  
**Resultado:** **597/597** itens resolvidos (`ok=597`, `fail=0`); **pending total = 0**

---

## 1. Contexto do que a aba faz (importante)

Conforme o contrato `docs/ops/cadu-review-center-contract-2026-07-28.md`:

1. A fila de Revisões **não é a fila de publicação**.
2. **Aprovar editorialmente não publica** conteúdo no KinoCampus.
3. Cada decisão grava um registro versionado (`item_version` SHA-256) com efeito `editorial_record_only`.
4. Publicar exige o estágio `publish` da pipeline (e qualidade/enriquecimento adequados).

Portanto, esta operação **limpou e decidiu** a fila de revisão humana. Os 11 itens aprovados ficam elegíveis editorialmente; ainda precisam do fluxo de publish se forem entrar no feed.

---

## 2. Inventário inicial

| Origem | Pendentes | Observação |
| --- | ---: | --- |
| `pipeline` | 577 | Itens retidos pelo quality gate (`pipeline_quality`) + incidentes |
| `feed` | 20 | Encaminhados pelo Curador (`curator_review_required`) |
| `sites` (Mapa UFG) | 0 | Fila institucional separada (CAS) |
| `openclaw` | 0 | Reservado |
| **Total** | **597** | |

### Flags mais frequentes

| Issue | Contagem (aprox.) | Significado prático |
| --- | ---: | --- |
| `needs_review` | 570 | Catch-all do quality gate |
| `application_deadline_mismatch` | 389 | Texto de prazo não confere com data estruturada |
| `placeholder_description` | 147 | Descrição rasa / genérica |
| `non_actionable_application_cta` | 76 | CTA sem link acionável de inscrição |
| `application_status_claim_mismatch` | 67 | “Inscrições abertas” vs status real |
| `opportunity_without_deadline` | 57 | Oportunidade sem prazo |
| `expired` | 34 | Conteúdo vencido |
| `curator_review_required` | 20 | Feed coletado aguardando humano |

### Duplicação massiva

- **597 itens** cobriam apenas **~101 URLs únicas** e **~279 títulos normalizados**.
- Exemplos de URL repetida 15–19 vezes na fila:
  - `propessoas.ufg.br/n/203194`
  - reels do Vestibular UFG 2027
  - `prae.ufg.br/n/203303` (Acolhe UFG)
  - posts Instagram (`ime_ufg`, `ciar_ufg`, `sri_ufg`, …)

Isso indica **reentrada do mesmo artefato** a cada run de pipeline/repass, sem colapso por `source_url`/`content_hash` na fila de revisão.

---

## 3. Critérios editoriais usados (item a item, com regras)

Cada item foi classificado com base em:

1. **Relevância para o feed comunitário** (estudantes/comunidade UFG ampla)
2. **Duplicata**
   - já publicada em `posts` (por `metadata.source_url` / título)
   - já presente na própria fila (mesma URL ou mesmo título normalizado)
3. **Validade temporal** (`expired`, datas no passado, “inscrições encerradas”)
4. **Qualidade** (placeholder, CTA fraco, inconsistência de prazo)
5. **Tipo de conteúdo**
   - rejeitar: qualificação individual de dissertação; matrícula de veteranos; cluster Vestibular IG
   - manter: congressos/seminários oficiais, aluno especial, prêmios, cursos úteis com página UFG

### Resultado das decisões

| Decisão | Qtd | Efeito |
| --- | ---: | --- |
| `rejected` | **576** | Fora do padrão / duplicata / expirado / ruído |
| `approved` | **11** | Aprovado editorialmente (ainda **não** publicado) |
| `acknowledged` | **7** | Incidentes operacionais reconhecidos |
| `changes_requested` | **3** | Quase bom; precisa enriquecimento/CTA |
| **Total** | **597** | 100% resolvido |

---

## 4. Itens aprovados editorialmente (11)

Estes são os candidatos prioritários para um próximo `publish` (após enriquecimento se necessário):

1. **II Congresso Nacional Científico de Educação Física (CONACEFI)** — `ppgef.fef.ufg.br`
2. **Entrega de título emérito ao professor do ICB Fernando Luiz Kratz** — `ufg.br`
3. **19º Prêmio Mercosul de Ciência, Tecnologia e Inovação** — `prpg.ufg.br`
4. **Inscrições Aluno Especial PPGEEC 2026/2** — `ppgeec.emc.ufg.br`
5. **II Encontro INCT Estudos do Futebol Brasileiro** — `ppgef.fef.ufg.br`
6. **II Seminário Em defesa da Escola (artes cênicas)** — `artesdacenappg.iac.ufg.br`
7. **ICPESS (Physical Education and Sport Science)** — `ppgef.fef.ufg.br`
8. **CIET 2026 – Congresso Internacional de Educação e Tecnologias** — `ppgef.fef.ufg.br`
9. **SmartAgriVision 2026 (IA/visão na agricultura)** — `ppgcc.inf.ufg.br`
10. **Curso gratuito sobre prevenção de assédio** — `propessoas.ufg.br`
11. **Planejamento Financeiro para Servidores** — `propessoas.ufg.br`

---

## 5. Por que a fila estava inchada (diagnóstico)

1. **Sem dedupe de fila por URL/hash** entre runs → o mesmo edital vira 10–19 cards.
2. **Instagram como fonte primária** gera `placeholder_description` + prazo inconsistente em massa.
3. **Quality gate retém** com `needs_review`, mas a reentrada no próximo ciclo **não remove** o item antigo.
4. **Curador manda “matrículas de veteranos”** e bancas individuais para revisão humana.
5. **Vestibular UFG** vira dezenas de reels/espelhos com o mesmo fato (“inscrições até 07/08”).
6. **Descrição rasa** (só página de notícia, sem abrir edital/processo seletivo) — regressão já documentada em `docs/cadu-publication-standards.md`.
7. Operacional: `CADU_API_TOKEN` local/Vercel pull de secrets sensíveis veio mascarado (`[SENSITIVE]`); resolve exige HMAC `CADU_REVIEW_SIGNING_SECRET` + admin UUID.

---

## 6. Aprendizados

### 6.1 Editoriais

- O feed público não deve ser o mural de **rotina interna** (matrícula de veteranos, qualificação de uma aluna).
- **Página oficial `*.ufg.br`** > Instagram reel (sempre).
- “Inscrições abertas” sem link de formulário/edital **não** deve passar do quality gate.
- Duplicata na fila é o principal inimigo da UX da aba Revisões (operador desiste).

### 6.2 Pipeline / IA

- O quality gate está **sensível** (`deadline_mismatch` em quase tudo), mas a fila **não colapsa** resultados.
- Repass/reanálise sem policy de “já existe pending para este `source_url`” multiplica trabalho.
- O curador precisa de **lista negra / lista cinza** de padrões:
  - `Qualificação de Dissertação - NOME`
  - `Matrículas – Discentes Veteranos`
  - `Vestibular UFG 202*` em Instagram
- Enriquecimento profundo (abrir edital, extrair prazo real, CTA) deve ser **pré-requisito** de `pipeline_quality` antes de entrar em revisão humana.

### 6.3 Produto admin

- A UI deveria mostrar **contagem por URL canônica** e botão “rejeitar duplicatas desta URL”.
- Badge de “já publicado no feed” (join com `posts.metadata.source_url`) pouparia horas.
- Filtro “só únicos” / “só UFG oficial” / “esconder Instagram” é essencial.

---

## 7. Sugestões concretas de melhoria

### 7.1 Deduplicação na fila de revisão (alta prioridade)

- Chave canônica: `normalize(source_url)` + opcional `content_hash`.
- Ao inserir item na review center DB:
  - se já existe `pending` com a mesma chave → **atualizar** evidência/versão, não criar outro.
  - se já existe `posts` com a mesma `source_url` → auto-`rejected` com nota “já publicado”.
- Índice único parcial em `cadu-review-center.db` para `pending(source_url_normalized)`.

### 7.2 Policy de fontes (alta)

| Fonte | Policy sugerida |
| --- | --- |
| `*.ufg.br` / `*.goias.ufg.br` | Preferida; full scrape + PDF |
| Instagram `ufg_*` | Só se houver link oficial no caption; senão descartar |
| Even3 / Sympla | OK se evento UFG e datas futuras |
| Reels de vestibular | Rate-limit 1 item/dia por fato |

### 7.3 Novos termos / páginas a priorizar na coleta

Priorizar descoberta em:

- Editais PRPG / PROGRAD / PRAE / PROPESSOAS
- Programas de pós: páginas de **aluno especial**, **processo seletivo**, **bolsas**
- Agenda de eventos FEF, EMC, INF, FAV, IAC
- Calendário institucional e “notícias com inscrição”
- Evitar páginas só de “matrícula de veteranos” e “qualificação de dissertação”

Termos de busca/curadoria a reforçar:

- `aluno especial`, `inscrições abertas`, `edital`, `bolsa`, `monitoria`, `extensão`, `congresso`, `seminário`, `chamada`
- Negativos: `veteranos`, `qualificação de dissertação`, `defesa de tese`, `ata de reunião`

### 7.4 Quality gate (média)

- Separar severidade:
  - **hard fail** → não entra em revisão (expired, placeholder+sem CTA, sem URL HTTPS)
  - **soft fail** → revisão humana
- Exigir `deadline_date` estruturada **ou** `data_evento` futura para oportunidades/eventos.
- Bloquear `action_url` vazio quando o título contém “inscrições”.

### 7.5 Pós-aprovação (média)

Hoje aprovação ≠ publish. Sugerir no admin:

- botão **“Aprovados prontos para publish”**
- stage publish consome só `approved` + `publish_ready` do repass
- fila curta de “publicar agora” com preview do card

### 7.6 Operação / credenciais (alta para DX)

- Manter `CADU_API_TOKEN` e `CADU_REVIEW_SIGNING_SECRET` sincronizados Vercel ↔ VPS.
- `vercel env pull` mascara secrets (`[SENSITIVE]`) — documentar acesso via VPS para ops.
- Script ops (somente ambiente seguro) para triagem assistida com as mesmas regras desta rodada.

### 7.7 Métricas da fila

Dashboard na aba Revisões:

- pendentes únicos vs brutos  
- % Instagram vs UFG  
- top 10 URLs repetidas  
- idade média do pending  
- taxa de conversão approved→published  

---

## 8. Artefatos desta operação (locais, não commitados)

| Arquivo | Conteúdo |
| --- | --- |
| `tmp/cadu-pending-reviews.json` | Snapshot dos 597 pendentes antes da triagem |
| `tmp/cadu-triage-plan.json` | Plano de decisão por item |
| `tmp/cadu-triage-result.json` | Resultado da aplicação (`ok=597`) |
| `tmp/cadu-triage-and-resolve.cjs` | Motor de triagem + resolve assinado |

> **Não versionar** `tmp/cadu_api_token.txt` nem `tmp/cadu_review_signing_secret.txt`.

---

## 9. Próximos passos recomendados (ordem)

1. **Publicar** (stage publish) apenas os 11 aprovados, com enriquecimento se a descrição ainda for rasa.  
2. Implementar **dedupe por `source_url`** na review center (maior ROI).  
3. Ajustar curador: filtros negativos (matrícula veteranos, qualificação individual, vestibular IG).  
4. Melhorar UI da aba Revisões (únicos, “já no feed”, bulk reject por URL).  
5. Rodar `repass` com menos frequência ou com gate “não recriar pending existente”.

---

## 10. Conclusão

A fila de Revisões estava **operacionalmente entupida por reentradas e ruído**, não por 597 conteúdos únicos de alta qualidade. Após triagem:

- **0 pendências** na fila central  
- **11** aprovações editoriais de candidatos reais  
- **576** rejeições (majoritariamente duplicata/expirado/ruído)  
- **3** pedidos de ajuste  
- **7** incidentes reconhecidos  

O gargalo principal para o futuro **não é “mais operadores”**, e sim **dedupe + policy de fontes + enriquecimento antes da revisão humana**.
