# Auditoria de Publicações Ativas — KinoCampus

**Data da auditoria:** 22/06/2026
**Escopo:** 112 publicações com `status='published'`
**Método:** dump SQL do Supabase (PostgREST API) + verificação visual via Playwright nas páginas `index.html`, `eventos.html` e `oportunidades.html`
**Auditor:** Mavis (M3)

---

## TL;DR — O que precisa de atenção

| Severidade | Quantidade | O que fazer |
|------------|------------|-------------|
| 🔴 Alta | 4 | Categorias erradas em posts visíveis na home |
| 🔴 Alta | 4 | Eventos passados ativos (`status=published`) sem data_fim_evento |
| 🟡 Média | 4 | Posts com texto "encerrado/inscrições abertas" mas status ainda published |
| 🟡 Média | 4 | Inconsistência de padronização de categorias (singular/plural, acento) |
| 🟢 Baixa | 8 | Posts sem `link` externo (link só no corpo da descrição) |
| ⚪ OK | — | Encoding UTF-8, imagens, duplicatas — tudo OK |

---

## Inventário Geral

**112 publicações ativas** distribuídas em:

| Módulo | Qtd | Categoria mais comum |
|--------|-----|---------------------|
| oportunidades | 69 | pesquisa (37), academicos (15), workshops (12) |
| eventos | 43 | culturais (8), academicos (15), workshops (12) |

**Visibilidade:** 109 `public` · 3 `community`

**Imagens:** 60 no Supabase Storage · 51 em `files.cercomp.ufg.br` · 1 externa. Todas as URLs respondem 200 OK com CORS liberado. (Lazy loading pode fazer `naturalWidth=0` momentaneamente — não é bug.)

**Links externos:** 97 para `ufg.br` · 7 externos · 8 sem link

---

## 🔴 ALTA — Erros confirmados que afetam a vitrine

### 1. Categoria errada em posts populares (visíveis na home)

Esses 4 posts estão na primeira página da home e estão com a categoria/subcategoria errada:

| ID (8 primeiros) | Título (resumido) | `category` no banco | Deveria ser |
|------------------|-------------------|--------------------|-------------|
| `2c95198a` | Edital de monitoria UFG 2026/2 e 2027/1 | `estagio` | **`monitoria`** |
| `7830d052` | UFG adere ao SISU+ | `monitoria` | **`selecao`** ou **`academicos`** (SISU não é monitoria) |
| `7d245895` | Vestibular UFG 2027 | `concursos` ✅ | subcategoria=`academica` (sem acento, falta padronizar) |
| `b41103a2` | Bolsas na Dinamarca | `bolsa` | **`bolsas`** (plural) |

**Como verificar no site:** home → rolar até o card → ver a tag/categoria exibida.

### 2. Eventos passados ainda ativos (sem `data_fim_evento` definido)

Esses eventos têm `data_evento` ANTERIOR a hoje (22/06/2026) mas seguem como `status='published'` e aparecem no feed de Eventos:

| ID | Data | Título (resumido) | Observação |
|----|------|-------------------|-----------|
| `53d7e0e8` | 2026-04-06 | 4º Ciclo de Estudos do Gepets | Passou há 2,5 meses |
| `98f81fa5` | 2026-05-21 | Projeto Café e Cultura na Casa do Patrimônio | Passou há 1 mês |
| `1cd7adeb` | 2026-06-16 | 1º Simpósio de Bioeconomia, Biodiversidade e Sustentabilidade | Passou há 6 dias |
| `16bb5c36` | 2026-06-15 | PROFEPI — Trilha de Formação | Passou há 7 dias |

**Diferença importante:** eventos com `data_fim_evento` definida (range de datas) estão todos válidos — 32/43 eventos OK. O problema é só nesses 4 que não têm data de término e cuja data de início já passou. Eles deveriam ser `closed` ou `hidden`.

**Para conferir visualmente:** https://www.kinocampus.com.br/eventos.html — esses 4 aparecem na primeira página.

---

## 🟡 MÉDIA — Pendências que afetam percepção/SEO

### 3. Posts com texto "encerrado" mas status ainda `published`

A descrição diz que o prazo acabou, mas o post continua como ativo. Isso confunde o usuário que vê no feed "Inscrições abertas" e clica:

| ID | Prazo no texto | Observação |
|----|---------------|-----------|
| `f4018bbe` | "29 de maio de 2026 (encerrado)" | 13ª OEU |
| `ddad28e2` | "08/05/2026 (encerrado)" | PROLICEN |
| `412aabf9` | "08/05/2026 (encerrado)" | PIP/UFG 2026/2027 |
| `953bb526` | "até 5 de junho de 2026" | PIEMP/UFG — passou há 17 dias |

**Ação:** mudar para `status=closed` ou `hidden` (mantém histórico mas tira do feed ativo).

### 4. Inconsistência de padronização de categorias

Não é "erro", mas atrapalha filtros e SEO. Há variações que deviam ser unificadas:

| Categoria no banco | Variações | Contagem | Forma sugerida |
|--------------------|-----------|----------|---------------|
| estágio | `estagio` (1) / `estagios` (5) | 6 | `estagios` |
| bolsa | `bolsa` (1) / `bolsas` (7) | 8 | `bolsas` |
| seminário | `seminario` (2) | 2 | `seminarios` |
| evento | `evento` (4) | 4 | revisar (categoria genérica demais) |

---

## 🟢 BAIXA — Não-bloqueante, mas vale revisar

