import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {encode,fromBase58,toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {createIntent,transitionIntent,updateBeneficiary} from "../api/_lib/v3-payment-store.js";
import {AMA_TX_TESTNET_DST,verifyPackedTestnetTransfer,verifyObservedChainTransaction} from "../api/_lib/v3-execution-core.js";
import {reserveSignedExecution,recordBroadcastResult,recordChainVerification,readExecution,preflightIntent} from "../api/_lib/v3-execution-store.js";
import {recordDocument,createSupplier,verifySupplier,createInvoice,verifyInvoice} from "../api/_lib/v3-invoice-store.js";
import {linkPayment,reconcileInvoice} from "../api/_lib/v3-reconcile-store.js";
import {agentRateEvent} from "../api/_lib/v3-agent-store.js";
import {getPolicy,reportRisk,emergencyPause,auditEvidence} from "../api/_lib/v3-governance-store.js";
import {acceptanceDB,acceptanceReadiness,acceptanceWitness,acceptanceReports,acceptanceAudit} from "../api/_lib/v3-acceptance-store.js";
import acceptanceHandler from "../api/_lib/v3-acceptance-handler.js";

const payerKey=bls.utils.randomPrivateKey(),recipientKey=bls.utils.randomPrivateKey();
const payer=toBase58(bls.getPublicKey(payerKey)),recipient=toBase58(bls.getPublicKey(recipientKey));
const other=toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const workspaceId=randomUUID(),outsideWorkspace=randomUUID();
const origin="https://m9-ci.example",host="m9-ci.example";
const hash=(n)=>toBase58(Buffer.alloc(32,n));
async function http(op,{method="GET",body=null,token="",csrf="",query={},originHeader=origin}={}){
 return new Promise(resolve=>{
  const headers={host,origin:originHeader,
   ...(token?{cookie:"jackv3_session="+token}:{}),
   ...(method==="POST"?{"content-type":"application/json","x-33jack-csrf":csrf}:{})};
  const res={code:200,setHeader(){return this},status(n){this.code=n;return this},
   json(data){resolve({status:this.code,data});return this}};
  Promise.resolve(acceptanceHandler({method,headers,query:{operation:op,workspaceId,...query},body},res,op))
   .catch(e=>resolve({status:500,error:e.message}));
 });
}
function nativePacket(row){
 const tx={signer:bls.getPublicKey(payerKey),
  nonce:BigInt(Date.now())*1000000n+1n,
  action:{op:"call",contract:"Coin",function:"transfer",
   args:[fromBase58(recipient),String(row.amount_units),"AMA"]}};
 const chainHash=Uint8Array.from(createHash("sha256").update(encode(tx)).digest());
 const signature=bls.sign(chainHash,payerKey,{DST:AMA_TX_TESTNET_DST});
 return {packed:toBase58(encode({tx,hash:chainHash,signature})),
  hash:toBase58(chainHash)};
}
function syntheticObserved(row,txHash){
 return {hash:txHash,
  tx:{signer:payer,action:{op:"call",contract:"Coin",function:"transfer",
   args:[recipient,String(row.amount_units),"AMA"]}},
  metadata:{entry_hash:hash(75),entry_height:44,status:"finalized"},
  receipt:{success:true},result:{error:null}};
}
test("M9 disposable PostgreSQL integrates M2-M8 controls without creating real Testnet transfers",async()=>{
 if(!process.env.DATABASE_URL)throw Error("M9 must run in disposable PostgreSQL");
 const sql=await identityDB();await acceptanceDB();
 await sql.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,'M9 CI synthetic acceptance',$2),($3,'Unrelated org',$4)",[
  workspaceId,payer,outsideWorkspace,other]);
 await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,'owner'),($3,$4,'owner')",[
  workspaceId,payer,outsideWorkspace,other]);
 await getPolicy({workspaceId,actor:payer});
 await updateBeneficiary({workspaceId,actor:payer,address:recipient,status:"allowed",label:"M9 disposable-recipient-only"});
 const source=await recordDocument({workspaceId,actor:payer,input:{filename:"m9-ci-invoice.txt",
  mime:"text/plain",base64:Buffer.from("M9-INV-1 0.000000100 AMA, local synthetic fixture","utf8").toString("base64")}});
 const supplier=await createSupplier({actor:payer,input:{workspaceId,name:"M9 CI supplier",address:recipient}});
 await verifySupplier({workspaceId,id:supplier.id,actor:payer,ackAddress:true});
 const invoice=await createInvoice({actor:payer,input:{
  workspaceId,documentId:source.id,supplierId:supplier.id,invoiceRef:"M9-INV-1",currency:"AMA",amount:"0.000000100"
 }});
 await verifyInvoice({workspaceId,id:invoice.id,actor:payer,sourceSha256:source.sha256,ackSourceReviewed:true});
 await agentRateEvent({workspaceId,actor:payer,event:"agent_question",input:"Explain risk on a synthetic Testnet invoice"});
 const key=randomToken(32);
 const input={workspaceId,payer,recipient,amount:"0.000000100",token:"AMA",network:"amadeus-testnet",
  invoiceRef:"M9-INV-1",expiresInMinutes:20};
 const row=(await createIntent({input,actor:payer,idempotencyKey:key})).row;
 const retry=(await createIntent({input,actor:payer,idempotencyKey:key}));
 assert.equal(retry.reused,true);
 assert.equal(retry.row.id,row.id);
 await assert.rejects(createIntent({input:{...input,amount:"0.000000200"},actor:payer,idempotencyKey:key}),/Idempotency/);
 await transitionIntent({workspaceId,id:row.id,actor:payer,expectedHash:row.terms_hash,action:"review"});
 await transitionIntent({workspaceId,id:row.id,actor:payer,expectedHash:row.terms_hash,action:"approve"});
 const current=(await sql.unsafe("SELECT * FROM ama_v3_payment_intents WHERE id=$1",[row.id]))[0];
 const signed=nativePacket(current),verified=verifyPackedTestnetTransfer({
  packed:signed.packed,intent:current,walletTxHash:signed.hash
 });
 assert.equal(verified.hash,signed.hash);
 assert.equal(verified.signatureVerified,true);
 assert.equal((await preflightIntent({workspaceId,id:row.id,actor:payer})).id,row.id);
 const reserved=await reserveSignedExecution({workspaceId,id:row.id,actor:payer,verified});
 assert.equal(reserved.created,true);
 const duplicate=await reserveSignedExecution({workspaceId,id:row.id,actor:payer,verified});
 assert.equal(duplicate.created,false);
 await assert.rejects(preflightIntent({workspaceId,id:row.id,actor:payer}),/already has/);
 await assert.rejects(reserveSignedExecution({workspaceId,id:row.id,actor:payer,
  verified:{...verified,hash:hash(19)}}),/different signed packet/);
 // NO transaction.submit call: synthetic chain and broadcast statuses are test fixtures.
 await recordBroadcastResult({workspaceId,id:row.id,hash:signed.hash,status:"uncertain",
  actor:payer,reason:"Synthetic CI timeout; no real RPC was contacted"});
 const pending=await readExecution({workspaceId,id:row.id,actor:payer});
 assert.equal(pending.public.mayRetryBroadcast,false);
 assert.equal(pending.public.status,"uncertain");
 const observed=verifyObservedChainTransaction({
  record:{tx_hash:signed.hash,payer,recipient,amount_units:String(current.amount_units)},
  chainTx:syntheticObserved(current,signed.hash),rootedHeight:45
 });
 assert.equal(observed.status,"finalized");
 // Explicit synthetic marker prevents M9 from interpreting this fixture as live proof.
 await recordChainVerification({workspaceId,id:row.id,actor:payer,
  observation:{...observed,receipt:{...observed.receipt,syntheticCIOnly:true}}
 });
 await linkPayment({workspaceId,invoiceId:invoice.id,intentId:row.id,actor:payer,ackHumanMatch:true});
 const reconciliation=await reconcileInvoice({workspaceId,id:invoice.id,actor:payer});
 assert.equal(reconciliation.settlement.state,"settled");
 // The previous M6 fixture-based settlement state is NOT live chain evidence.
 const blocked=await acceptanceReadiness({workspaceId,intentId:row.id,actor:payer,origin});
 assert.equal(blocked.result.acceptance,"no_go");
 assert.equal(blocked.result.liveTransferProven,false);
 const syntheticBlock=await acceptanceWitness({workspaceId,intentId:row.id,actor:payer,origin,
  clientFactory:()=>({transaction:{get:async()=>syntheticObserved(current,signed.hash)},
   chain:{getStats:async()=>({stats:{rooted_height:45}})}})});
 assert.equal(syntheticBlock.status,"blocked");
 assert.equal(syntheticBlock.witness.live,false);
 assert.equal(syntheticBlock.acceptance.acceptance,"no_go");
 // Simulate an exact stored official-shaped receipt to prove injected RPC remains
 // definitively synthetic; this is a throwaway CI database and NOT chain evidence.
 await sql.unsafe("UPDATE ama_v3_executions SET receipt=$1::jsonb WHERE intent_id=$2",[
  JSON.stringify({...observed.receipt}),row.id
 ]);
 const simulated=await acceptanceWitness({workspaceId,intentId:row.id,actor:payer,origin,
  clientFactory:()=>({transaction:{get:async()=>syntheticObserved(current,signed.hash)},
   chain:{getStats:async()=>({stats:{rooted_height:45}})}})});
 assert.equal(simulated.status,"synthetic_ci_only");
 assert.equal(simulated.witness.live,false);
 assert.equal(simulated.acceptance.liveTransferProven,false);
 assert.equal(simulated.acceptance.acceptance,"no_go");
 assert.equal(simulated.acceptance.openBlockers.includes("independent_security_review"),true);
 assert.equal(simulated.noTransactionSubmitted,true);
 const history=await acceptanceReports({workspaceId,actor:payer});
 assert.equal(history.length,2);
 assert.equal(history.every(x=>x.isLiveRPCAcceptance===false),true);
 const audit=await acceptanceAudit({workspaceId,actor:payer});
 assert.equal(audit.valid,true);assert.equal(audit.count,2);
 await assert.rejects(acceptanceReports({workspaceId,actor:other}),/owner\/admin/);
 await assert.rejects(acceptanceReports({workspaceId:outsideWorkspace,actor:payer}),/owner\/admin/);
 await assert.rejects(sql.unsafe("UPDATE ama_v3_m9_reports SET status='independently_checked' WHERE workspace_id=$1",[workspaceId]),/append-only/);
 await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m9_reports WHERE workspace_id=$1",[workspaceId]),/append-only/);
 // M9 status and witness endpoint require M2 valid cookies, origin, CSRF and owner role.
 const token=randomToken(48),csrf=randomToken(32),otherToken=randomToken(48),otherCsrf=randomToken(32);
 for(const [address,t,c] of [[payer,token,csrf],[other,otherToken,otherCsrf]]){
  await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",[
   hashSecret(t),address,origin,hashSecret(c)
  ]);
 }
 assert.equal((await http("acceptance-status",{query:{intentId:row.id}})).status,401);
 assert.equal((await http("acceptance-status",{token,method:"POST",
  body:{workspaceId,intentId:row.id},csrf})).status,405);
 assert.equal((await http("acceptance-status",{token,originHeader:"https://hostile.example",query:{intentId:row.id}})).status,403);
 assert.equal((await http("acceptance-reports",{token:otherToken})).status,403);
 assert.equal((await http("acceptance-status",{token,query:{intentId:row.id,network:"amadeus-mainnet"}})).status,400);
 assert.equal((await http("acceptance-witness",{method:"POST",token,csrf:"bad",
  body:{workspaceId,intentId:row.id}})).status,403);
 assert.equal((await http("acceptance-witness",{method:"POST",token,csrf,
  body:{workspaceId,intentId:row.id,txPacked:"not allowed"}})).status,400);
 assert.equal((await http("acceptance-status",{token,query:{intentId:row.id}})).status,200);
 assert.equal((await http("acceptance-audit",{token})).status,200);
 assert.equal((await http("acceptance-matrix",{token})).status,200);
 const executionCounts=(await sql.unsafe("SELECT COUNT(*)::integer AS n, MAX(broadcast_attempts)::integer AS attempts FROM ama_v3_executions WHERE workspace_id=$1",[workspaceId]))[0];
 assert.equal(executionCounts.n,1);assert.equal(executionCounts.attempts,1);
 const risk=await reportRisk({workspaceId,actor:payer,input:{
  kind:"manual_risk_hold",invoiceRef:"M9-INV-1",
  reason:"CI negative case: operator detected changed invoice metadata"
 }});
 assert.equal(risk.active,true);
 await assert.rejects(preflightIntent({workspaceId,id:row.id,actor:payer}),/risk hold|policy/i);
 const paused=await emergencyPause({workspaceId,actor:payer,
  reason:"CI incident drill: hold all Testnet authorizations during recovery"});
 assert.equal(paused.paused,true);
 assert.equal((await auditEvidence({workspaceId,actor:payer})).valid,true);
 // Acceptance assessment cannot silently unlock M4 gates or create a second tx.
 const stored=(await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_executions WHERE workspace_id=$1",[workspaceId]))[0];
 assert.equal(stored.n,1);
 await sql.unsafe("CREATE TABLE IF NOT EXISTS ama_v3_m9_restore_marker(workspace_id text PRIMARY KEY,intent_id text NOT NULL,tx_hash text NOT NULL,expected_reports integer NOT NULL,last_hash text NOT NULL,source_sha256 text NOT NULL)");
 await sql.unsafe("INSERT INTO ama_v3_m9_restore_marker(workspace_id,intent_id,tx_hash,expected_reports,last_hash,source_sha256) VALUES($1,$2,$3,2,$4,$5)",[
  workspaceId,row.id,signed.hash,audit.lastHash,source.sha256
 ]);
 await sql.end();
});
