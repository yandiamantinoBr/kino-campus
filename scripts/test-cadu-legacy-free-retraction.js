// Requires a disposable local Supabase database cloned from the existing local
// test schema. No production connection, URL, token, or database override exists.
'use strict';
const {spawnSync,spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const DB='cadu_legacy_free_retraction_20260908',CONTAINER='supabase_db_kino-campus';
const OWNER='2345582d-8bf7-4393-aa0d-f9953d0e02ca',POST='00000000-0000-4000-8000-00000000c701';
const PRIMARY='https://fanut.ufg.br/n/200351',OFFICIAL='https://ufg.br/e/39235-gimon-2026-global-insights-in-microbiome-obesity-nutrition-conference';
const EXCERPT='As inscrições já estão abertas na plataforma Even3, com valores promocionais de acordo com o lote vigente e categorias diferenciadas para estudantes de graduação, pós-graduação e profissionais.';
const FIELDS=['id','author_id','created_at','title','description','price','location','module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
const cli=['exec','-i',CONTAINER,'psql','-X','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1','-A','-t','-q'];
function sql(input,allowError=false){const r=spawnSync('docker',cli,{input,encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0&&!allowError)throw Error(r.stderr.slice(-2000));return r;}
const j=x=>`convert_from(decode('${Buffer.from(JSON.stringify(x)).toString('base64')}','base64'),'UTF8')::jsonb`;
const parse=r=>JSON.parse(r.stdout.trim().split('\n').find(x=>x.startsWith('{')));
const role="set role service_role; set request.jwt.claim.role='service_role'; set request.jwt.claims='{\"role\":\"service_role\"}';";
const call=(request,actor=OWNER)=>`${role} select public.kc_cadu_retract_legacy_free_claim('${POST}','${actor}',${j(request)});`;
function initial(){return {id:POST,author_id:OWNER,created_at:'2026-06-03T12:08:55.688477Z',updated_at:'2026-09-06T08:23:42.922822Z',title:'GIMON 2026',description:'Inscrições na plataforma Even3, com valores por lote e categorias especiais.',price:0,location:'Goiânia',module:'eventos',category:'palestras',status:'published',visibility:'public',image_url:'https://example.test/one.png',expires_at:'2099-09-28T02:59:59.999Z',metadata:{source_id:'',source_url:PRIMARY,source_registry_id:'web.ufg.portal',gratuito:true,merged_sources:[{source_url:OFFICIAL}],dates:{eventStartsAt:'2099-09-25',eventEndsAt:'2099-09-27'},manual_data_corrections:[{operation:'preserve_me'}],custom:{untouched:true}}};}
const media=[{id:'00000000-0000-4000-8000-00000000c720',post_id:POST,url:'https://example.test/one.png',is_cover:true,sort_order:0,created_at:'2026-06-03T12:08:55.123456Z'},{id:'00000000-0000-4000-8000-00000000c721',post_id:POST,url:'https://example.test/two.png',is_cover:false,sort_order:1,created_at:'2026-06-03T12:08:55.654321Z'}];
function readback(){return parse(sql(`select jsonb_build_object('post',(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(p)) where key=any(array[${FIELDS.map(x=>`'${x}'`).join(',')}])), 'media',(select jsonb_agg(to_jsonb(m) order by sort_order,id) from public.post_media m where post_id=p.id),'audits',(select count(*) from public.audit_log where entity_id=p.id and action='cadu_legacy_free_claim_retracted')) from public.posts p where id='${POST}';`));}
function fixture(edit=()=>{}){
 const post=initial();edit(post);
 sql(`begin;set local session_replication_role=replica;delete from public.audit_log where entity_id='${POST}';delete from public.post_media where post_id='${POST}';delete from public.posts where id='${POST}';insert into public.profiles(id) values('${OWNER}') on conflict do nothing;insert into public.kc_trusted_publishers(user_id) values('${OWNER}') on conflict do nothing;insert into public.posts(${FIELDS.join(',')}) select ${FIELDS.join(',')} from jsonb_populate_record(null::public.posts,${j(post)});insert into public.post_media select * from jsonb_populate_recordset(null::public.post_media,${j(media)});commit;`);
 // Establish a realistic steady state using this schema's real category
 // normalization trigger before taking the caller's CAS snapshot.
 sql(`update public.posts set metadata=metadata where id='${POST}';`);
 const before=readback();return {contract:'cadu-legacy-free-retraction-v1',operationId:'00000000-0000-4000-8000-00000000c710',expected:before.post,expectedMedia:before.media,evidence:{primaryUrl:PRIMARY,primaryAccess:'unavailable_not_fetched',corroboratingUrl:OFFICIAL,corroboratingSha256:'a'.repeat(64),capturedAt:new Date().toISOString(),officialExcerpt:EXCERPT,postExcerpt:'com valores por lote e categorias especiais',relationship:'existing_alias_and_internal_contradiction',primaryIdentityPreserved:true}};
}
function asyncSql(input){return new Promise(resolve=>{const child=spawn('docker',cli,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('close',status=>resolve({status,stdout,stderr}));child.stdin.end(input);});}
(async()=>{
 assert.equal(process.argv[2],'--local-disposable','Explicit local database test invocation required');
 const endpoint=spawnSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'});
 assert.equal(endpoint.status,0);assert.match(endpoint.stdout.trim(),/^npipe:\/\/\/\/\.\/pipe\/dockerDesktopLinuxEngine$/,'Only the verified local Docker Desktop engine is allowed');
 assert.equal(sql('select current_database();').stdout.trim(),DB);
 sql(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20260908134449_cadu_legacy_free_retraction_cas.sql'),'utf8'));
 const checks=[];
 let req=fixture(),before=readback(),success=parse(sql(call(req))),after=readback();
 assert.equal(success.code,'LEGACY_FREE_RETRACTED');assert.equal(after.audits,1);assert.deepEqual(after.media,before.media);
 const meta=structuredClone(after.post.metadata),history=meta.cadu_legacy_free_retraction_history;delete meta.cadu_legacy_free_retraction_history;
 assert.deepEqual(meta,{...before.post.metadata,gratuito:false});assert.equal(history.length,1);
 assert.deepEqual({...after.post,price:0,metadata:before.post.metadata,updated_at:before.post.updated_at},before.post);
 checks.push('actual triggers preserve all other post facts, identity, dates, histories and six media columns');
 assert.equal(parse(sql(call(req))).code,'EDIT_CONFLICT');assert.deepEqual(readback(),after);checks.push('exact replay creates no second effect or audit');
 for(const roleName of ['anon','authenticated']){const r=sql(`set role ${roleName}; select public.kc_cadu_retract_legacy_free_claim('${POST}','${OWNER}','{}');`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/);checks.push(`${roleName} cannot call the RPC`);}
 req=fixture();assert.notEqual(sql(call(req,'00000000-0000-4000-8000-00000000c799'),true).status,0);checks.push('untrusted actor denied');
 for(const [name,change] of [
  ['microsecond CAS',r=>{r.expected.updated_at=r.expected.updated_at.replace(/\.(\d{6})/,(_,fraction)=>'.'+String(Number(fraction)+(fraction==='999999'?-1:1)).padStart(6,'0'));}],
  ['metadata CAS',r=>{r.expected.metadata.custom.untouched=false;}],
  ['media timestamp CAS',r=>{r.expectedMedia[0].created_at='2026-06-03T12:08:55.123457Z';}],
  ['media removal CAS',r=>{r.expectedMedia.pop();}],
 ]){req=fixture();before=readback();change(req);assert.equal(parse(sql(call(req))).code,'EDIT_CONFLICT');assert.deepEqual(readback(),before);checks.push(name);}
 for(const [name,change] of [
  ['arbitrary patch',r=>{r.patch={price:12};}],['missing snapshot',r=>{delete r.expected.image_url;}],
  ['false primary capture',r=>{r.evidence.primaryAccess='fetched';}],['invented excerpt',r=>{r.evidence.postExcerpt='com valores por lote e informação inventada';}],
  ['old evidence',r=>{r.evidence.capturedAt='2020-01-01T00:00:00.000Z';}],['duplicate media',r=>{r.expectedMedia.push(r.expectedMedia[0]);}],
 ]){req=fixture();before=readback();change(req);assert.notEqual(sql(call(req),true).status,0);assert.deepEqual(readback(),before);checks.push(name+' rejected atomically');}
 req=fixture();
 sql(`begin;set local session_replication_role=replica;update public.posts set metadata=metadata-'categoryLabel' where id='${POST}';commit;`);
 before=readback();req.expected=before.post;
 const sideEffect=sql(call(req),true);assert.notEqual(sideEffect.status,0);assert.match(sideEffect.stderr,/unrelated post or media change/);assert.deepEqual(readback(),before);
 checks.push('unrelated normalization trigger side effect rolls back the whole operation');
 for(const [name,table,event,condition,target] of [
  ['post AFTER trigger','posts','update',`old.id='${POST}'::uuid and old.price=0 and new.price is null`,'new.id'],
  ['audit AFTER trigger','audit_log','insert',`new.entity_id='${POST}'::uuid and new.action='cadu_legacy_free_claim_retracted'`,'new.entity_id'],
 ]){
  req=fixture();before=readback();
  const counter=sql(`begin;create function public.cadu_local_after_probe() returns trigger language plpgsql as $$begin update public.posts set title=title||' [unexpected AFTER write]' where id=${target};return new;end$$;create trigger cadu_local_after_probe after ${event} on public.${table} for each row when(${condition}) execute function public.cadu_local_after_probe();${call(req)}rollback;`,true);
  assert.notEqual(counter.status,0);assert.match(counter.stderr,/unrelated post or media change/);assert.deepEqual(readback(),before);
  assert.equal(sql("select to_regprocedure('public.cadu_local_after_probe()') is null;").stdout.trim(),'t');
  checks.push(name+' side effect detected from post-write reread; complete rollback verified');
 }
 for(const [name,edit] of [['source rebind',p=>{p.metadata.source_id='invented';}],['missing alias',p=>{p.metadata.merged_sources=[];}],['manual lock',p=>{p.metadata.manual_edits_lock=true;}],['closed post',p=>{p.status='closed';}],['malformed history',p=>{p.metadata.cadu_legacy_free_retraction_history=[1];}]]){req=fixture(edit);before=readback();assert.notEqual(sql(call(req),true).status,0);assert.deepEqual(readback(),before);checks.push(name+' denied');}
 req=fixture();
 const first=asyncSql(`begin;${call(req)}select pg_sleep(1);commit;`);await new Promise(r=>setTimeout(r,200));
 const second=asyncSql(call(req));const [a,b]=await Promise.all([first,second]);assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);assert.equal(parse(a).ok,true);assert.equal(parse(b).code,'EDIT_CONFLICT');assert.equal(readback().audits,1);checks.push('concurrent same-operation workers commit once');
 req=fixture(p=>{p.expires_at=new Date(Date.now()+1800).toISOString();});before=readback();
 const lock=asyncSql(`begin;select id from public.posts where id='${POST}' for update;select pg_sleep(2.5);commit;`);await new Promise(r=>setTimeout(r,200));
 const late=await asyncSql(call(req));await lock;assert.equal(late.status,0,late.stderr);assert.equal(parse(late).code,'LEGACY_FREE_RETRACTION_EXPIRED');assert.deepEqual(readback(),before);checks.push('fresh wall clock after row lock prevents expiry races');
 req=fixture();before=readback();
 const otherMedia=asyncSql(`begin;update public.post_media set sort_order=8 where id='${media[1].id}';select pg_sleep(1);commit;`);await new Promise(r=>setTimeout(r,200));
 const raced=await asyncSql(call(req));await otherMedia;assert.equal(raced.status,0,raced.stderr);assert.equal(parse(raced).code,'EDIT_CONFLICT');assert.deepEqual(readback().post,before.post);assert.equal(readback().audits,0);checks.push('concurrent media-only change rejects before post mutation');
 console.log(JSON.stringify({passed:checks.length,checks,database:DB,productionTouched:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
