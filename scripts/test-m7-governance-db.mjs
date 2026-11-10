import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {paymentDB,createIntent,transitionIntent,updateBeneficiary} from "../api/_lib/v3-payment-store.js";
import {preflightIntent,readExecution} from "../api/_lib/v3-execution-store.js";
import {
 governanceDB,getPolicy,updatePolicy,emergencyPause,requestResume,confirmResume,
 reportRisk,closeRisk,readRisks,reportIncident,readIncidents,auditEvidence
} from "../api/_lib/v3-governance-store.js";
import governanceHandler from "../api/_lib/v3-governance-handler.js";

const addr=()=>toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const owner=addr(),admin=addr(),operator=addr(),approver=addr(),viewer=addr(),outsider=addr(),recipient=addr();
const workspaceId=randomUUID(),otherWorkspace=randomUUID();
const origin="https://m7-ci.example",host="m7-ci.example";
async function endpoint(op,{method="POST",body={workspaceId},token,csrf,originHeader=origin,query={}}={}){
 return new Promise(resolve=>{
  const headers={host,origin:originHeader,
   ...(method==="POST"?{"content-type":"application/json"}:{}),
   ...(token?{cookie:"jackv3_session="+token}:{}),
   ...(csrf?{"x-33jack-csrf":csrf}:{})};
  const res={statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},
   json(data){resolve({status:this.statusCode,data});return this}};
  Promise.resolve(governanceHandler({method,headers,body,query:{workspaceId,...query}},res,op))
   .catch(e=>resolve({status:500,error:e.message}));
 });
}
async function makeIntent({amount,ref,who=owner,key=randomToken(32)}){
 return (await createIntent({actor:who,idempotencyKey:key,input:{
  workspaceId,payer:who,recipient,amount,token:"AMA",network:"amadeus-testnet",
  invoiceRef:ref,expiresInMinutes:20
 }})).row;
}
async function approve({intent,reviewer=owner,checker=admin}){
 await transitionIntent({workspaceId,id:intent.id,actor:reviewer,expectedHash:intent.terms_hash,action:"review"});
 return transitionIntent({workspaceId,id:intent.id,actor:checker,expectedHash:intent.terms_hash,action:"approve"});
}
test("M7 disposable PostgreSQL: real maker-checker, pause, risk, policy version, HTTP auth, audit",async()=>{
 if(!process.env.DATABASE_URL)throw Error("Disposable PostgreSQL DATABASE_URL required");
 const sql=await identityDB();await paymentDB();await governanceDB();
 await sql.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,'M7 Governance',$2),($3,'Outside org',$4)",[
  workspaceId,owner,otherWorkspace,outsider
 ]);
 for(const [w,a,role] of [[workspaceId,owner,"owner"],[workspaceId,admin,"admin"],
  [workspaceId,operator,"operator"],[workspaceId,approver,"approver"],
  [workspaceId,viewer,"viewer"],[otherWorkspace,outsider,"owner"]]){
  await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,$3)",[w,a,role]);
 }
 await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"allowed",label:"M7 native AMA test recipient"});
 const initial=await getPolicy({workspaceId,actor:owner});
 assert.equal(initial.version,1);
 assert.equal(initial.paused,false);assert.equal(initial.externalCompliance.aml,"not_integrated");
 await assert.rejects(getPolicy({workspaceId,actor:outsider}),/access denied|permission denied/);
 await assert.rejects(updatePolicy({workspaceId,actor:operator,expectedVersion:1,patch:{highRiskUnits:"1000000000"}}),/Only owner\/admin/);
 const p2=await updatePolicy({workspaceId,actor:owner,expectedVersion:1,patch:{
  maxPaymentUnits:"80000000000",dailyUnits:"150000000000",
  highRiskUnits:"1000000000",enforceTwoPersonHighRisk:true
 }});
 assert.equal(p2.version,2);assert.equal(p2.maxPaymentUnits,"80000000000");
 await assert.rejects(updatePolicy({workspaceId,actor:owner,expectedVersion:1,patch:{highRiskUnits:"500000000"}}),/Stale/);
 await assert.rejects(updatePolicy({workspaceId,actor:owner,expectedVersion:2,patch:{maxPaymentUnits:"200000000000"}}),/cannot weaken/);
 const high=await makeIntent({amount:"3",ref:"M7-INV-HIGH"});
 await transitionIntent({workspaceId,id:high.id,actor:owner,expectedHash:high.terms_hash,action:"review"});
 await assert.rejects(transitionIntent({workspaceId,id:high.id,actor:owner,expectedHash:high.terms_hash,action:"approve"}),/separate maker/);
 const accepted=await transitionIntent({workspaceId,id:high.id,actor:admin,expectedHash:high.terms_hash,action:"approve"});
 assert.equal(accepted.row.approved_by,admin);assert.equal(accepted.row.status,"awaiting_wallet_signature");
 const seal=(await sql.unsafe("SELECT * FROM ama_v3_m7_approval_seals WHERE intent_id=$1",[high.id]))[0];
 assert.equal(seal.policy_version,2);assert.equal(seal.high_risk,true);
 assert.equal(seal.maker,owner);assert.equal(seal.approver,admin);
 assert.equal((await preflightIntent({workspaceId,id:high.id,actor:owner})).payer,owner);
 await assert.rejects(preflightIntent({workspaceId,id:high.id,actor:admin}),/Only the approved wallet owner/);
 const flag=await reportRisk({workspaceId,actor:operator,input:{
  kind:"suspected_duplicate_invoice",invoiceRef:"M7-INV-HIGH",
  reason:"Repeated supplier invoice identifier reported by operator."
 }});
 assert.equal(flag.active,true);
 await assert.rejects(preflightIntent({workspaceId,id:high.id,actor:owner}),/Active compliance risk hold/);
 await assert.rejects(makeIntent({amount:"1",ref:"M7-INV-HIGH"}),/Active compliance risk hold/);
 assert.equal((await readRisks({workspaceId,actor:viewer})).length,1);
 await assert.rejects(closeRisk({workspaceId,actor:operator,id:flag.id,reason:"Cleared after review"}),/Only owner\/admin/);
 const closed=await closeRisk({workspaceId,actor:admin,id:flag.id,reason:"Source evidence checked independently by finance reviewer"});
 assert.equal(closed.active,false);assert.equal(closed.policyVersion,3);
 await assert.rejects(preflightIntent({workspaceId,id:high.id,actor:owner}),/policy changed/);

 // Fresh low-risk intent may retain original M3 owner-led approval, but is
 // still sealed to current governance policy version for M4.
 const low=await makeIntent({amount:"1",ref:"M7-INV-LOW"});
 await approve({intent:low,reviewer:owner,checker:owner});
 assert.equal((await preflightIntent({workspaceId,id:low.id,actor:owner})).id,low.id);
 const paused=await emergencyPause({workspaceId,actor:owner,reason:"Operator observed possible invoice tampering and transaction confusion"});
 assert.equal(paused.paused,true);assert.equal(paused.version,4);
 await assert.rejects(makeIntent({amount:"1",ref:"M7-INV-AFTER-PAUSE"}),/Emergency pause/);
 await assert.rejects(preflightIntent({workspaceId,id:low.id,actor:owner}),/Emergency pause/);
 const cancelled=await transitionIntent({workspaceId,id:low.id,actor:owner,expectedHash:low.terms_hash,action:"cancel"});
 assert.equal(cancelled.row.status,"cancelled");
 const resume=await requestResume({workspaceId,actor:owner});
 assert.equal(resume.requiresIndependentOwnerOrAdmin,true);
 await assert.rejects(confirmResume({workspaceId,actor:owner,requestId:resume.id}),/Independent/);
 await assert.rejects(confirmResume({workspaceId,actor:operator,requestId:resume.id}),/Only owner\/admin/);
 const recovered=await confirmResume({workspaceId,actor:admin,requestId:resume.id});
 assert.equal(recovered.paused,false);assert.equal(recovered.version,5);
 await assert.rejects(confirmResume({workspaceId,actor:admin,requestId:resume.id}),/already unpaused/);

 // Policy budget counts unexpired reserved native payment amounts.
 const huge=await makeIntent({amount:"80",ref:"M7-BUDGET-80"});
 assert.equal(huge.amount_units,"80000000000");
 await assert.rejects(makeIntent({amount:"80",ref:"M7-BUDGET-OVER"}),/rolling organization payment cap/);
 await assert.rejects(makeIntent({amount:"90",ref:"M7-PER-PAYMENT-CAP"}),/organization limit/);

 const incident=await reportIncident({workspaceId,actor:viewer,severity:"critical",
  kind:"uncertain_transaction",detail:"Observed an RPC timeout; operator must reconcile the native Testnet hash"});
 assert.equal(incident.state,"open");
 assert.equal((await getPolicy({workspaceId,actor:owner})).paused,false);
 assert.equal((await readIncidents({workspaceId,actor:operator})).length,1);
 const audit=await auditEvidence({workspaceId,actor:admin});
 assert.equal(audit.valid,true);assert.ok(audit.checked>=8);assert.equal(audit.lastHash.length,64);
 await assert.rejects(auditEvidence({workspaceId,actor:operator}),/access denied|permission denied/);
 await assert.rejects(sql.unsafe("UPDATE ama_v3_m7_events SET event='altered' WHERE workspace_id=$1",[workspaceId]),/append-only/);
 await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m7_events WHERE workspace_id=$1",[workspaceId]),/append-only/);
 // No M7 path performs wallet signing, submits a transaction or modifies M4 gate.
 const existingExecutions=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_executions WHERE workspace_id=$1",[workspaceId]);
 assert.equal(existingExecutions[0].n,0);
 assert.equal(await readExecution({workspaceId,id:high.id,actor:owner}),null);

 const ownerToken=randomToken(48),ownerCsrf=randomToken(32),outsideToken=randomToken(48),outsideCsrf=randomToken(32);
 for(const [address,token,csrf] of [[owner,ownerToken,ownerCsrf],[outsider,outsideToken,outsideCsrf]]){
  await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",[
   hashSecret(token),address,origin,hashSecret(csrf)
  ]);
 }
 assert.equal((await endpoint("governance-policy",{method:"GET"})).status,401);
 assert.equal((await endpoint("governance-policy",{method:"GET",token:ownerToken})).status,200);
 assert.equal((await endpoint("governance-policy",{method:"GET",token:outsideToken})).status,403);
 assert.equal((await endpoint("governance-pause",{token:ownerToken,csrf:"invalid",body:{workspaceId,reason:"Twelve characters or more"}})).status,403);
 assert.equal((await endpoint("governance-pause",{token:ownerToken,csrf:ownerCsrf,
  originHeader:"https://evil.example",body:{workspaceId,reason:"Real emergency reason"}})).status,403);
 assert.equal((await endpoint("governance-policy-update",{token:ownerToken,csrf:ownerCsrf,
  body:{workspaceId,expectedVersion:1,patch:{highRiskUnits:"500000000"}}})).status,409);
 assert.equal((await endpoint("governance-recovery",{method:"GET",token:ownerToken})).status,200);
 assert.equal((await endpoint("governance-audit",{method:"GET",token:ownerToken})).status,200);
 assert.equal((await endpoint("governance-incident-report",{token:ownerToken,csrf:ownerCsrf,
  body:{workspaceId,kind:"unauthorized_attempt",severity:"high",detail:"Security alert raised by test fixture"}})).status,201);
 const invariant=(await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_executions WHERE workspace_id=$1",[workspaceId]))[0].n;
 assert.equal(invariant,0);
 const marker=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_m7_events WHERE workspace_id=$1",[workspaceId]);
 await sql.unsafe("CREATE TABLE IF NOT EXISTS ama_v3_m7_restore_marker(workspace_id text PRIMARY KEY,expected_events integer NOT NULL,original_head text NOT NULL,policy_version integer NOT NULL)");
 const snapshot=await auditEvidence({workspaceId,actor:owner});
 await sql.unsafe("INSERT INTO ama_v3_m7_restore_marker(workspace_id,expected_events,original_head,policy_version) VALUES($1,$2,$3,$4)",[
  workspaceId,marker[0].n,snapshot.lastHash,(await getPolicy({workspaceId,actor:owner})).version
 ]);
 await sql.end();
});
