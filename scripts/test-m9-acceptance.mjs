import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {toBase58} from "@amadeus-protocol/sdk";
import {
 M9_NETWORK,M9_SCOPES,M9_EXTERNAL,assertNoSensitiveEvidence,assertM9Intent,
 persistedM4Proof,checkChainWitness,evaluateAcceptance,evidenceRecordHash,
 verifyEvidenceHistory
} from "../api/_lib/v3-acceptance-core.js";
const hash=(n)=>toBase58(Buffer.alloc(32,n));
const payer=hash(1),recipient=hash(2),other=hash(3),txHash=hash(8),entryHash=hash(9);
const workspaceId="123e4567-e89b-42d3-a456-426614174000";
const intent={id:"123e4567-e89b-42d3-a456-426614174001",network:"amadeus-testnet",
 asset:"AMA",status:"awaiting_wallet_signature",payer,recipient,created_by:payer,
 terms_hash:"a".repeat(64),approval_terms_hash:"a".repeat(64),
 amount_units:"123456789",invoice_ref:"INV-M9",approved_by:payer};
const receipt={network:"amadeus-testnet",finality:"finalized",executionSuccess:true,
 txHash,payer,recipient,amountUnits:intent.amount_units,asset:"AMA",
 contract:"Coin",method:"transfer",entryHash,entryHeight:125,
 verifiedBy:"official Amadeus Testnet RPC"};
const execution={status:"finalized",tx_hash:txHash,receipt,verified_at:new Date(),
 broadcast_attempts:1};
const chain={hash:txHash,tx:{signer:payer,action:{op:"call",contract:"Coin",function:"transfer",
 args:[recipient,intent.amount_units,"AMA"]}},
 metadata:{entry_hash:entryHash,entry_height:125,status:"finalized"},
 receipt:{success:true},result:{error:null}};
