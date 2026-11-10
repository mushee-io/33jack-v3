/**
 * M7 — deterministic, fail-closed Amadeus Testnet financial governance.
 * Compliance-provider checks are NOT integrated. No provider-verification claims.
 */
import {createHash} from "node:crypto";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
export const M7_DEFAULTS=Object.freeze({
 network:"amadeus-testnet",paused:false,maxPaymentUnits:"100000000000",
 dailyUnits:"500000000000",highRiskUnits:"1000000000",
 enforceTwoPersonHighRisk:true,beneficiaryOnly:true
});
export const M7_EXTERNAL_COMPLIANCE=Object.freeze({
 kyc:"not_integrated",kyb:"not_integrated",aml:"not_integrated",sanctions:"not_integrated",
 disclosure:"Internal policy rules are not legal/compliance-provider verification"
});
export const M7_RISK_KINDS=Object.freeze([
 "suspected_duplicate_invoice","invoice_content_mismatch","recipient_changed",
 "unusual_payment_request","suspicious_transaction","possible_sanctions_match_unverified",
 "manual_risk_hold"
]);
export function digest(value){return createHash("sha256").update(String(value),"utf8").digest("hex")}
export function positiveAtomic(value,name,{zero=false,max=1000000000000000000n}={}){
 if(typeof value!=="string"||!/^(0|[1-9]\d{0,22})$/.test(value))
  throw new PaymentError(400,name+" must be an exact decimal integer string");
 const n=BigInt(value);
 if((zero?n<0n:n===0n)||n>max)throw new PaymentError(400,name+" exceeds safe native AMA policy limits");
 return n;
}
export function strictPolicyPatch(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new PaymentError(400,"Policy patch must be an object");
 const keys=Object.keys(input);
 const accepted=["maxPaymentUnits","dailyUnits","highRiskUnits","enforceTwoPersonHighRisk"];
 if(!keys.length||keys.some(k=>!accepted.includes(k)))
  throw new PaymentError(400,"Only bounded, native Testnet policy fields may be changed");
 const out={};
 for(const key of ["maxPaymentUnits","dailyUnits","highRiskUnits"]){
  if(key in input)out[key]=positiveAtomic(input[key],key).toString();
 }
 if("enforceTwoPersonHighRisk" in input){
  if(input.enforceTwoPersonHighRisk!==true)
   throw new PaymentError(403,"Two-person high-risk control cannot be disabled in M7");
  out.enforceTwoPersonHighRisk=true;
 }
 return out;
}
export function humanRiskClassification(intent,flags=[],policy=M7_DEFAULTS){
 if(!intent||intent.network!=="amadeus-testnet"||intent.asset!=="AMA")
  throw new PaymentError(400,"M7 financial controls require native AMA Testnet intent");
 const amount=positiveAtomic(String(intent.amount_units),"intent amount");
 const high=amount>BigInt(policy.high_risk_units??policy.highRiskUnits);
 const flagged=flags.some(x=>x.active===true||x.active==="true");
 const suspicious=String(intent.memo||"").length>170||
  (amount>0n&&!String(intent.invoice_ref||"").trim()&&amount>BigInt(policy.high_risk_units??policy.highRiskUnits));
 return {highRisk:high||flagged||suspicious,flagged,suspicious,
  reasons:[...(high?["exceeds_high_risk_threshold"]:[]),
   ...(flagged?["active_manual_risk_hold"]:[]),
   ...(suspicious?["high_value_missing_invoice_reference"]:[])],
  requiresDistinctChecker:high||flagged||suspicious};
}
export function assertFinancialPolicy({intent,policy,flags=[],actor,action,approvalSeal}){
 if(!policy)throw new PaymentError(503,"M7 policy record missing; refuse financial action");
 if(policy.paused===true||policy.paused==="true")
  throw new PaymentError(423,"Emergency pause active; no new approval or signing");
 const amount=positiveAtomic(String(intent.amount_units),"AMA amount");
 if(amount>BigInt(policy.max_payment_units))
  throw new PaymentError(409,"Amount exceeds native Testnet organization limit");
 if(flags.some(f=>f.active===true||f.active==="true"))
  throw new PaymentError(423,"Active compliance risk hold; human investigation required");
 const risk=humanRiskClassification(intent,flags,policy);
 if(action==="approve"&&risk.requiresDistinctChecker&&actor===intent.created_by)
  throw new PaymentError(403,"High-risk payment requires separate maker and checker");
 if(action==="execute"){
  if(!approvalSeal||
     Number(approvalSeal.policy_version)!==Number(policy.version)||
     approvalSeal.terms_hash!==intent.terms_hash||
     approvalSeal.approver!==intent.approved_by||
     approvalSeal.payer!==intent.payer)
    throw new PaymentError(409,"M7 approval policy changed or seal missing; no signed transaction can proceed");
  if(risk.requiresDistinctChecker&&intent.approved_by===intent.created_by)
    throw new PaymentError(403,"High-risk maker-checker separation missing");
 }
 return risk;
}
export function canonicalAuditHash({workspaceId,previousHash,event,actor,entityId,details,timestamp}){
 assertWorkspaceId(workspaceId);
 const fields=[workspaceId,previousHash,event,actor,entityId,JSON.stringify(details),timestamp];
 return digest(["33jack-m7-audit-v1",...fields].join("\n"));
}
export function verifyAuditRows(rows,workspaceId){
 let previous="0".repeat(64),checked=0;
 for(const row of rows){
  const details=typeof row.details==="string"?JSON.parse(row.details):row.details;
  const timestamp=new Date(row.occurred_at).toISOString();
  const expect=canonicalAuditHash({workspaceId,previousHash:previous,event:row.event,
   actor:row.actor,entityId:row.entity_id,details,timestamp});
  if(row.previous_hash!==previous||row.event_hash!==expect)
   return {valid:false,checked,reason:"Audit-chain hash or predecessor mismatch",
    firstInvalidEvent:row.id};
  previous=row.event_hash;checked++;
 }
 return {valid:true,checked,lastHash:previous,scope:"organization-only",
  proves:"database event continuity only; not external notarization"};
}
export function incidentState(state){return ["open","investigating","resolved"].includes(state)}
export function validateRiskFlag(input){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new PaymentError(400,"Invalid risk flag");
 const kind=input.kind;
 if(!M7_RISK_KINDS.includes(kind))throw new PaymentError(400,"Unknown risk flag category");
 const invoiceRef=input.invoiceRef??"";
 if(typeof invoiceRef!=="string"||invoiceRef.length>90||
   (invoiceRef!==""&&!/^[A-Za-z0-9._/-]{2,90}$/.test(invoiceRef)))
  throw new PaymentError(400,"Invalid risk invoice reference");
 const address=input.recipient??"";
 if(typeof address!=="string"||address.length>85)throw new PaymentError(400,"Invalid risk recipient");
 const reason=String(input.reason||"");
 if(reason.length<8||reason.length>300||/[\u0000-\u001f\u007f]/.test(reason))
  throw new PaymentError(400,"Risk report requires a bounded factual human reason");
 return {kind,invoiceRef,recipient:address,reasonHash:digest(reason),
  reasonSummary:"Human-submitted risk report; external sanctions screening not performed"};
}
