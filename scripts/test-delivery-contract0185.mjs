// Disposable embedded PostgreSQL only. Never reads .env or contacts hosted Supabase.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomUUID as uuid } from 'node:crypto'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })
const rows = async (sql, args = []) => (await db.query(sql, args)).rows
const scalar = async (sql, args = []) => Object.values((await rows(sql,args))[0])[0]
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log('PASS:',name) }
async function denied(fn,code='42501') { await assert.rejects(fn, e => e.code===code) }
async function role(name,fn) { await db.exec(`set role ${name}`); try { return await fn() } finally { await db.exec('reset role') } }
async function actor(f) { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.user]) }
async function insert(table,data) { const keys=Object.keys(data); return (await rows(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(data)))[0] }
async function fixture(count=1,parts=1,state='downloaded',reuse=null) {
 const user=reuse?.user??uuid(),device=reuse?.device??uuid(),sim=reuse?.sim??uuid(),campaign=uuid(),dispatch=uuid(),auth=uuid(),secret=reuse?.secret??('fixture-only-'+uuid())
 if(!reuse) await insert('auth.users',{id:user,email:user+'@example.invalid'})
 const org=await scalar('select personal_workspace_id from profiles where id=$1',[user])
 if(!reuse) {
 await insert('gateway_devices',{id:device,organization_id:org,display_name:'Fixture phone',installation_fingerprint_hash:uuid(),paired_by:user,last_inventory_at:new Date().toISOString()})
 await db.query("insert into gateway_device_credentials(device_id,version,secret_hash,expires_at) values($1,1,encode(extensions.digest($2,'sha256'),'hex'),now()+interval '1 day')",[device,secret])
 await insert('gateway_device_sims',{id:sim,device_id:device,subscription_id:1,slot_index:0,sim_identity_hash:'a'.repeat(64)})
 await insert('gateway_device_sim_bindings',{device_id:device,sim_id:sim,bound_by:user})
 }
 await insert('campaigns',{id:campaign,organization_id:org,source_draft_updated_at:new Date().toISOString(),title:'Contract fixture',message_template_snapshot:'test',template_syntax_version:'v1',eligibility_policy_version:'v1',recipient_count:count,gsm7_recipients:count,estimated_sms_units:count*parts,gateway_device_id_snapshot:device,gateway_device_name:'Fixture',gateway_sim_id_snapshot:sim,sim_subscription_id:1,sim_slot_index:0,sim_identity_hash:'a'.repeat(64),confirmed_by:user})
 await db.query("insert into campaign_send_authorizations(id,organization_id,campaign_id,gateway_device_id,gateway_sim_id,sim_subscription_id,sim_slot_index,sim_identity_hash,authorized_by,expires_at) values($1,$2,$3,$4,$5,1,0,$6,$7,now()+interval '5 minutes')",[auth,org,campaign,device,sim,'a'.repeat(64),user])
 await insert('campaign_dispatches',{id:dispatch,organization_id:org,campaign_id:campaign,authorization_id:auth,gateway_device_id:device,gateway_sim_id:sim,sim_subscription_id:1,sim_slot_index:0,sim_identity_hash:'a'.repeat(64),recipient_count:count,estimated_sms_units:count*parts,created_by:user})
 const jobs=[]
 for(let i=0;i<count;i++) {
  const phone='+923'+String(100000000+i)
  const rec=await insert('campaign_recipients',{campaign_id:campaign,organization_id:org,source_row_number:i+2,normalized_e164:phone,rendered_message:'test',sms_encoding:'GSM-7',character_count:4,encoding_units:4,segment_count:parts,consent_state:'granted',suppression_state:'clear'})
  await insert('contact_consent_events',{organization_id:org,normalized_e164:phone,event_type:'granted',source:'manual',evidence_note:'Synthetic test consent',occurred_at:new Date().toISOString(),recorded_by:user})
  const job=uuid()
  await db.query(`insert into campaign_message_jobs(id,organization_id,dispatch_id,campaign_id,campaign_recipient_id,source_row_number,normalized_e164,rendered_message,sms_encoding,segment_count,state,lease_owner_device_id,lease_token,leased_at,lease_expires_at,downloaded_at)
  values($1,$2,$3,$4,$5,$6,$7,'test','GSM-7',$8,$9,case when $9='queued' then null else $10::uuid end,case when $9='queued' then null else gen_random_uuid() end,case when $9='queued' then null else now() end,case when $9='queued' then null else now()+interval '2 minutes' end,case when $9='downloaded' then now() else null end)`,[job,org,dispatch,campaign,rec.id,i+2,phone,parts,state,device])
  jobs.push(job)
 }
 const f={user,org,device,sim,campaign,dispatch,secret,jobs,parts};await actor(f);return f
}
async function begin(f,index=0,client=uuid(),parts=f.parts) {const a=await scalar('select begin_gateway_message_attempt_v2($1,$2,$3,$4,$5)',[f.device,f.secret,f.jobs[index],client,parts]);return {...a,client_attempt_id:client} }
async function event(f,a,type='sent',result=-1,part=0,extra={}) {
 const {id=uuid(),time=1234567890000,format=null,status=null,hash=null}=extra
 return role('anon',()=>scalar('select report_gateway_message_attempt_event_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[f.device,f.secret,id,a.client_attempt_id,type,['sent','delivery'].includes(type)?part:null,['sent','delivery'].includes(type)?result:null,time,format,status,hash]))
}
async function recovery(f,attempt=null) {await actor(f);await role('authenticated',()=>scalar("select request_campaign_message_recovery($1,$2,'skip_unknown')",[f.org,f.campaign]));return scalar("select id from campaign_message_recovery_requests where campaign_id=$1 and outcome='pending' and ($2::uuid is null or attempt_id=$2) order by requested_at desc limit 1",[f.campaign,attempt?.attempt_id??null])}
const ack=(f,id,outcome='applied')=>role('anon',()=>scalar('select acknowledge_gateway_message_recovery_v2($1,$2,$3,$4)',[f.device,f.secret,id,outcome]))
const report={format:'3gpp',status:0,hash:'b'.repeat(64)}
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema extensions; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to public;`)
 const migrations=(await readdir(root+'supabase/migrations')).sort()
 const patch=migrations.pop()
 for(const name of migrations) await db.exec(await readFile(root+'supabase/migrations/'+name,'utf8'))
 // Exercise a real 0.18.4 -> 0.18.5 upgrade with historical transport and resolution.
 const historical=await fixture(3)
 const history=[]
 for(let i=0;i<3;i++) history.push((await rows('select * from begin_gateway_message_attempt($1,$2,$3,$4,1)',[historical.device,historical.secret,historical.jobs[i],uuid()]))[0])
 const oldEvent=(a,type,result=-1)=>rows('select * from report_gateway_message_attempt_event($1,$2,$3,$4,$5,$6,$7,1234567890000)',[historical.device,historical.secret,uuid(),a.client_attempt_id,type,type==='unknown'?null:0,type==='unknown'?null:result])
 await oldEvent(history[0],'sent');await oldEvent(history[0],'delivery')
 await oldEvent(history[1],'sent');await oldEvent(history[1],'sent',1)
 await oldEvent(history[2],'unknown')
 await scalar("select request_campaign_message_recovery($1,$2,'skip_unknown')",[historical.org,historical.campaign])
 const oldRecovery=await scalar('select id from campaign_message_recovery_requests where attempt_id=$1',[history[2].attempt_id])
 await scalar('select acknowledge_gateway_message_recovery($1,$2,$3)',[historical.device,historical.secret,oldRecovery])
 await db.exec(await readFile(root+'supabase/migrations/'+patch,'utf8'))
 await test('upgrade retains SENT but removes unsupported historical DELIVERED claim',async()=>assert.equal(await scalar('select state from campaign_message_attempts where id=$1',[history[0].attempt_id]),'sent'))
 await test('upgrade preserves historical conflicting SENT as a durable conflict',async()=>{const r=await event(historical,history[1]);assert.equal(r.state,'unknown');assert.equal(r.conflict,true)})
 await test('upgrade keeps resolved UNKNOWN resolved and never retryable',async()=>{const r=await event(historical,history[2],'unknown');assert.equal(r.state,'unknown');assert.equal(r.resolution,'skip_without_retry');assert.equal(r.safe_retry_eligible,false)})

 await db.exec(await readFile(root+'supabase/verify_fresh_schema.sql','utf8'))
 await test('all migrations and final schema verifier pass',async()=>assert.equal(await scalar("select value->>'version' from app_meta where key='schema'"),'0.18.5'))
 const f=await fixture(12),a=await begin(f)
 await test('registration is idempotent; different attempt cannot resend',async()=>{assert.equal(a.outcome,'registered');assert.equal((await begin(f,0,a.client_attempt_id)).attempt_id,a.attempt_id);await denied(()=>begin(f), '22023')})
 await test('SENT success remains SENT',async()=>assert.equal((await event(f,a)).state,'sent'))
 await test('legacy delivery -1 does not assert delivered',async()=>{const r=await role('anon',()=>rows("select * from report_gateway_message_attempt_event($1,$2,$3,$4,'delivery',0,-1,1234567890000)",[f.device,f.secret,uuid(),a.client_attempt_id]));assert.equal(r[0].state,'sent');assert.equal(r[0].delivered_parts,0)})
 await test('pending delivery report stays SENT',async()=>assert.equal((await event(f,a,'delivery',-1,0,{...report,status:32})).state,'sent'))
 await test('successful parsed report advances DELIVERED',async()=>assert.equal((await event(f,a,'delivery',-1,0,report)).state,'delivered'))
 await test('late pending report cannot downgrade delivery',async()=>assert.equal((await event(f,a,'delivery',-1,0,{...report,status:32})).state,'delivered'))
 await test('conflicting terminal delivery latches UNKNOWN',async()=>{assert.equal((await event(f,a,'delivery',-1,0,{...report,status:64})).state,'unknown');assert.equal((await event(f,a,'delivery',-1,0,report)).state,'unknown')})
 await test('skip resolution survives conflicting/late callbacks',async()=>{const id=await recovery(f,a);assert.equal((await ack(f,id)).outcome,'applied');const r=await event(f,a);assert.equal(r.state,'unknown');assert.equal(r.resolution,'skip_without_retry');assert.ok(r.resolved_at);assert.equal((await ack(f,id)).outcome,'applied')})
 const b=await begin(f,1),eventId=uuid()
 await test('matching immutable event replay is idempotent',async()=>{await event(f,b,'sent',-1,0,{id:eventId});assert.equal((await event(f,b,'sent',-1,0,{id:eventId})).outcome,'duplicate')})
 await test('same event ID with conflicting payload is durably retained',async()=>{assert.equal((await event(f,b,'sent',1,0,{id:eventId})).outcome,'conflict');await event(f,b,'sent',1,0,{id:eventId});assert.equal(await scalar('select count(*)::int from campaign_callback_conflicts where attempt_id=$1',[b.attempt_id]),1);assert.equal((await event(f,b)).state,'unknown')})
 const c=await begin(f,2)
 await test('timeout UNKNOWN can resolve from complete late SENT',async()=>{await event(f,c,'unknown');assert.equal((await event(f,c)).state,'sent')})
 const d=await begin(f,3)
 await test('ACK after late success is terminal superseded, including replay',async()=>{await event(f,d,'unknown');const id=await recovery(f,d);await event(f,d);assert.equal((await ack(f,id)).outcome,'superseded');assert.equal((await ack(f,id)).outcome,'superseded');assert.equal(await role('anon',()=>scalar('select acknowledge_gateway_message_recovery($1,$2,$3)',[f.device,f.secret,id])),true)})
 const e=await begin(f,4)
 await test('device rejection is terminal and allows a new request identity',async()=>{await event(f,e,'unknown');const id=await recovery(f,e);assert.equal((await ack(f,id,'not_applicable')).outcome,'rejected');const next=await recovery(f,e);assert.notEqual(next,id);assert.equal((await ack(f,next)).outcome,'applied')})
 const fail=await begin(f,5)
 await test('failed SENT is UNKNOWN and never retry eligible',async()=>{const r=await event(f,fail,'sent',1);assert.equal(r.state,'unknown');assert.equal(r.safe_retry_eligible,false);await denied(()=>role('authenticated',()=>scalar("select request_campaign_message_recovery($1,$2,'safe_retry')",[f.org,f.campaign])),'22023')})
 const noProof=await begin(f,6)
 await test('missing or malformed evidence cannot prove delivered',async()=>{await event(f,noProof);for(const x of [{...report,hash:null},{...report,hash:'bad'},{...report,format:'invalid'},{...report,status:99999}]) assert.equal((await event(f,noProof,'delivery',-1,0,x)).state,'sent')})
 const deleted=await fixture(),del=await begin(deleted)
 await event(deleted,del);await event(deleted,del,'delivery',-1,0,report)
 await test('permitted campaign deletion retains callback tombstone',async()=>{await role('authenticated',()=>scalar('select delete_campaign($1,$2)',[deleted.org,deleted.campaign]));assert.equal((await event(deleted,del)).outcome,'tombstoned');assert.equal((await rows("select * from report_gateway_message_attempt_event($1,$2,$3,$4,'sent',0,-1,1234567890000)",[deleted.device,deleted.secret,uuid(),del.client_attempt_id])).length,1)})
 const foreign=await fixture()
 await test('other gateway cannot inspect an attempt or tombstone',async()=>{assert.equal((await event(foreign,a)).outcome,'rejected');assert.equal((await event(foreign,del)).outcome,'rejected')})
 await test('wrong credential rejected before callback processing',async()=>await denied(()=>event({...f,secret:'wrong-credential-xxxxxxxx'},a)))
 await test('expired credential rejected',async()=>{await db.query("update gateway_device_credentials set issued_at=now()-interval '2 days',expires_at=now()-interval '1 day' where device_id=$1",[foreign.device]);await denied(()=>event(foreign,a))})
 await test('unauthenticated/cross-workspace Web RPCs rejected',async()=>{await actor(foreign);await denied(()=>role('authenticated',()=>scalar('select get_campaign_contract_health($1,$2)',[f.org,f.campaign])));await db.exec("select set_config('request.jwt.claim.sub','',false)");await denied(()=>role('authenticated',()=>scalar('select get_campaign_contract_health($1,$2)',[f.org,f.campaign])))})
 await test('internal helpers and tombstones inaccessible to client roles',async()=>{for(const roleName of ['anon','authenticated']){await denied(()=>role(roleName,()=>db.query('select retire_gateway_recoveries_internal($1)',[f.device])));await denied(()=>role(roleName,()=>db.query('select * from gateway_attempt_tombstones')))}})
 await test('conflict observations are tenant scoped under RLS',async()=>{await actor(foreign);assert.equal((await role('authenticated',()=>rows('select * from campaign_callback_conflicts'))).length,0);await actor(f);assert.ok((await role('authenticated',()=>rows('select * from campaign_callback_conflicts'))).length>=1)})
 const many=await fixture(31)
 for(let i=0;i<31;i++){const x=await begin(many,i);await event(many,x,'unknown')}
 await recovery(many)
 await db.query("update campaign_message_attempts set state='sent' where campaign_id=$1 and job_id<>$2",[many.campaign,many.jobs[30]])
 await test('more than 25 stale recoveries cannot starve one valid request',async()=>{const r=await rows('select * from list_gateway_message_recovery_requests($1,$2,25)',[many.device,many.secret]);assert.equal(r.length,1);assert.equal(r[0].job_id,many.jobs[30]);assert.equal(await scalar("select count(*)::int from campaign_message_recovery_requests where campaign_id=$1 and outcome='superseded'",[many.campaign]),30)})
 const blocked=await fixture(3,1,'queued')
 await insert('contact_suppression_events',{organization_id:blocked.org,normalized_e164:'+923100000000',event_type:'suppressed',reason:'opt_out',source:'manual',occurred_at:new Date().toISOString()})
 await test('suppressed oldest job blocked while later eligible jobs lease',async()=>{const r=await rows('select * from claim_gateway_message_jobs($1,$2,2)',[blocked.device,blocked.secret]);assert.equal(r.length,2);assert.ok(!r.some(x=>x.job_id===blocked.jobs[0]));assert.equal(await scalar('select execution_block_code from campaign_message_jobs where id=$1',[blocked.jobs[0]]),'recipient_ineligible')})
 const beforeSend=await fixture(2)
 await insert('contact_suppression_events',{organization_id:beforeSend.org,normalized_e164:'+923100000000',event_type:'suppressed',reason:'opt_out',source:'manual',occurred_at:new Date().toISOString()})
 await test('final compliance gate commits structured block without creating attempt',async()=>{assert.equal((await begin(beforeSend)).outcome,'blocked');assert.equal(await scalar('select count(*)::int from campaign_message_attempts where job_id=$1',[beforeSend.jobs[0]]),0);assert.equal((await rows('select * from begin_gateway_message_attempt($1,$2,$3,$4,1)',[beforeSend.device,beforeSend.secret,beforeSend.jobs[0],uuid()])).length,0)})
 await test('segment mismatch blocks and never creates attempt',async()=>assert.equal((await begin(beforeSend,1,uuid(),2)).code,'segment_mismatch'))
 const multi=await fixture(1,2),ma=await begin(multi)
 await test('multipart delivery needs all successful SENT and verified delivery parts',async()=>{assert.equal((await event(multi,ma,'sent',-1,0)).state,'prepared');await event(multi,ma,'sent',-1,1);await event(multi,ma,'delivery',-1,0,report);assert.equal((await event(multi,ma,'delivery',-1,1,{...report,status:32})).state,'sent');assert.equal((await event(multi,ma,'delivery',-1,1,report)).state,'delivered')})
 await test('null action and invalid part cannot mutate attempts',async()=>{await actor(f);await denied(()=>scalar('select request_campaign_message_recovery($1,$2,null)',[f.org,f.campaign]),'22023');await denied(()=>event(f,a,'sent',-1,99),'22023')})
 const oldBinding=await fixture(1,1,'queued')
 const newSim=await insert('gateway_device_sims',{device_id:oldBinding.device,subscription_id:2,slot_index:1,sim_identity_hash:'a'.repeat(64)})
 await db.query('update gateway_device_sim_bindings set sim_id=$1 where device_id=$2',[newSim.id,oldBinding.device])
 const newBinding=await fixture(1,1,'queued',{...oldBinding,sim:newSim.id})
 // Fresh fixture uses subscription 1/slot 0 defaults; align only frozen test snapshot with SIM 2.
 await db.query('update campaign_dispatches set sim_subscription_id=2,sim_slot_index=1 where id=$1',[newBinding.dispatch])
 await test('old SIM dispatch cannot starve later exact-binding dispatch',async()=>{const r=await rows('select * from claim_gateway_message_jobs($1,$2,1)',[oldBinding.device,oldBinding.secret]);assert.equal(r.length,1);assert.equal(r[0].job_id,newBinding.jobs[0]);assert.equal(r[0].sim_subscription_id,2);assert.ok(await scalar('select queue_block_reason from campaign_dispatches where id=$1',[oldBinding.dispatch]))})
 const stale=await fixture(1,1,'queued')
 await test('stale inventory prevents leasing and records reason',async()=>{await db.query("update gateway_devices set last_inventory_at=now()-interval '1 hour' where id=$1",[stale.device]);assert.equal((await rows('select * from claim_gateway_message_jobs($1,$2,1)',[stale.device,stale.secret])).length,0);assert.match(await scalar('select queue_block_reason from campaign_dispatches where id=$1',[stale.dispatch]),/stale/i)})
 const revoked=await fixture()
 await test('revoked device cannot post callbacks',async()=>{await db.query("update gateway_devices set status='revoked' where id=$1",[revoked.device]);await denied(()=>event(revoked,a))})
 await test('legacy begin cannot reauthorize a completed attempt',async()=>{assert.equal((await rows('select * from begin_gateway_message_attempt($1,$2,$3,$4,1)',[f.device,f.secret,f.jobs[2],c.client_attempt_id])).length,0)})
 await test('health distinguishes queue blocks, legacy evidence and recovery outcomes',async()=>{await actor(f);const h=await role('authenticated',()=>scalar('select get_campaign_contract_health($1,$2)',[f.org,f.campaign]));assert.ok(h.conflicted_attempts>=2);assert.ok(h.recovery_outcomes.applied>=1);await actor(beforeSend);const h2=await scalar('select get_campaign_contract_health($1,$2)',[beforeSend.org,beforeSend.campaign]);assert.equal(h2.blocked_jobs,2)})
 await test('bulk delete removes only safe queued campaign and retains leased campaign',async()=>{await actor(oldBinding);const r=await role('authenticated',()=>scalar('select delete_campaign_history($1)',[oldBinding.org]));assert.equal(r.deletedCount,1);assert.equal(r.skippedCount,1);assert.equal(await scalar('select count(*)::int from campaigns where id=$1',[newBinding.campaign]),1)})
 const cdma=await fixture(2),cdmaPending=await begin(cdma),cdmaSuccess=await begin(cdma,1)
 await event(cdma,cdmaPending);await event(cdma,cdmaSuccess)
 await test('CDMA uses raw Android upper-word status; failure never grants resend',async()=>{await event(cdma,cdmaPending,'delivery',-1,0,{...report,format:'3gpp2',status:1<<16});assert.equal(await scalar('select delivery_state from campaign_message_attempt_parts where attempt_id=$1',[cdmaPending.attempt_id]),'pending');const r=await event(cdma,cdmaPending,'delivery',-1,0,{...report,format:'3gpp2',status:3<<24});assert.equal(r.state,'sent');assert.equal(r.safe_retry_eligible,false);assert.equal(await scalar('select delivery_state from campaign_message_attempt_parts where attempt_id=$1',[cdmaPending.attempt_id]),'failed');assert.equal((await event(cdma,cdmaSuccess,'delivery',-1,0,{...report,format:'3gpp2',status:0})).state,'delivered')})
 console.log(`PASS: ${passed} SQL contract scenarios; full migrations executed in disposable PGlite. No hosted calls.`)
} catch(e) {console.error('FAIL:',e.message,e.code??'',e.detail??'',e.where??'');process.exitCode=1}
finally {await db.close()}
