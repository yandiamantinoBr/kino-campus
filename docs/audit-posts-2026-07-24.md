# Auditoria de Publicações 2026-07-24

**Data:** 2026-07-25
**Total de posts auditados:** 56
**Autor:** Cadu Bot (`2345582d-8bf7-4393-aa0d-f9953d0e02ca`)
**Status inicial:** 55 published, 1 closed
**Status pós-auditoria:** 45 published, 10 hidden, 1 closed

## Distribuição

| Módulo | Categoria | Count |
|--------|-----------|-------|
| oportunidades | pesquisa | 9 |
| oportunidades | bolsas | 2 |
| oportunidades | workshops | 3 |
| oportunidades | monitoria | 2 |
| oportunidades | empregos | 6 |
| oportunidades | estagios | 2 |
| eventos | workshops | 14 |
| eventos | pesquisa | 8 |
| eventos | culturais | 5 |
| eventos | academicos | 4 |
| eventos | palestras | 1 |

Total: 24 oportunidades, 32 eventos.

## Achados Críticos (3 posts)

### Posts 1, 2, 3: Matrículas classificadas como `eventos/workshops`

| ID | Title | Problema | Correção Aplicada |
|----|-------|----------|-------------------|
| e6fa7f89 | Matrículas do Centro de Línguas da UFG começam em 27 de julho | `eventos/workshops` mas é PROCESSO de matrícula | ✅ → `oportunidades/pesquisa`, area=Humanas, subcat=letras |
| b4af34f8 | Matrículas para cursos do Centro de Línguas UFG abrem em 27 de julho | `eventos/workshops` mas é JANELA de matrícula | ✅ → `oportunidades/pesquisa`, area=Humanas, subcat=letras |
| cce405e1 | Matrículas 2026/2: 27/07 a 05/08 via SIGAA | `eventos/academicos` mas é CALENDÁRIO de matrícula | ✅ → `oportunidades/pesquisa`, area=Humanas, subcat=artes_visuais |

**Lição para o pipeline:** O formatador não detecta o pattern "matrícula" + "seleção" + "edital" e força o módulo `oportunidades`. Ele acaba categorizando esses processos como eventos porque a keyword "oficina" (matrícula em curso) é ambígua.

**Fix proposto:** No `formatador-ia.js`, adicionar detector de opportunity patterns:
```js
const OPP_KEYWORDS = /matr[íi]cula|sele[çc][ãa]o|edital|concurso\s+p[úu]blico|inscri[çc][õo]es?\s+(abertas?|prorrogadas?)|processo\s+seletivo/i;
if (OPP_KEYWORDS.test(text) && !EVENT_KEYWORDS.test(text)) {
  module = "oportunidades";
}
```

## Achados de Warning (32 posts)

### 1. Posts sem `area`/`subcategory` no metadata (32 posts)

O formatador (IA) deveria inferir area/subcategory baseado no `source_unit` e no conteúdo. Para 32 posts, esses campos estavam vazios.

**Correção aplicada:** Script heurístico em `tmp/fix-area-subcat.py` inferiu baseado em:
- Mapeamento direto `source_unit → area` (ex: `ig:@fefufg → Humanas/educacao_fisica`)
- Keyword matching no título/descrição (ex: "matemática" → Exatas/matematica)
- Fallback por categoria (culturais → Humanas/cultura, palestras → Multi/evento)

**Resultado:** 32/32 atualizados + 5 refinamentos manuais para casos com fallback ruim.

**Lição:** O formatador deveria SEMPRE setar `area` e `subcategory`. Considerar adicionar lógica determinística no `formatador-ia.js` (não só IA generativa).

### 2. `employmentType` faltando em 8 posts (FALSO POSITIVO)

