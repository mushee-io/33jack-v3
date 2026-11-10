/**
 * M4: native Amadeus Testnet signed-packet and independently queried receipt checks.
 * The server never generates, stores or handles a wallet private key.
 * Signed packets are checked BEFORE one-attempt Testnet submission.
 */
import {createHash,timingSafeEqual} from "node:crypto";
import {decode,encode,fromBase58,toBase58} from "@amadeus-protocol/sdk";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {AMA_TESTNET} from "./amadeus-testnet.js";
import {PaymentError,assertExactReview,assertBeneficiarySnapshot} from "./v3-payment-core.js";

export const AMA_TX_TESTNET_DST="AMADEUS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_TX_TESTNET_";
const HEX_HASH=/^[1-9A-HJ-NP-Za-km-z]{25,110}$/;
const textDecoder=new TextDecoder("utf-8",{fatal:true});

function rawMapField(value,key){
  if(!(value instanceof Map))throw new PaymentError(400,"Signed transaction has invalid native Map structure");
  let matched;
  for(const [k,v] of value){
    if(!(k instanceof Uint8Array))throw new PaymentError(400,"Unexpected native transaction key type");
    if(textDecoder.decode(k)===key){
      if(matched!==undefined)throw new PaymentError(400,"Duplicate native transaction key");
      matched=v;
    }
  }
  if(matched===undefined)throw new PaymentError(400,"Missing signed transaction field: "+key);
  return matched;
}
function utf8Bytes(value,label){
  if(!(value instanceof Uint8Array))throw new PaymentError(400,label+" must use native VecPack bytes");
  return textDecoder.decode(value);
}
function bytesEqual(a,b){
  return a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
function exactB58(value,expected){
  if(typeof value!=="string"||!HEX_HASH.test(value))throw new PaymentError(400,"Malformed native transaction hash");
  if(expected&&value!==expected)throw new PaymentError(409,"Wallet transaction hash differs from signed payload");
  return value;
}
export function verifyPackedTestnetTransfer({packed,intent,walletTxHash}){
  if(typeof packed!=="string"||packed.length<140||packed.length>16384||
     !/^[1-9A-HJ-NP-Za-km-z]+$/.test(packed))
    throw new PaymentError(400,"Expected a valid native Base58 signed transaction packet");
  if(!intent||intent.network!=="amadeus-testnet"||intent.asset!=="AMA"||
     intent.status!=="awaiting_wallet_signature"||
     intent.approval_terms_hash!==intent.terms_hash)
    throw new PaymentError(409,"Unapproved or altered native payment intent");
  const bytes=fromBase58(packed);
  if(bytes.length>8192)throw new PaymentError(413,"Native transaction exceeds M4 packet safety limit");
  let packet;
  try{packet=decode(bytes)}catch{
    throw new PaymentError(400,"Signed packet is not canonical VecPack");
  }
  if(!bytesEqual(encode(packet),bytes))
    throw new PaymentError(400,"Noncanonical signed packet cannot be broadcast");
  const tx=rawMapField(packet,"tx");
  const claimedHash=rawMapField(packet,"hash");
  const signature=rawMapField(packet,"signature");
  if(!(claimedHash instanceof Uint8Array)||claimedHash.length!==32||
     !(signature instanceof Uint8Array)||signature.length!==96)
    throw new PaymentError(400,"Native transaction hash or signature bytes are invalid");
  const calculated=Uint8Array.from(createHash("sha256").update(encode(tx)).digest());
  if(!bytesEqual(calculated,claimedHash))
    throw new PaymentError(409,"Signed packet hash is not the SHA-256 of native transaction");
  const signer=rawMapField(tx,"signer");
  const nonce=rawMapField(tx,"nonce");
  const action=rawMapField(tx,"action");
  if(!(signer instanceof Uint8Array)||signer.length!==48||
     toBase58(signer)!==intent.payer)
    throw new PaymentError(403,"Native transaction signer does not match approved payer wallet");
  if(typeof nonce!=="bigint"||nonce<=0n||nonce>10n**22n)
    throw new PaymentError(400,"Invalid native transaction nonce");
  const op=utf8Bytes(rawMapField(action,"op"),"Operation");
  const contract=utf8Bytes(rawMapField(action,"contract"),"Contract");
  const method=utf8Bytes(rawMapField(action,"function"),"Function");
  if(op!=="call"||contract!=="Coin"||method!=="transfer")
    throw new PaymentError(409,"Signed action is not the approved native Coin.transfer");
  const args=rawMapField(action,"args");
  if(!Array.isArray(args)||args.length!==3)
    throw new PaymentError(400,"Native Coin.transfer requires exactly three arguments");
  const recipientBytes=args[0];
  if(!(recipientBytes instanceof Uint8Array)||recipientBytes.length!==48||
     toBase58(recipientBytes)!==intent.recipient)
    throw new PaymentError(409,"Signed transfer recipient differs from approved terms");
  const units=utf8Bytes(args[1],"Atomic amount");
  const asset=utf8Bytes(args[2],"Native token");
  if(!/^[1-9]\d*$/.test(units)||units!==String(intent.amount_units)||asset!=="AMA")
    throw new PaymentError(409,"Signed AMA asset or exact atomic amount differs from approved terms");
  let verified=false;
  try{verified=bls.verify(signature,calculated,signer,{DST:AMA_TX_TESTNET_DST})}
  catch{verified=false}
  if(!verified)throw new PaymentError(403,"Invalid signature for Amadeus Testnet signing domain");
  const hash=toBase58(calculated);
  if(walletTxHash!==undefined)exactB58(walletTxHash,hash);
  return Object.freeze({hash,signer:intent.payer,recipient:intent.recipient,
    amountUnits:units,asset:"AMA",network:AMA_TESTNET.id,signatureVerified:true,
    packetDigest:createHash("sha256").update(bytes).digest("hex"),
    // Never return the signed packed payload to the caller, logs or DB.
    nonce:nonce.toString(),bytes});
}
export function authorizeExecutionIntent(intent,beneficiary,actor,now=Date.now()){
  if(!intent||intent.payer!==actor||intent.network!=="amadeus-testnet"||
     intent.asset!=="AMA"||intent.status!=="awaiting_wallet_signature")
    throw new PaymentError(403,"Only the approved wallet owner can execute a native AMA Testnet intent");
  assertExactReview(intent,intent.terms_hash);
  assertBeneficiarySnapshot(intent,beneficiary);
  if(new Date(intent.expires_at).getTime()<=now)
    throw new PaymentError(409,"Approved terms expired before execution");
  if(intent.approval_terms_hash!==intent.terms_hash)
    throw new PaymentError(409,"Approved terms fingerprint does not match immutable intent");
}
function normalizedChainArgument(value,label){
  if(typeof value==="string")return value;
  if(value instanceof Uint8Array)return toBase58(value);
  throw new PaymentError(422,"Unsupported on-chain "+label+" encoding; verification pending");
}
function readableAtomic(value){
  if(typeof value==="string"&&/^(0|[1-9]\d*)$/.test(value))return value;
  if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0)return String(value);
  throw new PaymentError(422,"On-chain amount encoding is unknown; verification pending");
}
export function verifyObservedChainTransaction({record,chainTx,rootedHeight}){
  if(!record||!exactB58(record.tx_hash))throw new PaymentError(400,"Missing reserved transaction hash");
  if(!chainTx||chainTx.hash!==record.tx_hash)
    return {status:"disputed",reason:"RPC hash does not match reserved signed packet"};
  const action=chainTx.tx?.action;
  let termsMatch=false;
  try{
    const signer=normalizedChainArgument(chainTx.tx?.signer,"signer");
    const contract=normalizedChainArgument(action?.contract,"contract");
    const method=normalizedChainArgument(action?.function,"method");
    const recipient=normalizedChainArgument(action?.args?.[0],"recipient");
    const units=readableAtomic(action?.args?.[1]);
    const asset=normalizedChainArgument(action?.args?.[2],"asset");
    termsMatch=signer===record.payer&&contract==="Coin"&&method==="transfer"&&
      action?.op==="call"&&Array.isArray(action?.args)&&action.args.length===3&&
      recipient===record.recipient&&units===String(record.amount_units)&&asset==="AMA";
  }catch{termsMatch=false}
  if(!termsMatch)return {status:"disputed",reason:"Chain signer, recipient, amount or native action does not match approved payment"};
  const success=chainTx.receipt?.success;
  if(success===false|| (chainTx.result?.error!==null&&chainTx.result?.error!==undefined&&chainTx.result.error!=="ok"))
    return {status:"failed",reason:"Verified chain transaction reports failed execution"};
  if(success!==true)return {status:"pending",reason:"Chain has not supplied an explicitly successful execution receipt"};
  const metadata=chainTx.metadata;
  if(!metadata||!Number.isSafeInteger(Number(metadata.entry_height))||
     Number(metadata.entry_height)<0||typeof metadata.entry_hash!=="string")
    return {status:"pending",reason:"Missing verifiable block metadata"};
  const rooted=Number.isSafeInteger(rootedHeight)&&rootedHeight>=Number(metadata.entry_height);
  const explicit=metadata.status==="finalized";
  const status=explicit||rooted?"finalized":"confirmed";
  return {status,reason:null,receipt:{
    network:AMA_TESTNET.id,txHash:record.tx_hash,payer:record.payer,
    recipient:record.recipient,amountUnits:String(record.amount_units),asset:"AMA",
    contract:"Coin",method:"transfer",entryHash:metadata.entry_hash,
    entryHeight:Number(metadata.entry_height),finality:status,
    executionSuccess:true,verifiedBy:"official Amadeus Testnet RPC",
    checkedAt:new Date().toISOString()
  }};
}
export function executionIsTerminal(status){return ["finalized","failed","disputed"].includes(status)}
