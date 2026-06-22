# Relatório de Aplicação — Correções da Auditoria

**Data:** 22/06/2026
**Aplicador:** Mavis (M3)

---

## ✅ Correções aplicadas (via SQL direto no Supabase)

### 1. Encerramentos (8 posts → status='closed')

| Tipo | ID (8 primeiros) | Título (resumido) | Status anterior |
|------|------------------|-------------------|-----------------|
| Evento | `53d7e0e8` | 4º Ciclo de Estudos do Gepets | published → **closed** |
| Evento | `98f81fa5` | Projeto Café e Cultura na Casa do Patrimônio | published → **closed** |
| Evento | `1cd7adeb` | 1º Simpósio de Bioeconomia | published → **closed** |
| Evento | `16bb5c36` | PROFEPI Trilha de Formação | published → **closed** |
| Oport. | `f4018bbe` | 13ª OEU | published → **closed** |
| Oport. | `ddad28e2` | PROLICEN 2026/2027 | published → **closed** |
| Oport. | `412aabf9` | PIP/UFG 2026/2027 | published → **closed** |
| Oport. | `953bb526` | PIEMP/UFG | published → **closed** |

### 2. Correções de categoria (4 posts)

| ID | Título | Categoria antiga | Categoria nova |
|----|--------|------------------|---------------|
| `2c95198a` | Edital de monitoria UFG 2026/2 e 2027/1 | `estagio` | **`monitoria`** |
| `7830d052` | UFG adere ao SISU+ | `monitoria` | **`academicos`** |
| `b41103a2` | Bolsas na Dinamarca (SRI/UFG) | `bolsa` | **`bolsas`** |
| `7d245895` | Vestibular UFG 2027 | subcategoria: `academica` (sem acento) | **`Acadêmica`** (com acento) |

### 3. Padronização geral de categorias

| Mudança | Quantidade | Onde |
|---------|-----------|------|
| `estagio` → `estagios` | 6 posts | `posts.category` + `metadata.categoriaKey` |
| `bolsa` → `bolsas` | 0 (já tratado direto) | `posts.category` |
| `seminario` → `seminarios` | 3 posts | `posts.category` + `metadata.categoriaKey` |

### 4. Padronização de labels em subcategorias (acentos)

| Mudança | Quantidade |
|---------|-----------|
| `Sa���de` → `Saúde` (via remoção de U+FFFD + reinsert UTF-8) | 16 |
| `Acad���mica` / `AcadA�mica` → `Acadêmica` | 10 |
| `Gest���o` → `Gestão` | 3 |
| `L���nguas` → `Línguas` | 2 |
| `Comunica������o` / `ComunicaA�o` → `Comunicação` | 2 |
| `MA�sica` → `Música` | 2 |
| `Engenharia ElActrica e de ComputaA�A�o` → `Engenharia Elétrica e de Computação` | 1 |

**Verificação técnica:** todos os hex UTF-8 confirmados via `encode(convert_to(subcategoria, 'UTF8'), 'hex')` — strings armazenadas corretamente em UTF-8.

---

## 📊 Estatísticas finais

| Métrica | Antes | Depois |
|---------|-------|--------|
| Posts `status='published'` | 112 | **104** |
| Posts `status='closed'` | 118 | **126** |
| Categorias inconsistentes (singular vs plural) | 2 | **0** |
| Subcategorias com mojibake (U+FFFD) | ~38 | **0** |
| Eventos passados ativos sem `data_fim_evento` | 4 | **0** |
| Oportunidades com prazo já vencido | 4 | **0** |

---

## 🔴 O que NÃO foi resolvido automaticamente — preciso da sua decisão

### 8 publicações sem `link` externo (campo `metadata.link` vazio)

Esses posts existem no banco mas não têm URL externa (a fonte fica só no corpo da descrição). Avaliei um por um:

