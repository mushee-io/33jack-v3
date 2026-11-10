/**
 * M7 policy, maker-checker seals, manual risk reports and tamper-evident audit.
 * Uses M2 workspace membership; no wallet secrets, provider KYC or chain writes.
 * Policy row locks serialize finance decisions with policy mutations.
 */
import {randomUUID} from "node:crypto";
import {paymentDB} from "./v3-payment-store.js";
import {hasPermission,nativeAddress} from "./v3-identity-core.js";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
import {
 M7_DEFAULTS,M7_EXTERNAL_COMPLIANCE,positiveAtomic,strictPolicyPatch,
 assertFinancialPolicy,validateRiskFlag,canonicalAuditHash,verifyAuditRows,digest
} from "./v3-governance-core.js";

let initialized;
const DDL=[
 "CREATE TABLE IF NOT EXISTS ama_v3_m7_policies(workspace_id text PRIMARY KEY REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,version integer NOT NULL DEFAULT 1 CHECK(version>0),paused boolean NOT NULL DEFAULT false,max_payment_units numeric(40,0) NOT NULL DEFAULT 100000000000 CHECK(max_payment_units>0),daily_units numeric(40,0) NOT NULL DEFAULT 500000000000 CHECK(daily_units>0),high_risk_units numeric(40,0) NOT NULL DEFAULT 1000000000 CHECK(high_risk_units>0),enforce_two_person boolean NOT NULL DEFAULT true,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE TABLE IF NOT EXISTS ama_v3_m7_approval_seals(intent_id text PRIMARY KEY REFERENCES ama_v3_payment_intents(id) ON DELETE RESTRICT,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,policy_version integer NOT NULL,terms_hash text NOT NULL,payer text NOT NULL,maker text NOT NULL,approver text NOT NULL,high_risk boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE TABLE IF NOT EXISTS ama_v3_m7_flags(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,kind text NOT NULL,invoice_ref text NOT NULL DEFAULT '',recipient text NOT NULL DEFAULT '',reason_hash text NOT NULL,active boolean NOT NULL DEFAULT true,reported_by text NOT NULL,closed_by text,created_at timestamptz NOT NULL DEFAULT NOW(),closed_at timestamptz)",
 "CREATE INDEX IF NOT EXISTS ama_v3_m7_flags_active ON ama_v3_m7_flags(workspace_id,active,invoice_ref,recipient)",
 "CREATE TABLE IF NOT EXISTS ama_v3_m7_incidents(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),kind text NOT NULL,state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','investigating','resolved')),detail_hash text NOT NULL,tx_hash text,reported_by text NOT NULL,resolved_by text,created_at timestamptz NOT NULL DEFAULT NOW(),resolved_at timestamptz)",
 "CREATE TABLE IF NOT EXISTS ama_v3_m7_resumes(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,requested_by text NOT NULL,requested_version integer NOT NULL,expires_at timestamptz NOT NULL,confirmed_by text,confirmed_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE TABLE IF NOT EXISTS ama_v3_m7_events(id text PRIMARY KEY,seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,event text NOT NULL,actor text NOT NULL,entity_id text NOT NULL,details text NOT NULL,previous_hash text NOT NULL,event_hash text NOT NULL,occurred_at timestamptz NOT NULL,UNIQUE(workspace_id,event_hash))",
 "CREATE INDEX IF NOT EXISTS ama_v3_m7_events_order ON ama_v3_m7_events(workspace_id,seq)",
 "CREATE OR REPLACE FUNCTION ama_v3_m7_immutable_events() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'M7 audit records are append-only'; END; $$",
 "DO $body$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ama_v3_m7_no_update_or_delete') THEN CREATE TRIGGER ama_v3_m7_no_update_or_delete BEFORE UPDATE OR DELETE ON ama_v3_m7_events FOR EACH ROW EXECUTE FUNCTION ama_v3_m7_immutable_events(); END IF; END $body$"
];
export async function governanceDB(){
 const sql=await paymentDB();
 if(!initialized)initialized=(async()=>{for(const ddl of DDL)await sql.unsafe(ddl);return true})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
async function member(sql,workspaceId,actor,permission="workspace:read"){
 const r=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 LIMIT 1",[workspaceId,actor]);
 if(!r.length||!hasPermission(r[0].role,permission))throw new PaymentError(403,"M7 workspace permission denied");
 return r[0];
}
async function admin(sql,workspaceId,actor){
 const m=await member(sql,workspaceId,actor);
 if(!["owner","admin"].includes(m.role))throw new PaymentError(403,"Only owner/admin may change security policy");
 return m;
}
export async function lockedPolicy(sql,workspaceId,actor="system"){
 await sql.unsafe("INSERT INTO ama_v3_m7_policies(workspace_id,updated_by) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[workspaceId,actor]);
 const rows=await sql.unsafe("SELECT * FROM ama_v3_m7_policies WHERE workspace_id=$1 FOR UPDATE",[workspaceId]);
 if(!rows.length)throw new PaymentError(503,"M7 financial policy unavailable");
 return rows[0];
}
export function publicPolicy(p){
 return {workspaceId:p.workspace_id,version:Number(p.version),paused:p.paused,
  maxPaymentUnits:String(p.max_payment_units),dailyUnits:String(p.daily_units),
  highRiskUnits:String(p.high_risk_units),enforceTwoPersonHighRisk:p.enforce_two_person,
  network:"amadeus-testnet",externalCompliance:M7_EXTERNAL_COMPLIANCE};
}
async function audit(sql,workspaceId,actor,event,entityId,details){
 // All financial/state writes hold policy row FOR UPDATE, enforcing single writer.
 const last=await sql.unsafe("SELECT event_hash FROM ama_v3_m7_events WHERE workspace_id=$1 ORDER BY seq DESC LIMIT 1",[workspaceId]);
 const previousHash=last[0]?.event_hash??"0".repeat(64);
 const timestamp=new Date().toISOString();
 const eventHash=canonicalAuditHash({workspaceId,previousHash,event,actor,entityId,details,timestamp});
 const id=randomUUID();
 await sql.unsafe("INSERT INTO ama_v3_m7_events(id,workspace_id,event,actor,entity_id,details,previous_hash,event_hash,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[
  id,workspaceId,event,actor,entityId,JSON.stringify(details),previousHash,eventHash,new Date(timestamp)
 ]);
 return {id,eventHash,previousHash};
}
async function flagsFor(sql,workspaceId,intent){
 return sql.unsafe("SELECT id,kind,active FROM ama_v3_m7_flags WHERE workspace_id=$1 AND active=true AND ((invoice_ref<>'' AND lower(invoice_ref)=lower($2)) OR (recipient<>'' AND recipient=$3) OR (invoice_ref='' AND recipient='')) FOR SHARE",[
  workspaceId,String(intent.invoice_ref||""),intent.recipient
 ]);
}
async function dailyLimit(sql,workspaceId,amount,policy,excludeId=null){
 const rows=await sql.unsafe("SELECT COALESCE(SUM(amount_units),0)::text AS total FROM ama_v3_payment_intents WHERE workspace_id=$1 AND created_at>NOW()-INTERVAL '24 hours' AND status IN ('draft','reviewed','awaiting_wallet_signature') AND ($2::text IS NULL OR id<>$2)",[
  workspaceId,excludeId
 ]);
 if(BigInt(rows[0].total)+BigInt(amount)>BigInt(policy.daily_units))
  throw new PaymentError(429,"M7 rolling organization payment cap exceeded; no approval or execution permitted");
}
export async function guardPaymentCreate({sql,workspaceId,actor,amountUnits,recipient,invoiceRef}){
 const policy=await lockedPolicy(sql,workspaceId,actor);
 const synthetic={network:"amadeus-testnet",asset:"AMA",payer:actor,recipient,
  amount_units:String(amountUnits),invoice_ref:invoiceRef||"",created_by:actor};
 const flags=await flagsFor(sql,workspaceId,synthetic);
 assertFinancialPolicy({intent:synthetic,policy,flags,actor,action:"create"});
 await dailyLimit(sql,workspaceId,amountUnits,policy);
 return {policy,flags};
}
export async function guardPaymentTransition({sql,intent,actor,action}){
 const policy=await lockedPolicy(sql,intent.workspace_id,actor);
 const flags=await flagsFor(sql,intent.workspace_id,intent);
 const risk=assertFinancialPolicy({intent,policy,flags,actor,action});
 if(action!=="cancel")await dailyLimit(sql,intent.workspace_id,intent.amount_units,policy,intent.id);
 return {policy,risk};
}
export async function sealFinancialApproval({sql,intent,actor,policy,risk}){
 const rows=await sql.unsafe("INSERT INTO ama_v3_m7_approval_seals(intent_id,workspace_id,policy_version,terms_hash,payer,maker,approver,high_risk) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(intent_id) DO NOTHING RETURNING *",[
  intent.id,intent.workspace_id,policy.version,intent.terms_hash,intent.payer,intent.created_by,actor,risk.highRisk
 ]);
 if(!rows.length)throw new PaymentError(409,"M7 approval seal already exists");
 await audit(sql,intent.workspace_id,actor,"m7_approval_sealed",intent.id,{
  policyVersion:policy.version,termsHash:intent.terms_hash,highRisk:risk.highRisk,
  separateChecker:actor!==intent.created_by
 });
 return rows[0];
}
export async function guardExecution({sql,intent,actor}){
 const policy=await lockedPolicy(sql,intent.workspace_id,actor);
 const flags=await flagsFor(sql,intent.workspace_id,intent);
 const found=await sql.unsafe("SELECT * FROM ama_v3_m7_approval_seals WHERE intent_id=$1 AND workspace_id=$2 FOR SHARE",[intent.id,intent.workspace_id]);
 return assertFinancialPolicy({intent,policy,flags,actor,action:"execute",approvalSeal:found[0]});
}
export async function getPolicy({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await governanceDB();
 await member(sql,workspaceId,actor);
 return sql.begin(async tx=>publicPolicy(await lockedPolicy(tx,workspaceId,actor)));
}
export async function updatePolicy({workspaceId,actor,expectedVersion,patch}){
 workspaceId=assertWorkspaceId(workspaceId);
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
  throw new PaymentError(400,"Policy version required to prevent stale changes");
 const change=strictPolicyPatch(patch),sql=await governanceDB();
 return sql.begin(async tx=>{
  await admin(tx,workspaceId,actor);
  const policy=await lockedPolicy(tx,workspaceId,actor);
  if(Number(policy.version)!==expectedVersion)throw new PaymentError(409,"Stale policy version rejected");
  const max=change.maxPaymentUnits??String(policy.max_payment_units);
  const daily=change.dailyUnits??String(policy.daily_units);
  const high=change.highRiskUnits??String(policy.high_risk_units);
  if(BigInt(max)>100000000000n||BigInt(daily)>500000000000n||BigInt(high)>BigInt(max))
   throw new PaymentError(400,"M7 policy cannot weaken native transfer caps or exceed daily limit");
  const rows=await tx.unsafe("UPDATE ama_v3_m7_policies SET version=version+1,max_payment_units=$1,daily_units=$2,high_risk_units=$3,enforce_two_person=true,updated_by=$4,updated_at=NOW() WHERE workspace_id=$5 RETURNING *",[
   max,daily,high,actor,workspaceId
  ]);
  await audit(tx,workspaceId,actor,"m7_policy_updated",workspaceId,{
   oldVersion:policy.version,newVersion:rows[0].version,
   newLimits:{maxPaymentUnits:max,dailyUnits:daily,highRiskUnits:high},pendingApprovalsInvalidated:true
  });
  return publicPolicy(rows[0]);
 });
}
export async function emergencyPause({workspaceId,actor,reason}){
 workspaceId=assertWorkspaceId(workspaceId);
 if(typeof reason!=="string"||reason.trim().length<12||reason.length>400)
  throw new PaymentError(400,"Emergency pause requires an incident description");
 const sql=await governanceDB();
 return sql.begin(async tx=>{
  await admin(tx,workspaceId,actor);
  const policy=await lockedPolicy(tx,workspaceId,actor);
  if(policy.paused)throw new PaymentError(409,"Workspace already paused");
  const rows=await tx.unsafe("UPDATE ama_v3_m7_policies SET paused=true,version=version+1,updated_by=$1,updated_at=NOW() WHERE workspace_id=$2 RETURNING *",[actor,workspaceId]);
  await audit(tx,workspaceId,actor,"m7_emergency_paused",workspaceId,{reasonHash:digest(reason),policyVersion:rows[0].version});
  return publicPolicy(rows[0]);
 });
}
export async function requestResume({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await governanceDB();
 return sql.begin(async tx=>{
  await admin(tx,workspaceId,actor);
  const policy=await lockedPolicy(tx,workspaceId,actor);
  if(!policy.paused)throw new PaymentError(409,"Workspace is not paused");
  const expiresAt=new Date(Date.now()+60*60000);
  const rows=await tx.unsafe("INSERT INTO ama_v3_m7_resumes(id,workspace_id,requested_by,requested_version,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *",[
   randomUUID(),workspaceId,actor,policy.version,expiresAt
  ]);
  await audit(tx,workspaceId,actor,"m7_resume_requested",rows[0].id,{policyVersion:policy.version,expiresAt:expiresAt.toISOString()});
  return {id:rows[0].id,requestedBy:actor,expiresAt,requiresIndependentOwnerOrAdmin:true};
 });
}
export async function confirmResume({workspaceId,actor,requestId}){
 workspaceId=assertWorkspaceId(workspaceId);requestId=assertIntentId(requestId);const sql=await governanceDB();
 return sql.begin(async tx=>{
  await admin(tx,workspaceId,actor);
  const policy=await lockedPolicy(tx,workspaceId,actor);
  if(!policy.paused)throw new PaymentError(409,"Workspace already unpaused");
  const rows=await tx.unsafe("SELECT * FROM ama_v3_m7_resumes WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[requestId,workspaceId]);
  const x=rows[0];
  if(!x||x.confirmed_at||new Date(x.expires_at).getTime()<=Date.now()||
     x.requested_by===actor||Number(x.requested_version)!==Number(policy.version))
    throw new PaymentError(409,"Independent, current and unexpired resume approval required");
  await tx.unsafe("UPDATE ama_v3_m7_resumes SET confirmed_by=$1,confirmed_at=NOW() WHERE id=$2",[actor,requestId]);
  const changed=await tx.unsafe("UPDATE ama_v3_m7_policies SET paused=false,version=version+1,updated_by=$1,updated_at=NOW() WHERE workspace_id=$2 RETURNING *",[actor,workspaceId]);
  await audit(tx,workspaceId,actor,"m7_resumed_two_person",workspaceId,{
   requester:x.requested_by,confirmer:actor,newVersion:changed[0].version,
   existingApprovalsRemainInvalid:true
  });
  return publicPolicy(changed[0]);
 });
}
export async function reportRisk({workspaceId,actor,input}){
 workspaceId=assertWorkspaceId(workspaceId);
 const x=validateRiskFlag(input),sql=await governanceDB();
 if(x.recipient)nativeAddress(x.recipient);
 if(!x.recipient&&!x.invoiceRef)
  throw new PaymentError(400,"Risk report must target a native recipient or invoice reference");
 return sql.begin(async tx=>{
  await member(tx,workspaceId,actor,"invoice:write");
  await lockedPolicy(tx,workspaceId,actor);
  const rows=await tx.unsafe("INSERT INTO ama_v3_m7_flags(id,workspace_id,kind,invoice_ref,recipient,reason_hash,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[
   randomUUID(),workspaceId,x.kind,x.invoiceRef,x.recipient,x.reasonHash,actor
  ]);
  await audit(tx,workspaceId,actor,"m7_risk_reported",rows[0].id,{
   kind:x.kind,invoiceRef:x.invoiceRef,recipient:x.recipient,reasonHash:x.reasonHash
  });
  return {id:rows[0].id,kind:x.kind,active:true,screening:"human_report_only"};
 });
}
export async function closeRisk({workspaceId,actor,id,reason}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 if(typeof reason!=="string"||reason.length<10||reason.length>400)
  throw new PaymentError(400,"Risk clearance requires bounded documented reason");
 const sql=await governanceDB();
 return sql.begin(async tx=>{
  await admin(tx,workspaceId,actor);const p=await lockedPolicy(tx,workspaceId,actor);
  const rows=await tx.unsafe("UPDATE ama_v3_m7_flags SET active=false,closed_by=$1,closed_at=NOW() WHERE id=$2 AND workspace_id=$3 AND active=true RETURNING *",[actor,id,workspaceId]);
  if(!rows.length)throw new PaymentError(404,"Open risk flag not found");
  // Existing approvals cannot be resurrected merely by closing a hold.
  const updated=await tx.unsafe("UPDATE ama_v3_m7_policies SET version=version+1,updated_by=$1,updated_at=NOW() WHERE workspace_id=$2 RETURNING version",[actor,workspaceId]);
  await audit(tx,workspaceId,actor,"m7_risk_closed",id,{reasonHash:digest(reason),
   priorPolicyVersion:p.version,newVersion:updated[0].version,pendingApprovalsInvalidated:true});
  return {id,active:false,policyVersion:updated[0].version};
 });
}
export async function readRisks({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await governanceDB();
 await member(sql,workspaceId,actor);
 return sql.unsafe("SELECT id,kind,invoice_ref,recipient,active,reported_by,closed_by,created_at,closed_at FROM ama_v3_m7_flags WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[workspaceId]);
}
export async function reportIncident({workspaceId,actor,severity,kind,detail,txHash}){
 workspaceId=assertWorkspaceId(workspaceId);
 if(!["low","medium","high","critical"].includes(severity)||
   typeof kind!=="string"||!/^[a-z_]{4,40}$/.test(kind)||
   typeof detail!=="string"||detail.length<12||detail.length>500)
  throw new PaymentError(400,"Incident requires severity, incident type and bounded factual details");
 if(txHash!==undefined&&(typeof txHash!=="string"||!/^[1-9A-HJ-NP-Za-km-z]{25,110}$/.test(txHash)))
  throw new PaymentError(400,"Invalid native transaction hash");
 const sql=await governanceDB();
 return sql.begin(async tx=>{
  await member(tx,workspaceId,actor);
  await lockedPolicy(tx,workspaceId,actor);
  const rows=await tx.unsafe("INSERT INTO ama_v3_m7_incidents(id,workspace_id,severity,kind,detail_hash,tx_hash,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[
   randomUUID(),workspaceId,severity,kind,digest(detail),txHash??null,actor
  ]);
  await audit(tx,workspaceId,actor,"m7_incident_reported",rows[0].id,{
   severity,kind,detailHash:digest(detail),txHash:txHash??null,
   automaticallyBroadcast:false
  });
  return {id:rows[0].id,severity,kind,state:"open",
   warning:severity==="critical"?"Owner/admin must separately activate emergency pause":"Incident recorded; no transaction action taken"};
 });
}
export async function readIncidents({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await governanceDB();
 await member(sql,workspaceId,actor);
 return sql.unsafe("SELECT id,severity,kind,state,tx_hash,reported_by,created_at FROM ama_v3_m7_incidents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[workspaceId]);
}
export async function auditEvidence({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await governanceDB();
 await member(sql,workspaceId,actor,"audit:read");
 const rows=await sql.unsafe("SELECT id,seq,workspace_id,event,actor,entity_id,details,previous_hash,event_hash,occurred_at FROM ama_v3_m7_events WHERE workspace_id=$1 ORDER BY seq ASC LIMIT 1000",[workspaceId]);
 return {network:"amadeus-testnet",...verifyAuditRows(rows,workspaceId),
  events:rows.map(x=>({id:x.id,event:x.event,actor:x.actor,entityId:x.entity_id,
    hash:x.event_hash,occurredAt:x.occurred_at})),
  limitation:"Tamper-evident database continuity, not external immutable notarization or a verified regulatory audit"};
}
