# Report — Reclassificação de posts ativos (2026-08-05)

**Projeto:** `wacyrkwhkvzwkqpolrbg`  
**Escopo:** posts `status = published`, não-legacy, não expirados  
**Total ativos no momento:** 131 (68 eventos + 63 oportunidades)

## Taxonomia canônica (create-post schema)

### Eventos (`category` / `metadata.categoriaKey`)
`academicos`, `palestras`, `congressos`, `cursos`, `culturais`, `esportivos`, `workshops`, `festas`, `sustentabilidade`

### Oportunidades
`editais`, `concursos`, `bolsas`, `estagios`, `empregos`, `monitoria`, `pesquisa`, `cursos-capacitacoes`, `voluntariado`, `freelancer`

Fonte: `assets/js/features/create-post/kc-create-post.schema.js`

## Problemas encontrados

Dos 131 ativos, **29** tinham classificação inconsistente com o schema ou mismatch `category` ↔ `metadata.categoriaKey`.

Padrões principais (pipeline Cadu / publisher):

| Padrão | Exemplo | Problema |
|--------|---------|----------|
| `pesquisa` em **eventos** | palestras Diálogos | chave de **oportunidades** no módulo errado |
| `eventos:academico` | circuito AKCIT | formato legado / home-key, não schema de create-post |
| `workshops` + key `academicos` | simpósios/encontros | category e key divergentes |
| `curso-capacitacao` / `emprego` | curso de verão / concurso | singular fora do schema |
| categorias de eventos em oportunidades | `workshops`, `culturais`, `academicos` | módulo errado na key |
| `data_evento` ausente | campeonato, simpósio, jornada | filtro de data de eventos quebra/falha |

## Correções aplicadas (produção)

**29 posts** atualizados individualmente (somente `category` + campos de classificação em `metadata`; título/descrição/mídia intactos).

### Eventos (18)

| De | Para | Casos típicos |
|----|------|----------------|
| `pesquisa` / `eventos:academico` | `palestras` | Diálogos, AKCIT, palestra nutrição |
| `workshops` (encontros/simpósios) | `congressos` ou `academicos` | EGOEEP, GIMON, Simpósio Inclusiva, Semana Pedagógica |
| `pesquisa` (oficina) | `workshops` | Oficina fundos europeus |
| `culturais` mal alinhado | `culturais` / `academicos` | Flore-Ser (key), PIEmp |
| missing `data_evento` | preenchido quando inferível | drones, saúde indígena, ANPAD, etc. |

### Oportunidades (11)

| De | Para | Casos típicos |
|----|------|----------------|
| `workshops` / `culturais` | `cursos-capacitacoes` | Oficina Taipa, GEPETO |
| `curso-capacitacao` | `cursos-capacitacoes` | Curso de Verão PPGCB |
| `emprego` | `concursos` | Concurso Prefeitura |
| `academicos` | `editais` | Matrículas veteranos |
| `pesquisa` + key edital | `editais` | Aluno Especial, SEREX |
| `monitoria` errado | `concursos` | Prêmio Crea-GO |
| key `pesquisa` em bolsas | `bolsas` | DAAD |
| `pesquisa`/`culturais` | `concursos` | NutriChef |

## Validação pós-correção

```text
remaining invalid category/key/mismatch for active posts: 0
eventos: academicos 29, palestras 7, congressos 4, culturais 13,
         esportivos 1, workshops 14
oportunidades: pesquisa 34, monitoria 6, empregos 5, cursos-capacitacoes 5,
               concursos 4, bolsas 3, editais 3, estagios 2, voluntariado 1
```

`kc_home_category_post_counts()` continua agregando em buckets de home (`academico`, `cultural`, …) via `kc_home_match_category` — taxonomia **paralela de personalização**, não a de chips do create-post. Isso é esperado e não indica regressão dos filtros de feed (`#academicos`, etc.).

## O que não foi alterado

- Posts `closed` / `hidden` / `deleted` / expirados  
- Módulos sem publicados ativos (caronas, moradia, compra-venda, achados)  
- Títulos, descrições, links, imagens, status, autores  
- 60 índices “unused” ou outras áreas do advisor  

## Risco residual / follow-up

1. **Cadu publisher** ainda pode reintroduzir keys legadas (`pesquisa` em eventos, `eventos:academico`). Vale endurecer o classificador no pipeline de publicação.  
2. Algumas `data_evento` foram inferidas do texto (ex.: “setembro” → `2026-09-15`); revisar se o calendário oficial divergir.  
3. Oportunidades de pesquisa (34) parecem intencionais e válidas no schema — não foram mexidas.

## Artefato

Registro local da aplicação: `%TEMP%\kc_post_reclass_applied.json` (IDs, before/after, motivo).