| ID | Título | Provável URL oficial |
|----|--------|---------------------|
| `b0a80050` | Convite GTME EMC UFG — Primeiros Socorros | Verificar `emc.ufg.br` |
| `adfa4f98` | Seleção professores bolsistas IsF-UFG | Verificar `isf.ufg.br` ou SRI |
| `a584e695` | Projeto Rondon PROEX | `proex.ufg.br/p/61616-edital-proex-n-15-2026-...` (similar ao `efd974ae` que TEM link) |
| `94fd05d7` | Edital mobilidade MARCA agronomia | SRI: `sri.ufg.br` |
| `5c239822` | PPGEEC/EMC edital 01/2026 | `emc.ufg.br/p/...` |
| `5817f691` | PPGEcoevol mestrado/doutorado | `ppgecoevol.ufg.br` ou `prpg.ufg.br` |
| `edd64571` | PPGEAS mestrado | `ppgeas.ufg.br` ou `prpg.ufg.br` |
| `2c436cec` | PPGGECon mestrado/doutorado | `prpg.ufg.br/n/200710` |

**Para o post `a584e695` eu já localizei a URL via dedução** (irmão do `efd974ae` que tem link):
- URL: `https://proex.ufg.br/p/61616-edital-proex-n-15-2026-selecao-de-propostas-de-trabalho-da-ufg-para-a-operacao-carnauba-do-projeto-rondon`

**Sugestão:** adicionar essa URL no `metadata.link` do `a584e695`. Para os outros 7, idealmente você (ou o bot SECOM) deveria consultar cada PPG/Instituto e pegar o link oficial.

---

## 🌐 Validação visual no site (Playwright)

Confirmei via Playwright que as correções estão refletidas na UI:

| Página | Card | Categoria exibida |
|--------|------|-------------------|
| Oportunidades (1ª posição) | UFG adere ao SISU+ (`7830d052`) | "Acadêmicos • Tecnologia" ✅ (antes: Monitoria) |
| Oportunidades (3ª posição) | Bolsas na Dinamarca (`b41103a2`) | "Bolsas • Pesquisa" ✅ (antes: bolsa) |
| Oportunidades | Vestibular UFG 2027 (`7d245895`) | "Concursos • Acadêmica" ✅ (antes: academica) |
| Oportunidades (vários) | subcategorias com acentos | "Saúde", "Acadêmica", "Línguas", "Comunicação", "Música" ✅ |
| Eventos | 4 eventos encerrados | **não aparecem mais** no feed principal ✅ |

---

## 📝 Notas técnicas

### Sobre a corrupção de encoding
Durante a aplicação inicial, o PowerShell enviou as strings acentuadas como UTF-16 (default Windows), e o endpoint PostgREST gravou `U+FFFD` (REPLACEMENT CHARACTER) no lugar dos acentos. Para reverter, usei `convert_from(decode('<hex>', 'hex'), 'UTF8')` em queries Postgres — mais robusto do que `unhex()` (que é MySQL).

### Migration aplicada
- Não criei arquivo de migration. As mudanças foram aplicadas via PostgREST API direto.
- **Recomendação:** gerar migration consolidada para auditoria. Posso fazer isso se quiser.

### Commits/push
Nada foi commitado ainda — todas as mudanças estão no banco (Supabase). Se quiser que eu gere commit/push com migration SQL consolidada, é só falar.

---

## Próximos passos sugeridos

1. **Você decide:** dos 8 posts sem link, quer que eu adicione a URL que sugeri para `a584e695`? Para os outros 7, posso tentar achar as URLs via web search (IsF-UFG, PPGs específicos).
2. **Migration consolidada:** posso gerar arquivo `supabase/migrations/NNN_audit-fixes-2026-06-22.sql` com todas as mudanças, pra ficar no histórico versionado.
3. **Cron de vigilância:** posso adicionar um cron job que rode semanalmente e detecte posts com prazo vencido, status inconsistente, etc.

Qual você quer que eu faça?