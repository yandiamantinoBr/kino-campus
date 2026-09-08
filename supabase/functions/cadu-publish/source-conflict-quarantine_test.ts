import assert from "node:assert/strict";
import { handleEdit } from "./index.ts";
import evidence from "./fixtures/unity-source-conflict.json" with { type: "json" };
const OWNER="2345582d-8bf7-4393-aa0d-f9953d0e02ca", POST="00000000-0000-4000-8000-00000000d701";
const CONTRACT="cadu-source-conflict-quarantine-v1", HISTORY="cadu_source_conflict_quarantine_history";
const TITLE="Fundamentos do Unity3D para o Desenvolvimento de Aplicações";
type Row=Record<string,any>;
function fixture():Row{return {id:POST,author_id:OWNER,created_at:"2026-09-08T14:09:34.123456Z",updated_at:"2026-09-08T14:11:00.123456Z",
 title:TITLE,description:"Descrição publicada preservada, mesmo com cronogramas conflitantes na fonte.",price:0,location:"EMC UFG",
 module:"eventos",category:"cursos",status:"published",visibility:"public",image_url:"https://example.test/cover.png",expires_at:"2026-10-09T02:59:59.999Z",
 metadata:{source_id:evidence.sourceId,source_url:evidence.sourceUrl,source_registry_id:"web.ufg.emc",source_revision:evidence.sourceRevision,
 source_title:TITLE,cadu_run_id:evidence.sourceRunId,dates:{eventStartsAt:"2026-09-08",eventEndsAt:"2026-10-08"},custom:{keep:true},gratuito:true}};}
function media(){return [{id:"00000000-0000-4000-8000-00000000d720",post_id:POST,url:"https://example.test/cover.png",is_cover:true,sort_order:0,created_at:"2026-09-08T14:09:35.123456Z"}];}
function request(post=fixture()):Row{return {action:"edit",postId:POST,sourceConflictQuarantine:{contract:CONTRACT,
 operationId:"00000000-0000-4000-8000-00000000d710",expected:structuredClone(post),expectedMedia:media(),evidence:structuredClone(evidence)}};}
function fake(post=fixture(),rpcResult?:any){const state=structuredClone(post),calls:Row[]=[];return {state,calls,admin:{
 from(table:string){if(table==="audit_log")return{insert:async()=>({error:null})};assert.equal(table,"posts");return{
 select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(state),error:null})})}),
 update:(patch:Row)=>({eq:async()=>{calls.push({ordinary:patch});Object.assign(state,patch);return{error:null};}})};},
 rpc:async(name:string,args:Row)=>{calls.push({name,args});assert.equal(name,"kc_cadu_quarantine_source_conflict");
 assert.deepEqual(Object.keys(args).sort(),["p_post_id","p_actor_id","p_request"].sort());assert.equal(args.p_actor_id,OWNER);
 if(rpcResult==="throw")throw Error("connection lost after dispatch");
 if(rpcResult!==undefined)return typeof rpcResult==="function"?rpcResult(state,args):rpcResult;
 const entry={contract:CONTRACT,operation:"quarantine_source_conflict",operation_id:args.p_request.operationId,at:new Date().toISOString(),
 evidence:structuredClone(args.p_request.evidence),before:{post:structuredClone(state),post_media:structuredClone(args.p_request.expectedMedia)},
 after:{status:"hidden"},before_hash:"a".repeat(64),after_hash:"b".repeat(64)};
 state.status="hidden";state.metadata[HISTORY]=[...(state.metadata[HISTORY]||[]),entry];state.updated_at=new Date().toISOString();
 return{data:{ok:true,code:"SOURCE_CONFLICT_QUARANTINED",post:structuredClone(state),post_media:args.p_request.expectedMedia},error:null};}
 }};}
Deno.test("Unity quarantine dispatches a specific CAS operation and changes only status/history",async()=>{
 const post=fixture(),h=fake(post),response=await handleEdit(h.admin as never,OWNER,request(post));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal(h.calls.length,1);
 const after=structuredClone(h.state);delete after.metadata[HISTORY];
 assert.deepEqual(after,{...post,status:"hidden",updated_at:after.updated_at});
 assert.equal(h.state.metadata[HISTORY][0].before.post.status,"published");
 assert.equal((await handleEdit(h.admin as never,OWNER,request(h.state))).status,409);assert.equal(h.calls.length,1);
});
for(const [name,edit] of Object.entries<(body:Row)=>void>({
 extra_fields:b=>{b.fields={status:"hidden"};},extra_item:b=>{b.sourceConflictQuarantine.item={score:1};},
 injected_status:b=>{b.sourceConflictQuarantine.status="published";},rollback:b=>{b.sourceConflictQuarantine.operation="rollback";},
 other_contract:b=>{b.sourceConflictQuarantine.contract="cadu-edit-integrity-v1";},
 combined_integrity:b=>{b.integrityCorrection={};},combined_media:b=>{b.mediaCorrection={};},combined_legacy:b=>{b.legacyFreeRetraction={};},
 operation_array:b=>{b.sourceConflictQuarantine.operationId=[b.sourceConflictQuarantine.operationId];},
 snapshot_missing:b=>{delete b.sourceConflictQuarantine.expected.image_url;},
 snapshot_stale:b=>{b.sourceConflictQuarantine.expected.metadata.custom.keep=false;},
 microsecond_stale:b=>{b.sourceConflictQuarantine.expected.updated_at="2026-09-08T14:11:00.123457Z";},
 media_incomplete:b=>{delete b.sourceConflictQuarantine.expectedMedia[0].created_at;},
 media_duplicate:b=>{b.sourceConflictQuarantine.expectedMedia.push(b.sourceConflictQuarantine.expectedMedia[0]);},
 media_boolean_string:b=>{b.sourceConflictQuarantine.expectedMedia[0].is_cover="true";},
 media_other_post:b=>{b.sourceConflictQuarantine.expectedMedia[0].post_id=OWNER;},
 source_url:b=>{b.sourceConflictQuarantine.evidence.sourceUrl+="?x=1";},
 source_id:b=>{b.sourceConflictQuarantine.evidence.sourceId="web.other";},
 source_revision:b=>{b.sourceConflictQuarantine.evidence.sourceRevision="a".repeat(64);},
 source_run:b=>{b.sourceConflictQuarantine.evidence.sourceRunId=POST;},
 source_text_changed:b=>{b.sourceConflictQuarantine.evidence.sourceText+="Retificação: datas corrigidas.";},
 source_text_array:b=>{b.sourceConflictQuarantine.evidence.sourceText=[b.sourceConflictQuarantine.evidence.sourceText];},
 source_hash_array:b=>{b.sourceConflictQuarantine.evidence.sourceTextSha256=[b.sourceConflictQuarantine.evidence.sourceTextSha256];},
 false_refetch:b=>{b.sourceConflictQuarantine.evidence.primaryAccess="fetched_fresh";},
 unsupported_reason:b=>{b.sourceConflictQuarantine.evidence.reason="course_finished";},
 no_conflict:b=>{b.sourceConflictQuarantine.evidence.sourceText="Cronograma coerente, sem conflito.";},
 }))Deno.test(`quarantine rejects ${name} before dispatch`,async()=>{
 const h=fake(),b=request();edit(b);const r=await handleEdit(h.admin as never,OWNER,b);
 assert([409,422].includes(r.status));assert.equal(h.calls.length,0);
 });