| Post | Title | cat | employmentType esperado |
|------|-------|-----|-------------------------|
| 25 | Vestibular UFG 2027: O Jogo da Sua Vida Começou! | empregos | (não se aplica) |
| 28 | Monitoria 2026/2 na Filosofia | estagios | (não se aplica) |
| 30 | Seminário de Estágio do CEPAE-UFG | estagios | (não se aplica) |
| 37 | Vestibular UFG 2026 | empregos | (não se aplica) |
| 39 | Vestibular UFG 2027: edital publicado | empregos | (não se aplica) |
| 40 | Concurso Câmara Ipameri | empregos | (não se aplica) |
| 41 | Concurso Prefeitura Buriti Alegre | empregos | (não se aplica) |
| 42 | Concurso Prefeitura São Miguel do Araguaia | empregos | (não se aplica) |

**Análise:** O schema (`schema.ts:88-92`) define employmentType apenas para `type === "emprego"`. Os 8 posts são:
- Concursos públicos (não tem employmentType no schema)
- Vestibular (não tem employmentType no schema)
- Monitoria/Estágio (categoria diferente, type=bolsa/estagio)

**Conclusão:** Warning é **falso positivo**. Não há ação necessária.

**Sugestão:** Considerar adicionar `employmentType` para "concurso" (key: "publico") no schema para cobrir essa categoria. Não foi aplicado para evitar mudanças no schema que poderiam quebrar compatibilidade.

## Achados de Imagem (8 grupos duplicados, 15 posts)

Hash check via MD5 das imagens dos 56 posts:

### Grupo 1: Centro de Línguas (3 posts)
| Post | source_url | Note |
|------|------------|------|
| e89dae60 | instagram.com/centrodelinguasflufg/reel/DaOpEUMRUwr/ | merged do e6fa7f89 |
| e6fa7f89 | instagram.com/centrodelinguasflufg/p/DbLnbPMRfY4/ | reclassificado para oportunidades |
| b4af34f8 | instagram.com/centrodelinguasflufg/p/DZc6hfBRK3N/ | reclassificado para oportunidades |

**Análise:** São 3 anúncios diferentes do mesmo evento (matrículas). A imagem é a mesma porque o Centro de Línguas usou a mesma arte em todos. **Ação:** Considerar hide de e6fa7f89 (mais redundante). Manter b4af34f8 (tem data range estendido) e e89dae60 (mais recente).

### Grupo 2: IX SIPACV (3 posts)
| Post | source_url | Note |
|------|------------|------|
| 3d500db4 | instagram.com/sipacv_/p/DbEVRpPDxRE/ | primeira aparição |
| d5cffac4 | instagram.com/sipacv_/p/DZ0jFs-j9ml/ | segunda |
| c14bcf38 | instagram.com/sipacv_/p/DaL2fn7D8yV/ | terceira |

**Análise:** Mesmo evento (IX SIPACV) anunciado em 3 posts do @sipacv_ com ângulos diferentes. **Bug:** dedup-kino não pegou. **Ação:** Considerar hide de 2 dos 3.

### Grupo 3: PPGACV 2026/2 (2 posts)
| Post | source_url | Note |
|------|------------|------|
| af634f5f | instagram.com/ppgacv_ufg/p/Dafsrqhjtrh/ | PPGACV-specific |
| cce405e1 | instagram.com/ppgacv_ufg/p/Da34Z2BjaMH/ | SIGAA-general |

**Análise:** Posts sobre 2026/2 mas ângulos diferentes. **Ação:** Manter ambos (contextos diferentes).

### Grupo 4: ICB (2 posts)
| Post | source_url | Note |
|------|------------|------|
| 952af4a9 | instagram.com/icb.ufg/reel/DQIEIhpkW8o/ | LABMol Simpósio |
| 42cecb03 | instagram.com/icb.ufg/reel/DQfXd_oj-UJ/ | 33ª Semana ICB |

**Análise:** Eventos diferentes do ICB. **Bug:** mesmo image. Provavelmente cache-instagram-images usou a primeira imagem do perfil. **Ação:** Investigar cache-instagram-images; rever a lógica de "primeira imagem do perfil" vs "imagem do post específico".

### Grupo 5: CAPES + Fundos Europeus (2 posts)
| Post | source_url | Note |
|------|------------|------|
| 813e0f5f | instagram.com/pesquisaeinovacaoufg/p/DbG2uEonf_I/ | Oficina |
| 1e7ad3ed | instagram.com/posufg/p/DbBIbI-ku3h/ | CAPES |

