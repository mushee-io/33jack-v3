/**
 * M9 acceptance ledger. Only M2 owner/admin can request read-only witness.
 * A passing synthetic CI RPC is ALWAYS labelled synthetic_ci_only, never real.
 */
import {randomUUID} from "node:crypto";
import {getAmaClient,getAmaRpcUrl} from "./amadeus-testnet.js";
import {invoiceDB} from "./v3-invoice-store.js";
import {agentDB} from "./v3-agent-store.js";
import {auditEvidence,governanceDB} from "./v3-governance-store.js";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
import {readInvoice} from "./v3-reconcile-store.js";
import {M9_NETWORK,M9_SCOPES,M9_EXTERNAL,
 assertM9Intent,checkChainWitness,evaluateAcceptance,evidenceRecordHash,
 verifyEvidenceHistory} from "./v3-acceptance-core.js";
let initialized;
const SQL=[
 "CREATE TABLE IF NOT EXISTS ama_v3_m9_reports(id text PRIMARY KEY,seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,intent_id text NOT NULL REFERENCES ama_v3_payment_intents(id) ON DELETE RESTRICT,actor text NOT NULL,status text NOT NULL CHECK(status IN ('blocked','synthetic_ci_only','independently_checked')),source text NOT NULL CHECK(source IN ('official_testnet_rpc_live','synthetic_ci_only','unavailable')),checked_at timestamptz NOT NULL,tx_hash text NOT NULL,details text NOT NULL,previous_hash text NOT NULL CHECK(previous_hash ~ '^[a-f0-9]{64}$'),event_hash text NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$'),UNIQUE(workspace_id,event_hash))",
 "CREATE INDEX IF NOT EXISTS ama_v3_m9_reports_scope ON ama_v3_m9_reports(workspace_id,seq)",
 "CREATE OR REPLACE FUNCTION ama_v3_m9_immutable_reports() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'M9 evidence reports are append-only'; END; $$",
 "DO $body$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ama_v3_m9_no_update_or_delete') THEN CREATE TRIGGER ama_v3_m9_no_update_or_delete BEFORE UPDATE OR DELETE ON ama_v3_m9_reports FOR EACH ROW EXECUTE FUNCTION ama_v3_m9_immutable_reports(); END IF; END $body$"
];
export async function acceptanceDB(){
 const sql=await agentDB();
 await invoiceDB();await governanceDB();
 if(!initialized)initialized=(async()=>{for(const d of SQL)await sql.unsafe(d);return true})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
async function ownerMember(sql,workspaceId,actor){
 const rows=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 LIMIT 1",[workspaceId,actor]);
 if(!rows.length||!["owner","admin"].includes(rows[0].role))
  throw new PaymentError(403,"M9 independent acceptance records require authenticated owner/admin");
 return rows[0].role;
}
async function snapshot(sql,{workspaceId,intentId,origin,actor}){
 await ownerMember(sql,workspaceId,actor);
 const rows=await sql.unsafe(
  "SELECT i.*,e.tx_hash,e.packet_digest,e.status AS execution_status,e.broadcast_attempts,e.verified_at,e.receipt,e.entry_hash,e.entry_height FROM ama_v3_payment_intents i LEFT JOIN ama_v3_executions e ON e.intent_id=i.id WHERE i.id=$1 AND i.workspace_id=$2 LIMIT 1",
  [intentId,workspaceId]
 );
 if(!rows.length)throw new PaymentError(404,"M9 witness payment intent not found in this organization");
 const row=rows[0];
 const intent={...row,network:row.network,asset:row.asset,amount_units:String(row.amount_units)};
 const execution=row.tx_hash?{tx_hash:row.tx_hash,status:row.execution_status,
  packet_digest:row.packet_digest,broadcast_attempts:row.broadcast_attempts,
  verified_at:row.verified_at,receipt:row.receipt,entry_hash:row.entry_hash,
  entry_height:row.entry_height}:null;
 const login=await sql.unsafe(
  "SELECT DISTINCT address FROM ama_v3_challenges WHERE address IN ($1,$2) AND origin=$3 AND network='amadeus-testnet' AND consumed_at IS NOT NULL AND consumed_at>NOW()-INTERVAL '7 days'",
  [intent.payer,intent.recipient,origin]
 );
 const matching=await sql.unsafe(
  "SELECT invoice_id FROM ama_v3_m6_matches WHERE workspace_id=$1 AND intent_id=$2 LIMIT 1",
  [workspaceId,intentId]
 );
 const agentTrace=await sql.unsafe(
  "SELECT COUNT(*)::integer AS n FROM ama_v3_agent_events WHERE workspace_id=$1 AND event IN ('agent_question','a2a_question','read_tool','mcp_read_tool')",
  [workspaceId]
 );
 const seal=await sql.unsafe(
  "SELECT policy_version,terms_hash,payer,maker,approver,high_risk FROM ama_v3_m7_approval_seals WHERE intent_id=$1 AND workspace_id=$2 LIMIT 1",
  [intentId,workspaceId]
 );
 const policy=await sql.unsafe(
  "SELECT paused,version,enforce_two_person FROM ama_v3_m7_policies WHERE workspace_id=$1 LIMIT 1",[workspaceId]
 );
 return {intent,execution,loginWallets:login.map(r=>r.address),matchedInvoiceId:matching[0]?.invoice_id||null,
  agentTrace:agentTrace[0].n,seal:seal[0]||null,policy:policy[0]||null};
}
function observedSeal(s){
 if(!s.seal||!s.policy)return false;
 return Number(s.seal.policy_version)===Number(s.policy.version)&&
  s.seal.terms_hash===s.intent.terms_hash&&s.seal.payer===s.intent.payer&&
  s.seal.approver===s.intent.approved_by&&
  (!s.seal.high_risk||s.seal.approver!==s.seal.maker)&&
  s.policy.enforce_two_person===true&&s.policy.paused!==true;
}
async function compile(sql,{workspaceId,intentId,origin,actor,witness,source}){
 const s=await snapshot(sql,{workspaceId,intentId,origin,actor});
 let invoice=null;
 if(s.matchedInvoiceId)invoice=await readInvoice({workspaceId,id:s.matchedInvoiceId,actor});
 const audit=await auditEvidence({workspaceId,actor});
 const status=evaluateAcceptance({wallets:s.loginWallets,intent:s.intent,
  execution:s.execution,receiptWitness:witness,invoice,agentReadEvents:s.agentTrace,
  securityReview:"not_submitted",auditIntegrity:audit,
  restoreEvidence:null,source});
 const sealValid=observedSeal(s);
 status.requirements.push({id:"m7_current_policy_seal",
  status:sealValid?"passed":"blocked",
  evidence:"Current policy version, active status, exact M3 terms and distinct high-risk checker"});
 if(!sealValid)status.openBlockers.push("m7_current_policy_seal");
 status.acceptance=status.openBlockers.length===0?"acceptance_evidence_complete":"no_go";
 return {result:status,context:{
  walletLoginWitnesses:s.loginWallets.length,agentReadEvents:s.agentTrace,
  invoiceLinked:!!invoice,governanceAuditValid:audit.valid,
  approvalPolicyCurrent:sealValid,
  signedTransactionInDB:!!s.execution,
  entryHash:s.execution?.entry_hash||null,
  txHash:s.execution?.tx_hash||null
 },snapshot:s};
}
export async function acceptanceReadiness({workspaceId,intentId,actor,origin}){
 workspaceId=assertWorkspaceId(workspaceId);intentId=assertIntentId(intentId);
 if(typeof origin!=="string")throw new PaymentError(400,"M2 session origin required");
 const sql=await acceptanceDB();
 const compiled=await compile(sql,{workspaceId,intentId,origin,actor,witness:null,source:"unavailable"});
 return {network:M9_NETWORK,phase:"M9 Testnet acceptance",intentId,workspaceId,
  result:compiled.result,context:compiled.context,
  readonly:true,noFundsMoved:true,securityReview:"not_submitted",
  note:"Readiness is not fresh independent RPC verification. Use explicit witness check to query official Testnet; no mainnet or transaction broadcast."};
}
export async function acceptanceWitness({workspaceId,intentId,actor,origin,clientFactory=getAmaClient}){
 workspaceId=assertWorkspaceId(workspaceId);intentId=assertIntentId(intentId);
 if(typeof origin!=="string")throw new PaymentError(400,"M2 session origin required");
 const sql=await acceptanceDB();
 await ownerMember(sql,workspaceId,actor);
 const first=await snapshot(sql,{workspaceId,intentId,origin,actor});
 if(!first.execution||!first.execution.tx_hash)
  throw new PaymentError(409,"Only an existing M4 reserved, independently checked signed transaction can be witnessed. No broadcast requested.");
 const live=clientFactory===getAmaClient;
 if(live)getAmaRpcUrl(); // rejects mainnet and all nonofficial endpoints
 const witness=await checkChainWitness({intent:first.intent,execution:first.execution,
  clientFactory,isLiveClient:live});
 const source=live?"official_testnet_rpc_live":"synthetic_ci_only";
 // Prevent a stale observation being stored if actual intent or receipt changes
 const current=await snapshot(sql,{workspaceId,intentId,origin,actor});
 if(current.execution?.tx_hash!==first.execution.tx_hash||
    current.intent.terms_hash!==first.intent.terms_hash||
    current.execution?.status!==first.execution.status)
  throw new PaymentError(409,"Acceptance witness conflicted with newer financial state; recheck original transaction");
 const compiled=await compile(sql,{workspaceId,intentId,origin,actor,witness,source});
 const status=witness.status==="synthetic_ci_only"?"synthetic_ci_only":
  witness.ok?"independently_checked":"blocked";
 const details={chainWitness:{status:witness.status,reason:witness.reason,
    live:witness.realChainEvidence===true,hash:witness.txHash||null,
    entryHash:witness.entryHash||null,entryHeight:witness.entryHeight??null},
  acceptance:compiled.result.acceptance,openBlockers:compiled.result.openBlockers,
  walletLoginWitnesses:compiled.context.walletLoginWitnesses,
  invoiceLinked:compiled.context.invoiceLinked,governanceAuditValid:compiled.context.governanceAuditValid,
  approvalPolicyCurrent:compiled.context.approvalPolicyCurrent,
  independentSecurityReview:"not_submitted",externalWalletCompatibility:"not_witnessed",
  ciFixture:!live,scope:M9_NETWORK};
 const report=await sql.begin(async tx=>{
  await ownerMember(tx,workspaceId,actor);
  // Serializes append-only predecessor hashes even for concurrent serverless runs.
  await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[workspaceId,"m9-evidence"]);
  const last=await tx.unsafe(
   "SELECT event_hash FROM ama_v3_m9_reports WHERE workspace_id=$1 ORDER BY seq DESC LIMIT 1",
   [workspaceId]
  );
  const previousHash=last[0]?.event_hash||"0".repeat(64);
  const checkedAt=new Date().toISOString();
  const eventHash=evidenceRecordHash({workspaceId,intentId,actor,status,previousHash,checkedAt,details});
  const rows=await tx.unsafe(
   "INSERT INTO ama_v3_m9_reports(id,workspace_id,intent_id,actor,status,source,checked_at,tx_hash,details,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status,event_hash,checked_at",
   [randomUUID(),workspaceId,intentId,actor,status,source,new Date(checkedAt),
    first.execution.tx_hash,JSON.stringify(details),previousHash,eventHash]
  );
  return rows[0];
 });
 return {id:report.id,status:report.status,checkedAt:report.checked_at,
  evidenceHash:report.event_hash,network:M9_NETWORK,
  witness:details.chainWitness,acceptance:compiled.result,
  noTransactionSubmitted:true,noWalletKeyAccess:true,
  note:"This check only reads official Testnet RPC and stored M2–M7 evidence. Synthetic fixtures remain NO-GO; independent security audit not submitted."};
}
export async function acceptanceReports({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await acceptanceDB();
 await ownerMember(sql,workspaceId,actor);
 const rows=await sql.unsafe(
  "SELECT id,seq,intent_id,status,source,checked_at,tx_hash,event_hash FROM ama_v3_m9_reports WHERE workspace_id=$1 ORDER BY seq DESC LIMIT 50",
  [workspaceId]);
 return rows.map(r=>({id:r.id,intentId:r.intent_id,status:r.status,source:r.source,
  checkedAt:r.checked_at,txHash:r.tx_hash,evidenceHash:r.event_hash,
  // A successful CI record never asserts an actual financed transfer.
  isLiveRPCAcceptance:r.status==="independently_checked"&&r.source==="official_testnet_rpc_live"}));
}
export async function acceptanceAudit({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await acceptanceDB();
 await ownerMember(sql,workspaceId,actor);
 const rows=await sql.unsafe(
  "SELECT id,intent_id,actor,status,details,previous_hash,event_hash,checked_at FROM ama_v3_m9_reports WHERE workspace_id=$1 ORDER BY seq ASC LIMIT 1000",
  [workspaceId]);
 return {network:M9_NETWORK,...verifyEvidenceHistory(rows,workspaceId)};
}
export const ACCEPTANCE_MATRIX=M9_SCOPES;
export const ACCEPTANCE_LIMITATIONS=M9_EXTERNAL;