const factory=()=>({transaction:{get:async()=>chain},chain:{getStats:async()=>({stats:{rooted_height:140}})}});
test("M9 Testnet scope, no fabricated KYC or live transfer",()=>{
 assert.equal(M9_NETWORK,"amadeus-testnet");
 assert.ok(M9_SCOPES.length>=12);
 assert.equal(M9_EXTERNAL.fundedTwoWalletTransfer,"not_witnessed");
 assert.equal(M9_EXTERNAL.independentSecurityReview,"not_submitted");
 assert.equal(M9_EXTERNAL.complianceProviders.kyc,"not_integrated");
 assert.equal(assertM9Intent(intent),intent);
 for(const p of [{...intent,network:"amadeus-mainnet"},
  {...intent,asset:"USDC"},{...intent,status:"draft"},
  {...intent,recipient:payer},{...intent,approval_terms_hash:"b".repeat(64)}])
  assert.throws(()=>assertM9Intent(p),/No eligible/);
});
test("M9 rejects tampered, synthetic, nonofficial or replayed settlement receipts",()=>{
 assert.equal(persistedM4Proof(intent,execution).ok,true);
 for(const x of [
  {...execution,receipt:{...receipt,syntheticCIOnly:true}},
  {...execution,receipt:{...receipt,recipient:other}},
  {...execution,receipt:{...receipt,amountUnits:"1"}},
  {...execution,receipt:{...receipt,verifiedBy:"simulated"}},
  {...execution,receipt:{...receipt,finality:"confirmed"}},
  {...execution,broadcast_attempts:2},
  {...execution,verified_at:null},
  {...execution,status:"pending"}
 ])assert.equal(persistedM4Proof(intent,x).ok,false);
});
test("M9 injected fake RPC cannot produce live witness, even when chain fixture matches",async()=>{
 const mock=await checkChainWitness({intent,execution,clientFactory:factory,isLiveClient:false});
 assert.equal(mock.status,"synthetic_ci_only");
 assert.equal(mock.realChainEvidence,false);
 assert.equal(mock.ok,false);
 const mismatch=await checkChainWitness({intent,execution,clientFactory:()=>({
  transaction:{get:async()=>({...chain,tx:{...chain.tx,signer:other}})},
  chain:{getStats:async()=>({stats:{rooted_height:140}})}
 }),isLiveClient:false});
 assert.equal(mismatch.ok,false);
 const networkError=await checkChainWitness({intent,execution,clientFactory:()=>({
  transaction:{get:async()=>{throw Error("offline")}},chain:{getStats:async()=>({stats:{rooted_height:140}})}
 }),isLiveClient:false});
 assert.equal(networkError.ok,false);
 const notRooted=await checkChainWitness({intent,execution,clientFactory:()=>({
  transaction:{get:async()=>({...chain,metadata:{...chain.metadata,status:"confirmed"}})},
  chain:{getStats:async()=>({stats:{rooted_height:110}})}
 }),isLiveClient:false});
 assert.equal(notRooted.ok,false);
});
test("M9 overall acceptance never becomes GO from simulated RPC and synthetic CI restore",()=>{
 const result=evaluateAcceptance({wallets:[payer,recipient],intent,execution,
  receiptWitness:{ok:false,realChainEvidence:false,reason:"synthetic_ci_only"},
  invoice:{status:"human_verified",currency:"AMA",settlement:{state:"settled"},linkedIntents:1},
  agentReadEvents:1,auditIntegrity:{valid:true},
  restoreEvidence:{verified:true,source:"independent_postgresql_restore"},
  source:"synthetic_ci_only"});
 assert.equal(result.acceptance,"no_go");
 assert.equal(result.liveTransferProven,false);
 assert.equal(result.readyForMainnet,false);
 assert.equal(result.automaticBroadcastAuthorized,false);
 assert.ok(result.openBlockers.includes("official_rpc_reverification"));
 assert.ok(result.openBlockers.includes("independent_security_review"));
 const noLogin=evaluateAcceptance({wallets:[payer,payer],intent,execution});
 assert.ok(noLogin.openBlockers.includes("wallet_two_distinct_authenticated"));
});
test("M9 hash-linked audit detects altered, missing, or reordered acceptance evidence",()=>{
 const at="2026-11-10T12:30:00.000Z",zero="0".repeat(64);
 const data={txHash,source:"synthetic_ci_only",acceptance:"no_go"};
 const h1=evidenceRecordHash({workspaceId,intentId:intent.id,actor:payer,
  status:"synthetic_ci_only",previousHash:zero,checkedAt:at,details:data});
 const row={id:"event1",intent_id:intent.id,actor:payer,status:"synthetic_ci_only",
  details:JSON.stringify(data),previous_hash:zero,event_hash:h1,checked_at:at};
 assert.equal(verifyEvidenceHistory([row],workspaceId).valid,true);
 assert.equal(verifyEvidenceHistory([{...row,details:JSON.stringify({...data,source:"official"})}],workspaceId).valid,false);
 assert.equal(verifyEvidenceHistory([{...row,previous_hash:"1".repeat(64)}],workspaceId).valid,false);
});
test("M9 never receives raw secrets or financial control capabilities",()=>{
 assert.doesNotThrow(()=>assertNoSensitiveEvidence("Redacted RPC finality metadata only"));
 for(const x of ["seed: twelve words here","Authorization=Bearer","-----BEGIN PRIVATE KEY-----",
  "gsk_"+"x".repeat(30),"cookie: sessionToken"])
  assert.throws(()=>assertNoSensitiveEvidence(x),/Unsafe/);
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const h=read("api/_lib/v3-acceptance-handler.js");
 assert.match(h,/acceptance-witness/);
 assert.match(h,/requireCsrf/);
 assert.doesNotMatch(h,/transaction\.submit\(|signTransaction\(|reserveSignedExecution\(/);
 const store=read("api/_lib/v3-acceptance-store.js");
 assert.doesNotMatch(store,/UPDATE ama_v3_executions|INSERT INTO ama_v3_executions|DELETE FROM ama_v3_payment_intents/);
 assert.match(store,/ciFixture:!live/);
 const m4=read("api/_lib/v3-execution-handler.js");
 assert.match(m4,/AMA_M4_ENABLE_BROADCAST/);
 assert.match(m4,/AMA_M4_WALLET_EXTENSION_VERIFIED/);
 assert.match(m4,/AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED/);
 const agent=read("api/_lib/v3-agent-core.js");
 assert.doesNotMatch(agent,/ama\.tx\.submit|ama\.payment\.approve/);
 const inv=read("api/_lib/v3-invoice-store.js");
 assert.match(inv,/ama_v3_m6_immutable_events/);
 const gov=read("api/_lib/v3-governance-store.js");
 assert.match(gov,/ama_v3_m7_immutable_events/);
});
