import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {encode,fromBase58,toBase58} from "@amadeus-protocol/sdk";
import {PaymentError} from "../api/_lib/v3-payment-core.js";
import {AMA_TX_TESTNET_DST,verifyPackedTestnetTransfer,authorizeExecutionIntent,verifyObservedChainTransaction,executionIsTerminal} from "../api/_lib/v3-execution-core.js";

const secret=bls.utils.randomPrivateKey(),other=bls.utils.randomPrivateKey();
const payer=toBase58(bls.getPublicKey(secret)),wrongPayer=toBase58(bls.getPublicKey(other));
const recipient=toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const units="1000000001",hashOf=s=>createHash("sha256").update(s).digest("hex");
const intent=()=>({
 id:"123e4567-e89b-42d3-a456-426614174111",payer,recipient,
 network:"amadeus-testnet",asset:"AMA",status:"awaiting_wallet_signature",
 amount_units:units,terms_hash:"a".repeat(64),approval_terms_hash:"a".repeat(64),
 beneficiary_version:3,expires_at:new Date(Date.now()+600000)
});
const beneficiary={status:"allowed",version:3};
function signPacket({
 sk=secret,pk=bls.getPublicKey(secret),rec=recipient,amount=units,asset="AMA",
 contract="Coin",method="transfer",op="call",dst=AMA_TX_TESTNET_DST,
 nonce=BigInt(Date.now())*1000000n,changeHash=false
}={}){
 const tx={signer:pk,nonce,action:{op,contract,function:method,
  args:[fromBase58(rec),amount,asset]}};
 const hash=Uint8Array.from(createHash("sha256").update(encode(tx)).digest());
 const signature=bls.sign(hash,sk,{DST:dst});
 return {packed:toBase58(encode({tx,hash:changeHash?new Uint8Array(32):hash,signature})),
   hash:toBase58(hash)};
}
test("Cryptographically validates canonical VecPack, signer and official Testnet DST",()=>{
 const signed=signPacket();
 const result=verifyPackedTestnetTransfer({packed:signed.packed,intent:intent(),walletTxHash:signed.hash});
 assert.equal(result.hash,signed.hash);
 assert.equal(result.signer,payer);assert.equal(result.recipient,recipient);
 assert.equal(result.amountUnits,units);assert.equal(result.asset,"AMA");
 assert.equal(result.signatureVerified,true);
 assert.equal(result.packetDigest.length,64);
 assert.equal("packed" in result,false);
 assert.throws(()=>verifyPackedTestnetTransfer({packed:signed.packed,intent:intent(),walletTxHash:toBase58(new Uint8Array(32).fill(5))}),/differs/);
});
test("Invalid signature / mainnet DST / wrong keys / changed bytes are rejected",()=>{
 const valid=intent();
 for(const invalid of [
  signPacket({dst:"AMADEUS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_TX_"}),
  signPacket({sk:other}),
  signPacket({pk:bls.getPublicKey(other)}),
  signPacket({changeHash:true}),
  signPacket({amount:"1000000002"}),
  signPacket({asset:"USDC"}),
  signPacket({rec:wrongPayer}),
  signPacket({contract:"Nft"}),
  signPacket({method:"mint"}),
  signPacket({op:"approve"})
 ]){
  assert.throws(()=>verifyPackedTestnetTransfer({packed:invalid.packed,intent:valid}),/Invalid|Signed|signer|action|hash|amount|asset|recipient/i);
 }
 for(const value of ["", "!!", "0x01234","not-a-packet", "A".repeat(17000)]){
  assert.throws(()=>verifyPackedTestnetTransfer({packed:value,intent:valid}),/Base58|packet|limit/);
 }
 assert.throws(()=>verifyPackedTestnetTransfer({packed:signPacket().packed,intent:{...valid,status:"draft"}}),/Unapproved/);
 assert.throws(()=>verifyPackedTestnetTransfer({packed:signPacket().packed,intent:{...valid,approval_terms_hash:"b".repeat(64)}}),/Unapproved/);
});
test("Execution policy blocks stale approval, expired time, changed beneficiary, wrong actor",()=>{
 const valid=intent();
 assert.doesNotThrow(()=>authorizeExecutionIntent(valid,beneficiary,payer));
 assert.throws(()=>authorizeExecutionIntent(valid,beneficiary,wrongPayer),/wallet owner/);
 assert.throws(()=>authorizeExecutionIntent({...valid,expires_at:new Date(Date.now()-1000)},beneficiary,payer),/expired/);
 assert.throws(()=>authorizeExecutionIntent(valid,{status:"blocked",version:3},payer),/Beneficiary/);
 assert.throws(()=>authorizeExecutionIntent(valid,{status:"allowed",version:4},payer),/Beneficiary/);
 assert.throws(()=>authorizeExecutionIntent({...valid,approval_terms_hash:"x"},beneficiary,payer),/terms|approved/i);
});
const fakeChain=(hash,{payerArg=payer,receiver=recipient,amt=units,asset="AMA",success=true,error=null,status="finalized",height=30}={})=>({
 hash,tx:{signer:payerArg,action:{op:"call",contract:"Coin",function:"transfer",args:[receiver,amt,asset]}},
 metadata:{entry_hash:toBase58(new Uint8Array(32).fill(7)),entry_height:height,status},
 receipt:{success,result:success?null:"execution_error",logs:[]},result:{error}
});
test("Independent chain comparison requires matching hash, signer, exact amount and successful receipt",()=>{
 const hash=signPacket().hash;
 const record={tx_hash:hash,payer,recipient,amount_units:units};
 const pass=verifyObservedChainTransaction({record,chainTx:fakeChain(hash),rootedHeight:40});
 assert.equal(pass.status,"finalized");
 assert.equal(pass.receipt.executionSuccess,true);
 assert.equal(pass.receipt.amountUnits,units);
 assert.equal(pass.receipt.finality,"finalized");
 const confirmation=verifyObservedChainTransaction({record,chainTx:fakeChain(hash,{status:"confirmed",height:40}),rootedHeight:20});
 assert.equal(confirmation.status,"confirmed");
 const rooted=verifyObservedChainTransaction({record,chainTx:fakeChain(hash,{status:"unknown",height:30}),rootedHeight:35});
 assert.equal(rooted.status,"finalized");
 for(const change of [
  {payerArg:wrongPayer},{receiver:wrongPayer},{amt:"1000000000"},{asset:"USDC"}
 ]){
  const bad=verifyObservedChainTransaction({record,chainTx:fakeChain(hash,change),rootedHeight:50});
  assert.equal(bad.status,"disputed");
  assert.equal(!!bad.receipt,false);
 }
 assert.equal(verifyObservedChainTransaction({record,chainTx:fakeChain(hash,{success:false}),rootedHeight:50}).status,"failed");
 assert.equal(verifyObservedChainTransaction({record,chainTx:fakeChain(hash,{error:"failed"}),rootedHeight:50}).status,"failed");
 assert.equal(verifyObservedChainTransaction({record,chainTx:fakeChain(hash+"different"),rootedHeight:50}).status,"disputed");
 assert.equal(executionIsTerminal("finalized"),true);
 assert.equal(executionIsTerminal("uncertain"),false);
});
test("Refuses to treat absent chain metadata or unknown success as final",()=>{
 const signed=signPacket(),record={tx_hash:signed.hash,payer,recipient,amount_units:units};
 const tx=fakeChain(signed.hash);
 delete tx.metadata;
 assert.equal(verifyObservedChainTransaction({record,chainTx:tx,rootedHeight:100}).status,"pending");
 const tx2=fakeChain(signed.hash);delete tx2.receipt.success;
 assert.equal(verifyObservedChainTransaction({record,chainTx:tx2,rootedHeight:100}).status,"pending");
});
