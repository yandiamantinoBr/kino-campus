import assert from 'node:assert/strict';
import { applicationDeadlineEvidence, applicationDeadlineIssues, applicationDeadlineTransitionIssue } from './application-deadline.ts';
import { mapItemToPost } from './mapper.ts';
import { handleEdit, handlePublish } from './index.ts';
import { integritySnapshot, prepareIntegrityUpdate, validateIntegrityRequest } from './integrity.ts';
const fixture=JSON.parse(Deno.readTextFileSync(new URL('./fixtures/application-deadline-evidence.json',import.meta.url)));
const OWNER='cadu-test-owner';const ID='11111111-1111-4111-8111-111111111111';
function item(kind='ppgcc'):Record<string,any>{const f=structuredClone(fixture[kind]); const base={...f,title:'Seleção oficial da UFG para alunos e comunidade',category:'concursos',score:0.72,sourceTitle:'Seleção oficial da UFG para alunos e comunidade',
 description:'Consulte os requisitos e documentos da seleção na fonte oficial. As candidaturas obedecem ao prazo estabelecido no edital, com informações completas disponíveis no endereço oficial da instituição.',link:f.url,linkAsCta:true,
 dates:{applicationDeadline:f.dates.applicationDeadline,applicationOpensAt:kind==='ppgcc'?'2026-08-14':'2026-09-25',dateEvidence:f.dates.dateEvidence,applicationStatus:kind==='ppgcc'?'open':'scheduled',canApply:false}};
 return {...base,applicationDeadlineEvidence:applicationDeadlineEvidence(base)};
}
function row(input=item()):Record<string,any>{return{...mapItemToPost(input,{now:new Date('2026-09-08T12:00:00Z')}).row,id:ID,author_id:OWNER,status:'published',created_at:'2026-09-01T12:00:00Z',updated_at:'2026-09-08T12:00:00.123456+00:00'}};
async function withNow(iso:string,fn:(advance:(next:string)=>void)=>void|Promise<void>){const Original=Date;let ms=Original.parse(iso);class FixedDate extends Original{constructor(value?:any){super(value===undefined?ms:value)}static override now(){return ms}};globalThis.Date=FixedDate as DateConstructor;try{return await fn(next=>{ms=Original.parse(next)})}finally{globalThis.Date=Original}}
function admin(existing:Record<string,any>|null=null){const writes:unknown[]=[];let state=structuredClone(existing);const q:any={select(){return q},eq(){return q},neq(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:structuredClone(state),error:null}),update(p:unknown){writes.push(p);return q},insert(p:unknown){writes.push(p);return q},single:async()=>({data:state,error:null}),then(resolve:any,reject:any){return Promise.resolve({data:state,error:null}).then(resolve,reject)}};return {writes,client:{from(table:string){if(table==='audit_log')return{insert:()=>Promise.resolve({error:null})};assert.equal(table,'posts');return q},rpc:async(name:string,args:any)=>{assert.equal(name,'kc_cadu_correct_post_integrity');assert.deepEqual(args.p_expected,integritySnapshot(state!));writes.push(args);state={...state,...structuredClone(args.p_update)};return{data:{ok:true,post:state},error:null}}} as any};}
function request(current=row(),input=item()){return{action:'edit',postId:ID,integrityCorrection:{operation:'correct',operationId:'22222222-2222-4222-8222-222222222222',expected:integritySnapshot(current),reason:'Preservar o horário literal do prazo confirmado na fonte oficial.',evidence:[{url:input.sourceUrl,title:input.title,dates:'Horário explícito do último dia de inscrição no edital.',venue:'Fonte oficial vinculada ao processo seletivo.'}],item:input,detachSources:[]}}}

