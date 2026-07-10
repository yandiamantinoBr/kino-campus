-- Reconcile tables that exist in production but were absent from a clean
-- local reset. Existing production rows and counters are preserved.

begin;

create table if not exists public.caronas_locations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  icon text default 'fas fa-map-pin',
  zone_key text not null,
  zone_label text not null,
  aliases text[] not null default '{}'::text[],
  abbreviations text[] default '{}'::text[],
  is_campus boolean default false,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_caronas_loc_zone
  on public.caronas_locations (zone_key);
create index if not exists idx_caronas_loc_usage
  on public.caronas_locations (usage_count desc);

-- Keep the frontend constants and database seed synchronized. Custom locations
-- are intentionally not part of this seed.
with seed_items as (
  select value as item
  from jsonb_array_elements($seed$[{"key":"campus-samambaia","label":"Câmpus Samambaia (Câmpus II)","icon":"fas fa-university","zoneKey":"campus-samambaia","zoneLabel":"Câmpus Samambaia","isCampus":true,"aliases":["campus samambaia","samambaia","campus ii","campus 2","câmpus samambaia","ufg samambaia"],"abbreviations":[]},{"key":"vila-itatiaia","label":"Vila Itatiaia","icon":"fas fa-map-pin","zoneKey":"campus-samambaia","zoneLabel":"Câmpus Samambaia","isCampus":false,"aliases":["itatiaia","vila itatiaia"],"abbreviations":[]},{"key":"sao-judas-tadeu","label":"São Judas Tadeu","icon":"fas fa-map-pin","zoneKey":"campus-samambaia","zoneLabel":"Câmpus Samambaia","isCampus":false,"aliases":["são judas tadeu","são judas","judas tadeu","sao judas"],"abbreviations":[]},{"key":"chacaras-california","label":"Chácaras Califórnia","icon":"fas fa-map-pin","zoneKey":"campus-samambaia","zoneLabel":"Câmpus Samambaia","isCampus":false,"aliases":["chácaras califórnia","chacaras california","califórnia","california"],"abbreviations":[]},{"key":"jardim-pompeia","label":"Jardim Pompéia","icon":"fas fa-map-pin","zoneKey":"campus-samambaia","zoneLabel":"Câmpus Samambaia","isCampus":false,"aliases":["jardim pompéia","jardim pompeia","pompéia","pompeia"],"abbreviations":[]},{"key":"campus-colemar","label":"Câmpus Colemar Natal e Silva","icon":"fas fa-university","zoneKey":"campus-colemar","zoneLabel":"Câmpus Colemar","isCampus":true,"aliases":["campus colemar","colemar","campus i","campus 1","câmpus colemar","praça universitária","praca universitaria"],"abbreviations":[]},{"key":"setor-universitario","label":"Setor Universitário","icon":"fas fa-map-pin","zoneKey":"campus-colemar","zoneLabel":"Câmpus Colemar","isCampus":false,"aliases":["setor universitário","setor universitario","universitário","universitario"],"abbreviations":[]},{"key":"praca-universitaria","label":"Praça Universitária","icon":"fas fa-map-pin","zoneKey":"campus-colemar","zoneLabel":"Câmpus Colemar","isCampus":false,"aliases":["praça universitária","praca universitaria","praça universitaria","praca universitária"],"abbreviations":[]},{"key":"setor-leste-universitario","label":"Setor Leste Universitário","icon":"fas fa-map-pin","zoneKey":"campus-colemar","zoneLabel":"Câmpus Colemar","isCampus":false,"aliases":["setor leste universitário","setor leste universitario","leste universitário","leste universitario"],"abbreviations":[]},{"key":"campus-aparecida","label":"Câmpus Aparecida de Goiânia (FCT)","icon":"fas fa-university","zoneKey":"campus-aparecida","zoneLabel":"Câmpus Aparecida","isCampus":true,"aliases":["campus aparecida","aparecida","fct","câmpus aparecida","aparecida de goiânia","aparecida de goiania"],"abbreviations":["FCT"]},{"key":"campus-goias","label":"Câmpus Goiás (Cidade de Goiás)","icon":"fas fa-university","zoneKey":"campus-goias","zoneLabel":"Câmpus Goiás","isCampus":true,"aliases":["campus goiás","campus goias","cidade de goiás","cidade de goias","goiás velho","goias velho"],"abbreviations":[]},{"key":"campus-cidade-ocidental","label":"Câmpus Cidade Ocidental","icon":"fas fa-university","zoneKey":"campus-cidade-ocidental","zoneLabel":"Câmpus Cidade Ocidental","isCampus":true,"aliases":["campus cidade ocidental","cidade ocidental"],"abbreviations":[]},{"key":"fo-odontologia","label":"Faculdade de Odontologia (FO)","icon":"fas fa-tooth","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["faculdade de odontologia","odontologia","odonto","fo"],"abbreviations":["FO"]},{"key":"evz-veterinaria","label":"Escola de Veterinária e Zootecnia (EVZ)","icon":"fas fa-paw","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["escola de veterinária","veterinária","veterinaria","zootecnia","evz","escola de veterinaria e zootecnia"],"abbreviations":["EVZ"]},{"key":"icb-biologicas","label":"Instituto de Ciências Biológicas (ICB)","icon":"fas fa-dna","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["instituto de ciências biológicas","ciências biológicas","biológicas","biologicas","icb"],"abbreviations":["ICB"]},{"key":"if-fisica","label":"Instituto de Física (IF)","icon":"fas fa-atom","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["instituto de física","instituto de fisica","física","fisica","if ufg"],"abbreviations":["IF"]},{"key":"inf-informatica","label":"Instituto de Informática (INF)","icon":"fas fa-laptop-code","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["instituto de informática","instituto de informatica","informática","informatica","inf","computação","computacao"],"abbreviations":["INF"]},{"key":"fe-educacao","label":"Faculdade de Educação (FE)","icon":"fas fa-chalkboard-teacher","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["faculdade de educação","faculdade de educacao","educação","educacao","fe ufg"],"abbreviations":["FE"]},{"key":"hc-clinicas","label":"Hospital das Clínicas (HC)","icon":"fas fa-hospital","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["hospital das clínicas","hospital das clinicas","hc","hc ufg","hospital ufg"],"abbreviations":["HC"]},{"key":"fen-engenharia","label":"Escola de Engenharia (EMC/EEC/EECA)","icon":"fas fa-cogs","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["escola de engenharia","engenharia","emc","eec","eeca","engenharia civil","engenharia elétrica","engenharia mecânica"],"abbreviations":["EMC","EEC","EECA"]},{"key":"iq-quimica","label":"Instituto de Química (IQ)","icon":"fas fa-flask","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["instituto de química","instituto de quimica","química","quimica","iq"],"abbreviations":["IQ"]},{"key":"imc-matematica","label":"Instituto de Matemática e Estatística (IME)","icon":"fas fa-square-root-alt","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["instituto de matemática","matemática","matematica","estatística","estatistica","ime"],"abbreviations":["IME"]},{"key":"fav-artes","label":"Faculdade de Artes Visuais (FAV)","icon":"fas fa-palette","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["faculdade de artes visuais","artes visuais","artes","fav"],"abbreviations":["FAV"]},{"key":"fl-letras","label":"Faculdade de Letras (FL)","icon":"fas fa-book","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["faculdade de letras","letras","fl ufg"],"abbreviations":["FL"]},{"key":"fd-direito","label":"Faculdade de Direito (FD)","icon":"fas fa-balance-scale","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["faculdade de direito","direito","fd ufg"],"abbreviations":["FD"]},{"key":"face-economia","label":"Faculdade de Administração, Ciências Contábeis e Econômicas (FACE)","icon":"fas fa-chart-line","zoneKey":"unidades-ufg","zoneLabel":"Unidades UFG","isCampus":true,"aliases":["face","administração","administracao","ciências contábeis","contábeis","economia","econômicas"],"abbreviations":["FACE"]},{"key":"centro","label":"Centro / Setor Central","icon":"fas fa-building","zoneKey":"zona-central","zoneLabel":"Zona Central","isCampus":false,"aliases":["centro","setor central","centro de goiânia","centro de goiania"],"abbreviations":[]},{"key":"setor-campinas","label":"Setor Campinas","icon":"fas fa-map-pin","zoneKey":"zona-central","zoneLabel":"Zona Central","isCampus":false,"aliases":["setor campinas","campinas"],"abbreviations":[]},{"key":"setor-oeste","label":"Setor Oeste","icon":"fas fa-map-pin","zoneKey":"zona-central","zoneLabel":"Zona Central","isCampus":false,"aliases":["setor oeste","oeste"],"abbreviations":[]},{"key":"setor-aeroporto","label":"Setor Aeroporto","icon":"fas fa-plane","zoneKey":"zona-central","zoneLabel":"Zona Central","isCampus":false,"aliases":["setor aeroporto","aeroporto","aeroporto de goiânia","aeroporto santa genoveva"],"abbreviations":[]},{"key":"setor-coimbra","label":"Setor Coimbra","icon":"fas fa-map-pin","zoneKey":"zona-central","zoneLabel":"Zona Central","isCampus":false,"aliases":["setor coimbra","coimbra"],"abbreviations":[]},{"key":"setor-bueno","label":"Setor Bueno","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["setor bueno","bueno","bairro bueno"],"abbreviations":[]},{"key":"setor-marista","label":"Setor Marista","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["setor marista","marista"],"abbreviations":[]},{"key":"jardim-goias","label":"Jardim Goiás","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["jardim goiás","jardim goias","jd goiás","jd goias"],"abbreviations":[]},{"key":"setor-nova-suica","label":"Setor Nova Suíça","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["setor nova suíça","setor nova suica","nova suíça","nova suica"],"abbreviations":[]},{"key":"jardim-america","label":"Jardim América","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["jardim américa","jardim america","jd américa","jd america"],"abbreviations":[]},{"key":"setor-pedro-ludovico","label":"Setor Pedro Ludovico","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["setor pedro ludovico","pedro ludovico"],"abbreviations":[]},{"key":"parque-amazonia","label":"Parque Amazônia","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["parque amazônia","parque amazonia","amazônia","amazonia"],"abbreviations":[]},{"key":"setor-sul","label":"Setor Sul","icon":"fas fa-map-pin","zoneKey":"zona-sul","zoneLabel":"Zona Sul","isCampus":false,"aliases":["setor sul","sul"],"abbreviations":[]},{"key":"setor-norte-ferroviario","label":"Setor Norte Ferroviário","icon":"fas fa-map-pin","zoneKey":"zona-norte","zoneLabel":"Zona Norte","isCampus":false,"aliases":["setor norte ferroviário","setor norte ferroviario","norte ferroviário","norte ferroviario"],"abbreviations":[]},{"key":"goiania-2","label":"Goiânia 2","icon":"fas fa-map-pin","zoneKey":"zona-norte","zoneLabel":"Zona Norte","isCampus":false,"aliases":["goiânia 2","goiania 2","goiânia dois"],"abbreviations":[]},{"key":"jardim-guanabara","label":"Jardim Guanabara","icon":"fas fa-map-pin","zoneKey":"zona-norte","zoneLabel":"Zona Norte","isCampus":false,"aliases":["jardim guanabara","guanabara","jd guanabara"],"abbreviations":[]},{"key":"setor-leste-vila-nova","label":"Setor Leste Vila Nova","icon":"fas fa-map-pin","zoneKey":"zona-leste","zoneLabel":"Zona Leste","isCampus":false,"aliases":["setor leste vila nova","leste vila nova","vila nova"],"abbreviations":[]},{"key":"vila-mutirao","label":"Vila Mutirão","icon":"fas fa-map-pin","zoneKey":"zona-leste","zoneLabel":"Zona Leste","isCampus":false,"aliases":["vila mutirão","vila mutirao","mutirão","mutirao"],"abbreviations":[]},{"key":"jardim-novo-mundo","label":"Jardim Novo Mundo","icon":"fas fa-map-pin","zoneKey":"zona-leste","zoneLabel":"Zona Leste","isCampus":false,"aliases":["jardim novo mundo","novo mundo","jd novo mundo"],"abbreviations":[]},{"key":"setor-bela-vista","label":"Setor Bela Vista","icon":"fas fa-map-pin","zoneKey":"zona-oeste","zoneLabel":"Zona Oeste","isCampus":false,"aliases":["setor bela vista","bela vista"],"abbreviations":[]},{"key":"cidade-jardim","label":"Cidade Jardim","icon":"fas fa-map-pin","zoneKey":"zona-oeste","zoneLabel":"Zona Oeste","isCampus":false,"aliases":["cidade jardim"],"abbreviations":[]},{"key":"setor-gentil-meireles","label":"Setor Gentil Meireles","icon":"fas fa-map-pin","zoneKey":"zona-oeste","zoneLabel":"Zona Oeste","isCampus":false,"aliases":["setor gentil meireles","gentil meireles"],"abbreviations":[]},{"key":"terminal-bandeiras","label":"Terminal Bandeiras","icon":"fas fa-bus","zoneKey":"terminais","zoneLabel":"Terminais","isCampus":false,"aliases":["terminal bandeiras","bandeiras","t. bandeiras"],"abbreviations":[]},{"key":"terminal-prainha","label":"Terminal Prainha","icon":"fas fa-bus","zoneKey":"terminais","zoneLabel":"Terminais","isCampus":false,"aliases":["terminal prainha","prainha","t. prainha"],"abbreviations":[]},{"key":"terminal-isidoria","label":"Terminal Isidória","icon":"fas fa-bus","zoneKey":"terminais","zoneLabel":"Terminais","isCampus":false,"aliases":["terminal isidória","terminal isidoria","isidória","isidoria","t. isidória"],"abbreviations":[]},{"key":"terminal-padre-pelagio","label":"Terminal Padre Pelágio","icon":"fas fa-bus","zoneKey":"terminais","zoneLabel":"Terminais","isCampus":false,"aliases":["terminal padre pelágio","terminal padre pelagio","padre pelágio","padre pelagio","t. padre pelágio"],"abbreviations":[]},{"key":"terminal-recanto-do-bosque","label":"Terminal Recanto do Bosque","icon":"fas fa-bus","zoneKey":"terminais","zoneLabel":"Terminais","isCampus":false,"aliases":["terminal recanto do bosque","recanto do bosque","t. recanto"],"abbreviations":[]},{"key":"rodoviaria-goiania","label":"Rodoviária de Goiânia","icon":"fas fa-bus-alt","zoneKey":"terminais","zoneLabel":"Terminais","isCampus":false,"aliases":["rodoviária de goiânia","rodoviária","rodoviaria","rodoviaria de goiania","terminal rodoviário"],"abbreviations":[]},{"key":"aparecida-centro","label":"Centro de Aparecida","icon":"fas fa-map-pin","zoneKey":"aparecida-goiania","zoneLabel":"Aparecida de Goiânia","isCampus":false,"aliases":["centro de aparecida","aparecida centro","centro aparecida"],"abbreviations":[]},{"key":"cidade-livre","label":"Cidade Livre","icon":"fas fa-map-pin","zoneKey":"aparecida-goiania","zoneLabel":"Aparecida de Goiânia","isCampus":false,"aliases":["cidade livre"],"abbreviations":[]},{"key":"garavelo","label":"Garavelo","icon":"fas fa-map-pin","zoneKey":"aparecida-goiania","zoneLabel":"Aparecida de Goiânia","isCampus":false,"aliases":["garavelo","garavelo park"],"abbreviations":[]}]$seed$::jsonb)
)
insert into public.caronas_locations (
  key,
  label,
  icon,
  zone_key,
  zone_label,
  aliases,
  abbreviations,
  is_campus
)
select
  item->>'key',
  item->>'label',
  coalesce(item->>'icon', 'fas fa-map-pin'),
  item->>'zoneKey',
  item->>'zoneLabel',
  array(select jsonb_array_elements_text(coalesce(item->'aliases', '[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(item->'abbreviations', '[]'::jsonb))),
  coalesce((item->>'isCampus')::boolean, false)
from seed_items
on conflict (key) do nothing;

alter table public.caronas_locations enable row level security;

drop policy if exists "Leitura pública de localizações" on public.caronas_locations;
drop policy if exists caronas_locations_select_public on public.caronas_locations;
create policy caronas_locations_select_public
  on public.caronas_locations
  for select to anon, authenticated
  using (true);

revoke all on table public.caronas_locations from public, anon, authenticated;
grant select on public.caronas_locations to anon, authenticated;
grant all on table public.caronas_locations to service_role;

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

create or replace function kc_private.kc_increment_location_usage(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.caronas_locations
  set usage_count = usage_count + 1,
      updated_at = now()
  where key = p_key;
end;
$$;

create or replace function kc_private.kc_upsert_custom_location(p_key text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key !~ '^custom-[a-z0-9][a-z0-9-]{0,120}$'
     or length(trim(coalesce(p_label, ''))) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOM_LOCATION';
  end if;

  insert into public.caronas_locations as locations (
    key,
    label,
    icon,
    zone_key,
    zone_label,
    aliases,
    usage_count
  )
  values (
    p_key,
    trim(p_label),
    'fas fa-map-pin',
    'custom',
    'Locais Personalizados',
    array[lower(trim(p_label))],
    1
  )
  on conflict (key) do update
    set usage_count = locations.usage_count + 1,
        updated_at = now();
end;
$$;

create or replace function public.kc_increment_location_usage(p_key text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_increment_location_usage($1)
$$;

create or replace function public.kc_upsert_custom_location(p_key text, p_label text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_upsert_custom_location($1, $2)
$$;

revoke all on function kc_private.kc_increment_location_usage(text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_increment_location_usage(text)
  to authenticated, service_role;

revoke all on function kc_private.kc_upsert_custom_location(text, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_upsert_custom_location(text, text)
  to authenticated, service_role;

revoke all on function public.kc_increment_location_usage(text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_increment_location_usage(text)
  to authenticated, service_role;

revoke all on function public.kc_upsert_custom_location(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_upsert_custom_location(text, text)
  to authenticated, service_role;

create table if not exists public.kc_unit_meta (
  unit_id text primary key,
  tier smallint check (tier >= 1 and tier <= 3),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  source text not null default 'admin-ui'
);

create index if not exists idx_kc_unit_meta_tier
  on public.kc_unit_meta (tier) where tier is not null;
create index if not exists idx_kc_unit_meta_updated_by
  on public.kc_unit_meta (updated_by) where updated_by is not null;

create or replace function public.kc_unit_meta_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kc_unit_meta_touch on public.kc_unit_meta;
create trigger kc_unit_meta_touch
  before update on public.kc_unit_meta
  for each row execute function public.kc_unit_meta_touch();

alter table public.kc_unit_meta enable row level security;

drop policy if exists "anyone can read kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can insert kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can update kc_unit_meta" on public.kc_unit_meta;
drop policy if exists "admins can delete kc_unit_meta" on public.kc_unit_meta;
drop policy if exists kc_unit_meta_select_public on public.kc_unit_meta;
drop policy if exists kc_unit_meta_insert_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_update_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_delete_admin on public.kc_unit_meta;

create policy kc_unit_meta_select_public
  on public.kc_unit_meta
  for select to anon, authenticated
  using (true);
create policy kc_unit_meta_insert_admin
  on public.kc_unit_meta
  for insert to authenticated
  with check (public.kc_is_admin((select auth.uid())));
create policy kc_unit_meta_update_admin
  on public.kc_unit_meta
  for update to authenticated
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));
create policy kc_unit_meta_delete_admin
  on public.kc_unit_meta
  for delete to authenticated
  using (public.kc_is_admin((select auth.uid())));

revoke all on table public.kc_unit_meta from public, anon, authenticated;
grant select on public.kc_unit_meta to anon;
grant select, delete on public.kc_unit_meta to authenticated;
grant insert (unit_id, tier, note, updated_by, source)
  on public.kc_unit_meta to authenticated;
grant update (tier, note, updated_by, source)
  on public.kc_unit_meta to authenticated;
grant all on table public.kc_unit_meta to service_role;

revoke all on function public.kc_unit_meta_touch()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_unit_meta_touch() to service_role;

comment on table public.caronas_locations is
  'Catalogo canonico e contadores de uso de locais do modulo de caronas.';
comment on table public.kc_unit_meta is
  'Overrides editaveis de tier e notas das fontes UFG usadas pelo Cadu.';

commit;
