import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {paymentDB,updateBeneficiary,listBeneficiaries,createIntent,listIntents,getIntent,transitionIntent} from "../api/_lib/v3-payment-store.js";
import paymentHandler from "../api/_lib/v3-payment-handler.js";
const addr=()=>toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const owner=addr(),operator=addr(),approver=addr(),other=addr(),recipient=addr();
const workspaceId=randomUUID(),secondWorkspace=randomUUID();
const origin="https://m3-ci.example",host="m3-ci.example";
const input={workspaceId,network:"amadeus-testnet",payer:owner,recipient,amount:"0.123456789",token:"AMA",
 memo:"M3 test",invoiceRef:"INV-M3",expiresInMinutes:20};
const newKey=()=>randomToken(32);
function response(op,{method="POST",headers={},body={},query={}}={}){
 return new Promise(resolve=>{
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
   status(code){this.statusCode=code;return this},
   json(data){resolve({status:this.statusCode,data});return this}};
  Promise.resolve(paymentHandler({method,query:{operation:op,...query},headers:{host,origin,...headers},body},res))
   .catch(err=>resolve({status:500,error:err.message}));
 });
}
test("durable PostgreSQL idempotency, tenant isolation, beneficiary snapshots, state machine, HTTP auth",async()=>{
 if(!process.env.DATABASE_URL)throw Error("Database integration test requires disposable DATABASE_URL");
 const sql=await identityDB();await paymentDB();
 await sql.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,'M3 Workspace A',$2),($3,'M3 Workspace B',$4)",[workspaceId,owner,secondWorkspace,other]);
 for(const [work,who,role] of [[workspaceId,owner,"owner"],[workspaceId,operator,"operator"],[workspaceId,approver,"approver"],[secondWorkspace,other,"owner"]]){
  await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,$3)",[work,who,role]);
 }
 await assert.rejects(updateBeneficiary({workspaceId,actor:operator,address:recipient,status:"allowed",label:"Supplier"}),/access denied/);
 const b1=await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"allowed",label:"Supplier"});
 assert.equal(b1.version,1);
 assert.equal((await listBeneficiaries({workspaceId,actor:approver})).length,1);
 await assert.rejects(createIntent({input:{...input,payer:other},actor:owner,idempotencyKey:newKey()}),/authenticated wallet owner/);
 await assert.rejects(createIntent({input:{...input,recipient:addr()},actor:owner,idempotencyKey:newKey()}),/allowlisted/);
 const key=newKey(),created=await createIntent({input,actor:owner,idempotencyKey:key});
 assert.equal(created.reused,false);assert.equal(created.row.status,"draft");
 const repeated=await createIntent({input,actor:owner,idempotencyKey:key});
 assert.equal(repeated.reused,true);assert.equal(repeated.row.id,created.row.id);
 await assert.rejects(createIntent({input:{...input,amount:"0.2"},actor:owner,idempotencyKey:key}),/Idempotency/);
 assert.equal((await listIntents({workspaceId,actor:operator}))[0].id,created.row.id);
 await assert.rejects(listIntents({workspaceId,actor:other}),/access denied/);
 await assert.rejects(getIntent({workspaceId:secondWorkspace,id:created.row.id,actor:other}),/not found/);
 const before=await getIntent({workspaceId,id:created.row.id,actor:owner});
 assert.equal(before.atomicUnits,"123456789");assert.equal(before.mayBroadcast,false);
 await assert.rejects(transitionIntent({workspaceId,id:created.row.id,actor:operator,expectedHash:before.termsHash,action:"review"}),/access denied/);
 await assert.rejects(transitionIntent({workspaceId,id:created.row.id,actor:approver,expectedHash:"0".repeat(64),action:"review"}),/terms changed/);
 const reviewed=await transitionIntent({workspaceId,id:created.row.id,actor:approver,expectedHash:before.termsHash,action:"review"});
 assert.equal(reviewed.row.status,"reviewed");
 await assert.rejects(transitionIntent({workspaceId,id:created.row.id,actor:approver,expectedHash:before.termsHash,action:"review"}),/Illegal/);
 const blocked=await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"blocked",label:"Risk stop"});
 assert.equal(blocked.version,2);
 await assert.rejects(transitionIntent({workspaceId,id:created.row.id,actor:approver,expectedHash:before.termsHash,action:"approve"}),/Beneficiary/);
 const stale=await getIntent({workspaceId,id:created.row.id,actor:owner});
 assert.equal(stale.beneficiaryCurrent,false);
 await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"allowed",label:"Reapproved"});
 await assert.rejects(transitionIntent({workspaceId,id:created.row.id,actor:approver,expectedHash:before.termsHash,action:"approve"}),/Beneficiary/);
 const fresh=await createIntent({input,actor:owner,idempotencyKey:newKey()});
 const first=await getIntent({workspaceId,id:fresh.row.id,actor:owner});
 await transitionIntent({workspaceId,id:fresh.row.id,actor:approver,expectedHash:first.termsHash,action:"review"});
 const approved=await transitionIntent({workspaceId,id:fresh.row.id,actor:approver,expectedHash:first.termsHash,action:"approve"});
 assert.equal(approved.row.status,"awaiting_wallet_signature");
 assert.equal(approved.row.approval_terms_hash,first.termsHash);
 await assert.rejects(transitionIntent({workspaceId,id:fresh.row.id,actor:approver,expectedHash:first.termsHash,action:"approve"}),/Illegal/);
 await transitionIntent({workspaceId,id:fresh.row.id,actor:owner,expectedHash:first.termsHash,action:"cancel"});
 const canceled=await getIntent({workspaceId,id:fresh.row.id,actor:owner});
 assert.equal(canceled.status,"cancelled");assert.equal(canceled.mayBroadcast,false);
 await assert.rejects(transitionIntent({workspaceId,id:fresh.row.id,actor:owner,expectedHash:first.termsHash,action:"review"}),/Illegal/);
 const exp=await createIntent({input,actor:owner,idempotencyKey:newKey()});
 await sql.unsafe("UPDATE ama_v3_payment_intents SET expires_at=NOW()-INTERVAL '2 minutes' WHERE id=$1",[exp.row.id]);
 const expired=await getIntent({workspaceId,id:exp.row.id,actor:owner});assert.equal(expired.status,"expired");
 await assert.rejects(transitionIntent({workspaceId,id:exp.row.id,actor:approver,expectedHash:expired.termsHash,action:"review"}),/expired/);
 const audit=await sql.unsafe("SELECT event FROM ama_v3_payment_events WHERE workspace_id=$1",[workspaceId]);
 assert.ok(audit.length>=6);

 // HTTP session/CSRF/origin and immutable idempotency checks, not only pure helpers.
 const token=randomToken(48),csrf=randomToken(32);
 await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",
 [hashSecret(token),owner,origin,hashSecret(csrf)]);
 const cookie="jackv3_session="+token;
 const body={...input};
 assert.equal((await response("intent-create",{body,headers:{"content-type":"application/json","x-idempotency-key":newKey()}})).status,401);
 assert.equal((await response("intent-create",{body,headers:{cookie,"content-type":"application/json","x-33jack-csrf":"wrong","x-idempotency-key":newKey()}})).status,403);
 assert.equal((await response("intent-create",{body,headers:{cookie,origin:"https://evil.example","content-type":"application/json","x-33jack-csrf":csrf,"x-idempotency-key":newKey()}})).status,403);
 const httpKey=newKey(),headers={cookie,"content-type":"application/json","x-33jack-csrf":csrf,"x-idempotency-key":httpKey};
 const http=await response("intent-create",{body,headers});
 assert.equal(http.status,201);assert.equal(http.data.intent.atomicUnits,"123456789");
 const replay=await response("intent-create",{body,headers});
 assert.equal(replay.status,200);assert.equal(replay.data.reused,true);assert.equal(replay.data.intent.id,http.data.intent.id);
 const conflict=await response("intent-create",{body:{...body,amount:"0.3"},headers});
 assert.equal(conflict.status,409);
 const wrongTenant=await response("intent-get",{method:"GET",headers:{cookie},query:{workspaceId:secondWorkspace,id:http.data.intent.id}});
 assert.equal(wrongTenant.status,403);
 const unsupported=await response("intent-create",{body:{...input,fxRate:2},headers:{...headers,"x-idempotency-key":newKey()}});
 assert.equal(unsupported.status,400);
 await sql.end();
});
