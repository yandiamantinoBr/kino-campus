/** @jest-environment node */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { appendPostMediaIfAbsent: append, buildCanonicalGalleryImageUrls } = require('../../data/.openclaw/workspace/scripts/post-media-append');
const POST = '00000000-0000-4000-8000-00000000a501';
const row = (n, url) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`, post_id: POST, url, is_cover:false, sort_order:n, created_at:'2026-09-08T00:00:00.123456+00:00' });
function mock(initial = [], rpcHook) {
 const state = { rows: structuredClone(initial), reads: 0, calls: [] };
 const db = {
  from: jest.fn(() => ({select: jest.fn(() => ({eq: jest.fn(() => ({order: jest.fn(() => ({limit: jest.fn(async () => {state.reads++;return {data:structuredClone(state.rows)};})}))}))}))})),
  rpc: jest.fn(async (name, body) => {
   state.calls.push(body); if(rpcHook)return rpcHook(state, body);
   const inserted=body.p_append_urls.map((url,i)=>row(100+i,url));state.rows.push(...inserted);
   return {data:{ok:true,code:'MEDIA_APPENDED',post_id:POST,inserted}};
  })
 }; return {db,state};
}
describe('Cadu append media CAS client', () => {
 test('sends complete raw snapshot to RPC and preserves the existing cover', async () => {
  const before={...row(1,'https://example.test/cover.jpg'),is_cover:true};const {db,state}=mock([before]);
  const result=await append(db,POST,['https://example.test/a.jpg','https://example.test/a.jpg']);
  expect(result.inserted).toHaveLength(1);expect(db.rpc).toHaveBeenCalledWith('kc_cadu_append_post_media',{p_post_id:POST,p_expected_rows:[before],p_append_urls:['https://example.test/a.jpg']});
  expect(state.rows[0]).toEqual(before);
 });
 test('known Weby variant is already present; semantic edition is distinct',async()=>{
  const a='https://files.cercomp.ufg.br/weby/up/1/l/cartaz.jpg';const {db,state}=mock([row(1,a)]);
  expect((await append(db,POST,[a.replace('/l/','/o/')])).attempted).toBe(0);expect(state.calls).toHaveLength(0);
  expect((await append(db,POST,[a+'?edition=2'])).inserted).toHaveLength(1);
 });
 test('CAS conflict rereads and recomputes equivalent identity',async()=>{
  const a='https://files.cercomp.ufg.br/weby/up/1/l/cartaz.jpg';
  const {db,state}=mock([],(s)=>{s.rows.push(row(1,a));return {data:{ok:false,code:'MEDIA_EDIT_CONFLICT'}};});
  expect((await append(db,POST,[a.replace('/l/','/o/')])).attempted).toBe(0);
  expect(state.reads).toBe(2);expect(state.calls).toHaveLength(1);
 });
 test('timeout after commit reconciles IDs without retry or own-write claim',async()=>{
  const {db,state}=mock([],(s,b)=>{s.rows.push(row(1,b.p_append_urls[0]));throw Error('lost response');});
  const result=await append(db,POST,['https://example.test/a.jpg']);
  expect(result.outcome).toBe('reconciled');expect(result.inserted).toEqual([]);expect(result.reconciled[0].id).toBe(row(1,'x').id);expect(state.calls).toHaveLength(1);
 });
 test('missing snapshot fails closed without RPC',async()=>{
  const {db}=mock();db.from.mockImplementation(()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:null})})})})}));
  await expect(append(db,POST,['https://example.test/a.jpg'])).rejects.toMatchObject({code:'MEDIA_SNAPSHOT_INVALID'});expect(db.rpc).not.toHaveBeenCalled();
 });
 test('empty append performs no database request',async()=>{expect(await append({},POST,[])).toEqual({attempted:0,inserted:[]});});
 test('gallery excludes equivalent cover without removing distinct edition',()=>{
  const a='https://files.cercomp.ufg.br/weby/up/1/l/cartaz.jpg';
  expect(buildCanonicalGalleryImageUrls(a,[{url:a.replace('/l/','/o/')},{url:a+'?edition=2'}])).toEqual([a+'?edition=2']);
 });
});
describe('Cadu append migration contract',()=>{
 const directory=path.join(__dirname,'../../supabase/migrations');
 const migrations=fs.readdirSync(directory).filter(name=>name.endsWith('_cadu_post_media_append_cas.sql'));
 if(migrations.length!==1)throw Error('exactly one append CAS migration required');
 const sql=fs.readFileSync(path.join(directory,migrations[0]),'utf8');
 test('invoker and narrow active authenticated actor; no caller-supplied signature or actor',()=>{
  expect(sql).toMatch(/language plpgsql security invoker/i);expect(sql).toContain("set search_path = ''");
  expect(sql).toContain("current_user <> 'authenticated'");expect(sql).toContain("auth.uid() is distinct from '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid");
  expect(sql).toContain('public.kc_is_current_session_active() is distinct from true');expect(sql).toContain('v_author is distinct from auth.uid()');
  expect(sql).toMatch(/revoke all[^;]+from public,anon,authenticated,service_role/);expect(sql).toMatch(/grant execute[^;]+to authenticated/);
 });
 test('parent lock precedes media snapshot, exact comparison and conflict-safe insert',()=>{
  const post=sql.indexOf('from public.posts where id = p_post_id for update');
  const media=sql.indexOf('from public.post_media where post_id = p_post_id order by id for update');
  const cas=sql.indexOf('v_actual is distinct from v_expected');const insert=sql.indexOf('insert into public.post_media');
  expect(post).toBeGreaterThan(0);expect(media).toBeGreaterThan(post);expect(cas).toBeGreaterThan(media);expect(insert).toBeGreaterThan(cas);
  expect(sql).toContain('on conflict (post_id,url) do nothing');expect(sql).not.toMatch(/\b(delete from|update public\.|drop (index|constraint))/i);
  expect(sql).toContain("'created_at',(r->>'created_at')::timestamptz");
 });
});
