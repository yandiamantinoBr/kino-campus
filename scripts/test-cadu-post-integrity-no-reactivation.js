'use strict';
// Manual integration test, fixed disposable local Docker database only.
if (!process.argv.includes('--local')) { console.error('Usage: node scripts/test-cadu-post-integrity-no-reactivation.js --local'); process.exit(1); }
const { spawnSync, spawn } = require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const DB='cadu_integrity_cas_20260908',CONTAINER='supabase_db_kino-campus';
const args=['exec','-i',CONTAINER,'psql','-X','-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1','-A','-t','-q'];
function sql(code,allowError=false){const r=spawnSync('docker',args,{input:code,encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0&&!allowError)throw Error(r.stderr);return r;}
const js=v=>`convert_from(decode('${Buffer.from(JSON.stringify(v)).toString('base64')}','base64'),'UTF8')::jsonb`;
const POST='00000000-0000-4000-8000-00000000a601',OWNER='2345582d-8bf7-4393-aa0d-f9953d0e02ca';
const FIELDS=['id','author_id','created_at','title','description','price','location','module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
const DIR=path.join(__dirname,'../supabase/migrations');
const migration=fs.readdirSync(DIR).filter(name=>name.endsWith('_cadu_post_integrity_no_reactivation.sql'));assert.equal(migration.length,1);
assert.equal(sql('select current_database();').stdout.trim(),DB);
sql(fs.readFileSync(path.join(DIR,migration[0]),'utf8'));
const snapshot=()=>JSON.parse(sql(`select jsonb_build_object(${FIELDS.map(k=>`'${k}',${k}`).join(',')}) from public.posts where id='${POST}';`).stdout.trim());
const media=()=>JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from public.post_media m where post_id='${POST}';`).stdout.trim());
const auditCount=()=>Number(sql(`select count(*) from public.audit_log where entity_id='${POST}';`).stdout.trim());
function fixture(extra={}){
 const value={id:POST,author_id:OWNER,title:'Local integrity validity fixture',description:'Source-bound local fixture',price:null,location:'Goiânia',module:'eventos',category:'academicos',status:'published',visibility:'public',image_url:'https://example.test/cover.jpg',expires_at:'2099-12-31T23:59:59Z',metadata:{source_id:'fixture:integrity-lifecycle',source_url:'https://ufg.br/n/1',dates:{eventStartsAt:'2099-10-14',eventEndsAt:'2099-10-16'}},...extra};
 sql(`begin;set local session_replication_role=replica;delete from public.audit_log where entity_id='${POST}';delete from public.post_media where post_id='${POST}';delete from public.posts where id='${POST}';insert into public.profiles(id) values ('${OWNER}') on conflict do nothing;insert into public.kc_trusted_publishers(user_id) values ('${OWNER}') on conflict do nothing;insert into public.posts(${Object.keys(value).join(',')}) select ${Object.keys(value).join(',')} from jsonb_populate_record(null::public.posts,${js(value)});insert into public.post_media(id,post_id,url,is_cover,sort_order,created_at) values('00000000-0000-4000-8000-00000000a620','${POST}','https://example.test/cover.jpg',true,0,now());commit;`);
 return snapshot();
}
const metadata=dates=>({source_id:'fixture:integrity-lifecycle',source_url:'https://ufg.br/n/1',dates});
function patch(before,extra={}){
 const result={...Object.fromEntries(['title','description','price','location','category','visibility','expires_at'].map(k=>[k,before[k]])),metadata:structuredClone(before.metadata),...extra};
 result.title+=' corrected';result.metadata.cadu_integrity_history=[...(before.metadata.cadu_integrity_history||[]),{contract:'cadu-edit-integrity-v1',operation:'correct',operation_id:crypto.randomUUID(),before_hash:'a'.repeat(64),after_hash:'b'.repeat(64),before:{},evidence:[]}];return result;
}
const invoke=(before,after,m=null,name='public.kc_cadu_correct_post_integrity')=>`select ${name}('${POST}','${OWNER}',${js(before)},${js(after)},${m===null?'null':js(m)});`;
const role="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const parse=stdout=>JSON.parse(stdout.trim().split('\n').filter(x=>x.startsWith('{')).at(-1));
const results=[];
function denied(name,before,after){const unchanged=snapshot(),oldMedia=media(),audits=auditCount();const r=sql(role+invoke(before,after),true);if(r.status===0){const receipt=parse(r.stdout);assert.equal(receipt.ok,false);assert.match(receipt.code,/^INTEGRITY_(?:REACTIVATION_BLOCKED|ACTIVE_REPAIR_EXPIRED)$/);}else assert.match(r.stderr,/invalid integrity temporal/);assert.deepEqual(snapshot(),unchanged);assert.deepEqual(media(),oldMedia);assert.equal(auditCount(),audits);results.push(name);}
function activeRepair(after,score=0.69){const entry=after.metadata.cadu_integrity_history.at(-1);entry.observed_score=score;entry.quality_context={context:'existing_active_post_repair',warning:'existing_active_post_repair_below_auto_publish_threshold',observed_score:score};return after;}
function accepted(name,before,after){const r=parse(sql(role+invoke(before,after)).stdout);assert.equal(r.ok,true);assert.equal(r.post.id,POST);assert.equal(r.post.status,before.status);results.push(name);}
let before=fixture({expires_at:'2020-01-01T00:00:00Z'});
// Counterproof runs the applied predecessor as a transaction-local function;
// never replace the current public RPC or leave the legacy mutation committed.
const oldText=fs.readFileSync(path.join(DIR,'20260908030526_cadu_post_integrity_cas.sql'),'utf8');
const definition=oldText.slice(oldText.indexOf('create or replace function'),oldText.indexOf('\nrevoke all')).replace('public.kc_cadu_correct_post_integrity','pg_temp.legacy_integrity_probe');
const counter=parse(sql(`begin;${definition}${role}${invoke(before,patch(before,{expires_at:'2099-01-01T00:00:00Z'}),null,'pg_temp.legacy_integrity_probe')}rollback;`).stdout);assert.equal(counter.ok,true);assert.equal(snapshot().expires_at,before.expires_at);results.push('predecessor reproduced expired2020 to future2099; transaction rolled back');
for(const nextExpiry of ['2099-01-01T00:00:00Z',null])denied('expired post cannot become future or unbounded',before,patch(before,{expires_at:nextExpiry}));
accepted('inactive historical correction remains allowed',before,patch(before,{expires_at:'2021-01-01T00:00:00Z'}));
before=fixture({status:'closed',expires_at:'2020-01-01T00:00:00Z'});denied('closed post cannot gain future expiry',before,patch(before,{expires_at:'2099-01-01T00:00:00Z'}));
accepted('closed post may remain historically inactive',before,patch(before));
for(const module of ['eventos','oportunidades']){
 before=fixture({module,metadata:metadata({applicationDeadline:'2020-01-01',applicationStatus:'closed',canApply:false})});
 for(const dates of [{applicationDeadline:'2099-01-01',applicationStatus:'open',canApply:true},{},{applicationDeadline:'2099-01-01',applicationStatus:'closed',canApply:false}])denied(`${module} closed application cannot reopen or erase closure`,before,patch(before,{metadata:metadata(dates)}));
}
before=fixture({metadata:metadata({applicationDeadline:'2020-08-14',applicationStatus:'closed',canApply:false,eventStartsAt:'2099-10-14',eventEndsAt:'2099-10-16'})});
accepted('CONPEEX-style closed application stays closed when mapper removes false and future event dates are corrected',before,patch(before,{metadata:metadata({applicationDeadline:'2020-08-28',applicationStatus:'closed',eventStartsAt:'2099-11-09',eventEndsAt:'2099-11-13'})}));
before=fixture({metadata:metadata({eventEndsAt:'2020-01-01',eventStatus:'ended'})});
for(const dates of [{eventEndsAt:'2099-01-01',eventStatus:'upcoming'},{},{eventEndsAt:'2020-01-01',eventStartsAt:'2099-01-01',eventStatus:'ended'}])denied('ended event cannot become future or unknown through conflicting dates',before,patch(before,{metadata:metadata(dates)}));
before=fixture({module:'oportunidades',metadata:metadata({eventStartsAt:'2020-01-01',applicationDeadline:'2099-11-01'})});
accepted('opportunity examination date is not its application expiry',before,patch(before,{metadata:metadata({eventStartsAt:'2099-12-13',applicationDeadline:'2099-11-01'})}));
before=fixture({metadata:metadata({canApply:false})});denied('removing explicit canApply false is not a permission to reopen',before,patch(before,{metadata:metadata({})}));
accepted('mapper may omit canApply false when an explicit application opening remains future',before,patch(before,{metadata:metadata({applicationOpensAt:'2099-09-25',applicationDeadline:'2099-10-26'})}));
for(const dates of [{applicationOpensAt:'2020-01-01'},{applicationOpensAt:'2099-09-25',canApply:true},{applicationOpensAt:'2099-09-25',applicationStatus:'open'},{applicationDeadline:'2020-01-01',applicationStatus:'accepting'}]){
 before=fixture({metadata:metadata({canApply:false})});denied('omitting canApply false needs future opening or still-closed evidence and no open claim',before,patch(before,{metadata:metadata(dates)}));
}
for(const key of ['temporalStatus','lifecycleStatus','lifecycle_status']){
 before=fixture({metadata:{...metadata({}),validity:{[key]:'expired'}}});denied('terminal lifecycle aliases cannot be cleared',before,patch(before,{metadata:metadata({})}));
}
// These alternate keys really close the public renderer, not just the mapper.
const lifecycle=require('../assets/js/shared/kc-post-lifecycle.shared');
for(const key of ['expired','isExpired','is_expired','isClosed','is_closed']){
 before=fixture({metadata:{...metadata({}),[key]:true}});assert.equal(lifecycle.resolve(before).closed,true);
 for(const replacement of [false,'true',null]){
  const nextMeta={...metadata({}),...(replacement===null?{}:{[key]:replacement})};
  denied('public strict boolean closure cannot be removed or converted to text',before,patch(before,{metadata:nextMeta}));
 }
}
for(const [module,key,value] of [['oportunidades','applicationStatus','encerrado'],['eventos','eventStatus','finalizada'],['oportunidades','applicationDeadlineAt','2020-01-01'],['eventos','dateEnd','2020-01-01'],['eventos','eventEnd','2020-01-01']]){
 before=fixture({module,metadata:{...metadata({}),[key]:value}});assert.equal(lifecycle.resolve(before).closed,true);
 denied('public translated terminal status and date aliases cannot become active',before,patch(before,{metadata:metadata({})}));
}
before=fixture({metadata:{...metadata({}),isExpired:true}});accepted('explicitly closed historical repair may preserve its true marker',before,patch(before));
for(const [module,key] of [['oportunidades','activeUntil'],['eventos','active_until']]){
 before=fixture({module,metadata:metadata({[key]:'2020-01-01'})});assert.equal(lifecycle.resolve(before).closed,true);
 for(const dates of [{[key]:'2099-01-01'},{}])denied('public generic activeUntil expiry cannot become future or be removed',before,patch(before,{metadata:metadata(dates)}));
}
before=fixture({module:'oportunidades',expires_at:null,metadata:metadata({expiresAt:'2020-01-01'})});assert.equal(lifecycle.resolve(before).closed,true);
denied('public metadata expiry fallback cannot be erased',before,patch(before,{metadata:metadata({})}));
before=fixture({metadata:metadata({eventEndsAt:'2099-01-01',activeUntil:'2020-01-01'})});assert.equal(lifecycle.resolve(before).closed,false);
accepted('generic metadata expiry ignored by future event does not invent another closed axis',before,patch(before,{metadata:metadata({eventEndsAt:'2099-01-01',activeUntil:'2099-01-01'})}));
before=fixture({metadata:metadata({eventEndsAt:'not-a-date'})});denied('invalid temporal data fails closed',before,patch(before));
const today=sql("select (clock_timestamp() at time zone 'America/Sao_Paulo')::date;").stdout.trim();
before=fixture({metadata:metadata({eventStartsAt:today,eventEndsAt:today})});accepted('date-only event remains active through the current Sao Paulo day',before,patch(before,{metadata:metadata({eventStartsAt:'2099-01-01',eventEndsAt:'2099-01-01'})}));
before=fixture({metadata:metadata({eventStartsAt:'2020-01-01T12:00:00.123456-03:00'})});denied('timestamp with explicit offset is an instant, not a whole future date',before,patch(before,{metadata:metadata({eventStartsAt:'2099-01-01T12:00:00.123456-03:00'})}));
for(const score of ['0.69',null,-0.1,0.7,1]){before=fixture();denied('active repair requires a real numeric below-threshold score in its explicit receipt',before,activeRepair(patch(before),score));}
before=fixture();const mismatched=activeRepair(patch(before));mismatched.metadata.cadu_integrity_history.at(-1).quality_context.observed_score=0.5;denied('active repair receipt cannot disagree with observed score',before,mismatched);
for(const extra of [{status:'closed'},{visibility:'community'},{expires_at:'2020-01-01T00:00:00Z'},{metadata:metadata({eventStatus:'open'})},{metadata:metadata({eventEndsAt:'2020-01-01'})},{metadata:{...metadata({eventEndsAt:'2099-01-01'}),isExpired:true}}]){
 before=fixture(extra);denied('active repair context requires a currently public active post and a known active module axis',before,activeRepair(patch(before)));
}
before=fixture();accepted('active repair receipt preserves numeric observed 0.69 without raising it',before,activeRepair(patch(before)));assert.equal(snapshot().metadata.cadu_integrity_history.at(-1).observed_score,0.69);
// Optional captured handler→mapper→prepare arguments. Remap database IDs and
// source_id to an isolated namespace (the author/source index stays intact);
// preserve the source URL, facts, dates and prepared patch structure.
const realFixtureOption=process.argv.indexOf('--real-fixtures');
if(realFixtureOption!==-1){
 const realDir=path.resolve(process.argv[realFixtureOption+1]);
 for(const name of ['1a_real_carmo_paid_cost_repair-sql-args.json','1b_real_conpeex_closed_app_future_event-sql-args.json']){
  const captured=JSON.parse(fs.readFileSync(path.join(realDir,name),'utf8').replace(/^\uFEFF/,''));
  const isolatedSource=`fixture:integrity-lifecycle:${captured.p_expected.metadata.source_id}`;
  captured.p_expected.metadata.source_id=isolatedSource;captured.p_update.metadata.source_id=isolatedSource;
  before=fixture({...captured.p_expected,id:POST,author_id:OWNER});
  const remapped=structuredClone(captured.p_media),after=structuredClone(captured.p_update),ids=new Map();
  if(remapped){
   for(const row of [...remapped.before,...remapped.after]){if(!ids.has(row.id))ids.set(row.id,crypto.randomUUID());row.id=ids.get(row.id);row.post_id=POST;}
   sql(`begin;set local session_replication_role=replica;delete from public.post_media where post_id='${POST}';insert into public.post_media select * from jsonb_populate_recordset(null::public.post_media,${js(remapped.before)});commit;`);
   after.metadata.cadu_integrity_history.at(-1).media=remapped;
  }
  const result=parse(sql(role+invoke(before,after,remapped)).stdout);assert.equal(result.ok,true);assert.equal(result.post.metadata.source_url,before.metadata.source_url);assert.equal(auditCount(),1);
  if(remapped)assert.equal(media().length,remapped.after.length);
  results.push(`real prepared draft accepted on isolated post: ${name}`);
 }
}
function asyncSql(code,onOutput){return new Promise(resolve=>{const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>{stdout+=x;onOutput?.(stdout);});p.stderr.on('data',x=>stderr+=x);p.on('close',status=>resolve({status,stdout,stderr}));p.stdin.end(code);});}
(async()=>{
 before=fixture();sql(`update public.posts set expires_at=clock_timestamp()+interval '1.3 second' where id='${POST}';`);before=snapshot();
 let ready;const locked=new Promise(resolve=>{ready=resolve;});
 const blocker=asyncSql(`begin;select id from public.posts where id='${POST}' for update;select 'LOCK_READY';select pg_sleep(2);commit;`,out=>{if(out.includes('LOCK_READY'))ready();});
 await locked;
 const attempt=await asyncSql(`begin;${role}${invoke(before,patch(before,{expires_at:'2099-01-01T00:00:00Z'}))}commit;`);await blocker;
 assert.equal(attempt.status,0);assert.equal(parse(attempt.stdout).code,'INTEGRITY_REACTIVATION_BLOCKED');assert.deepEqual(snapshot(),before);assert.equal(auditCount(),0);results.push('expiry crossed during real parent-lock wait blocks with clock_timestamp, snapshot unchanged');
 before=fixture();sql(`update public.posts set expires_at=clock_timestamp()+interval '1.3 second' where id='${POST}';`);before=snapshot();
 const oldMedia=media(),mediaPatch={before:oldMedia,after:oldMedia};const after=patch(before,{expires_at:'2099-01-01T00:00:00Z',image_url:before.image_url});after.metadata.cadu_integrity_history.at(-1).media=mediaPatch;
 let mediaReady;const mediaLocked=new Promise(resolve=>{mediaReady=resolve;});
 const mediaBlocker=asyncSql(`begin;select id from public.post_media where post_id='${POST}' for update;select 'MEDIA_LOCK_READY';select pg_sleep(2);commit;`,out=>{if(out.includes('MEDIA_LOCK_READY'))mediaReady();});
 await mediaLocked;const mediaAttempt=await asyncSql(`begin;${role}${invoke(before,after,mediaPatch)}commit;`);await mediaBlocker;
 assert.equal(mediaAttempt.status,0);assert.equal(parse(mediaAttempt.stdout).code,'INTEGRITY_REACTIVATION_BLOCKED');assert.deepEqual(snapshot(),before);assert.deepEqual(media(),oldMedia);assert.equal(auditCount(),0);results.push('expiry crossed during real media-lock wait blocks before any media mutation');
 before=fixture();sql(`update public.posts set expires_at=clock_timestamp()+interval '1.3 second' where id='${POST}';`);before=snapshot();
 let waiverReady;const waiverLocked=new Promise(resolve=>{waiverReady=resolve;});
 const waiverBlocker=asyncSql(`begin;select id from public.posts where id='${POST}' for update;select 'WAIVER_LOCK_READY';select pg_sleep(2);commit;`,out=>{if(out.includes('WAIVER_LOCK_READY'))waiverReady();});
 await waiverLocked;const waiverAttempt=await asyncSql(`begin;${role}${invoke(before,activeRepair(patch(before)))}commit;`);await waiverBlocker;
 assert.equal(waiverAttempt.status,0);assert.equal(parse(waiverAttempt.stdout).code,'INTEGRITY_ACTIVE_REPAIR_EXPIRED');assert.deepEqual(snapshot(),before);assert.equal(auditCount(),0);results.push('active repair waiver expires during lock even when its old expiry is unchanged');
 before=fixture();const stale=structuredClone(before);stale.updated_at='2000-01-01T00:00:00Z';const conflict=parse(sql(role+invoke(stale,patch(stale))).stdout);assert.equal(conflict.code,'EDIT_CONFLICT');results.push('original complete 15-field stale CAS response remains unchanged');
 const acl=sql("select prosecdef,has_function_privilege('anon','public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb)','execute'),has_function_privilege('authenticated','public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb)','execute'),has_function_privilege('service_role','public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb)','execute') from pg_proc where oid='public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;").stdout.trim();assert.equal(acl,'f|f|f|t');results.push('security invoker and service-role-only execution preserved');
 console.log(JSON.stringify({productionTouched:false,db:DB,passed:results.length,results},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
