const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
// Manual integration test: fixed local Docker database only; never a remote connection.
if (!process.argv.includes('--local')) { console.error('Usage: node scripts/test-cadu-post-media-append-cas.js --local'); process.exit(1); }
const DB = 'cadu_integrity_cas_20260908'; const CONTAINER = 'supabase_db_kino-campus';
const args = ['exec','-i',CONTAINER,'psql','-X','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1','-A','-t','-q'];
function sql(code, allowError = false) { const r = spawnSync('docker', args, { input: code, encoding: 'utf8', maxBuffer: 4*1024*1024 }); if (r.status !== 0 && !allowError) throw Error(r.stderr); return r; }
const POST = '00000000-0000-4000-8000-00000000a501'; const RACE = '00000000-0000-4000-8000-00000000a502';
const OWNER = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'; const OTHER = '00000000-0000-4000-8000-00000000a503';
const SESSION = '00000000-0000-4000-8000-00000000a510';
const credentialedFixture = new URL('https://example.test/invalid-userinfo');
credentialedFixture.username = 'fixture-user';
credentialedFixture.password = 'fixture-password';
const js = v => `convert_from(decode('${Buffer.from(JSON.stringify(v)).toString('base64')}','base64'),'UTF8')::jsonb`;
const claims = (sub = OWNER, session_id = SESSION) => `set role authenticated; select set_config('request.jwt.claims',${js({sub,role:'authenticated',session_id,is_anonymous:false})}::text,false);`;
const snap = post => JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from public.post_media m where post_id='${post}';`).stdout.trim());
const invoke = (post, expected, urls) => `select public.kc_cadu_append_post_media('${post}',${js(expected)},array(select jsonb_array_elements_text(${js(urls)})));`;
const parse = output => JSON.parse(output.trim().split('\n').filter(line => line.startsWith('{')).at(-1));
const call = (post, expected, urls, auth = claims()) => sql(auth + invoke(post,expected,urls));
const checks=[];
const check = (name, run) => { run(); checks.push(name); };
function fixture() {
 sql(`begin; set local session_replication_role=replica;
 insert into auth.users(id,aud,role) values ('${OWNER}','authenticated','authenticated'),('${OTHER}','authenticated','authenticated') on conflict do nothing;
 insert into public.profiles(id) values ('${OWNER}'),('${OTHER}') on conflict do nothing;
 insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values ('${SESSION}','${OWNER}',now(),now(),now()+interval '1 hour') on conflict(id) do update set not_after=excluded.not_after;
 delete from public.post_media where post_id in ('${POST}','${RACE}'); delete from public.posts where id in ('${POST}','${RACE}');
 insert into public.posts(id,author_id,title,module,category,status,visibility) values ('${POST}','${OWNER}','Append CAS local fixture','eventos','academicos','published','community'),('${RACE}','${OWNER}','Append race local fixture','eventos','academicos','published','community');
 insert into public.post_media(id,post_id,url,is_cover,sort_order,created_at) values ('00000000-0000-4000-8000-00000000a520','${POST}','https://example.test/cover.jpg',true,7,'2026-09-08T00:00:00.123456Z');
 commit;`);
}
const directory = path.join(__dirname,'../supabase/migrations');
const migrations = fs.readdirSync(directory).filter(name=>name.endsWith('_cadu_post_media_append_cas.sql'));
assert.equal(migrations.length,1);
const migration = path.join(directory,migrations[0]);
assert.equal(sql('select current_database();').stdout.trim(),DB);
sql(fs.readFileSync(migration,'utf8')); fixture();
const initial = snap(POST);
check('invoker, empty search_path and exact execute grants',()=>{
 const p = sql("select prosecdef,proconfig::text,has_function_privilege('anon','public.kc_cadu_append_post_media(uuid,jsonb,text[])','execute'),has_function_privilege('authenticated','public.kc_cadu_append_post_media(uuid,jsonb,text[])','execute'),has_function_privilege('service_role','public.kc_cadu_append_post_media(uuid,jsonb,text[])','execute') from pg_proc where oid='public.kc_cadu_append_post_media(uuid,jsonb,text[])'::regprocedure;").stdout.trim();
 assert.match(p,/^f\|/); assert.match(p,/search_path=/); assert.match(p,/\|f\|t\|f$/);
});
check('canonical active owner appends, preserves exact prior row and microseconds',()=>{
 const result = parse(call(POST,initial,['https://example.test/a.jpg','https://example.test/a.jpg?edition=2']).stdout);
 assert.equal(result.ok,true);assert.equal(result.inserted.length,2);assert.deepEqual(result.inserted.map(r=>r.sort_order),[8,9]);assert.ok(result.inserted.every(r=>r.is_cover===false));
 assert.deepEqual(snap(POST).find(r=>r.id===initial[0].id),initial[0]);
});
check('stale snapshot rejects without mutation',()=>{
 const before=snap(POST);assert.equal(parse(call(POST,initial,['https://example.test/b.jpg']).stdout).code,'MEDIA_EDIT_CONFLICT');assert.deepEqual(snap(POST),before);
});
for(const field of ['id','url','is_cover','sort_order','created_at']) check(`exact CAS rejects changed ${field}`,()=>{
 const before=snap(POST), expected=structuredClone(before);
 expected[0][field] = {id:'00000000-0000-4000-8000-00000000afff',url:'https://example.test/other.jpg',is_cover:!expected[0].is_cover,sort_order:123,created_at:'2026-09-08T00:00:00.123457Z'}[field];
 assert.equal(parse(call(POST,expected,['https://example.test/b.jpg']).stdout).code,'MEDIA_EDIT_CONFLICT');assert.deepEqual(snap(POST),before);
});
for(const [name, auth] of [['anon',"set role anon;"],['service role',"set role service_role;"],['wrong UID',claims(OTHER)],['missing session',claims(OWNER,null)],['forged nonexistent session',claims(OWNER,'00000000-0000-4000-8000-00000000afff')]]) check(`rejects ${name}`,()=>{
 const before=snap(POST);const r=sql(auth+invoke(POST,before,['https://example.test/denied.jpg']),true);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied|active canonical publisher required/);assert.deepEqual(snap(POST),before);
});
check('expired session denied by RPC and RLS',()=>{
 sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${SESSION}';`);
 const r=sql(claims()+invoke(POST,snap(POST),['https://example.test/denied.jpg']),true);assert.notEqual(r.status,0);assert.match(r.stderr,/active canonical publisher required/);
 sql(`update auth.sessions set not_after=now()+interval '1 hour' where id='${SESSION}';`);
});
check('canonical actor cannot append to a different owner',()=>{
 sql(`begin;set local session_replication_role=replica;update public.posts set author_id='${OTHER}' where id='${RACE}';commit;`);
 const r=sql(claims()+invoke(RACE,[],['https://example.test/denied.jpg']),true);assert.notEqual(r.status,0);assert.match(r.stderr,/owned post required/);
 sql(`begin;set local session_replication_role=replica;update public.posts set author_id='${OWNER}' where id='${RACE}';commit;`);
});
for(const invalid of [[],['http://example.test/a'],[credentialedFixture.href],['https://example.test/a','https://example.test/a'],Array.from({length:6},(_,i)=>`https://example.test/${i}.jpg`)]) check('invalid URLs rejected before write',()=>{
 const before=snap(POST);const r=sql(claims()+invoke(POST,before,invalid),true);assert.notEqual(r.status,0);assert.deepEqual(snap(POST),before);
});
check('unique exact constraint remains and append never replaces an existing cover',()=>{
 const before=snap(POST);const result=parse(call(POST,before,[before[0].url]).stdout);assert.equal(result.inserted.length,0);assert.deepEqual(snap(POST),before);
 assert.equal(sql("select count(*) from pg_indexes where schemaname='public' and tablename='post_media' and indexdef like 'CREATE UNIQUE INDEX% (post_id, url)';").stdout.trim(),'1');
});
check('24-row maximum rejects append without truncating rows',()=>{
 sql(`insert into public.post_media(post_id,url,is_cover,sort_order) select '${RACE}','https://example.test/cap-'||n||'.jpg',false,n from generate_series(1,24) as n;`);
 const before=snap(RACE);assert.equal(before.length,24);
 const r=sql(claims()+invoke(RACE,before,['https://example.test/over-cap.jpg']),true);
 assert.notEqual(r.status,0);assert.match(r.stderr,/media cap exceeded/);assert.deepEqual(snap(RACE),before);
 sql(`delete from public.post_media where post_id='${RACE}';`);
});
function asyncSql(code) {return new Promise(resolve=>{const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('close',status=>resolve({status,stdout,stderr}));child.stdin.end(code);});}
(async()=>{
 const base='https://files.cercomp.ufg.br/weby/up/1/l/race.jpg';
 const a=asyncSql('begin;'+claims()+invoke(RACE,[],[base])+"select pg_sleep(1.5);commit;");
 await new Promise(resolve=>setTimeout(resolve,250));
 const b=asyncSql(claims()+invoke(RACE,[],[base.replace('/l/','/o/')]))
 const [ar,br]=await Promise.all([a,b]);assert.equal(ar.status,0,ar.stderr);assert.equal(br.status,0,br.stderr);
 const outcomes=[parse(ar.stdout),parse(br.stdout)];assert.equal(outcomes.filter(x=>x.ok).length,1);assert.equal(outcomes.filter(x=>x.code==='MEDIA_EDIT_CONFLICT').length,1);assert.equal(snap(RACE).length,1);
 checks.push('two real sessions with equivalent URLs: one insert, one stale conflict after parent lock');
 const report={db:DB,productionTouched:false,passed:checks.length,checks};
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
