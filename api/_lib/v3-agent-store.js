/**
 * M5 durable agent context and audit. No agent-generated approvals or payment writes.
 * Only manually entered invoice references may be stored; they remain UNVERIFIED.
 */
import {randomUUID} from "node:crypto";
import {executionDB,readExecution} from "./v3-execution-store.js";
import {listBeneficiaries,listIntents,getIntent} from "./v3-payment-store.js";
import {getAmaClient} from "./amadeus-testnet.js";
import {hasPermission,nativeAddress} from "./v3-identity-core.js";
import {PaymentError,assertWorkspaceId,assertIntentId,sha256} from "./v3-payment-core.js";
import {allowedTool,strictAgentArgs,deterministicRisk,responseEnvelope} from "./v3-agent-core.js";

let initialized;
const DDL=[
 "CREATE TABLE IF NOT EXISTS ama_v3_agent_invoices(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,invoice_ref text NOT NULL,issuer_label text NOT NULL,recipient text,currency text NOT NULL,amount_text text NOT NULL,source_type text NOT NULL DEFAULT 'manual_unverified' CHECK(source_type='manual_unverified'),verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status='unverified'),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),UNIQUE(workspace_id,invoice_ref))",
 "CREATE INDEX IF NOT EXISTS ama_v3_agent_invoices_workspace ON ama_v3_agent_invoices(workspace_id,created_at DESC)",
 "CREATE TABLE IF NOT EXISTS ama_v3_agent_events(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,actor text NOT NULL,event text NOT NULL,input_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE INDEX IF NOT EXISTS ama_v3_agent_events_rate ON ama_v3_agent_events(workspace_id,actor,created_at DESC)"
];
export async function agentDB(){
 const sql=await executionDB();
 if(!initialized)initialized=(async()=>{for(const ddl of DDL)await sql.unsafe(ddl);return true})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
export async function requireAgentMembership(sql,{actor,workspaceId,permission="workspace:read"}){
 workspaceId=assertWorkspaceId(workspaceId);
 const rows=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE address=$1 AND workspace_id=$2 LIMIT 1",[actor,workspaceId]);
 if(!rows.length||!hasPermission(rows[0].role,permission))
  throw new PaymentError(403,"Agent workspace access denied");
 return rows[0];
}
export async function agentRateEvent({workspaceId,actor,event,input,limit=30}){
 workspaceId=assertWorkspaceId(workspaceId);
 if(typeof event!=="string"||!/^[a-z0-9_]{3,50}$/.test(event))throw new PaymentError(400,"Invalid agent event");
 const sql=await agentDB();
 return sql.begin(async tx=>{
  await requireAgentMembership(tx,{actor,workspaceId});
  // Serializes quota checks per actor+workspace across concurrent serverless requests.
  await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[workspaceId,actor]);
  const rows=await tx.unsafe(
   "SELECT COUNT(*)::integer AS n FROM ama_v3_agent_events WHERE workspace_id=$1 AND actor=$2 AND created_at>NOW()-INTERVAL '10 minutes'",[workspaceId,actor]);
  if(rows[0].n>=limit)throw new PaymentError(429,"Agent request rate limit reached; try again later");
  await tx.unsafe("INSERT INTO ama_v3_agent_events(id,workspace_id,actor,event,input_hash) VALUES($1,$2,$3,$4,$5)",[
   randomUUID(),workspaceId,actor,event,sha256(input)
  ]);
  return {remaining:Math.max(0,limit-rows[0].n-1)};
 });
}
function safeLabel(v,label,max){
 if(typeof v!=="string"||v.trim().length<2||v.length>max||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(v))
  throw new PaymentError(400,"Invalid "+label+" for unverified invoice");
 return v.trim();
}
export function validateManualInvoice(input){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new PaymentError(400,"Invalid invoice reference record");
 const workspaceId=assertWorkspaceId(input.workspaceId);
 const invoiceRef=safeLabel(input.invoiceRef,"invoice reference",90);
 if(!/^[A-Za-z0-9._/-]{2,90}$/.test(invoiceRef))throw new PaymentError(400,"Invoice reference must contain only simple identifier characters");
 const issuer=safeLabel(input.issuer,"issuer label",100);
 const currency=String(input.currency||"AMA").toUpperCase();
 if(!["AMA","GBP","USD","EUR"].includes(currency))
  throw new PaymentError(400,"Invoice currency unsupported; no FX conversion is available");
 const amount=String(input.amount||"");
 if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,9})?$/.test(amount)||Number(amount)<=0)
  throw new PaymentError(400,"Invalid unverified invoice amount");
 const recipient=input.recipient?nativeAddress(input.recipient):null;
 if(input.verification_status||input.source_type||input.verified===true||
    input.approved===true||input.paid===true||input.fxRate||input.paymentHash)
  throw new PaymentError(400,"Cannot claim verification, approval, payment, FX or source proof in manual invoice record");
 return {workspaceId,invoiceRef,issuer,currency,amount,recipient,
  verification_status:"unverified",source_type:"manual_unverified"};
}
export async function createManualInvoice({actor,input}){
 const invoice=validateManualInvoice(input),sql=await agentDB();
 return sql.begin(async tx=>{
  await requireAgentMembership(tx,{actor,workspaceId:invoice.workspaceId,permission:"invoice:write"});
  const result=await tx.unsafe(
   "INSERT INTO ama_v3_agent_invoices(id,workspace_id,invoice_ref,issuer_label,recipient,currency,amount_text,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,invoice_ref) DO NOTHING RETURNING *",
   [randomUUID(),invoice.workspaceId,invoice.invoiceRef,invoice.issuer,invoice.recipient,invoice.currency,invoice.amount,actor]
  );
  if(!result.length)throw new PaymentError(409,"Invoice reference already exists; manual duplicates require review");
  return result[0];
 });
}
function publicInvoice(row){
 return {id:row.id,invoiceRef:row.invoice_ref,issuer:row.issuer_label,
  recipient:row.recipient||null,currency:row.currency,amount:row.amount_text,
  sourceType:"manual_unverified",verificationStatus:"unverified",
  paidStatus:"not_asserted",createdAt:row.created_at};
}
export async function listManualInvoices({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await agentDB();
 await requireAgentMembership(sql,{actor,workspaceId,permission:"invoice:read"});
 const rows=await sql.unsafe(
  "SELECT * FROM ama_v3_agent_invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50",[workspaceId]);
 return rows.map(publicInvoice);
}
export async function getManualInvoice({workspaceId,id,actor}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 const sql=await agentDB();await requireAgentMembership(sql,{actor,workspaceId,permission:"invoice:read"});
 const rows=await sql.unsafe("SELECT * FROM ama_v3_agent_invoices WHERE workspace_id=$1 AND id=$2 LIMIT 1",[workspaceId,id]);
 if(!rows.length)throw new PaymentError(404,"Invoice reference not found in this workspace");
 return publicInvoice(rows[0]);
}
export async function listExecutionStatuses({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await agentDB();
 await requireAgentMembership(sql,{actor,workspaceId,permission:"payment:read"});
 const rows=await sql.unsafe(
  "SELECT e.intent_id,e.tx_hash,e.status,e.receipt,e.created_at,i.payer,i.recipient,i.amount_units FROM ama_v3_executions e JOIN ama_v3_payment_intents i ON i.id=e.intent_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC LIMIT 30",[workspaceId]);
 return rows.map(r=>({intentId:r.intent_id,hash:r.tx_hash,status:r.status,
  recipient:r.recipient,payer:r.payer,amountUnits:String(r.amount_units),
  independentlyVerified:r.status==="finalized"&&!!r.receipt,
  note:"Execution status is not proof of an independently checked receipt unless finalized"}));
}
export async function agentSnapshot({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await agentDB();await requireAgentMembership(sql,{actor,workspaceId});
 const [beneficiaries,invoices,intents,executions]=await Promise.all([
  listBeneficiaries({workspaceId,actor}),listManualInvoices({workspaceId,actor}),
  listIntents({workspaceId,actor}),listExecutionStatuses({workspaceId,actor})
 ]);
 return {beneficiaries,invoices,intents,executions};
}
export async function agentReadTool({tool,args,actor,clientFactory=getAmaClient}){
 const definition=allowedTool(tool),{workspaceId,id}=strictAgentArgs(args);
 const sql=await agentDB();
 await requireAgentMembership(sql,{actor,workspaceId,permission:definition.permission});
 let result,source="33jack-v3-workspace-postgresql";
 switch(tool){
 case "ama.wallet.balance": {
  // Never allow model-supplied arbitrary addresses; only the proven signed-in wallet.
  const client=clientFactory();
  try{result={account:actor,asset:"AMA",balance:await client.wallet.getBalance(actor,"AMA"),
    network:"amadeus-testnet",evidence:"official_testnet_rpc"};source="official_amadeus_testnet_rpc";}
  catch{result={account:actor,asset:"AMA",balance:null,
    status:"unavailable",evidence:"no_verified_balance"};source="official_amadeus_testnet_rpc";}
  break;
 }
 case "ama.beneficiaries.list":result=await listBeneficiaries({workspaceId,actor});break;
 case "ama.invoices.list":result=await listManualInvoices({workspaceId,actor});break;
 case "ama.invoices.get":
  if(!id)throw new PaymentError(400,"Invoice ID required");
  result=await getManualInvoice({workspaceId,id,actor});break;
 case "ama.intents.list":result=await listIntents({workspaceId,actor});break;
 case "ama.intents.get":
  if(!id)throw new PaymentError(400,"Intent ID required");
  result=await getIntent({workspaceId,id,actor});break;
 case "ama.executions.status":
  if(!id)throw new PaymentError(400,"Execution intent ID required");
  result=(await readExecution({workspaceId,id,actor}))?.public||null;break;
 case "ama.risk.summary":{
  const snapshot=await agentSnapshot({workspaceId,actor});
  result=deterministicRisk(snapshot);
  source="33jack-v3-deterministic-policy";
  break;
 }
 default:throw new PaymentError(403,"Unknown read-only agent tool");
 }
 return responseEnvelope({tool,workspaceId,result,source});
}
