import {randomUUID} from "node:crypto";
import {paymentDB} from "./v3-payment-store.js";
import {PaymentError,assertIntentId,assertWorkspaceId} from "./v3-payment-core.js";
import {authorizeExecutionIntent,executionIsTerminal} from "./v3-execution-core.js";
import {hasPermission} from "./v3-identity-core.js";

let initialized;
const DDL=[
 "CREATE TABLE IF NOT EXISTS ama_v3_executions(intent_id text PRIMARY KEY REFERENCES ama_v3_payment_intents(id) ON DELETE CASCADE,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,tx_hash text NOT NULL UNIQUE,packet_digest text NOT NULL,status text NOT NULL CHECK(status IN ('reserved','pending','uncertain','confirmed','finalized','failed','disputed')),broadcast_attempts integer NOT NULL CHECK(broadcast_attempts=1),broadcast_started_at timestamptz NOT NULL DEFAULT NOW(),checked_at timestamptz,verified_at timestamptz,entry_hash text,entry_height bigint,receipt jsonb,last_error text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),updated_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE INDEX IF NOT EXISTS ama_v3_executions_workspace ON ama_v3_executions(workspace_id,created_at DESC)"
];
export async function executionDB(){
 const sql=await paymentDB();
 if(!initialized)initialized=(async()=>{for(const statement of DDL)await sql.unsafe(statement);return true})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
async function permission(sql,actor,workspaceId,action){
 const r=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 LIMIT 1",[workspaceId,actor]);
 if(!r.length||!hasPermission(r[0].role,action))
  throw new PaymentError(403,"Workspace financial access denied");
 return r[0];
}
async function recordEvent(sql,intent,actor,name,details={}){
 await sql.unsafe("INSERT INTO ama_v3_payment_events(id,intent_id,workspace_id,actor,event,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[
  randomUUID(),intent.id,intent.workspace_id,actor,name,JSON.stringify(details)
 ]);
}
async function lockedIntent(sql,workspaceId,id){
 const rows=await sql.unsafe("SELECT * FROM ama_v3_payment_intents WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[id,workspaceId]);
 if(!rows.length)throw new PaymentError(404,"Payment intent not found in workspace");
 return rows[0];
}
async function beneficiary(sql,workspaceId,recipient){
 const rows=await sql.unsafe("SELECT status,version FROM ama_v3_beneficiaries WHERE workspace_id=$1 AND address=$2 FOR SHARE",[workspaceId,recipient]);
 return rows[0]||null;
}
function publicExecution(row,intent){
 if(!row)return null;
 return {
  intentId:row.intent_id,workspaceId:row.workspace_id,txHash:row.tx_hash,
  status:row.status,network:"amadeus-testnet",payer:intent?.payer||null,
  recipient:intent?.recipient||null,amountUnits:intent?String(intent.amount_units):null,
  asset:"AMA",broadcastAttempts:row.broadcast_attempts,
  broadcastStartedAt:row.broadcast_started_at,checkedAt:row.checked_at,
  verifiedAt:row.verified_at,reason:row.last_error||null,
  receipt:row.receipt||null,independentlyVerified:row.status==="finalized"&&!!row.receipt,
  mayRetryBroadcast:false
 };
}
export async function preflightIntent({workspaceId,id,actor}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 const sql=await executionDB();
 await permission(sql,actor,workspaceId,"payment:read");
 const rows=await sql.unsafe("SELECT * FROM ama_v3_payment_intents WHERE id=$1 AND workspace_id=$2",[id,workspaceId]);
 if(!rows.length)throw new PaymentError(404,"Payment intent not found");
 const intent=rows[0];
 const b=await beneficiary(sql,workspaceId,intent.recipient);
 authorizeExecutionIntent(intent,b,actor);
 const existing=await sql.unsafe("SELECT intent_id FROM ama_v3_executions WHERE intent_id=$1",[id]);
 if(existing.length)throw new PaymentError(409,"Payment already has a reserved signed transaction. Recover status; do not re-sign.");
 return intent;
}
export async function reserveSignedExecution({workspaceId,id,actor,verified}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 const sql=await executionDB();
 return sql.begin(async tx=>{
  await permission(tx,actor,workspaceId,"payment:read");
  const intent=await lockedIntent(tx,workspaceId,id);
  const rows=await tx.unsafe("SELECT * FROM ama_v3_executions WHERE intent_id=$1 FOR UPDATE",[id]);
  if(rows.length){
   if(rows[0].tx_hash!==verified.hash||rows[0].packet_digest!==verified.packetDigest)
    throw new PaymentError(409,"A different signed packet was already reserved. No second broadcast allowed.");
   return {created:false,record:rows[0],intent};
  }
  const b=await beneficiary(tx,workspaceId,intent.recipient);
  authorizeExecutionIntent(intent,b,actor);
  if(verified.signer!==intent.payer||verified.recipient!==intent.recipient||
     verified.amountUnits!==String(intent.amount_units)||verified.asset!=="AMA")
    throw new PaymentError(409,"Signed transaction does not match the approved payment");
  const result=await tx.unsafe("INSERT INTO ama_v3_executions(intent_id,workspace_id,tx_hash,packet_digest,status,broadcast_attempts,created_by) VALUES($1,$2,$3,$4,'reserved',1,$5) RETURNING *",[
   id,workspaceId,verified.hash,verified.packetDigest,actor
  ]);
  await recordEvent(tx,intent,actor,"m4_signed_packet_reserved",{txHash:verified.hash,termsHash:intent.terms_hash});
  return {created:true,record:result[0],intent};
 });
}
export async function recordBroadcastResult({workspaceId,id,hash,status,actor,reason}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 if(!["pending","uncertain"].includes(status))
  throw new PaymentError(400,"Invalid post-broadcast status");
 const sql=await executionDB();
 return sql.begin(async tx=>{
  await permission(tx,actor,workspaceId,"payment:read");
  const rows=await tx.unsafe(
   "UPDATE ama_v3_executions SET status=$1,last_error=$2,updated_at=NOW() WHERE intent_id=$3 AND workspace_id=$4 AND tx_hash=$5 AND status='reserved' RETURNING *",
   [status,reason?String(reason).slice(0,150):null,id,workspaceId,hash]
  );
  const intent=await lockedIntent(tx,workspaceId,id);
  if(rows.length)await recordEvent(tx,intent,actor,"m4_broadcast_"+status,{txHash:hash});
  const existing=rows[0]||(await tx.unsafe("SELECT * FROM ama_v3_executions WHERE intent_id=$1 AND workspace_id=$2",[id,workspaceId]))[0];
  if(!existing)throw new PaymentError(404,"Reserved signed transaction not found");
  return publicExecution(existing,intent);
 });
}
export async function readExecution({workspaceId,id,actor}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 const sql=await executionDB();
 await permission(sql,actor,workspaceId,"payment:read");
 const rows=await sql.unsafe("SELECT e.*,i.payer,i.recipient,i.amount_units,i.terms_hash,i.status AS intent_status FROM ama_v3_executions e JOIN ama_v3_payment_intents i ON i.id=e.intent_id WHERE e.workspace_id=$1 AND e.intent_id=$2",[workspaceId,id]);
 if(!rows.length)return null;
 return {record:rows[0],public:publicExecution(rows[0],rows[0])};
}
export async function recordChainVerification({workspaceId,id,actor,observation}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 if(!["pending","confirmed","finalized","failed","disputed"].includes(observation.status))
  throw new PaymentError(400,"Invalid verified chain observation");
 const sql=await executionDB();
 return sql.begin(async tx=>{
  await permission(tx,actor,workspaceId,"payment:read");
  const i=await lockedIntent(tx,workspaceId,id);
  const r=(await tx.unsafe("SELECT * FROM ama_v3_executions WHERE intent_id=$1 AND workspace_id=$2 FOR UPDATE",[id,workspaceId]))[0];
  if(!r)throw new PaymentError(404,"No signed execution to reconcile");
  if(executionIsTerminal(r.status))return publicExecution(r,i);
  // Confirmation may only upgrade to finalized; never mark a pending/failed broadcast settled.
  if(r.status==="confirmed"&&observation.status==="pending")return publicExecution(r,i);
  const evidence=observation.receipt&&["confirmed","finalized"].includes(observation.status)?observation.receipt:null;
  const changed=await tx.unsafe(
   "UPDATE ama_v3_executions SET status=$1,checked_at=NOW(),verified_at=CASE WHEN $1='finalized' THEN NOW() ELSE verified_at END,receipt=$2::jsonb,entry_hash=$3,entry_height=$4,last_error=$5,updated_at=NOW() WHERE intent_id=$6 AND workspace_id=$7 RETURNING *",
   [observation.status,evidence?JSON.stringify(evidence):null,
    evidence?.entryHash||null,evidence?.entryHeight??null,
    observation.reason?String(observation.reason).slice(0,160):null,id,workspaceId]
  );
  await recordEvent(tx,i,actor,"m4_chain_"+observation.status,{txHash:r.tx_hash,
   metadataHeight:evidence?.entryHeight??null,verified:evidence?.finality==="finalized"});
  return publicExecution(changed[0],i);
 });
}
