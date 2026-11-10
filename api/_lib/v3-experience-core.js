/**
 * M8: present VERIFIED native Amadeus Testnet evidence, never infer settlement.
 * All values come from authenticated organization-scoped existing M2–M7 records.
 */
import {verifiedM4Evidence} from "./v3-invoice-core.js";
import {PaymentError} from "./v3-payment-core.js";
export const UX_NETWORK=Object.freeze({id:"amadeus-testnet",label:"Amadeus Testnet",asset:"AMA",unit:"native AMA",source:"independent Amadeus L1"});
export const UX_NAV=Object.freeze([
 {id:"overview",label:"Overview"},
 {id:"wallet",label:"Wallet & identity"},
 {id:"payments",label:"Payments"},
 {id:"receipts",label:"Chain evidence"},
 {id:"agent",label:"AI assistant"},
 {id:"invoices",label:"Invoices"},
 {id:"governance",label:"Governance"}
]);
export function navigationTarget(key,current,ids=UX_NAV.map(t=>t.id)){
 const i=ids.indexOf(current);
 if(i<0)return ids[0];
 if(key==="Home")return ids[0];
 if(key==="End")return ids[ids.length-1];
 if(key==="ArrowRight"||key==="ArrowDown")return ids[(i+1)%ids.length];
 if(key==="ArrowLeft"||key==="ArrowUp")return ids[(i-1+ids.length)%ids.length];
 return null;
}
export function connectedStatus({wallet,session,networkKnown=false}={}){
 if(!wallet)return {state:"disconnected",label:"Wallet not connected",allowFinancialActions:false};
 if(!networkKnown)return {state:"network_unverified",label:"Wallet network not independently verified",allowFinancialActions:false};
 if(!session||session.address!==wallet||!session.csrf)
  return {state:"connected_only",label:"Connected, sign-in required",allowFinancialActions:false};
 return {state:"authenticated",label:"Wallet session authenticated",allowFinancialActions:true};
}
export function normalizeNativeReceipt(record){
 const status=record?.status??"not_submitted";
 const intent=record?.intent||null;
 const execution=record?.execution||null;
 let evidence=execution?.receipt??null;
 for(let i=0;i<2&&typeof evidence==="string";i++){
  try{evidence=JSON.parse(evidence)}catch{evidence=null}
 }
 const check=verifiedM4Evidence({intent,execution:{...execution,receipt:evidence}});
 const valid=status==="finalized"&&check.ok;
 const entry={intentId:intent?.id??null,hash:execution?.tx_hash??null,
  amountUnits:intent?.amount_units?String(intent.amount_units):null,
  recipient:intent?.recipient??null,payer:intent?.payer??null,
  verified:valid,network:UX_NETWORK.id,asset:"AMA",status,
  safeToRebroadcast:false,source:"M4 stored independent Testnet receipt"};
 const state={
  reserved:["Signing reservation recorded; broadcast outcome unknown","pending"],
  uncertain:["RPC outcome uncertain; do not rebroadcast","warning"],
  pending:["Broadcast reported; independent chain finality pending","pending"],
  confirmed:["On-chain observation exists; not finalized","pending"],
  finalized:valid?["Independently finalized native AMA transfer","verified"]:
    ["Finalized label without matching complete M4 receipt — review required","warning"],
  failed:["Transaction marked failed; no settlement credited","error"],
  disputed:["Observed chain evidence disputed; manual review required","error"],
  not_submitted:["No signed Testnet transaction reservation","neutral"]
 }[status]||["Unknown execution state; not verified","warning"];
 return {...entry,label:state[0],tone:state[1],
  entryHash:valid?evidence.entryHash:null,
  entryHeight:valid?Number(evidence.entryHeight):null,
  independentlyVerified:valid&&!!execution.verified_at,
  observedReceipt:valid?{
   txHash:execution.tx_hash,payer:intent.payer,recipient:intent.recipient,
   amountUnits:String(intent.amount_units),finality:"finalized",
   entryHash:evidence.entryHash,entryHeight:Number(evidence.entryHeight)
  }:null};
}
export function overviewMetrics({intents=[],invoices=[],executions=[],risks=[],policy=null}={}){
 const recent=executions.map(normalizeNativeReceipt);
 const verified=recent.filter(x=>x.independentlyVerified);
 return {nativeNetwork:UX_NETWORK.id,asset:"AMA",
  intentCount:intents.length,
  pendingHumanReview:intents.filter(x=>["draft","reviewed","awaiting_wallet_signature"].includes(x.status)).length,
  invoiceCount:invoices.length,
  invoicesHumanReviewed:invoices.filter(x=>x.status==="human_verified").length,
  transfersWithVerifiedFinality:verified.length,
  transfersPendingEvidence:recent.filter(x=>["pending","uncertain","reserved","confirmed"].includes(x.status)).length,
  transfersDisputedOrFailed:recent.filter(x=>["disputed","failed"].includes(x.status)).length+
    recent.filter(x=>x.status==="finalized"&&!x.independentlyVerified).length,
  openManualRiskHolds:risks.filter(x=>x.active===true).length,
  policyState:policy===null?"unavailable":policy.paused===true?"emergency_paused":"configured",
  policyVersion:policy?.version??null,
  walletBalance:null,
  walletBalanceEvidence:"Not queried by overview; never infer AMA balance from payment totals",
  noFiatSettlementClaim:true,noAutonomousSigning:true,
  scope:"organization_database_records_only",
  receiptCountMayBeLimited:executions.length>=50};
}
export function formatAtomicAMA(value){
 if(typeof value!=="string"||!/^(0|[1-9]\d{0,38})$/.test(value))
  throw new PaymentError(400,"Invalid native AMA amount evidence");
 const n=BigInt(value);const whole=n/1000000000n;
 const frac=(n%1000000000n).toString().padStart(9,"0").replace(/0+$/,"");
 return whole.toString()+(frac?"."+frac:"");
}
