import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {updateBeneficiary,createIntent,transitionIntent} from "../api/_lib/v3-payment-store.js";
import {invoiceDB,recordDocument,listDocuments,createSupplier,verifySupplier,listSuppliers,createInvoice,verifyInvoice} from "../api/_lib/v3-invoice-store.js";
import {readInvoice,listInvoices,linkPayment,reconcileInvoice,exportAccounting} from "../api/_lib/v3-reconcile-store.js";
import invoiceHandler from "../api/_lib/v3-invoice-handler.js";
const addr=()=>toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const owner=addr(),operator=addr(),viewer=addr(),other=addr(),recipient=addr();
const workspaceId=randomUUID(),otherWorkspace=randomUUID();
const origin="https://m6-ci.example",host="m6-ci.example";
const textFile=(name,text)=>({filename:name,mime:"text/plain",base64:Buffer.from(text,"utf8").toString("base64")});
function endpoint(op,{method="POST",body={workspaceId},token,csrf,originHeader=origin,query={}}={}){
 return new Promise(resolve=>{
  const headers={host,origin:originHeader,
   ...(method==="POST"?{"content-type":"application/json"}:{}),
   ...(token?{cookie:"jackv3_session="+token}:{}),
   ...(csrf?{"x-33jack-csrf":csrf}:{})};
  const res={statusCode:200,setHeader(){return this},status(code){this.statusCode=code;return this},
   json(data){resolve({status:this.statusCode,data});return this}};
  Promise.resolve(invoiceHandler({method,headers,body,query:{workspaceId,...query}},res,op))
   .catch(e=>resolve({status:500,error:e.message}));
 });
}
async function makeApprovedIntent({ref,amount="1"}){
 const input={workspaceId,payer:owner,recipient,amount,token:"AMA",network:"amadeus-testnet",
  invoiceRef:ref,expiresInMinutes:20};
 const made=(await createIntent({actor:owner,idempotencyKey:randomToken(32),input})).row;
 await transitionIntent({workspaceId,id:made.id,actor:owner,expectedHash:made.terms_hash,action:"review"});
 await transitionIntent({workspaceId,id:made.id,actor:owner,expectedHash:made.terms_hash,action:"approve"});
 return made;
}
async function syntheticM4Receipt(sql,intent,{state="finalized",mismatch=false}={}){
 const hash=toBase58(Buffer.from(randomToken(32)).subarray(0,32));
 const entryHash=toBase58(Buffer.alloc(32,5));
 const receipt={network:"amadeus-testnet",txHash:hash,payer:intent.payer,
  recipient:mismatch?other:intent.recipient,amountUnits:String(intent.amount_units),
  asset:"AMA",contract:"Coin",method:"transfer",entryHash,entryHeight:25,
  finality:"finalized",executionSuccess:true,verifiedBy:"mock_m4_test_fixture_only"};
 await sql.unsafe(
  "INSERT INTO ama_v3_executions(intent_id,workspace_id,tx_hash,packet_digest,status,broadcast_attempts,verified_at,receipt,created_by) VALUES($1,$2,$3,$4,$5,1,NOW(),$6::jsonb,$7)",
  [intent.id,workspaceId,hash,randomToken(32).padEnd(64,"0").slice(0,64),state,
   JSON.stringify(receipt),owner]
 );
}
test("M6 PostgreSQL invoice intake, manual review, chain evidence, exports and isolation",async()=>{
 if(!process.env.DATABASE_URL)throw Error("Disposable PostgreSQL database required");
 const sql=await identityDB();await invoiceDB();
 await sql.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,'M6 Test',$2),($3,'M6 Other',$4)",[workspaceId,owner,otherWorkspace,other]);
 for(const [w,actor,role] of [[workspaceId,owner,"owner"],[workspaceId,operator,"operator"],
   [workspaceId,viewer,"viewer"],[otherWorkspace,other,"owner"]]){
  await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,$3)",[w,actor,role]);
 }
 await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"allowed",label:"Verified Testnet beneficiary"});
 const input=textFile("INV-100.txt","Invoice INV-100\nSupplier M6 Co\n2.00 AMA");
 const doc=await recordDocument({workspaceId,actor:operator,input});
 assert.equal(doc.extractionStatus,"text_extracted_unverified");
 assert.equal(doc.rawFileStored,false);
 assert.equal(doc.sha256.length,64);
 await assert.rejects(recordDocument({workspaceId,actor:operator,input}),/Duplicate document/);
 await assert.rejects(listDocuments({workspaceId,actor:other}),/access denied/);
 assert.equal((await listDocuments({workspaceId,actor:viewer}))[0].sha256,doc.sha256);
 await assert.rejects(recordDocument({workspaceId,actor:viewer,input:textFile("foo.txt","Invoice for viewer")}),/access denied/);

 const supplier=await createSupplier({actor:operator,input:{workspaceId,name:"M6 supplier",address:recipient}});
 assert.equal(supplier.status,"unverified");
 await assert.rejects(createSupplier({actor:operator,input:{workspaceId,name:"m6 SUPPLIER",address:recipient}}),/Duplicate/);
 await assert.rejects(verifySupplier({workspaceId,id:supplier.id,actor:operator,ackAddress:true}),/access denied/);
 const unverified=await createInvoice({actor:operator,input:{
  workspaceId,documentId:doc.id,supplierId:supplier.id,invoiceRef:"INV-100",amount:"2",currency:"AMA"
 }});
 assert.equal(unverified.status,"unverified");
 await assert.rejects(verifyInvoice({workspaceId,id:unverified.id,actor:owner,
  sourceSha256:doc.sha256,ackSourceReviewed:true}),/Supplier must/);
 await verifySupplier({workspaceId,id:supplier.id,actor:owner,ackAddress:true});
 await assert.rejects(verifyInvoice({workspaceId,id:unverified.id,actor:owner,
  sourceSha256:"f".repeat(64),ackSourceReviewed:true}),/SHA-256/);
 await assert.rejects(verifyInvoice({workspaceId,id:unverified.id,actor:owner,
  sourceSha256:doc.sha256,ackSourceReviewed:false}),/review/);
 const verified=await verifyInvoice({workspaceId,id:unverified.id,actor:operator,
  sourceSha256:doc.sha256,ackSourceReviewed:true});
 assert.equal(verified.status,"human_verified");assert.ok(verified.verified_at);
 await assert.rejects(verifyInvoice({workspaceId,id:unverified.id,actor:operator,
  sourceSha256:doc.sha256,ackSourceReviewed:true}),/already reviewed/);
 await assert.rejects(createInvoice({actor:owner,input:{
  workspaceId,documentId:doc.id,supplierId:supplier.id,invoiceRef:"inv-100",amount:"2",currency:"AMA"
 }}),/duplicate/i);
 const invoice=await readInvoice({workspaceId,id:unverified.id,actor:viewer});
 assert.equal(invoice.settlement.state,"unmatched");
 await assert.rejects(readInvoice({workspaceId:otherWorkspace,id:unverified.id,actor:other}),/not found/);
 await assert.rejects(linkPayment({workspaceId,invoiceId:unverified.id,intentId:randomUUID(),actor:operator,ackHumanMatch:true}),/not found/);
 const i1=await makeApprovedIntent({ref:"INV-100",amount:"1"});
 const i2=await makeApprovedIntent({ref:"INV-100",amount:"1"});
 await assert.rejects(linkPayment({workspaceId,invoiceId:unverified.id,intentId:i1.id,actor:operator,ackHumanMatch:false}),/acknowledge/);
 await linkPayment({workspaceId,invoiceId:unverified.id,intentId:i1.id,actor:operator,ackHumanMatch:true});
 await assert.rejects(linkPayment({workspaceId,invoiceId:unverified.id,intentId:i1.id,actor:operator,ackHumanMatch:true}),/linked twice/);
 assert.equal((await reconcileInvoice({workspaceId,id:unverified.id,actor:viewer})).settlement.state,"pending");
 await syntheticM4Receipt(sql,i1);
 const partial=await reconcileInvoice({workspaceId,id:unverified.id,actor:viewer});
 assert.equal(partial.settlement.state,"partial");
 assert.equal(partial.settlement.settledUnits,"1000000000");
 assert.equal(partial.settlement.outstandingUnits,"1000000000");
 await linkPayment({workspaceId,invoiceId:unverified.id,intentId:i2.id,actor:operator,ackHumanMatch:true});
 await syntheticM4Receipt(sql,i2);
 const settled=await reconcileInvoice({workspaceId,id:unverified.id,actor:viewer});
 assert.equal(settled.settlement.state,"settled");
 assert.equal(settled.settlement.evidence.length,2);
 assert.equal(settled.settlement.bankPayoutVerified,false);
 const i3=await makeApprovedIntent({ref:"INV-100",amount:"1"});
 await assert.rejects(linkPayment({workspaceId,invoiceId:unverified.id,intentId:i3.id,actor:operator,ackHumanMatch:true}),/exceed/);

 // Fiat remains explicitly not settled by native AMA, regardless of source review.
 const fiatDoc=await recordDocument({workspaceId,actor:owner,input:textFile("fiat-invoice.txt","GBP 50 invoice FIAT-1")});
 const fiat=await createInvoice({actor:owner,input:{workspaceId,documentId:fiatDoc.id,supplierId:supplier.id,
  invoiceRef:"FIAT-1",currency:"GBP",amount:"50.00"}});
 await verifyInvoice({workspaceId,id:fiat.id,actor:owner,sourceSha256:fiatDoc.sha256,ackSourceReviewed:true});
 const fiatRecord=await reconcileInvoice({workspaceId,id:fiat.id,actor:viewer});
 assert.equal(fiatRecord.settlement.state,"not_applicable");
 assert.equal(fiatRecord.unitKind,"fiat_minor_2_no_fx");
 await assert.rejects(linkPayment({workspaceId,invoiceId:fiat.id,intentId:i3.id,actor:owner,ackHumanMatch:true}),/native AMA/);

 const token=randomToken(48),csrf=randomToken(32),otherToken=randomToken(48),otherCsrf=randomToken(32);
 for(const [actor,t,c] of [[owner,token,csrf],[other,otherToken,otherCsrf]]){
  await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",[hashSecret(t),actor,origin,hashSecret(c)]);
 }
 assert.equal((await endpoint("invoice-list",{method:"GET"})).status,401);
 assert.equal((await endpoint("invoice-create",{token,csrf:"bad"})).status,403);
 assert.equal((await endpoint("invoice-list",{method:"GET",token:otherToken,query:{workspaceId}})).status,403);
 assert.equal((await endpoint("invoice-list",{method:"GET",token})).status,200);
 assert.equal((await endpoint("invoice-export",{method:"GET",token})).status,200);
 const exportData=await exportAccounting({workspaceId,actor:owner});
 assert.equal(exportData.count,2);
 assert.match(exportData.csv,/not_applicable/);
 assert.match(exportData.csv,/settled/);
 assert.match(exportData.csv,/fiat_minor_2_no_fx/);
 await assert.rejects(exportAccounting({workspaceId,actor:operator}),/access denied/);
 const eventCount=(await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_m6_events WHERE workspace_id=$1",[workspaceId]))[0].n;
 assert.ok(eventCount>=8);
 await assert.rejects(sql.unsafe("UPDATE ama_v3_m6_events SET event='tamper' WHERE workspace_id=$1",[workspaceId]),/append-only/);
 await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m6_events WHERE workspace_id=$1",[workspaceId]),/append-only/);
 // Persist fixture metadata for pg_dump/pg_restore integrity test.
 await sql.unsafe("CREATE TABLE IF NOT EXISTS ama_v3_m6_restore_marker(workspace_id text PRIMARY KEY,source_sha256 text NOT NULL,expected_count integer NOT NULL)");
 await sql.unsafe("INSERT INTO ama_v3_m6_restore_marker(workspace_id,source_sha256,expected_count) VALUES($1,$2,$3)",[workspaceId,doc.sha256,eventCount]);
 // Synthetic receipts are generated only within disposable CI; not live chain events.
 await sql.end();
});