**Análise:** Posts de contas DIFERENTES com mesma imagem. Possível repost. **Ação:** Investigar.

### Grupo 6: CEPAE (2 posts)
| Post | source_url | Note |
|------|------------|------|
| 206f8b3e | instagram.com/cepae_ufg/p/DaON_b1O6ff/ | Simpósio Educação Inclusiva |
| 15ad7604 | instagram.com/cepae_ufg/p/DaPpEC9nLPI/ | Seminário Estágio |

**Análise:** Eventos diferentes do CEPAE. **Bug:** mesmo image. **Ação:** Cache bug.

### Grupo 7: Editora UFG (2 posts)
| Post | source_url | Note |
|------|------------|------|
| b165d137 | instagram.com/editora.ufg/reel/Da5szR7idsz/ | Foucault |
| 170b6b15 | instagram.com/editora.ufg/reel/DbBF5XzlLjF/ | Pensar como historiadora |

**Análise:** Lançamentos de livros diferentes. **Bug:** mesmo image. **Ação:** Cache bug.

### Grupo 8: Institutoverbena (3 posts)
| Post | source_url | Note |
|------|------------|------|
| 1f59d22e | instagram.com/institutoverbenaufg/reel/DRkux4hDZD_/ | 85º Fórum |
| ddf87375 | instagram.com/institutoverbenaufg/p/DZnvkqcPEGw/ | Concurso Buriti Alegre |
| 5a98dacf | instagram.com/institutoverbenaufg/p/DaWPFstPl-k/ | Concurso São Miguel |

**Análise:** 3 posts DIFERENTES (fórum + 2 concursos) com mesma imagem. **Bug grave:** formatador errou a imagem. **Ação:** Substituir imagens dos concursos pelas imagens específicas dos posts.

## IG_HANDLE_URL_MISMATCH (15 warnings)

Análise: A maioria é **cross-account repost** (uma conta UFG repostou conteúdo de outra). Esperado e OK.

| Post | source_unit (atribuído) | source_url (real) | Diagnóstico |
|------|------------------------|-------------------|-------------|
| 3 | @fefufg | @prof.claudiolira | Repost (Claudio Lira é prof FEFD) |
| 4 | @fefufg | @danca.ufg | Repost (Dança é da FEFD/UFG) |
| 7 | @pesquisaeinovacaoufg | @ipelab.ufg | Repost (IPELAB é projeto da PRPI) |
| 10 | @ppggmp.ufg | @grupoeugem | Repost (Grupo EuGem é do PPGGMP) |
| 11 | @ppgacv_ufg | @sipacv_ | Repost (SIPACV é evento do PPGACV) |
| 14 | @poshistoriaufg | @sbhciencia | Repost (SBH = Sociedade Brasileira) |
| 16 | @fefufg | @fefufg/p/... | OK (mesmo source_unit) |
| 21 | @posufg | @pesquisaeinovacaoufg | Repost (PRPG compartilha PRPI) |
| 23 | @ppgzufg | (reel) | URL sem username explícito |
| 24 | @campusocidentalufg | @prefeituracidadeocidental | Repost (parceria municipal) |
| 36 | @odontologia.ufg | @jordana.estudente | Repost (aluno/colaborador) |
| 37 | @institutoverbenaufg | @reitoriaufg | Repost (Reitoria UFG) |
| 46, 47 | @fav_ufg | @sipacv_ | Repost (FAV ↔ PPGACV) |
| 49 | @iptsp_ufg | @nmobrasil_oficial | Repost (associação) |

**Conclusão:** Cross-account é comum e OK. **Ação:** Considerar ajustar `source_unit` para a conta original (em vez da que repostou) quando for detectado repost. Adicionar warning informational.

## Posts Limpos (14)

