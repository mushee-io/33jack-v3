/**
 * M3: deterministic native AMA Testnet payment intent rules.
 * No RPC submission, signing, fiat conversion or fake settlement.
 */
import {createHash,randomBytes} from "node:crypto";
import {AMA_TESTNET,normalizeAmaProposal,prepareAmaCall,parseAmaAmount} from "./amadeus-testnet.js";

export const M3_STATUSES=Object.freeze([
  "draft","reviewed","awaiting_wallet_signature","cancelled","expired"
]);
const TRANSITIONS=Object.freeze({
  draft:["reviewed","cancelled","expired"],
  reviewed:["awaiting_wallet_signature","cancelled","expired"],
  awaiting_wallet_signature:["cancelled","expired"],
  cancelled:[],expired:[]
});
export class PaymentError extends Error {
  constructor(status,message){super(message);this.status=status;this.name="PaymentError"}
}
export function sha256(value){
  return createHash("sha256").update(String(value),"utf8").digest("hex");
}
export function randomIntentNonce(){
  return randomBytes(24).toString("base64url");
}
export function assertWorkspaceId(id){
  if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))
    throw new PaymentError(400,"Valid workspace ID required");
  return id.toLowerCase();
}
export function assertIntentId(id){return assertWorkspaceId(id)}
export function assertIdempotencyKey(key){
  if(typeof key!=="string"||!/^[A-Za-z0-9_-]{24,128}$/.test(key))
    throw new PaymentError(400,"A fresh 24–128 character X-Idempotency-Key is required");
  return key;
}
export function cleanLimitedText(value,label,max=100){
  if(value===undefined||value===null)return "";
  if(typeof value!=="string"||value.length>max||/[\u0000-\u001f\u007f]/.test(value))
    throw new PaymentError(400,label+" contains invalid characters or exceeds "+max+" characters");
  return value.trim();
}
export function assertExpiresInMinutes(n){
  const value=n===undefined?20:n;
  if(!Number.isSafeInteger(value)||value<5||value>1440)
    throw new PaymentError(400,"Expiry must be an integer from 5 to 1440 minutes");
  return value;
}
export function normalizeM3Request(input,sessionAddress){
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new PaymentError(400,"Payment request must be an object");
  const workspaceId=assertWorkspaceId(input.workspaceId);
  const request=normalizeAmaProposal({
    ...input,network:input.network??AMA_TESTNET.id,token:input.token??"AMA"
  });
  if(request.payer!==sessionAddress)
    throw new PaymentError(403,"Payer must be the authenticated wallet owner");
  const invoiceRef=cleanLimitedText(input.invoiceRef,"Invoice reference",90);
  const memo=cleanLimitedText(input.memo,"Memo",140);
  const expiresInMinutes=assertExpiresInMinutes(input.expiresInMinutes);
  return Object.freeze({
    workspaceId,network:AMA_TESTNET.id,payer:request.payer,recipient:request.recipient,
    token:"AMA",amount:request.amount,amountUnits:request.amountUnits,memo,invoiceRef,
    expiresInMinutes
  });
}
export function requestFingerprint(normalized){
  const {workspaceId,network,payer,recipient,token,amountUnits,memo,invoiceRef,expiresInMinutes}=normalized;
  return sha256(JSON.stringify({workspaceId,network,payer,recipient,token,amountUnits,memo,invoiceRef,expiresInMinutes}));
}
export function intentTerms(normalized,{beneficiaryVersion,expiresAt,nonce}){
  if(!Number.isSafeInteger(beneficiaryVersion)||beneficiaryVersion<1)
    throw new PaymentError(409,"Beneficiary must be allowlisted");
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=0||!/^[A-Za-z0-9_-]{24,60}$/.test(nonce))
    throw new PaymentError(400,"Invalid immutable intent expiry or nonce");
  return Object.freeze({
    ...normalized,beneficiaryVersion,expiresAt,nonce,
    contract:"Coin",method:"transfer",args:[normalized.recipient,normalized.amountUnits,"AMA"]
  });
}
export function termsFingerprint(terms){return sha256(JSON.stringify(terms))}
export function mayTransition(from,to){return (TRANSITIONS[from]||[]).includes(to)}
export function effectiveIntentStatus(row,now=Date.now()){
  const status=String(row.status||"");
  return !["cancelled","expired"].includes(status)&&new Date(row.expires_at).getTime()<=now
    ?"expired":status;
}
export function exactTransferCall(row){
  // Native SDK call arguments: NOT a signed or serialized transaction.
  const proposal={network:AMA_TESTNET.id,payer:row.payer,recipient:row.recipient,
    amount:String(row.amount),token:"AMA",selfTransferAcknowledged:true};
  const call=prepareAmaCall(proposal);
  if(call.contract!=="Coin"||call.method!=="transfer"||
     String(call.args[1])!==String(row.amount_units))
    throw new PaymentError(409,"Stored native transfer terms failed integrity check");
  return Object.freeze({...call,serialized:false,unsigned:true,
    requiresWalletSignature:true,chain:AMA_TESTNET.id});
}
export function assertExactReview(row,providedHash){
  if(typeof providedHash!=="string"||!/^[a-f0-9]{64}$/.test(providedHash)||
    providedHash!==row.terms_hash)
    throw new PaymentError(409,"Payment terms changed; reload and review the exact new intent");
  if(effectiveIntentStatus(row)==="expired")
    throw new PaymentError(409,"Payment intent expired; create a new one");
}
export function assertBeneficiarySnapshot(row,beneficiary){
  if(!beneficiary||beneficiary.status!=="allowed"||
    Number(beneficiary.version)!==Number(row.beneficiary_version))
    throw new PaymentError(409,"Beneficiary was changed or blocked; prepare a new payment intent");
}
export function approvalReviewResult(row,beneficiary){
  const status=effectiveIntentStatus(row);
  let valid=true,reason="";
  try{assertBeneficiarySnapshot(row,beneficiary)}catch(e){valid=false;reason=e.message}
  if(status==="expired"||status==="cancelled"){valid=false;reason="Intent is no longer active"}
  const call=exactTransferCall(row);
  return {id:row.id,status,termsHash:row.terms_hash,network:AMA_TESTNET.id,
    workspaceId:row.workspace_id,payer:row.payer,recipient:row.recipient,
    amount:String(row.amount),atomicUnits:String(row.amount_units),asset:"AMA",
    invoiceRef:row.invoice_ref||"",memo:row.memo||"",expiresAt:new Date(row.expires_at).toISOString(),
    reviewedBy:row.reviewed_by||null,approvedBy:row.approved_by||null,
    approvalHash:row.approval_terms_hash||null,
    unsignedCall:call,beneficiaryCurrent:valid,blockReason:reason||null,
    requiresWalletSignature:true,mayBroadcast:false,independentlyVerified:false};
}
export function assertFeeUnsupported(value) {
  if(value!==undefined&&value!==null)
    throw new PaymentError(400,"Unverified fee, fiat, stablecoin and FX quotes are unsupported in M3");
}
export function configuredMaxUnits(){
  return BigInt(parseAmaAmount(String(process.env.AMA_TESTNET_MAX_TRANSFER||"100")));
}