Deno.test('audited deadlines map to the exact UTC instant while semantic dates remain calendar-only',()=>{for(const kind of ['ppgcc','carmo']){const source=item(kind),proof=source.applicationDeadlineEvidence,mapped=mapItemToPost(source,{now:new Date('2026-09-08T12:00:00Z')});assert.equal(mapped.row.expires_at,proof.instant);assert.equal((mapped.row.metadata.dates as any).applicationDeadline,proof.calendarDate);assert.equal(mapped.row.metadata.application_deadline_at,proof.instant);assert.deepEqual(mapped.row.metadata.application_deadline_evidence,proof)}});
Deno.test('mapper refuses modified clock, source, revision or document in the incoming proof',()=>{for(const change of [(x:any)=>x.instant='2099-09-16T19:00:00.000Z',(x:any)=>x.localTime='23:59',(x:any)=>x.role='eventEndsAt',(x:any)=>x.sourceRevision='f'.repeat(64),(x:any)=>x.sourceId+='x',(x:any)=>x.document.sha256='0'.repeat(64),(x:any)=>x.excerpts[0].text='Hora estimada.']){const source=item();change(source.applicationDeadlineEvidence);assert.throws(()=>mapItemToPost(source),/application_deadline_evidence_invalid/)}});
Deno.test('no optional proof preserves existing daily behavior and does not infer a clock from generated text',()=>{const source=item();delete source.applicationDeadlineEvidence;delete source.editorialResearch;source.description+=' Prazo final às16h.';assert.equal(mapItemToPost(source,{now:new Date('2026-09-08T12:00:00Z')}).row.expires_at,'2026-09-17T02:59:59.999Z')});
Deno.test('raw Edge callers derive the same optional proof only from exact research bindings',()=>{
  for(const kind of ['ppgcc','carmo']){
    const source=item(kind),proof=source.applicationDeadlineEvidence;
    delete source.applicationDeadlineEvidence;
    const mapped=mapItemToPost(source);
    assert.deepEqual(mapped.row.metadata.application_deadline_evidence,proof);
    assert.equal(mapped.row.expires_at,proof.instant);
    for(const change of [(x:any)=>delete x.editorialResearch,(x:any)=>delete x.sourceId,
      (x:any)=>x.editorialResearch.sources.find((s:any)=>s.type==='official_document').sha256='0'.repeat(64),
      (x:any)=>x.sourceUrl+='?other=1',(x:any)=>x.editorialResearch.amendments=[{}]]){
      const changed=structuredClone(source);change(changed);
      const unproven=mapItemToPost(changed);
      assert.equal(unproven.row.metadata.application_deadline_evidence,undefined);
      assert.notEqual(unproven.row.expires_at,proof.instant);
    }
  }
});
Deno.test('actual publication quality rejects the exact cutoff and later on the same calendar day without any write',async()=>{for(const iso of ['2026-09-16T19:00:00.000Z','2026-09-16T22:00:00.000Z'])await withNow(iso,async()=>{const db=admin();const response=await handlePublish(db.client,OWNER,{item:item(),options:{dryRun:true}});const body=await response.json();assert.equal(body.code,'QUALITY_BLOCKED');assert(body.quality.blockingWarnings.includes('application_deadline_instant_past'));assert.equal(db.writes.length,0)})});
Deno.test('canonical correction keeps the evidence inside the complete CAS payload and durable history',async()=>withNow('2026-09-08T12:00:00Z',async()=>{const current=row(),db=admin(current);const response=await handleEdit(db.client,OWNER,request(current));const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(db.writes.length,1);const write=db.writes[0] as any;assert.equal(Object.keys(write.p_expected).length,15);assert.deepEqual(write.p_expected.metadata.application_deadline_evidence,current.metadata.application_deadline_evidence);assert.equal(write.p_update.expires_at,current.expires_at);assert.deepEqual(write.p_update.metadata.application_deadline_evidence,current.metadata.application_deadline_evidence);const history=write.p_update.metadata.cadu_integrity_history;assert.equal(history.length,1);assert.equal(history[0].before.metadata.application_deadline_evidence.instant,current.expires_at);assert.equal(typeof history[0].source_item_sha256,'string')}));
Deno.test('canonical correction cannot remove optional proof and extend to end of day, even before cutoff',async()=>withNow('2026-09-08T12:00:00Z',async()=>{const current=row(),source=item();delete source.applicationDeadlineEvidence;delete source.editorialResearch;const db=admin(current);const response=await handleEdit(db.client,OWNER,request(current,source));assert.equal(response.status,422);assert.equal((await response.json()).code,'INTEGRITY_REACTIVATION_BLOCKED');assert.equal(db.writes.length,0)}));
Deno.test('regular metadata edit cannot erase proof or publish a known elapsed deadline',async()=>{await withNow('2026-09-08T12:00:00Z',async()=>{const current=row(),db=admin(current);const response=await handleEdit(db.client,OWNER,{action:'edit',postId:ID,metadata:{application_deadline_evidence:null}});assert.equal(response.status,422);assert.equal(db.writes.length,0)});await withNow('2026-09-16T22:00:00Z',async()=>{const current=row();current.status='closed';const db=admin(current);const response=await handleEdit(db.client,OWNER,{action:'edit',postId:ID,fields:{status:'published'}});assert.equal(response.status,422);assert.equal(db.writes.length,0)})});
Deno.test('source-bound proof cannot be transplanted into another module or removed through transition',()=>{const current=row(),next=structuredClone(current);next.module='eventos';assert(applicationDeadlineTransitionIssue(current,next));delete next.metadata.application_deadline_evidence;assert(applicationDeadlineTransitionIssue(current,next));assert(applicationDeadlineIssues(item(),'2026-09-16T19:00:00Z').includes('application_deadline_instant_past'))});

Deno.test('a cutoff reached while hashing the canonical history is refused before RPC dispatch',async()=>
  withNow('2026-09-16T18:59:59.999Z',async advance=>{
    const current=row(),db=admin(current),originalDigest=crypto.subtle.digest;
    crypto.subtle.digest=async function(...args:Parameters<SubtleCrypto['digest']>){
      const result=await originalDigest.apply(this,args);
      advance('2026-09-16T19:00:00.000Z');
      return result;
    };
    try{
      const response=await handleEdit(db.client,OWNER,request(current));
      const body=await response.json();
      assert.equal(response.status,422,JSON.stringify(body));
      assert.equal(body.code,'QUALITY_BLOCKED');
      assert(body.quality.blockingWarnings.includes('application_deadline_instant_past'));
      assert.equal(db.writes.length,0);
    }finally{crypto.subtle.digest=originalDigest}
  }));

Deno.test('canonical rollback cannot remove a newly persisted exact cutoff and restore end of day',async()=>
  withNow('2026-09-08T12:00:00Z',async()=>{
    const current=row();
    delete current.metadata.application_deadline_evidence;delete current.metadata.application_deadline_at;
    current.expires_at='2026-09-17T02:59:59.999Z';
    const input=validateIntegrityRequest(request(current),current);
    const correction=await prepareIntegrityUpdate(current,input,mapItemToPost(item()).row);
    const after={...current,...correction.update};
    const rollback=validateIntegrityRequest({action:'edit',postId:ID,integrityCorrection:{
      operation:'rollback',operationId:'33333333-3333-4333-8333-333333333333',rollbackOf:input.operationId,
      expected:integritySnapshot(after),reason:'Rollback solicitado de prova temporal recentemente persistida.',
      evidence:input.evidence,
    }},after);
    await assert.rejects(()=>prepareIntegrityUpdate(after,rollback),/application_deadline_evidence_removed/);
  }));