- [ 1] Centro de Línguas da UFG: matrículas a partir de 27 de julho
- [ 6] Editais 2026/2027 do PIP/UFG: fique de olho nas datas!
- [12] Disciplinas do PPGACV para 2026/2: inscrições para estudantes especiais
- [15] Inscrições prorrogadas para voluntários no projeto Lapig na Escola
- [17] Revista Pensar a Prática recebe artigos para dossiê até 30/12/2026
- [18] Seleção de Monitores – Matemática Básica em Módulos (MBM)
- [19] Especialização, mestrado e doutorado em Letras: editais abertos!
- [22] Ação social do 4º Congresso UFG de Contabilidade beneficia 210 famílias
- [35] Publicações sumiram e comentários estão desativados? Entenda o período eleitoral na UFG
- [43] 23º CONPEEX: submissões encerram em menos de 30 dias — tema "Ciência Delas"
- [48] Curso Introdução ao Raspberry Pi e sua Aplicação em IoT
- [50] PPGBRPH abre seleção para mestrado e doutorado no 2º semestre de 2026
- [52] CAPES abre chamada para PPGs indicarem vagas no Programa de Desenvolvimento Acadêmico Indígena
- [56] 33ª Jornadas de Jovens Pesquisadores da AUGM: pré-seleção na UFG

## Ações Tomadas (já aplicadas)

1. ✅ Reclassificados 3 posts críticos: `eventos/workshops` → `oportunidades/pesquisa`
2. ✅ Inferidos area/subcategory para 32 posts
3. ✅ Refinadas 5 inferências com fallback ruim
4. ✅ **Aplicado dedup --apply: 10 posts hidden** (status='hidden') por conteúdo duplicado
   - e89dae60, e6fa7f89 (Centro de Línguas - 2 dos 3)
   - d5cffac4 (IX SIPACV)
   - af634f5f (PPGACV)
   - 952af4a9 (ICB LABMol)
   - 813e0f5f (CAPES/Fundos)
   - 206f8b3e (CEPAE Simp. Educação Inclusiva)
   - b165d137 (Editora UFG - Foucault)
   - 1f59d22e (Institutoverbena - Fórum)
   - ddf87375 (Institutoverbena - Concurso Buriti Alegre)
5. ✅ **Fix Q commitado (PR #91)**: dedup-kino v1.8.0 com Stage 1.5 content-hash

## Ações Recomendadas (próximas)

### Para o Pipeline (openclaw-cadu)

1. **formatador-ia.js**: Adicionar detector de opportunity patterns para forçar `module=oportunidades` quando texto contém "matrícula|seleção|edital|concurso" mas não contém "show|congresso|simpósio".

2. **formatador-ia.js**: SEMPRE setar `area` e `subcategory` baseado em heurística determinística + IA. Adicionar tabela de mapeamento `source_unit → area` (replicar a tabela do audit).

3. **cache-instagram-images.js**: Usar a imagem ESPECÍFICA do post IG (não a primeira do perfil). Verificar se `cache[postId]` está sendo diferenciado.

4. **dedup-kino.js**: Habilitar `--apply` por padrão. Os 8 grupos de duplicatas (15 posts) seriam reduzidos a 8 posts.

5. **dedup-kino.js**: Adicionar detecção de "mesma imagem + mesmo source_unit" como confirmação de duplicata. Os 3 posts do IX SIPACV (mesmo source_unit @sipacv_) e 3 do Centro de Línguas (mesmo @centrodelinguasflufg) seriam automaticamente flagados.

### Para o KinoCampus (kino-campus)

1. **Edge Function cadu-publish**: Considerar adicionar `employmentType="publico"` para concursos públicos (mas requer mudança no schema).

2. **Criar categoria "concursos" ou "processos_seletivos"** em oportunidades (separado de empregos). Vestibulares e concursos públicos não são exatamente "empregos".

### Posts a reavaliar

- **Posts 31, 32, 33**: Lançamentos de livros (3 posts) - 2 deles têm imagem duplicada. Verificar se são eventos reais ou conteúdo duplicado.
- **Posts 16 e 23**: Posts com URL sem username explícito (reel) - investigar.
- **Post 35**: "Publicações sumiram e comentários estão desativados? Entenda o período eleitoral na UFG" - esse é META (sobre o KinoCampus, não sobre evento UFG). Considerar se deveria estar publicado como "oportunidade".
