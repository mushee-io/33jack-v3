import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {testnetDemoReadiness} from "../api/_lib/v3-demo-store.js";
import {verifyM10GrantSnapshot} from "../api/_lib/v3-demo-core.js";
import demoHandler from "../api/_lib/v3-demo-handler.js";
const origin="https://m10-ci.example",host="m10-ci.example";
const viewer=toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const outside=toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
function endpoint(op,{method="GET",query={},token="",originHeader=origin,body=null}={}){
 return new Promise(resolve=>{
  const headers={host,origin:originHeader,...(token?{cookie:"jackv3_session="+token}:{})};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
   status(code){this.statusCode=code;return this},
   json(data){resolve({status:this.statusCode,data,headers:this.headers});return this}};
  Promise.resolve(demoHandler({method,headers,query:{operation:op,...query},body},res,op))
   .catch(e=>resolve({status:500,error:String(e.message)}));
 });
}
test("M10 scoped grant evidence, operator HTTP security and immutable synthetic CI acceptance",async()=>{
 if(!process.env.DATABASE_URL)throw Error("M10 requires disposable PostgreSQL");
 const sql=await identityDB();
 const fixture=await sql.unsafe("SELECT * FROM ama_v3_m9_restore_marker");
 assert.equal(fixture.length,1,"M9 synthetic Testnet fixtures must be present in M10's own disposable database");
 const m=fixture[0],workspaceId=m.workspace_id;
 const [intent]=await sql.unsafe(
  "SELECT payer,recipient,terms_hash,network,asset FROM ama_v3_payment_intents WHERE id=$1 AND workspace_id=$2",
  [m.intent_id,workspaceId]
 );
 assert.equal(intent.network,"amadeus-testnet");
 assert.equal(intent.asset,"AMA");
 await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,'viewer')",[workspaceId,viewer]);
 const owners=await sql.unsafe("SELECT id FROM ama_v3_workspaces WHERE id<>$1 LIMIT 1",[workspaceId]);
 assert.equal(owners.length,1);
 const foreignId=owners[0].id;
 const result=await testnetDemoReadiness({workspaceId,actor:intent.payer});
 assert.equal(result.network,"amadeus-testnet");
 assert.equal(result.readOnly,true);
 assert.equal(result.decision,"NO_GO_FOR_PUBLIC_FUNDS_AND_MAINNET");
 assert.equal(result.manualChecklist.length,10);
 const manifest=result.grantSnapshot;
 assert.equal(manifest.sourceSnapshot.sampledM9Records,2);
 assert.equal(manifest.sourceSnapshot.m9AuditValid,true);
 assert.equal(manifest.sourceSnapshot.m7AuditValid,true);
 assert.equal(manifest.sourceSnapshot.m9AuditHead,m.last_hash);
 assert.equal(verifyM10GrantSnapshot(manifest),true);
 assert.equal(manifest.sourceSnapshot.evidence.every(x=>x.kind!=="official_rpc_comparison_recorded"),true);
 assert.equal(manifest.claims.realFundedTwoWalletTransferVerified,false);
 assert.equal(manifest.release.canEnableM4Broadcast,false);
 assert.equal(manifest.release.canDeployMainnet,false);
 const serialized=JSON.stringify(manifest);
 for(const forbidden of [workspaceId,intent.payer,intent.recipient,m.tx_hash,m.intent_id])
  assert.equal(serialized.includes(forbidden),false,"M10 privacy leak: "+forbidden.slice(0,8));
 await assert.rejects(testnetDemoReadiness({workspaceId,actor:viewer}),/owner\/admin/);
 await assert.rejects(testnetDemoReadiness({workspaceId,actor:outside}),/owner\/admin/);
 await assert.rejects(testnetDemoReadiness({workspaceId:foreignId,actor:intent.payer}),/owner\/admin/);
 const token=randomToken(48),viewerToken=randomToken(48),foreignToken=randomToken(48);
 for(const [actor,t] of [[intent.payer,token],[viewer,viewerToken],[outside,foreignToken]]){
  await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')",[
   hashSecret(t),actor,origin,hashSecret(randomToken(32))
  ]);
 }
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId}})).status,401);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId},token:viewerToken})).status,403);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId},token:foreignToken})).status,403);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId:foreignId},token})).status,403);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId},token,originHeader:"https://outside.example"})).status,403);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId},token,method:"POST",body:{}})).status,405);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId,actor:outside},token})).status,400);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId,network:"amadeus-mainnet"},token})).status,400);
 assert.equal((await endpoint("demo-readiness",{query:{workspaceId,txPacked:"not a permitted field"},token})).status,400);
 assert.equal((await endpoint("demo-unknown",{query:{workspaceId},token})).status,404);
 const api=await endpoint("demo-readiness",{query:{workspaceId},token});
 assert.equal(api.status,200);
 assert.equal(api.headers["Cache-Control"],"no-store");
 assert.equal(api.data.grantSnapshot.digest,manifest.digest);
 const exportResult=await endpoint("demo-grant-export",{query:{workspaceId},token});
 assert.equal(exportResult.status,200);
 assert.equal(exportResult.data.manifest.digest,manifest.digest);
 assert.equal(exportResult.data.manifest.release.canDeployMainnet,false);
 assert.equal(JSON.stringify(exportResult.data).includes(m.tx_hash),false);
 // Source and report records are not mutated by read-only M10 checks.
 const counts=await sql.unsafe(
  "SELECT (SELECT COUNT(*)::integer FROM ama_v3_executions WHERE workspace_id=$1) AS executions,(SELECT COUNT(*)::integer FROM ama_v3_m9_reports WHERE workspace_id=$1) AS m9",
  [workspaceId]
 );
 assert.equal(counts[0].executions,1);
 assert.equal(counts[0].m9,2);
 assert.equal((await sql.unsafe("SELECT MAX(broadcast_attempts)::integer AS n FROM ama_v3_executions WHERE workspace_id=$1",[workspaceId]))[0].n,1);
 await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m9_reports WHERE workspace_id=$1",[workspaceId]),/append-only/);
 await sql.unsafe("CREATE TABLE IF NOT EXISTS ama_v3_m10_restore_marker(workspace_id text PRIMARY KEY,digest text NOT NULL,m9_head text NOT NULL,expected_reports integer NOT NULL)");
 await sql.unsafe("INSERT INTO ama_v3_m10_restore_marker(workspace_id,digest,m9_head,expected_reports) VALUES($1,$2,$3,2)",[
  workspaceId,manifest.digest,m.last_hash
 ]);
 await sql.end();
});
