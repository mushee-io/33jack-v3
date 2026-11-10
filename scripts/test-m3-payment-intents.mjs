import {test} from "node:test";
import assert from "node:assert/strict";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {
 PaymentError,sha256,assertWorkspaceId,assertIdempotencyKey,normalizeM3Request,
 requestFingerprint,randomIntentNonce,intentTerms,termsFingerprint,mayTransition,effectiveIntentStatus,
 exactTransferCall,assertExactReview,assertBeneficiarySnapshot,approvalReviewResult,
 configuredMaxUnits,assertFeeUnsupported
} from "../api/_lib/v3-payment-core.js";
import amaHandler from "../api/_lib/v3-amadeus-handler.js";
import {readFileSync} from "node:fs";

const addr=()=>toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const payer=addr(),recipient=addr(),workspaceId="123e4567-e89b-42d3-a456-426614174000";
const base={workspaceId,network:"amadeus-testnet",payer,recipient,token:"AMA",
 amount:"1.000000001",memo:"Test-only",invoiceRef:"INV-3",expiresInMinutes:20};
function draft(){
 const normalized=normalizeM3Request(base,payer);
 const expiresAt=Date.now()+20*60*1000,nonce=randomIntentNonce();
 const terms=intentTerms(normalized,{beneficiaryVersion:3,expiresAt,nonce});
 return {id:"123e4567-e89b-42d3-a456-426614174001",workspace_id:workspaceId,
 payer,recipient,amount:normalized.amount,amount_units:normalized.amountUnits,
 network:"amadeus-testnet",asset:"AMA",memo:"Test-only",invoice_ref:"INV-3",
 beneficiary_version:3,nonce,terms_hash:termsFingerprint(terms),
 expires_at:new Date(expiresAt),status:"draft"};
}
test("M3 stores exact native 9-decimal amounts and rejects unsupported networks",()=>{
 const obj=normalizeM3Request(base,payer);
 assert.equal(obj.amountUnits,"1000000001");
 assert.equal(configuredMaxUnits(),100000000000n);
 assert.throws(()=>normalizeM3Request({...base,amount:"0"},payer),/exceed zero/);
 assert.throws(()=>normalizeM3Request({...base,amount:"1e-2"},payer),/decimal/);
 assert.throws(()=>normalizeM3Request({...base,amount:"0.0000000001"},payer),/9/);
 assert.throws(()=>normalizeM3Request({...base,amount:"101"},payer),/limit/);
 assert.throws(()=>normalizeM3Request({...base,network:"celo"},payer),/Only Amadeus Testnet/);
 assert.throws(()=>normalizeM3Request({...base,token:"USDC"},payer),/Only native AMA/);
 assert.throws(()=>normalizeM3Request({...base,recipient:"0xabcdef"},payer),/Base58/);
 assert.throws(()=>normalizeM3Request({...base,payer:recipient},payer),/authenticated wallet owner/);
 assert.throws(()=>normalizeM3Request({...base,expiresInMinutes:1},payer),/Expiry/);
 assert.throws(()=>normalizeM3Request({...base,memo:"unsafe\nnewline"},payer),/invalid characters/);
 assert.throws(()=>normalizeM3Request({...base,recipient:payer},payer),/self-transfer/);
 assert.equal(normalizeM3Request({...base,recipient:payer,selfTransferAcknowledged:true},payer).recipient,payer);
});
test("idempotency and immutable terms contain all chain-critical inputs",()=>{
 assert.equal(assertWorkspaceId(workspaceId),workspaceId);
 assert.equal(assertIdempotencyKey("request_a2345678901234567890123456"),"request_a2345678901234567890123456");
 assert.throws(()=>assertIdempotencyKey("short"),/Idempotency/);
 const one=normalizeM3Request(base,payer);
 assert.equal(requestFingerprint(one),requestFingerprint(normalizeM3Request({...base,amount:"1.0"+""+"00000001"},payer)));
 assert.notEqual(requestFingerprint(one),requestFingerprint(normalizeM3Request({...base,recipient:addr()},payer)));
 assert.notEqual(requestFingerprint(one),requestFingerprint(normalizeM3Request({...base,invoiceRef:"INV-4"},payer)));
 const nonce1=randomIntentNonce(),nonce2=randomIntentNonce(),expiry=Date.now()+1200000;
 assert.notEqual(nonce1,nonce2);
 assert.notEqual(termsFingerprint(intentTerms(one,{beneficiaryVersion:1,expiresAt:expiry,nonce:nonce1})),
   termsFingerprint(intentTerms(one,{beneficiaryVersion:1,expiresAt:expiry,nonce:nonce2})));
 assert.notEqual(termsFingerprint(intentTerms(one,{beneficiaryVersion:1,expiresAt:expiry,nonce:nonce1})),
   termsFingerprint(intentTerms(one,{beneficiaryVersion:2,expiresAt:expiry,nonce:nonce1})));
 assert.equal(sha256("same"),sha256("same"));
});
test("transfer parameters are native unsigned Coin.transfer only",()=>{
 const row=draft(),call=exactTransferCall(row);
 assert.equal(call.network,"amadeus-testnet");
 assert.equal(call.contract,"Coin");assert.equal(call.method,"transfer");
 assert.deepEqual(call.args,[recipient,"1000000001","AMA"]);
 assert.equal(call.unsigned,true);assert.equal(call.serialized,false);
 assert.equal(call.requiresWalletSignature,true);
 assert.equal("txPacked" in call,false);
 assert.equal("signature" in call,false);
 assert.throws(()=>exactTransferCall({...row,amount_units:"999"}),/integrity/);
});
test("stale hash, beneficiary version, expiry and illegal transitions fail closed",()=>{
 const row=draft(),b={status:"allowed",version:3};
 assert.doesNotThrow(()=>assertExactReview(row,row.terms_hash));
 assert.throws(()=>assertExactReview(row,"0".repeat(64)),/terms changed/);
 assert.doesNotThrow(()=>assertBeneficiarySnapshot(row,b));
 assert.throws(()=>assertBeneficiarySnapshot(row,{status:"blocked",version:3}),/Beneficiary/);
 assert.throws(()=>assertBeneficiarySnapshot(row,{status:"allowed",version:4}),/Beneficiary/);
 assert.equal(mayTransition("draft","reviewed"),true);
 assert.equal(mayTransition("draft","awaiting_wallet_signature"),false);
 assert.equal(mayTransition("reviewed","awaiting_wallet_signature"),true);
 assert.equal(mayTransition("awaiting_wallet_signature","confirmed"),false);
 assert.equal(mayTransition("cancelled","reviewed"),false);
 assert.equal(effectiveIntentStatus({...row,expires_at:new Date(Date.now()-1000)}),"expired");
 assert.throws(()=>assertExactReview({...row,expires_at:new Date(Date.now()-1000)},row.terms_hash),/expired/);
 const preview=approvalReviewResult(row,b);
 assert.equal(preview.beneficiaryCurrent,true);
 assert.equal(preview.mayBroadcast,false);
 assert.equal(preview.independentlyVerified,false);
 assert.equal(approvalReviewResult(row,{status:"blocked",version:3}).beneficiaryCurrent,false);
});
test("fabricated fiat, fee and settlement paths remain unsupported",()=>{
 assert.throws(()=>assertFeeUnsupported("0.02"),/unsupported/);
 assert.doesNotThrow(()=>assertFeeUnsupported(undefined));
 const src=readFileSync(new URL("../src/AmadeusWorkspace.jsx",import.meta.url),"utf8");
 assert.doesNotMatch(src,/submitAndWait|signTransaction|sendRawTransaction|txPacked/);
 assert.match(src,/AmadeusPaymentPanel/);
});
test("old unauthenticated plan/submit/broadcast API is retired",async()=>{
 for(const operation of ["plan","submit","broadcast"]){
  const value=await new Promise(resolve=>{
   const res={statusCode:200,setHeader(){return this},status(code){this.statusCode=code;return this},
    json(data){resolve({status:this.statusCode,data});return this}};
   Promise.resolve(amaHandler({query:{operation},method:"POST",body:{}},res))
    .catch(e=>resolve({status:500,error:e.message}));
  });
  assert.equal(value.status,410,operation+" was not retired");
 }
});
