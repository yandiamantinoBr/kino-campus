-- Migration: Auditoria de publicações 2026-06-22
-- Aplicada em produção em 22/06/2026 via PostgREST.
-- Reverte com: ver arquivo de log apply-fixes-log.json na pasta scripts/

BEGIN;

-- ============================================================
-- PARTE 1: Encerrar 4 eventos passados
-- (data_evento anterior a 22/06/2026, sem data_fim_evento)
-- ============================================================
UPDATE posts SET status = 'closed'
WHERE id IN (
  '53d7e0e8-f3af-4014-82ac-18b6b3f8257e', -- 4º Ciclo Gepets (data_evento=2026-04-06)
  '98f81fa5-11f8-44f6-8525-33ec2dacf439', -- Café e Cultura (2026-05-21)
  '1cd7adeb-b38d-4335-9839-a3962317cc2f', -- Simpósio Bioeconomia (2026-06-16)
  '16bb5c36-47af-44c7-b2c0-2b96f203e902'  -- PROFEPI Trilha (2026-06-15)
) AND status = 'published';

-- ============================================================
-- PARTE 2: Encerrar 4 oportunidades com prazo já vencido
-- ============================================================
UPDATE posts SET status = 'closed'
WHERE id IN (
  'f4018bbe-d9e9-4caf-a505-b05d8ca84e44', -- 13ª OEU (texto: "encerrado")
  'ddad28e2-e7e7-4127-825a-d71f37d68693', -- PROLICEN 2026/2027 (texto: "encerrado")
  '412aabf9-ad4a-45f1-94cd-63549badf89e', -- PIP/UFG 2026/2027 (texto: "encerrado")
  '953bb526-e5f5-4e36-a59c-7b102e344518'  -- PIEMP/UFG (inscrições até 5/6/2026)
) AND status = 'published';

-- ============================================================
-- PARTE 3: Corrigir categorias erradas em 4 posts específicos
-- ============================================================

-- 3a. Edital de monitoria marcado como estágio
UPDATE posts SET
  category = 'monitoria',
  metadata = metadata || jsonb_build_object(
    'categoriaKey', 'monitoria',
    'subcategoriaKey', '',
    'categoryKey', 'monitoria',
    'subcategoryKey', '',
    'categoryLabel', 'Monitoria',
    'subcategoryLabel', ''
  )
WHERE id = '2c95198a-9a84-4f74-943e-7f0e3d3049f4';

-- 3b. SISU+ marcado como monitoria (correto: acadêmicos)
UPDATE posts SET
  category = 'academicos',
  metadata = metadata || jsonb_build_object(
    'categoriaKey', 'academicos',
    'subcategoriaKey', '',
    'categoryKey', 'academicos',
    'subcategoryKey', '',
    'categoryLabel', 'Acadêmicos',
    'subcategoryLabel', ''
  )
WHERE id = '7830d052-7b6b-4a87-a65f-772a889b756c';

-- 3c. Bolsas Dinamarca: bolsa (singular) → bolsas
UPDATE posts SET
  category = 'bolsas',
  metadata = metadata || jsonb_build_object(
    'categoriaKey', 'bolsas',
    'subcategoriaKey', '',
    'categoryKey', 'bolsas',
    'subcategoryKey', '',
    'categoryLabel', 'Bolsas',
    'subcategoryLabel', ''
  )
WHERE id = 'b41103a2-f4f9-48bf-81b5-2fe0993b9d6b';

-- 3d. Vestibular: padronizar subcategoria com acento
UPDATE posts SET metadata = metadata || jsonb_build_object(
  'subcategoria', 'Acadêmica',
  'subcategory', 'academica',
  'subcategoriaKey', 'academica',
  'subcategoryKey', 'academica',
  'subcategoryLabel', 'Acadêmica'
)
WHERE id = '7d245895-ec9d-4684-aa18-01684bf80d1a';

-- ============================================================
-- PARTE 4: Padronização geral de categorias (singular → plural, sem acento → com)
-- ============================================================

-- estagio → estagios
UPDATE posts
SET category = 'estagios',
    metadata = jsonb_set(metadata, '{categoriaKey}', '"estagios"') || jsonb_build_object('categoryKey', 'estagios')
WHERE category = 'estagio';

-- seminarios (padronização do "seminario")
UPDATE posts
SET category = 'seminarios',
    metadata = jsonb_set(metadata, '{categoriaKey}', '"seminarios"') || jsonb_build_object('categoryKey', 'seminarios')
WHERE category = 'seminario';

-- bolsa → bolsas (genérico; casos específicos tratados em PARTE 3)
UPDATE posts
SET category = 'bolsas',
    metadata = jsonb_set(metadata, '{categoriaKey}', '"bolsas"') || jsonb_build_object('categoryKey', 'bolsas')
WHERE category = 'bolsa';

-- ============================================================
-- PARTE 5: Padronização de labels em subcategorias (acentos)
-- Aplica-se a TODOS os posts publicados
-- Usa convert_from(decode('<hex>', 'hex'), 'UTF8') para garantir UTF-8 correto
-- ============================================================