for(const [name,edit] of Object.entries<(post:Row)=>void>({
 wrong_source:p=>{p.metadata.source_url="https://emc.ufg.br/e/39517-other";},
 wrong_registry:p=>{p.metadata.source_registry_id="web.ufg.portal";},
 wrong_source_id:p=>{p.metadata.source_id="";},new_revision:p=>{p.metadata.source_revision="a".repeat(64);},
 new_run:p=>{p.metadata.cadu_run_id=POST;},new_source_title:p=>{p.metadata.source_title="Outro curso";},
 private_visibility:p=>{p.visibility="community";},closed:p=>{p.status="closed";},expired_status:p=>{p.status="expired";},
 already_hidden:p=>{p.status="hidden";},pending:p=>{p.status="pending";},deleted:p=>{p.status="deleted";},
 wrong_module:p=>{p.module="oportunidades";},manual_lock:p=>{p.metadata.manual_edits_lock=true;},
 description_lock:p=>{p.metadata.manual_description="true";},tombstone:p=>{p.metadata.merged_into_post_id=OWNER;},
 invalid_history:p=>{p.metadata[HISTORY]=[1];},null_history:p=>{p.metadata[HISTORY]=null;},
 }))Deno.test(`quarantine cannot repurpose ${name}`,async()=>{
 const p=fixture();edit(p);const h=fake(p);const r=await handleEdit(h.admin as never,OWNER,request(p));
 assert.equal(r.status,422);assert.equal(h.calls.length,0);
 });
for(const [name,value,status] of [
 ["explicit CAS conflict",{data:{ok:false,code:"EDIT_CONFLICT"},error:null},409],
 ["timeout throw","throw",502],["timeout error",{data:null,error:{code:"timeout"}},502],
 ["missing receipt",{data:null,error:null},502],["unknown receipt",{data:{ok:true},error:null},502],
 ["false success conflict",{data:{ok:true,code:"EDIT_CONFLICT"},error:null},502],
 ] as const)Deno.test(`${name}: one dispatch, no retry or ordinary fallback`,async()=>{
 const h=fake(fixture(),value);assert.equal((await handleEdit(h.admin as never,OWNER,request())).status,status);assert.equal(h.calls.length,1);
 });
Deno.test("quarantine rejects wrong owner before dispatch",async()=>{
 const h=fake();assert.equal((await handleEdit(h.admin as never,"not-owner",request())).status,403);assert.equal(h.calls.length,0);
});
Deno.test("receipt cannot silently edit facts, source, media, history or reactivation",async()=>{
 for(const edit of [
 (r:Row)=>{r.post.title="changed";},(r:Row)=>{r.post.status="published";},(r:Row)=>{r.post.expires_at="2099-01-01T00:00:00Z";},
 (r:Row)=>{r.post.metadata.source_revision="a".repeat(64);},(r:Row)=>{r.post_media=[];},
 (r:Row)=>{r.post.metadata[HISTORY][0].before_hash=["a".repeat(64)];},
 ]){
 const canonical=fake(),b=request();await handleEdit(canonical.admin as never,OWNER,b);
 const data={ok:true,code:"SOURCE_CONFLICT_QUARANTINED",post:canonical.state,post_media:media()};edit(data);
 const h=fake(fixture(),{data,error:null});assert.equal((await handleEdit(h.admin as never,OWNER,b)).status,502);assert.equal(h.calls.length,1);
 }
});
Deno.test("withdrawal never invents course expiration and preserves an already elapsed expiry",async()=>{
 const p=fixture();p.expires_at="2020-01-01T00:00:00Z";const h=fake(p);const r=await handleEdit(h.admin as never,OWNER,request(p));
 assert.equal(r.status,200);assert.equal(h.state.expires_at,p.expires_at);assert.equal(h.state.status,"hidden");
 assert.equal(h.state.metadata.closed_reason,undefined);
});
