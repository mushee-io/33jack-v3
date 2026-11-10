/** Durable, tenant-checked Amadeus Testnet agent store. No signing/approval tools. */
import {randomUUID} from "node:crypto";
import {listBeneficiaries,listIntents} from "./v3-payment-store.js";
import {executionDB} from "./v3-execution-store.js";
import {hasPermission,nativeAddress} from "./v3-identity-core.js";
import {assertWorkspaceId,PaymentError,sha256,assertIdempotencyKey} from "./v3-payment-core.js";
import {parseAmaAmount,amaBalance} from "./amadeus-testnet.js";
import {safeDocumentText,safeInvoiceReference,buildRiskReport,parseNaturalPaymentProposal,assertAgentTool,agentTaskFingerprint} from "./v3-agent-core.js";

let initialized;
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS ama_v3_agent_invoice_notes(workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,invoice_ref text NOT NULL,recipient text,amount_units numeric(40,0),note_text text NOT NULL,note_sha256 text NOT NULL,contains_injection boolean NOT NULL DEFAULT false,source_status text NOT NULL DEFAULT 'manually_entered_unverified' CHECK(source_status='manually_entered_unverified'),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(workspace_id,invoice_ref))",
 "CREATE TABLE IF NOT EXISTS ama_v3_agent_tasks(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,actor text NOT NULL,source text NOT NULL CHECK(source IN ('web','a2a','mcp')),request_hash text NOT NULL,idempotency_hash text NOT NULL,status text NOT NULL CHECK(status IN ('analyzed','blocked')),proposal jsonb,risk jsonb NOT NULL,explanation text NOT NULL DEFAULT '',model_used boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT NOW(),UNIQUE(workspace_id,actor,idempotency_hash))",
 "CREATE INDEX IF NOT EXISTS ama_v3_agent_tasks_recent ON ama_v3_agent_tasks(workspace_id,actor,created_at DESC)",
 "CREATE TABLE IF NOT EXISTS ama_v3_agent_access(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE CASCADE,actor text NOT NULL,tool_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE INDEX IF NOT EXISTS ama_v3_agent_access_recent ON ama_v3_agent_access(workspace_id,actor,created_at DESC)"
];
export async function agentDB(){
 const sql=await executionDB();
 if(!initialized)initialized=(async()=>{for(const ddl of SCHEMA)await sql.unsafe(ddl)})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
export async function authorizeAgent({sql,workspaceId,actor,action="workspace:read"}){
 workspaceId=assertWorkspaceId(workspaceId);nativeAddress(actor);
 const m=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 LIMIT 1",[workspaceId,actor]);
 if(!m.length||!hasPermission(m[0].role,action))throw new PaymentError(403,"Agent workspace or role access denied");
 return m[0].role;
}
async function budget(sql,workspaceId,actor,tool){
 const r=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_agent_access WHERE workspace_id=$1 AND actor=$2 AND created_at>NOW()-INTERVAL '1 hour'",[workspaceId,actor]);
 if(r[0].n>=100)throw new PaymentError(429,"Agent request budget exceeded");
 await sql.unsafe("INSERT INTO ama_v3_agent_access(id,workspace_id,actor,tool_name) VALUES($1,$2,$3,$4)",[randomUUID(),workspaceId,actor,tool]);
}
function publicInvoice(row){
 return {invoiceRef:row.invoice_ref,recipient:row.recipient||null,
 amountUnits:row.amount_units===null||row.amount_units===undefined?null:String(row.amount_units),
 source:"manually_entered_unverified",verified:false,paid:false,
 containsInjection:!!row.contains_injection,sourceHash:row.note_sha256,createdAt:row.created_at};
}
export async function createInvoiceNote({workspaceId,actor,invoiceRef,note,recipient,amount}){
 workspaceId=assertWorkspaceId(workspaceId);invoiceRef=safeInvoiceReference(invoiceRef);
 const safe=safeDocumentText(note);
 if((recipient===undefined)!==(amount===undefined))
  throw new PaymentError(400,"Invoice recipient and AMA amount must both be provided or both omitted");
 const address=recipient===undefined?null:nativeAddress(recipient);
 const units=amount===undefined?null:parseAmaAmount(amount);
 const sql=await agentDB();await authorizeAgent({sql,workspaceId,actor,action:"invoice:write"});
 await budget(sql,workspaceId,actor,"invoice.note.create");
 const rows=await sql.unsafe(
  "INSERT INTO ama_v3_agent_invoice_notes(workspace_id,invoice_ref,recipient,amount_units,note_text,note_sha256,contains_injection,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,invoice_ref) DO NOTHING RETURNING *",
  [workspaceId,invoiceRef,address,units,safe.text,safe.sha256,safe.containsInjection,actor]
 );
 if(!rows.length)throw new PaymentError(409,"Invoice note already exists; agent cannot overwrite it");
 return publicInvoice(rows[0]);
}
export async function listInvoiceNotes({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await agentDB();
 await authorizeAgent({sql,workspaceId,actor,action:"invoice:read"});
 await budget(sql,workspaceId,actor,"invoices.list");
 const rows=await sql.unsafe("SELECT invoice_ref,recipient,amount_units,note_sha256,contains_injection,created_at FROM ama_v3_agent_invoice_notes WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 30",[workspaceId]);
 return rows.map(publicInvoice);
}
export async function listExecutionHistory({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await agentDB();
 await authorizeAgent({sql,workspaceId,actor,action:"payment:read"});
 await budget(sql,workspaceId,actor,"transactions.list");
 const rows=await sql.unsafe("SELECT e.intent_id,e.tx_hash,e.status,e.verified_at,e.receipt,i.payer,i.recipient,i.amount_units FROM ama_v3_executions e JOIN ama_v3_payment_intents i ON i.id=e.intent_id AND i.workspace_id=e.workspace_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC LIMIT 30",[workspaceId]);
 return rows.map(x=>{
  let receipt=x.receipt;
  for(let i=0;i<2&&typeof receipt==="string";i++){try{receipt=JSON.parse(receipt)}catch{receipt=null}}
  const verified=x.status==="finalized"&&receipt&&typeof receipt==="object"&&receipt.finality==="finalized"&&receipt.executionSuccess===true&&receipt.txHash===x.tx_hash;
  return {intentId:x.intent_id,txHash:x.tx_hash,status:x.status,payer:x.payer,recipient:x.recipient,amountUnits:String(x.amount_units),asset:"AMA",network:"amadeus-testnet",independentlyVerified:!!verified,verifiedAt:verified?x.verified_at:null};
 });
}
export async function readAgentTool({name,workspaceId,actor,args={}}){
 name=assertAgentTool(name);workspaceId=assertWorkspaceId(workspaceId);
 if(!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).some(k=>k!=="message"))
  throw new PaymentError(400,"Unsupported agent tool arguments");
 const sql=await agentDB();
 await authorizeAgent({sql,workspaceId,actor,action:name==="risk.assess"?"payment:read":"workspace:read"});
 if(name==="wallet.balance"){
  await budget(sql,workspaceId,actor,name);
  try{return {network:"amadeus-testnet",asset:"AMA",account:actor,balance:await amaBalance(actor),verifiedRead:true,source:"official_testnet_rpc"}}
  catch{return {network:"amadeus-testnet",asset:"AMA",account:actor,balance:null,verifiedRead:false,source:"official_testnet_rpc",warning:"Testnet balance unavailable"}}
 }
 if(name==="beneficiaries.list"){
  await budget(sql,workspaceId,actor,name);
  return {network:"amadeus-testnet",beneficiaries:await listBeneficiaries({workspaceId,actor})};
 }
 if(name==="invoices.list")return {network:"amadeus-testnet",invoices:await listInvoiceNotes({workspaceId,actor})};
 if(name==="payments.list"){
  await budget(sql,workspaceId,actor,name);
  return {network:"amadeus-testnet",intents:await listIntents({workspaceId,actor})};
 }
 if(name==="transactions.list")return {network:"amadeus-testnet",transactions:await listExecutionHistory({workspaceId,actor})};
 if(name==="risk.assess"){
  await budget(sql,workspaceId,actor,name);
  const message=typeof args.message==="string"?args.message:"";
  const proposal=parseNaturalPaymentProposal(message);
  const [beneficiaries,invoices,intents,transactions]=await Promise.all([
   listBeneficiaries({workspaceId,actor}),listInvoiceNotes({workspaceId,actor}),
   listIntents({workspaceId,actor}),listExecutionHistory({workspaceId,actor})
  ]);
  return {network:"amadeus-testnet",proposal,
   risk:buildRiskReport({proposal,beneficiaries,invoices,intents,transactions})};
 }
 throw new PaymentError(403,"Agent tool unavailable");
}
export async function loadAgentContext({workspaceId,actor}){
 const sql=await agentDB();workspaceId=assertWorkspaceId(workspaceId);
 await authorizeAgent({sql,workspaceId,actor,action:"payment:propose"});
 await budget(sql,workspaceId,actor,"agent.analyze");
 const [beneficiaries,intents,transactions,invoices]=await Promise.all([
  listBeneficiaries({workspaceId,actor}),listIntents({workspaceId,actor}),
  listExecutionHistory({workspaceId,actor}),listInvoiceNotes({workspaceId,actor})
 ]);
 return {beneficiaries,intents,transactions,invoices};
}
function parsed(v){if(v&&typeof v==="object")return v;try{return JSON.parse(v)}catch{return null}}
function publicTask(row){
 return {id:row.id,workspaceId:row.workspace_id,source:row.source,status:row.status,
 proposal:parsed(row.proposal),risk:parsed(row.risk),explanation:row.explanation,
 modelUsed:!!row.model_used,createdAt:row.created_at,network:"amadeus-testnet",
 humanApprovalRequired:true,canSign:false,canApprove:false,canBroadcast:false,settled:false};
}
export async function saveAgentTask({workspaceId,actor,source,message,key,proposal,risk,explanation,modelUsed=false}){
 workspaceId=assertWorkspaceId(workspaceId);
 if(!["web","a2a","mcp"].includes(source))throw new PaymentError(400,"Invalid agent source");
 key=assertIdempotencyKey(key);
 const keyHash=sha256([workspaceId,actor,key].join("|"));
 const requestHash=agentTaskFingerprint({workspaceId,actor,message});
 const sql=await agentDB();
 return sql.begin(async tx=>{
  await authorizeAgent({sql:tx,workspaceId,actor,action:"payment:propose"});
  const old=await tx.unsafe("SELECT * FROM ama_v3_agent_tasks WHERE workspace_id=$1 AND actor=$2 AND idempotency_hash=$3 LIMIT 1",[workspaceId,actor,keyHash]);
  if(old.length){
   if(old[0].request_hash!==requestHash)throw new PaymentError(409,"Agent idempotency key reused with changed instructions");
   return {task:publicTask(old[0]),reused:true};
  }
  const count=await tx.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_agent_tasks WHERE workspace_id=$1 AND actor=$2 AND created_at>NOW()-INTERVAL '1 hour'",[workspaceId,actor]);
  if(count[0].n>=30)throw new PaymentError(429,"Agent analysis budget exceeded");
  const status=risk.flags?.some(x=>x.code==="PROMPT_INJECTION")?"blocked":"analyzed";
  const rows=await tx.unsafe("INSERT INTO ama_v3_agent_tasks(id,workspace_id,actor,source,request_hash,idempotency_hash,status,proposal,risk,explanation,model_used) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11) ON CONFLICT(workspace_id,actor,idempotency_hash) DO NOTHING RETURNING *",[
   randomUUID(),workspaceId,actor,source,requestHash,keyHash,status,
   proposal?JSON.stringify(proposal):null,JSON.stringify(risk),String(explanation).slice(0,1500),!!modelUsed
  ]);
  if(!rows.length){
   const raced=await tx.unsafe("SELECT * FROM ama_v3_agent_tasks WHERE workspace_id=$1 AND actor=$2 AND idempotency_hash=$3 LIMIT 1",[workspaceId,actor,keyHash]);
   if(raced.length&&raced[0].request_hash===requestHash)return {task:publicTask(raced[0]),reused:true};
   throw new PaymentError(409,"Concurrent agent idempotency collision");
  }
  return {task:publicTask(rows[0]),reused:false};
 });
}
export async function listAgentTasks({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);const sql=await agentDB();
 await authorizeAgent({sql,workspaceId,actor,action:"workspace:read"});
 await budget(sql,workspaceId,actor,"agent.tasks");
 const rows=await sql.unsafe("SELECT * FROM ama_v3_agent_tasks WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 20",[workspaceId]);
 return rows.map(publicTask);
}