-- Saude → Saúde (hex UTF-8: 5361c3ba6465)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('5361c3ba6465', 'hex'), 'UTF8'),
  'subcategoriaKey', 'saude',
  'subcategoryLabel', convert_from(decode('5361c3ba6465', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' IN ('Saude', 'Sa���de', 'SaA�de');

-- Acadêmica (hex UTF-8: 41636164c3aa6d696361)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('41636164c3aa6d696361', 'hex'), 'UTF8'),
  'subcategoriaKey', 'academica',
  'subcategoryLabel', convert_from(decode('41636164c3aa6d696361', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' IN ('Academica', 'Acad���mica', 'AcadA�mica', 'Acadêmica');

-- Gestão (hex UTF-8: 47657374c3a36f)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('47657374c3a36f', 'hex'), 'UTF8'),
  'subcategoriaKey', 'gestao',
  'subcategoryLabel', convert_from(decode('47657374c3a36f', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' IN ('Gestao', 'Gest���o', 'Gestão');

-- Línguas (hex UTF-8: 4cc3ad6e67756173)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('4cc3ad6e67756173', 'hex'), 'UTF8'),
  'subcategoriaKey', 'linguas',
  'subcategoryLabel', convert_from(decode('4cc3ad6e67756173', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' IN ('Linguas', 'L���nguas', 'LA-nguas', 'Línguas');

-- Comunicação (hex UTF-8: 436f6d756e696361c3a7c3a36f)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('436f6d756e696361c3a7c3a36f', 'hex'), 'UTF8'),
  'subcategoriaKey', 'comunicacao',
  'subcategoryLabel', convert_from(decode('436f6d756e696361c3a7c3a36f', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' IN ('Comunicacao', 'Comunica������o', 'ComunicaA�o', 'Comunicação');

-- Música (hex UTF-8: 4dc3ba73696361)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('4dc3ba73696361', 'hex'), 'UTF8'),
  'subcategoriaKey', 'musica',
  'subcategoryLabel', convert_from(decode('4dc3ba73696361', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' IN ('MA�sica', 'Música');

-- Engenharia Elétrica e de Computação (hex UTF-8 do nome completo)
UPDATE posts
SET metadata = metadata || jsonb_build_object(
  'subcategoria', convert_from(decode('456e67656e686172696120456cc3a97472696361206520646520436f6d70757461c3a7c3a36f', 'hex'), 'UTF8'),
  'subcategoryLabel', convert_from(decode('456e67656e686172696120456cc3a97472696361206520646520436f6d70757461c3a7c3a36f', 'hex'), 'UTF8')
)
WHERE metadata->>'subcategoria' LIKE '%ElActrica%' OR metadata->>'subcategoria' LIKE '%ComputaA�%';

-- ============================================================
-- PARTE 6: Adicionar metadata.link para 8 posts sem URL externa
-- ============================================================

-- IsF-UFG professores bolsistas italiano
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://idiomassemfronteiras.sri.ufg.br/')
WHERE id = 'adfa4f98-6bdb-4b79-a016-33af0b4435f6';

-- MARCA agronomia SRI/UFG
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://sri.ufg.br/n/201395-edital-sri-n-06-2026-mobilidade-marca-agronomia')
WHERE id = '94fd05d7-cb35-4c05-8ef3-29a2e7097e96';

-- PPGEEC/EMC edital 01/2026
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://ppgeec.emc.ufg.br/')
WHERE id = '5c239822-5c46-4002-a40d-ee65573f0995';

-- PPGEcoEvol UFG
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://ecoevol.ufg.br/')
WHERE id = '5817f691-d1a0-486d-82f4-ffff19500be9';

-- PPGEAS edital 002/2026
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://ppgeas.eeca.ufg.br/p/61363-processo-seletivo-aluno-regular-edital-n-002-2026')
WHERE id = 'edd64571-bd7e-4f86-b4b0-4231e2cc2c66';

-- PPGGECON UFG
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://ufg.br/n/200953-ppg-em-geotecnia-estruturas-e-construcao-civil-inscreve-candidatos-a-mestrado-e-doutorado')
WHERE id = '2c436cec-609f-4896-a648-b14e212c2eb7';

-- GTME EMC UFG (Convite Primeiros Socorros)
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://emc.ufg.br/n/200409-convite-do-grupo-de-trabalho-mulheres-nas-engenharias-gtme-emc-ufg')
WHERE id = 'b0a80050-9d70-44ba-b596-01cf77be4664';

-- Projeto Rondon PROEX (já aplicado anteriormente)
UPDATE posts SET metadata = metadata || jsonb_build_object('link', 'https://proex.ufg.br/p/61616-edital-proex-n-15-2026-selecao-de-propostas-de-trabalho-da-ufg-para-a-operacao-carnauba-do-projeto-rondon')
WHERE id = 'a584e695-fac2-4481-be12-768882a1076b';

COMMIT;

-- ============================================================
-- Verificação final
-- ============================================================
SELECT
  (SELECT count(*) FROM posts WHERE status = 'published') AS total_published,
  (SELECT count(*) FROM posts WHERE status = 'closed') AS total_closed,
  (SELECT count(*) FROM posts WHERE status = 'published' AND category IN ('estagio', 'bolsa', 'seminario')) AS cat_inconsistentes,
  (SELECT count(*) FROM posts WHERE status = 'published' AND module = 'eventos' AND (metadata->>'data_evento') IS NOT NULL AND (metadata->>'data_evento') != '' AND metadata->>'data_fim_evento' IS NULL AND (metadata->>'data_evento')::date < CURRENT_DATE) AS eventos_passados_sem_fim,
  (SELECT count(*) FROM posts WHERE status = 'published' AND (metadata->>'link' IS NULL OR metadata->>'link' = '')) AS sem_link;