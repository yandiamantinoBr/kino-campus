// Fixed, disposable local DB only. No production URL/token or DB override.
'use strict';
const {spawnSync,spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const DB='cadu_unity_quarantine_20260908',CONTAINER='supabase_db_kino-campus';
const OWNER='2345582d-8bf7-4393-aa0d-f9953d0e02ca',POST='00000000-0000-4000-8000-00000000d701';
const OTHER='00000000-0000-4000-8000-00000000d799',HISTORY='cadu_source_conflict_quarantine_history';
const evidence=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../supabase/functions/cadu-publish/fixtures/unity-source-conflict.json'),'utf8'));
const FIELDS=['id','author_id','created_at','title','description','price','location','module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
const cli=['exec','-i',CONTAINER,'psql','-X','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1','-A','-t','-q'];
function sql(input,allowError=false){const r=spawnSync('docker',cli,{input,encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0&&!allowError)throw Error(r.stderr.slice(-2400));return r;}
const j=x=>`convert_from(decode('${Buffer.from(JSON.stringify(x)).toString('base64')}','base64'),'UTF8')::jsonb`;
const parse=r=>JSON.parse(r.stdout.trim().split('\n').find(x=>x.startsWith('{')));
const role="set role service_role; set request.jwt.claim.role='service_role'; set request.jwt.claims='{\"role\":\"service_role\"}';";
const call=(request,actor=OWNER)=>`${role} select public.kc_cadu_quarantine_source_conflict('${POST}','${actor}',${j(request)});`;
function initial(){return {id:POST,author_id:OWNER,created_at:'2026-09-08T14:09:34.123456Z',updated_at:'2026-09-08T14:11:00.123456Z',
 title:'Fundamentos do Unity3D para o Desenvolvimento de Aplicações',description:'Descrição publicada preservada; fonte com cronogramas contraditórios.',price:0,location:'EMC UFG',
 module:'eventos',category:'cursos',status:'published',visibility:'public',image_url:'https://example.test/cover.png',expires_at:'2026-10-09T02:59:59.999Z',
 metadata:{source_id:evidence.sourceId,source_url:evidence.sourceUrl,source_registry_id:'web.ufg.emc',source_revision:evidence.sourceRevision,source_title:'Fundamentos do Unity3D para o Desenvolvimento de Aplicações',cadu_run_id:evidence.sourceRunId,
 dates:{eventStartsAt:'2026-09-08',eventEndsAt:'2026-10-08'},gratuito:true,custom:{untouched:true},manual_data_corrections:[{operation:'keep'}]}};}
const media=[{id:'00000000-0000-4000-8000-00000000d720',post_id:POST,url:'https://example.test/cover.png',is_cover:true,sort_order:0,created_at:'2026-09-08T14:09:35.123456Z'},
 {id:'00000000-0000-4000-8000-00000000d721',post_id:POST,url:'https://example.test/two.png',is_cover:false,sort_order:1,created_at:'2026-09-08T14:11:01.654321Z'}];
function readback(){return parse(sql(`select jsonb_build_object('post',(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(p)) where key=any(array[${FIELDS.map(x=>`'${x}'`).join(',')}])), 'fullPost',to_jsonb(p),'media',(select jsonb_agg(to_jsonb(m) order by sort_order,id) from public.post_media m where post_id=p.id),'audits',(select count(*) from public.audit_log where entity_id=p.id and action='cadu_source_conflict_quarantined')) from public.posts p where id='${POST}';`));}
function fixture(edit=()=>{}){
 const post=initial();edit(post);
 sql(`begin;set local session_replication_role=replica;delete from public.audit_log where entity_id='${POST}';delete from public.post_media where post_id='${POST}';delete from public.posts where id='${POST}';insert into public.profiles(id) values('${OWNER}'),('${OTHER}') on conflict do nothing;insert into public.kc_trusted_publishers(user_id) values('${OWNER}'),('${OTHER}') on conflict do nothing;insert into public.posts(${FIELDS.join(',')}) select ${FIELDS.join(',')} from jsonb_populate_record(null::public.posts,${j(post)});insert into public.post_media select * from jsonb_populate_recordset(null::public.post_media,${j(media)});commit;`);
 sql(`update public.posts set metadata=metadata where id='${POST}';`);
 const before=readback();return {contract:'cadu-source-conflict-quarantine-v1',operationId:'00000000-0000-4000-8000-00000000d710',expected:before.post,expectedMedia:before.media,evidence:structuredClone(evidence)};
}
function asyncSql(input){return new Promise(resolve=>{const child=spawn('docker',cli,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('close',status=>resolve({status,stdout,stderr}));child.stdin.end(input);});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 assert.equal(process.argv[2],'--local-disposable','Explicit local database test invocation required');
 const endpoint=spawnSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'});
 assert.equal(endpoint.status,0);assert.match(endpoint.stdout.trim(),/^npipe:\/\/\/\/\.\/pipe\/dockerDesktopLinuxEngine$/);
 assert.equal(sql('select current_database();').stdout.trim(),DB);
 if(process.argv.includes('--red-baseline')){
  const req=fixture(),before=readback(),r=sql(call(req),true);assert.notEqual(r.status,0);assert.match(r.stderr,/function public.kc_cadu_quarantine_source_conflict.*does not exist/);
  assert.deepEqual(readback(),before);console.log(JSON.stringify({baseline:'RED',reason:'canonical quarantine RPC absent',database:DB,productionTouched:false}));return;
 }
 sql(fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20260908155638_cadu_unity_source_quarantine.sql'),'utf8'));
 const checks=[];let req=fixture(),before=readback(),result=parse(sql(call(req))),after=readback();
 assert.equal(result.code,'SOURCE_CONFLICT_QUARANTINED');assert.equal(after.audits,1);assert.deepEqual(after.media,before.media);
 const metadata=structuredClone(after.post.metadata),history=metadata[HISTORY];delete metadata[HISTORY];assert.deepEqual(metadata,before.post.metadata);
 assert.equal(history.length,1);assert.deepEqual(history[0].evidence,evidence);assert.deepEqual(history[0].before,{post:before.post,post_media:before.media});
 assert.deepEqual({...after.fullPost,status:'published',updated_at:before.fullPost.updated_at,metadata:before.post.metadata},before.fullPost);
 checks.push('real triggers: only published to hidden and appended history, full post and media otherwise intact');
 assert.equal(parse(sql(call(req))).code,'EDIT_CONFLICT');assert.deepEqual(readback(),after);checks.push('exact replay has no second write or audit');
 req.expected=after.post;assert.equal(parse(sql(call(req))).code,'EDIT_CONFLICT');assert.deepEqual(readback(),after);checks.push('same operation with refreshed snapshot cannot repeat');
 req.operationId='00000000-0000-4000-8000-00000000d711';assert.notEqual(sql(call(req),true).status,0);assert.deepEqual(readback(),after);checks.push('new operation never reactivates hidden post');
 for(const roleName of ['anon','authenticated']){const r=sql(`set role ${roleName};select public.kc_cadu_quarantine_source_conflict('${POST}','${OWNER}','{}');`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/);checks.push(`${roleName} lacks RPC privilege`);}
 req=fixture();before=readback();for(const actor of [OTHER,'00000000-0000-4000-8000-00000000d798']){assert.notEqual(sql(call(req,actor),true).status,0);assert.deepEqual(readback(),before);}checks.push('trusted wrong owner and untrusted actor denied');
 for(const [name,edit] of [
  ['microsecond post CAS',r=>{r.expected.updated_at=r.expected.updated_at.replace(/\.(\d{6})/,(_,f)=>'.'+String(Number(f)+(f==='999999'?-1:1)).padStart(6,'0'));}],
  ['metadata CAS',r=>{r.expected.metadata.custom.untouched=false;}],['price type CAS',r=>{r.expected.price='0';}],
  ['media micros CAS',r=>{r.expectedMedia[0].created_at='2026-09-08T14:09:35.123457Z';}],['media removed CAS',r=>{r.expectedMedia.pop();}],
 ]){req=fixture();before=readback();edit(req);assert.equal(parse(sql(call(req))).code,'EDIT_CONFLICT');assert.deepEqual(readback(),before);checks.push(name);}
 for(const [name,edit] of [
  ['arbitrary patch',r=>{r.patch={status:'published'};}],['inverse',r=>{r.operation='rollback';}],['missing snapshot',r=>{delete r.expected.image_url;}],
  ['fake refetch',r=>{r.evidence.primaryAccess='fetched_fresh';}],['new source',r=>{r.evidence.sourceUrl+='?changed';}],
  ['changed text',r=>{r.evidence.sourceText+=' Retificação';}],['array text',r=>{r.evidence.sourceText=[r.evidence.sourceText];}],
  ['array operation ID',r=>{r.operationId=[r.operationId];}],['duplicate media',r=>{r.expectedMedia.push(r.expectedMedia[0]);}],
  ['media array entry',r=>{r.expectedMedia=[[]];}],['media bool string',r=>{r.expectedMedia[0].is_cover='true';}],
 ]){req=fixture();before=readback();edit(req);assert.notEqual(sql(call(req),true).status,0);assert.deepEqual(readback(),before);checks.push(name+' rejected without effect');}
 for(const [name,edit] of [
  ['source rebind',p=>{p.metadata.source_id='invented';}],['new revision',p=>{p.metadata.source_revision='a'.repeat(64);}],
  ['new run',p=>{p.metadata.cadu_run_id=POST;}],['other registry',p=>{p.metadata.source_registry_id='web.ufg.portal';}],
  ['manual lock',p=>{p.metadata.manual_edits_lock=true;}],['closed status',p=>{p.status='closed';}],['tombstone',p=>{p.metadata.merged_into_post_id=OTHER;}],
  ['malformed history',p=>{p.metadata[HISTORY]=[1];}],
 ]){req=fixture(edit);before=readback();assert.notEqual(sql(call(req),true).status,0);assert.deepEqual(readback(),before);checks.push(name+' rejected');}
 for(const [name,table,event,condition,statement,match] of [
  ['post AFTER','posts','update',`old.id='${POST}'::uuid and old.status='published' and new.status='hidden'`,`update public.posts set title=title||' unexpected' where id=new.id;`,'unrelated post or media change'],
  ['audit AFTER','audit_log','insert',`new.entity_id='${POST}'::uuid and new.action='cadu_source_conflict_quarantined'`,`update public.posts set moderation_reason='unexpected' where id=new.entity_id;`,'unrelated post or media change'],
  ['media AFTER','audit_log','insert',`new.entity_id='${POST}'::uuid and new.action='cadu_source_conflict_quarantined'`,`update public.post_media set sort_order=9 where id='${media[1].id}';`,'unrelated post or media change'],
  ['audit failure','audit_log','insert',`new.entity_id='${POST}'::uuid and new.action='cadu_source_conflict_quarantined'`,`raise exception 'local audit failure';`,'local audit failure'],
 ]){
  req=fixture();before=readback();const r=sql(`begin;create function public.cadu_local_quarantine_probe() returns trigger language plpgsql as $$begin ${statement}return new;end$$;create trigger cadu_local_quarantine_probe after ${event} on public.${table} for each row when(${condition}) execute function public.cadu_local_quarantine_probe();${call(req)}rollback;`,true);
  assert.notEqual(r.status,0);assert(r.stderr.includes(match),r.stderr);assert.deepEqual(readback(),before);assert.equal(sql("select to_regprocedure('public.cadu_local_quarantine_probe()') is null;").stdout.trim(),'t');checks.push(name+' causes complete rollback');
 }
 req=fixture();const first=asyncSql(`begin;${call(req)}select pg_sleep(1);commit;`);await pause(200);const second=asyncSql(call(req));const [a,b]=await Promise.all([first,second]);assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);assert.equal(parse(a).ok,true);assert.equal(parse(b).code,'EDIT_CONFLICT');assert.equal(readback().audits,1);checks.push('concurrent workers commit one operation');
 req=fixture(p=>{p.expires_at=new Date(Date.now()+700).toISOString();});before=readback();const started=Date.now();
 const lock=asyncSql(`begin;select id from public.posts where id='${POST}' for update;select pg_sleep(1.4);commit;`);await pause(200);const late=await asyncSql(call(req));await lock;
 assert.equal(late.status,0,late.stderr);after=readback();assert.equal(after.post.status,'hidden');assert.equal(after.post.expires_at,before.post.expires_at);assert(Date.parse(after.post.metadata[HISTORY][0].at)>started+1000);checks.push('fresh clock after locks; elapsed expiry is preserved without declaring closure or extending it');
 req=fixture();before=readback();const editMedia=asyncSql(`begin;update public.post_media set sort_order=8 where id='${media[1].id}';select pg_sleep(1);commit;`);await pause(200);const raced=await asyncSql(call(req));await editMedia;
 assert.equal(raced.status,0,raced.stderr);assert.equal(parse(raced).code,'EDIT_CONFLICT');assert.deepEqual(readback().post,before.post);assert.equal(readback().audits,0);checks.push('concurrent media change rejects before mutation');
 req=fixture();before=readback();const insertMedia=asyncSql(`begin;insert into public.post_media(id,post_id,url,is_cover,sort_order) values('00000000-0000-4000-8000-00000000d722','${POST}','https://example.test/new.png',false,2);select pg_sleep(1);commit;`);await pause(200);const insertedRace=await asyncSql(call(req));await insertMedia;
 assert.equal(insertedRace.status,0,insertedRace.stderr);assert.equal(parse(insertedRace).code,'EDIT_CONFLICT');assert.deepEqual(readback().post,before.post);assert.equal(readback().audits,0);checks.push('concurrent FK media insert is included in locked snapshot and rejects');
 console.log(JSON.stringify({passed:checks.length,checks,database:DB,productionTouched:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
