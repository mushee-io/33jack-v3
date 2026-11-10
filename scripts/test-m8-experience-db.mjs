import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {createIntent,transitionIntent,updateBeneficiary} from "../api/_lib/v3-payment-store.js";
import {executionDB} from "../api/_lib/v3-execution-store.js";
import {getPolicy,reportRisk} from "../api/_lib/v3-governance-store.js";
import {recordDocument,createSupplier,createInvoice,invoiceDB} from "../api/_lib/v3-invoice-store.js";
import {experienceSnapshot} from "../api/_lib/v3-experience-store.js";
import experienceHandler from "../api/_lib/v3-experience-handler.js";
const address=()=>toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const hash=byte=>toBase58(Buffer.alloc(32,byte));
const owner=address(),viewer=address(),other=address(),recipient=address(),otherRecipient=address();
const workspaceId=randomUUID(),otherWorkspace=randomUUID();
const origin="https://m8-ci.example",host="m8-ci.example";
function endpoint(op,{method="GET",token,originHeader=origin,query={},body}={}){
 return new Promise(resolve=>{
  const headers={host,origin:originHeader,...(token?{cookie:"jackv3_session="+token}:{}),
   ...(method==="POST"?{"content-type":"application/json"}:{})};
  const res={statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},
   json(data){resolve({status:this.statusCode,data});return this}};
  Promise.resolve(experienceHandler({method,headers,query:{operation:op,workspaceId,...query},body},res,op))
   .catch(e=>resolve({status:500,error:e.message}));
 });
}
async function intent({actor=owner,w=workspaceId,to=recipient,amount="1",invoiceRef="M8-INV-1"}){
 const r=await createIntent({actor,idempotencyKey:randomToken(32),input:{
  workspaceId:w,payer:actor,recipient:to,amount,token:"AMA",
  network:"amadeus-testnet",invoiceRef,expiresInMinutes:20
 }});
 return r.row;
}
function syntheticReceipt(x,txHash,extra={}){
 return {network:"amadeus-testnet",finality:"finalized",executionSuccess:true,
  txHash,payer:x.payer,recipient:x.recipient,amountUnits:String(x.amount_units),
  asset:"AMA",contract:"Coin",method:"transfer",entryHash:hash(71),entryHeight:102,
  syntheticCIOnly:true,...extra};
}
async function fixtureExecution(sql,intentRow,status,byte,{mismatch=false}={}){
 const txHash=hash(byte);
 await sql.unsafe(
  "INSERT INTO ama_v3_executions(intent_id,workspace_id,tx_hash,packet_digest,status,broadcast_attempts,verified_at,receipt,created_by) VALUES($1,$2,$3,$4,$5,1,$6,$7::jsonb,$8)",[
   intentRow.id,intentRow.workspace_id,txHash,byte.toString(16).repeat(64).slice(0,64),
   status,status==="finalized"?new Date():null,
   status==="finalized"?JSON.stringify(syntheticReceipt(intentRow,txHash,
    mismatch?{recipient:otherRecipient}:{})):null,intentRow.payer
  ]);
 return txHash;
}
test("M8 disposable PostgreSQL: authenticated read-only dashboard, precise evidence and cross-tenant isolation",async()=>{
 if(!process.env.DATABASE_URL)throw Error("M8 disposable PostgreSQL DATABASE_URL required");
 const sql=await identityDB();await executionDB();await invoiceDB();
 await sql.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,'M8 main organization',$2),($3,'M8 outside organization',$4)",[
  workspaceId,owner,otherWorkspace,other
 ]);
 for(const [w,a,role] of [[workspaceId,owner,"owner"],[workspaceId,viewer,"viewer"],[otherWorkspace,other,"owner"]]){
  await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,$3)",[w,a,role]);
 }
 await getPolicy({workspaceId,actor:owner});
 await getPolicy({workspaceId:otherWorkspace,actor:other});
 await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"allowed",label:"M8 Testnet recipient"});
 await updateBeneficiary({workspaceId:otherWorkspace,actor:other,address:otherRecipient,status:"allowed",label:"Isolated outside recipient"});
 const full=await intent({invoiceRef:"M8-INV-FINAL"});
 await transitionIntent({workspaceId,id:full.id,actor:owner,expectedHash:full.terms_hash,action:"review"});
 await transitionIntent({workspaceId,id:full.id,actor:owner,expectedHash:full.terms_hash,action:"approve"});
 const pending=await intent({amount:"0.5",invoiceRef:"M8-INV-UNCERTAIN"});
 const conflicting=await intent({amount:"0.75",invoiceRef:"M8-INV-CONFLICT"});
 const outside=await intent({actor:other,w:otherWorkspace,to:otherRecipient,amount:"0.8",invoiceRef:"M8-OTHER"});
 const verifiedHash=await fixtureExecution(sql,full,"finalized",11);
 await fixtureExecution(sql,pending,"uncertain",12);
 await fixtureExecution(sql,conflicting,"finalized",13,{mismatch:true});
 await fixtureExecution(sql,outside,"pending",14);
 const source=await recordDocument({workspaceId,actor:owner,input:{filename:"M8-invoice.txt",
  mime:"text/plain",base64:Buffer.from("Invoice M8-INV-LOCAL 120.00 GBP · manually sourced","utf8").toString("base64")}});
 const supplier=await createSupplier({actor:owner,input:{workspaceId,name:"M8 invoice supplier"}});
 await createInvoice({actor:owner,input:{workspaceId,documentId:source.id,supplierId:supplier.id,
  invoiceRef:"M8-INV-LOCAL",currency:"GBP",amount:"120.00"}});
 await reportRisk({workspaceId,actor:owner,input:{
  kind:"suspicious_transaction",recipient:address(),
  reason:"Manual suspicious transaction flag created during disposable PostgreSQL acceptance."
 }});
 const baseline=(await sql.unsafe(
  "SELECT (SELECT COUNT(*)::integer FROM ama_v3_payment_intents) AS intents,(SELECT COUNT(*)::integer FROM ama_v3_executions) AS executions,(SELECT COUNT(*)::integer FROM ama_v3_m6_invoices) AS invoices,(SELECT COUNT(*)::integer FROM ama_v3_m7_events) AS audit"))[0];

 const ownerView=await experienceSnapshot({workspaceId,actor:owner});
 assert.equal(ownerView.network.label,"Amadeus Testnet");
 assert.equal(ownerView.summary.intentCount,3);
 assert.equal(ownerView.summary.invoiceCount,1);
 assert.equal(ownerView.summary.invoicesHumanReviewed,0);
 assert.equal(ownerView.summary.transfersWithVerifiedFinality,1);
 assert.equal(ownerView.summary.transfersPendingEvidence,1);
 assert.equal(ownerView.summary.transfersDisputedOrFailed,1);
 assert.equal(ownerView.summary.openManualRiskHolds,1);
 assert.equal(ownerView.summary.walletBalance,null);
 assert.equal(ownerView.summary.policyState,"configured");
 assert.equal(ownerView.receiptRows.length,3);
 assert.equal(ownerView.receiptRows.filter(r=>r.independentlyVerified).length,1);
 assert.equal(ownerView.receiptRows.some(r=>r.hash===verifiedHash&&r.independentlyVerified),true);
 assert.equal(ownerView.receiptRows.some(r=>r.status==="uncertain"&&r.safeToRebroadcast===false),true);
 assert.equal(ownerView.receiptRows.some(r=>r.status==="finalized"&&r.independentlyVerified===false),true);
 assert.equal(ownerView.receiptRows.every(r=>r.network==="amadeus-testnet"),true);
 assert.equal(ownerView.receiptRows.some(r=>r.hash===hash(14)),false);
 assert.equal(ownerView.liveAmaWalletBalanceQueried,false);
 assert.equal(ownerView.liveChainQueried,false);
 const viewerView=await experienceSnapshot({workspaceId,actor:viewer});
 assert.equal(viewerView.summary.transfersWithVerifiedFinality,1);
 assert.equal(viewerView.role,"viewer");
 await assert.rejects(experienceSnapshot({workspaceId,actor:other}),/access denied/);
 const outsideView=await experienceSnapshot({workspaceId:otherWorkspace,actor:other});
 assert.equal(outsideView.summary.intentCount,1);
 assert.equal(outsideView.summary.invoiceCount,0);
 assert.equal(outsideView.receiptRows.some(r=>r.hash===verifiedHash),false);

 const ownerToken=randomToken(48),viewerToken=randomToken(48),otherToken=randomToken(48);
 for(const [actor,t] of [[owner,ownerToken],[viewer,viewerToken],[other,otherToken]]){
  await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",[
   hashSecret(t),actor,origin,hashSecret(randomToken(32))
  ]);
 }
 assert.equal((await endpoint("ux-overview")).status,401);
 assert.equal((await endpoint("ux-overview",{token:ownerToken,method:"POST",body:{workspaceId}})).status,405);
 assert.equal((await endpoint("ux-overview",{token:ownerToken,originHeader:"https://outside.example"})).status,403);
 assert.equal((await endpoint("ux-overview",{token:ownerToken,query:{workspaceId:otherWorkspace}})).status,403);
 assert.equal((await endpoint("ux-overview",{token:ownerToken,query:{network:"amadeus-mainnet"}})).status,400);
 assert.equal((await endpoint("ux-overview",{token:ownerToken,query:{actor:other}})).status,400);
 assert.equal((await endpoint("ux-overview",{token:otherToken})).status,403);
 const ok=await endpoint("ux-overview",{token:ownerToken});
 assert.equal(ok.status,200);
 assert.equal(ok.data.summary.transfersWithVerifiedFinality,1);
 assert.equal(ok.data.liveChainQueried,false);
 assert.equal(ok.data.liveWalletBalanceQueried,false);
 assert.equal(JSON.stringify(ok.data).includes(otherRecipient),false);
 const receipts=await endpoint("ux-receipts",{token:viewerToken});
 assert.equal(receipts.status,200);
 assert.equal(receipts.data.records.length,3);
 assert.equal(receipts.data.records.filter(r=>r.independentlyVerified).length,1);
 assert.equal(receipts.data.records.every(r=>r.safeToRebroadcast===false),true);
 assert.equal(receipts.data.verifiedOnlyFromM4,true);
 assert.equal((await endpoint("ux-receipts",{token:ownerToken,query:{workspaceId:"wrong"}})).status,400);
 assert.equal((await endpoint("ux-invented",{token:ownerToken})).status,404);

 const after=(await sql.unsafe(
  "SELECT (SELECT COUNT(*)::integer FROM ama_v3_payment_intents) AS intents,(SELECT COUNT(*)::integer FROM ama_v3_executions) AS executions,(SELECT COUNT(*)::integer FROM ama_v3_m6_invoices) AS invoices,(SELECT COUNT(*)::integer FROM ama_v3_m7_events) AS audit"))[0];
 assert.deepEqual(after,baseline,"Read-only UX queries cannot mutate any financial or audit records");
 await sql.unsafe("CREATE TABLE IF NOT EXISTS ama_v3_m8_restore_marker(workspace_id text PRIMARY KEY,owner_address text NOT NULL,expected_intents integer NOT NULL,expected_invoices integer NOT NULL,expected_verified integer NOT NULL,expected_evidence_count integer NOT NULL,expected_audit_count integer NOT NULL)");
 await sql.unsafe("INSERT INTO ama_v3_m8_restore_marker(workspace_id,owner_address,expected_intents,expected_invoices,expected_verified,expected_evidence_count,expected_audit_count) VALUES($1,$2,$3,$4,$5,$6,$7)",[
  workspaceId,owner,3,1,1,3,baseline.audit
 ]);
 await sql.end();
});