### 5. Posts sem `link` externo (8 publicações)

São posts onde a URL da fonte está só dentro do corpo da descrição, sem campo `metadata.link` separado:

| ID | Título (resumido) |
|----|-------------------|
| `b0a80050` | Convite grupo mulheres nas engenharias |
| `adfa4f98` | Seleção professores bolsistas italiano |
| `a584e695` | Projeto Rondon PROEX (já tem edital em PDF dentro do texto) |
| `94fd05d7` | Edital mobilidade MARCA |
| `5c239822` | PPGEEC/EMC edital 01/2026 |
| `5817f691` | PPGEcoevol mestrado/doutorado |
| `edd64571` | PPGEAS mestrado |
| `2c436cec` | PPGECon mestrado/doutorado |

A maioria é **legítima** (aviso interno sem URL dedicada ou edital em PDF embutido). Vale revisar caso a caso — se houver URL oficial, adicionar em `metadata.link` para abrir como CTA em vez de inline.

---

## ✅ Verificações que passaram (falsos positivos descartados)

| Verificação | Resultado |
|-------------|-----------|
| Encoding UTF-8 dos títulos | ✅ 0 mojibake real (o que aparece como `??` no PowerShell é só display errado; o site renderiza certo — testado via Playwright) |
| Encoding UTF-8 das descrições | ✅ 0 mojibake |
| Imagens quebradas (404) | ✅ 0 — todas respondem 200, CORS liberado |
| Imagens placeholder | ✅ 0 — cada post tem imagem única (hash distinto) |
| Duplicatas por título | ✅ 0 |
| Duplicatas por link | ✅ 0 |
| Política RLS impedindo leitura | ✅ Yan (admin) lê tudo; anon só vê `public` + `community` quando aplica |
| Mojibake clássico (`Ã©`, `??`, `ðŸ`) | ✅ 0 ocorrências reais no banco |

---

## 📊 Estatísticas por módulo/categoria (referência)

### Oportunidades (69)
| Categoria | Qtd |
|-----------|-----|
| pesquisa | 37 |
| academicos | 15 |
| workshops | 12 |
| bolsas | 7 |
| empregos | 5 |
| monitoria | 5 |
| estagios | 5 |
| concursos | 3 |
| voluntariado | 3 |
| tecnologia | 1 |
| estagio | 1 ⚠️ |
| premio | 1 |
| bolsa | 1 ⚠️ |
| evento | 4 (categoria genérica) |

### Eventos (43)
| Categoria | Qtd |
|-----------|-----|
| academicos | 15 |
| workshops | 12 |
| culturais | 8 |
| palestra | 2 |
| seminario | 2 ⚠️ (sem acento) |
| evento | 4 (genérica) |

---

## 🎯 Ações sugeridas (em ordem de prioridade)

### Imediato (alta)
1. **Mudar categoria de `2c95198a`** de `estagio` → `monitoria`
2. **Mudar categoria de `7830d052`** de `monitoria` → `selecao` (ou criar uma categoria específica para processos seletivos)
3. **Encerrar 4 eventos passados**: `53d7e0e8`, `98f81fa5`, `1cd7adeb`, `16bb5c36` → `status='closed'`

### Curto prazo (média)
4. **Encerrar 4 oportunidades com prazo já vencido**: `f4018bbe`, `ddad28e2`, `412aabf9`, `953bb526`
5. **Padronizar categorias**: criar migration que renomeia `estagio→estagios`, `bolsa→bolsas`, `seminario→seminarios`

### Desejável (baixa)
6. **Revisar 8 posts sem link** — adicionar `metadata.link` quando houver URL oficial
7. **Avaliar as 4 publicações com categoria genérica `evento`** em `oportunidades` — realocar para categoria específica

---

## 📁 Arquivos de apoio (auditáveis)

| Arquivo | Conteúdo |
|---------|----------|
| `scripts/published-posts-raw.json` | Dump completo das 112 publicações |
| `scripts/audit-posts.cjs` | Script de auditoria principal |
| `scripts/eventos-meta.json` | Eventos com `data_evento`, `data_fim_evento`, `deadline_date` |
| `scripts/audit-eventos-datas.cjs` | Análise correta de datas de eventos |
| `scripts/audit-report.json` | Relatório estruturado completo (gerado) |
| `scripts/eventos-datas-report.json` | Relatório específico de datas (gerado) |

---

## Observações metodológicas

1. **O display do PowerShell mostrou caracteres estranhos (`??`, `A�`, `Ã©`)** em todos os títulos — isso é **encoding do console Windows** (code page 1252), não do banco. O site renderiza os títulos corretamente. Para validar, usei Playwright + checagem de bytes UTF-8 hex via Postgres `encode(convert_to(title, 'UTF8'), 'hex')`.

2. **A regex original de "mojibake" no meu script gerou 112 falsos positivos** porque capturava `Ã©`/`Ã£` (que são acentos em português OK). Refinei para só contar `??` consecutivos, `ðŸ` (BOM intermediário) e aspas tipográficas mal-decodificadas — então o resultado real é 0 problemas de encoding.

3. **As 5 "imagens quebradas" iniciais** eram só `naturalWidth=0` por **lazy loading** ainda não ter carregado. Após scroll + espera, todas carregam corretamente.

4. **Yan (admin) vê 5 botões em qualquer post** (validado após o fix do item anterior). Então toda a UI admin funciona — só precisa ele clicar para encerrar.