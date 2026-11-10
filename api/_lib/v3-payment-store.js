import {randomUUID} from "node:crypto";
import {identityDB} from "./v3-identity-store.js";
import {hasPermission,nativeAddress} from "./v3-identity-core.js";
import {PaymentError,assertWorkspaceId,assertIntentId,requestFingerprint,sha256,randomIntentNonce,intentTerms,termsFingerprint,assertExactReview,assertBeneficiarySnapshot,mayTransition,approvalReviewResult,assertIdempotencyKey,normalizeM3Request} from "./v3-payment-core.js";

/* Durable, workspace-scoped intent ledger: no keys, broadcast, or fake settlement. */
let initialized;
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS ama_v3_beneficiaries(workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,address text NOT NULL,status text NOT NULL CHECK(status IN ('allowed','blocked')),label text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(workspace_id,address))",
 "CREATE TABLE IF NOT EXISTS ama_v3_payment_intents(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,network text NOT NULL CHECK(network='amadeus-testnet'),payer text NOT NULL,recipient text NOT NULL,asset text NOT NULL CHECK(asset='AMA'),amount text NOT NULL,amount_units numeric(40,0) NOT NULL CHECK(amount_units>0),memo text NOT NULL DEFAULT '',invoice_ref text NOT NULL DEFAULT '',beneficiary_version integer NOT NULL CHECK(beneficiary_version>0),nonce text NOT NULL,terms_hash text NOT NULL,request_hash text NOT NULL,idempotency_hash text NOT NULL,status text NOT NULL CHECK(status IN ('draft','reviewed','awaiting_wallet_signature','cancelled','expired')),created_by text NOT NULL,reviewed_by text,approved_by text,approval_terms_hash text,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),updated_at timestamptz NOT NULL DEFAULT NOW(),UNIQUE(workspace_id,created_by,idempotency_hash))",
 "CREATE INDEX IF NOT EXISTS ama_v3_intents_workspace_created ON ama_v3_payment_intents(workspace_id,created_at DESC)",
 "CREATE INDEX IF NOT EXISTS ama_v3_intents_payer_status ON ama_v3_payment_intents(payer,status,expires_at)",
 "CREATE TABLE IF NOT EXISTS ama_v3_payment_events(id text PRIMARY KEY,intent_id text REFERENCES ama_v3_payment_intents(id) ON DELETE CASCADE,workspace_id text NOT NULL,actor text NOT NULL,event text NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT NOW())"
];
export async function paymentDB(){
 const sql=await identityDB();
 if(!initialized)initialized=(async()=>{for(const ddl of SCHEMA)await sql.unsafe(ddl);return true})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
async function membership(sql,address,workspaceId,action){
 const r=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE address=$1 AND workspace_id=$2 LIMIT 1",[address,workspaceId]);
 if(!r.length||!hasPermission(r[0].role,action))throw new PaymentError(403,"Workspace access denied");
 return r[0];
}
async function audit(sql,intent,actor,event,details={}){
 await sql.unsafe("INSERT INTO ama_v3_payment_events(id,intent_id,workspace_id,actor,event,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[randomUUID(),intent.id,intent.workspace_id,actor,event,JSON.stringify(details)]);
}
async function beneficiary(sql,workspaceId,address,lock=false){
 const q="SELECT status,version,label,address FROM ama_v3_beneficiaries WHERE workspace_id=$1 AND address=$2"+(lock?" FOR SHARE":"");
 const rows=await sql.unsafe(q,[workspaceId,address]);return rows[0]||null;
}
export async function updateBeneficiary({workspaceId,actor,address,status,label}){
 workspaceId=assertWorkspaceId(workspaceId);address=nativeAddress(address);
 if(!["allowed","blocked"].includes(status))throw new PaymentError(400,"Beneficiary status must be allowed or blocked");
 if(typeof label!=="string"||label.length>80||/[\u0000-\u001f\u007f]/.test(label))throw new PaymentError(400,"Invalid beneficiary label");
 const sql=await paymentDB();
 return sql.begin(async tx=>{
  await membership(tx,actor,workspaceId,"beneficiary:manage");
  const rows=await tx.unsafe("INSERT INTO ama_v3_beneficiaries(workspace_id,address,status,label,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,address) DO UPDATE SET status=EXCLUDED.status,label=EXCLUDED.label,updated_by=EXCLUDED.updated_by,updated_at=NOW(),version=ama_v3_beneficiaries.version+1 RETURNING workspace_id,address,status,label,version,updated_at",[workspaceId,address,status,label.trim(),actor]);
  return rows[0];
 });
}
export async function listBeneficiaries({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await paymentDB();await membership(sql,actor,workspaceId,"beneficiary:read");
 return sql.unsafe("SELECT address,status,label,version,updated_at FROM ama_v3_beneficiaries WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 100",[workspaceId]);
}
export async function createIntent({input,actor,idempotencyKey}){
 const normalized=normalizeM3Request(input,actor);
 const workspaceId=normalized.workspaceId,recipient=normalized.recipient;
 const key=assertIdempotencyKey(idempotencyKey);
 const keyHash=sha256(["v3",workspaceId,actor,key].join("\n"));
 const requestHash=requestFingerprint(normalized);
 const sql=await paymentDB();
 return sql.begin(async tx=>{
  await membership(tx,actor,workspaceId,"payment:propose");
  const found=await tx.unsafe("SELECT * FROM ama_v3_payment_intents WHERE workspace_id=$1 AND created_by=$2 AND idempotency_hash=$3 LIMIT 1",[workspaceId,actor,keyHash]);
  if(found.length){
   if(found[0].request_hash!==requestHash)throw new PaymentError(409,"Idempotency key reused with different payment terms");
   return {row:found[0],reused:true};
  }
  const b=await beneficiary(tx,workspaceId,recipient,true);
  if(!b||b.status!=="allowed")throw new PaymentError(403,"Recipient must be explicitly allowlisted before payment preparation");
  const active=await tx.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_payment_intents WHERE workspace_id=$1 AND created_by=$2 AND status IN ('draft','reviewed','awaiting_wallet_signature') AND expires_at>NOW()",[workspaceId,actor]);
  if(active[0].n>=20)throw new PaymentError(429,"Too many active payment intents; cancel or expire an earlier intent");
  const nonce=randomIntentNonce(),expiresAt=Date.now()+normalized.expiresInMinutes*60000;
  const terms=intentTerms(normalized,{beneficiaryVersion:Number(b.version),expiresAt,nonce});
  const termsHash=termsFingerprint(terms),id=randomUUID();
  const rows=await tx.unsafe("INSERT INTO ama_v3_payment_intents(id,workspace_id,network,payer,recipient,asset,amount,amount_units,memo,invoice_ref,beneficiary_version,nonce,terms_hash,request_hash,idempotency_hash,status,created_by,expires_at) VALUES($1,$2,'amadeus-testnet',$3,$4,'AMA',$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15) ON CONFLICT(workspace_id,created_by,idempotency_hash) DO NOTHING RETURNING *",[
   id,workspaceId,actor,recipient,normalized.amount,normalized.amountUnits,normalized.memo,normalized.invoiceRef,b.version,nonce,termsHash,requestHash,keyHash,actor,new Date(expiresAt)
  ]);
  if(!rows.length){
   const raced=await tx.unsafe("SELECT * FROM ama_v3_payment_intents WHERE workspace_id=$1 AND created_by=$2 AND idempotency_hash=$3 LIMIT 1",[workspaceId,actor,keyHash]);
   if(raced.length&&raced[0].request_hash===requestHash)return {row:raced[0],reused:true};
   throw new PaymentError(409,"Idempotency conflict; generate a new key");
  }
  await audit(tx,rows[0],actor,"intent_created",{termsHash,beneficiaryVersion:b.version,network:"amadeus-testnet"});
  return {row:rows[0],reused:false};
 });
}
export async function getIntent({workspaceId,id,actor}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 const sql=await paymentDB();await membership(sql,actor,workspaceId,"payment:read");
 const rows=await sql.unsafe("SELECT * FROM ama_v3_payment_intents WHERE id=$1 AND workspace_id=$2 LIMIT 1",[id,workspaceId]);
 if(!rows.length)throw new PaymentError(404,"Payment intent not found in this workspace");
 return approvalReviewResult(rows[0],await beneficiary(sql,workspaceId,rows[0].recipient));
}
export async function listIntents({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await paymentDB();await membership(sql,actor,workspaceId,"payment:read");
 const rows=await sql.unsafe("SELECT * FROM ama_v3_payment_intents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 30",[workspaceId]);
 const bs=await sql.unsafe("SELECT address,status,version FROM ama_v3_beneficiaries WHERE workspace_id=$1",[workspaceId]);
 const lookup=new Map(bs.map(x=>[x.address,x]));
 return rows.map(r=>approvalReviewResult(r,lookup.get(r.recipient)));
}
export async function transitionIntent({workspaceId,id,actor,expectedHash,action}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 if(!["review","approve","cancel"].includes(action))throw new PaymentError(400,"Unsupported M3 transition");
 const sql=await paymentDB();
 return sql.begin(async tx=>{
  const m=await membership(tx,actor,workspaceId,action==="cancel"?"payment:read":"payment:approve");
  const rows=await tx.unsafe("SELECT * FROM ama_v3_payment_intents WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[id,workspaceId]);
  if(!rows.length)throw new PaymentError(404,"Payment intent not found in this workspace");
  const row=rows[0];assertExactReview(row,expectedHash);
  if(action==="cancel"&&!hasPermission(m.role,"payment:approve")&&
     !(row.payer===actor&&hasPermission(m.role,"payment:propose")))
    throw new PaymentError(403,"Only an approver or original payer may cancel");
  const b=await beneficiary(tx,workspaceId,row.recipient,true);
  if(action!=="cancel")assertBeneficiarySnapshot(row,b);
  const next={review:"reviewed",approve:"awaiting_wallet_signature",cancel:"cancelled"}[action];
  if(!mayTransition(row.status,next))throw new PaymentError(409,"Illegal payment state transition");
  const changed=await tx.unsafe("UPDATE ama_v3_payment_intents SET status=$1,reviewed_by=CASE WHEN $2='review' THEN $3 ELSE reviewed_by END,approved_by=CASE WHEN $2='approve' THEN $3 ELSE approved_by END,approval_terms_hash=CASE WHEN $2='approve' THEN terms_hash ELSE approval_terms_hash END,updated_at=NOW() WHERE id=$4 AND workspace_id=$5 AND status=$6 AND expires_at>NOW() RETURNING *",[next,action,actor,id,workspaceId,row.status]);
  if(!changed.length)throw new PaymentError(409,"Payment intent expired or changed during review");
  await audit(tx,changed[0],actor,"intent_"+action,{from:row.status,to:next,termsHash:row.terms_hash});
  return {row:changed[0],beneficiary:b};
 });
}
