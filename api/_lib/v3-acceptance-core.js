/**
 * M9 — Testnet-only independent acceptance rules.
 * CI fixtures NEVER become real wallet, independent RPC, or grant-ready evidence.
 */
import {createHash} from "node:crypto";
import {PaymentError} from "./v3-payment-core.js";
import {verifyObservedChainTransaction} from "./v3-execution-core.js";
import {verifiedM4Evidence} from "./v3-invoice-core.js";
import {M7_EXTERNAL_COMPLIANCE} from "./v3-governance-core.js";
export const M9_NETWORK="amadeus-testnet";
export const M9_SCOPES=Object.freeze([
 "clean_install_and_production_build","m2_wallet_auth_two_distinct_accounts",
 "m3_exact_terms_and_maker_checker","m4_signed_packet_and_single_broadcast",
 "official_testnet_finality","m5_agent_read_only",
 "m6_invoice_source_and_reconciliation","m7_policy_and_immutable_audit",
 "isolation_and_negative_paths","database_backup_and_restore",
 "dependency_and_secrets_review","external_independent_security_review"
]);
export const M9_EXTERNAL=Object.freeze({
 walletExtension:"not_witnessed",fundedTwoWalletTransfer:"not_witnessed",
 independentSecurityReview:"not_submitted",mainnet:"disabled",
 complianceProviders:M7_EXTERNAL_COMPLIANCE,
 note:"Passing CI demonstrates synthetic/controlled test acceptance, not live wallet extension or chain settlement"
});
export function sha(value){return createHash("sha256").update(String(value),"utf8").digest("hex")}
export function assertNoSensitiveEvidence(value){
 if(typeof value!=="string"||value.length>3000||
    /(?:-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----|gsk_[\w-]{16,}|sk-[\w-]{20,}|(?:seed|private.?key|mnemonic|authorization|cookie|csrf|password)\s*[:=]\s*\S+)/i.test(value))
  throw new PaymentError(400,"Unsafe acceptance evidence; no secrets or credentials are accepted");
 return value;
}
export function assertM9Intent(intent){
 if(!intent||intent.network!==M9_NETWORK||intent.asset!=="AMA"||
    intent.status!=="awaiting_wallet_signature"||
    typeof intent.payer!=="string"||typeof intent.recipient!=="string"||
    intent.payer===intent.recipient||intent.terms_hash!==intent.approval_terms_hash||
    typeof intent.terms_hash!=="string"||!/^[a-f0-9]{64}$/.test(intent.terms_hash))
  throw new PaymentError(409,"No eligible exact-term, distinct-wallet AMA Testnet intent");
 return intent;
}
function parseStoredReceipt(value){
 let receipt=value??null;
 for(let i=0;i<2&&typeof receipt==="string";i++){
  try{receipt=JSON.parse(receipt)}catch{return null}
 }
 if(!receipt||typeof receipt!=="object"||Array.isArray(receipt))return null;
 return receipt;
}
export function persistedM4Proof(intent,execution){
 const r=parseStoredReceipt(execution?.receipt);
 if(r?.syntheticCIOnly||r?.simulated||r?.fixture===true)
  return {ok:false,reason:"Synthetic M4 receipt cannot support live Testnet acceptance"};
 const result=verifiedM4Evidence({intent,execution:{...execution,receipt:r}});
 if(!result.ok)return {ok:false,reason:result.reason};
 if(r.verifiedBy!=="official Amadeus Testnet RPC")
  return {ok:false,reason:"Receipt was not tagged by M4 official Testnet verification"};
 if(execution.broadcast_attempts!==1)
  return {ok:false,reason:"Original signed transaction must have exactly one reserved broadcast attempt"};
 return {ok:true,hash:result.hash,amountUnits:result.amountUnits,
  entryHeight:result.inclusionHeight,entryHash:r.entryHash,source:"M4 official RPC stored evidence"};
}
export async function checkChainWitness({intent,execution,clientFactory,isLiveClient=false}){
 const stored=persistedM4Proof(intent,execution);
 if(!stored.ok)return {ok:false,status:"blocked",reason:stored.reason};
 // Never trust a supplied "official" boolean: only the server controls clientFactory/isLiveClient.
 // Tests with injected clients always receive "synthetic_ci_only".
 if(typeof clientFactory!=="function")
  return {ok:false,status:"blocked",reason:"Official read-only Testnet client missing"};
 let chainTx,stats;
 try{
  const client=clientFactory();
  [chainTx,stats]=await Promise.all([
   client.transaction.get(execution.tx_hash),client.chain.getStats()
  ]);
 }catch{
  return {ok:false,status:"blocked",reason:"Independent official Testnet RPC transaction or finality query unavailable"};
 }
 const rootedHeight=stats?.stats?.rooted_height;
 let observation;
 try{
  observation=verifyObservedChainTransaction({record:{
   tx_hash:execution.tx_hash,payer:intent.payer,recipient:intent.recipient,
   amount_units:String(intent.amount_units)
  },chainTx,rootedHeight});
 }catch{
  return {ok:false,status:"blocked",reason:"Independent chain evidence was not safely parseable"};
 }
 if(observation.status!=="finalized"||observation.receipt?.finality!=="finalized"||
    observation.receipt?.executionSuccess!==true||
    observation.receipt?.entryHash!==stored.entryHash||
    Number(observation.receipt?.entryHeight)!==stored.entryHeight)
  return {ok:false,status:"blocked",reason:"Fresh Testnet RPC result does not match M4 stored finalized block evidence"};
 return {
  ok:!!isLiveClient,status:isLiveClient?"independently_checked":"synthetic_ci_only",
  reason:isLiveClient?"Fresh official Testnet transaction and finality evidence matched M4":
   "Injected test RPC cannot prove live Testnet settlement",
  txHash:stored.hash,entryHash:stored.entryHash,entryHeight:stored.entryHeight,
  amountUnits:stored.amountUnits,network:M9_NETWORK,
  realChainEvidence:!!isLiveClient
 };
}
export function evaluateAcceptance({wallets=[],intent,execution,receiptWitness,
 invoice=null,agentReadEvents=0,securityReview="not_submitted",
 auditIntegrity=null,restoreEvidence=null,source="no_live_rpc"}={}){
 const requirements=[];
 const record=(id,ok,evidence)=>requirements.push({id,
  status:ok?"passed":"blocked",evidence:String(evidence).slice(0,200)});
 record("wallet_two_distinct_authenticated",wallets.length>=2&&
  wallets[0]!==wallets[1]&&wallets.includes(intent?.payer)&&wallets.includes(intent?.recipient),
  "Two distinct recent consumed M2 signed login challenges required");
 const approved=!!intent&&intent.network===M9_NETWORK&&intent.asset==="AMA"&&
  intent.status==="awaiting_wallet_signature"&&
  intent.terms_hash===intent.approval_terms_hash;
 record("human_approved_terms",approved,"M3 immutable approval terms must match");
 const prior=persistedM4Proof(intent,execution);
 record("persisted_m4_finality",prior.ok,prior.reason||"Exact native M4 transfer and finality receipt");
 record("official_rpc_reverification",receiptWitness?.ok===true&&
  receiptWitness.realChainEvidence===true&&source==="official_testnet_rpc_live",
  receiptWitness?.reason||"Fresh official Testnet RPC observation is required");
 record("invoice_human_verified",invoice?.status==="human_verified"&&
  invoice?.currency==="AMA"&&invoice?.settlement?.state==="settled"&&
  invoice.linkedIntents>=1,
  "M6 original source, human supplier review and separately verified AMA settlement required");
 record("agent_read_only_trace",Number.isSafeInteger(agentReadEvents)&&agentReadEvents>0,
  "M5 authenticated advisory history is a read-only event; it is never payment approval");
 record("governance_audit_integrity",auditIntegrity?.valid===true,
  "M7 append-only hash-linked audit continuity");
 record("backup_restore_integrity",restoreEvidence?.verified===true&&
  restoreEvidence?.source==="independent_postgresql_restore",
  "Independent database snapshot/restore acceptance is required; CI tests are separate");
 record("independent_security_review",securityReview==="approved_external",
  "External security reviewer evidence remains outstanding unless independently verified");
 const completed=requirements.every(x=>x.status==="passed");
 return {network:M9_NETWORK,acceptance:completed?"acceptance_evidence_complete":"no_go",
  liveTransferProven:requirements.find(x=>x.id==="official_rpc_reverification")?.status==="passed",
  readyForMainnet:false,automaticBroadcastAuthorized:false,
  requirements,openBlockers:requirements.filter(x=>x.status==="blocked").map(x=>x.id),
  limitations:M9_EXTERNAL};
}
export function evidenceRecordHash({workspaceId,intentId,actor,status,previousHash,checkedAt,details}){
 return sha(["33jack-m9-v1",workspaceId,intentId,actor,status,
  previousHash,checkedAt,JSON.stringify(details)].join("\n"));
}
export function verifyEvidenceHistory(rows,workspaceId){
 let prev="0".repeat(64);
 for(const row of rows){
  const details=typeof row.details==="string"?JSON.parse(row.details):row.details;
  const checkedAt=new Date(row.checked_at).toISOString();
  const expected=evidenceRecordHash({workspaceId,intentId:row.intent_id,actor:row.actor,
   status:row.status,previousHash:prev,checkedAt,details});
  if(row.previous_hash!==prev||row.event_hash!==expected)
   return {valid:false,reason:"M9 append-only evidence chain mismatch",badId:row.id};
  prev=row.event_hash;
 }
 return {valid:true,count:rows.length,lastHash:prev,
  limitation:"App/database evidence hash chain is not external notarization"};
}
