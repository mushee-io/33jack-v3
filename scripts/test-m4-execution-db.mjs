import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {encode,fromBase58,toBase58} from "@amadeus-protocol/sdk";
import {identityDB} from "../api/_lib/v3-identity-store.js";
import {hashSecret,randomToken} from "../api/_lib/v3-identity-core.js";
import {updateBeneficiary,createIntent,transitionIntent} from "../api/_lib/v3-payment-store.js";
import {executionDB,readExecution} from "../api/_lib/v3-execution-store.js";
import {AMA_TX_TESTNET_DST} from "../api/_lib/v3-execution-core.js";
import executionHandler from "../api/_lib/v3-execution-handler.js";

const key=bls.utils.randomPrivateKey(),recipientKey=bls.utils.randomPrivateKey();
const owner=toBase58(bls.getPublicKey(key)),recipient=toBase58(bls.getPublicKey(recipientKey));
const stranger=toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const workspaceId=randomUUID(),otherWorkspace=randomUUID();
const origin="https://m4-ci.example",host="m4-ci.example";
function signed(row,{sk=key,changeRecipient,changeAmount}={}){
 const tx={signer:bls.getPublicKey(sk),nonce:BigInt(Date.now())*1000000n+BigInt(Math.round(Math.random()*1e5)),
  action:{op:"call",contract:"Coin",function:"transfer",
   args:[fromBase58(changeRecipient||row.recipient),changeAmount||String(row.amount_units),"AMA"]}};
 const hash=Uint8Array.from(createHash("sha256").update(encode(tx)).digest());
 const signature=bls.sign(hash,sk,{DST:AMA_TX_TESTNET_DST});
 return {txPacked:toBase58(encode({tx,hash,signature})),walletTxHash:toBase58(hash)};
}
async function endpoint(op,{body={},method="POST",session=null,csrf=null,originHeader=origin,client=null,query={}}={}){
 return new Promise(resolve=>{
  const headers={host,origin:originHeader,...(method==="POST"?{"content-type":"application/json"}:{}),
   ...(session?{cookie:"jackv3_session="+session}:{}),
   ...(csrf?{"x-33jack-csrf":csrf}:{})};
  const res={code:200,setHeader(){return this},status(status){this.code=status;return this},
   json(data){resolve({status:this.code,data});return this}};
  const mock=client||{transaction:{submit:async()=>{throw Error("No live RPC configured in CI")},get:async()=>{throw Error("No tx")}},
   chain:{getStats:async()=>({stats:{rooted_height:0}})}};
  Promise.resolve(executionHandler({method,headers,query,body},res,op,{clientFactory:()=>mock}))
   .catch(e=>resolve({status:500,error:e.message}));
 });
}
const requestBase=()=>({workspaceId,network:"amadeus-testnet",payer:owner,recipient,token:"AMA",amount:"0.000000100",expiresInMinutes:20});
const ciChain=(row,hash,{finalized=false,match=true,success=true}={})=>({
 hash,tx:{signer:row.payer,action:{op:"call",contract:"Coin",function:"transfer",
 args:[match?row.recipient:stranger,String(row.amount_units),"AMA"]}},
 metadata:{entry_hash:toBase58(new Uint8Array(32).fill(6)),entry_height:20,status:finalized?"finalized":"confirmed"},
 receipt:{success,result:success?null:"invalid_args",logs:[]},result:{error:success?null:"invalid_args"}
});
async function prepared(ownerWallet=owner){
 const row=(await createIntent({input:requestBase(),actor:ownerWallet,idempotencyKey:randomToken(32)})).row;
 await transitionIntent({workspaceId,id:row.id,actor:ownerWallet,expectedHash:row.terms_hash,action:"review"});
 await transitionIntent({workspaceId,id:row.id,actor:ownerWallet,expectedHash:row.terms_hash,action:"approve"});
 return {...row,status:"awaiting_wallet_signature",approval_terms_hash:row.terms_hash};
}
test("M4 PostgreSQL exactly-once broadcast, on-chain finality and fail-closed HTTP",async()=>{
 if(!process.env.DATABASE_URL)throw Error("Disposable DATABASE_URL required");
 const sql=await identityDB();await executionDB();
 await sql.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,'M4 Test Workspace',$2),($3,'Other Workspace',$4)",[workspaceId,owner,otherWorkspace,stranger]);
 await sql.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,'owner'),($3,$4,'owner')",[workspaceId,owner,otherWorkspace,stranger]);
 await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"allowed",label:"Native AMA recipient"});
 const row=await prepared();
 const packet=signed(row);
 const token=randomToken(48),csrf=randomToken(32),strangerToken=randomToken(48),strangerCsrf=randomToken(32);
 await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 minutes'),($5,$6,$3,$7,NOW()+INTERVAL '30 minutes')",[hashSecret(token),owner,origin,hashSecret(csrf),hashSecret(strangerToken),stranger,hashSecret(strangerCsrf)]);
 const body={workspaceId,id:row.id,...packet};
 assert.equal((await endpoint("execution-preflight",{body})).status,401);
 assert.equal((await endpoint("execution-preflight",{body,session:token,csrf:"bad"})).status,403);
 assert.equal((await endpoint("execution-preflight",{body,session:token,csrf,originHeader:"https://evil.example"})).status,403);
 assert.equal((await endpoint("execution-preflight",{body,session:strangerToken,csrf:strangerCsrf})).status,403);
 assert.equal((await endpoint("execution-preflight",{body:{...body,txPacked:signed(row,{changeAmount:"101"}).txPacked},session:token,csrf})).status,409);
 const good=await endpoint("execution-preflight",{body,session:token,csrf});
 assert.equal(good.status,200);assert.equal(good.data.verifiedSignature,true);
 assert.equal(good.data.broadcasted,false);assert.equal(good.data.hash,packet.walletTxHash);
 const oldFlags={enable:process.env.AMA_M4_ENABLE_BROADCAST,wallet:process.env.AMA_M4_WALLET_EXTENSION_VERIFIED,two:process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED};
 try{
  delete process.env.AMA_M4_ENABLE_BROADCAST;
  delete process.env.AMA_M4_WALLET_EXTENSION_VERIFIED;
  delete process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED;
  assert.equal((await endpoint("execution-submit",{body,session:token,csrf})).status,503);
  assert.equal((await readExecution({workspaceId,id:row.id,actor:owner})),null);
  process.env.AMA_M4_ENABLE_BROADCAST="true";
  process.env.AMA_M4_WALLET_EXTENSION_VERIFIED="true";
  process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED="true";
  let attempts=0;
  const rpc={transaction:{
   submit:async()=>{attempts++;return {hash:packet.walletTxHash}},
   get:async hash=>ciChain(row,hash,{finalized:false})
  },chain:{getStats:async()=>({stats:{rooted_height:10}})}};
  const sent=await endpoint("execution-submit",{body,session:token,csrf,client:rpc});
  assert.equal(sent.status,202);
  assert.equal(sent.data.execution.status,"pending");
  assert.equal(sent.data.execution.txHash,packet.walletTxHash);
  assert.equal(sent.data.execution.broadcastAttempts,1);
  assert.equal(attempts,1);
  const second=await endpoint("execution-submit",{body,session:token,csrf,client:rpc});
  assert.equal(second.status,200);
  assert.equal(second.data.idempotent,true);
  assert.equal(attempts,1);
  const changed=await endpoint("execution-submit",{body:{...body,...signed(row,{changeAmount:"200"})},session:token,csrf,client:rpc});
  assert.notEqual(changed.status,202);
  assert.equal(attempts,1);
  const status=await endpoint("execution-status",{method:"GET",session:token,query:{workspaceId,id:row.id}});
  assert.equal(status.status,200);assert.equal(status.data.execution.independentlyVerified,false);
  const cross=await endpoint("execution-status",{method:"GET",session:strangerToken,query:{workspaceId,id:row.id}});
  assert.equal(cross.status,403);
  const pending=await endpoint("execution-reconcile",{body:{workspaceId,id:row.id},session:token,csrf,client:rpc});
  assert.equal(pending.status,200);assert.equal(pending.data.execution.status,"confirmed");
  assert.equal(pending.data.execution.independentlyVerified,false);
  const finalRpc={transaction:{get:async hash=>ciChain(row,hash,{finalized:true})},chain:{getStats:async()=>({stats:{rooted_height:25}})}};
  const finalized=await endpoint("execution-reconcile",{body:{workspaceId,id:row.id},session:token,csrf,client:finalRpc});
  assert.equal(finalized.status,200);
  assert.equal(finalized.data.execution.status,"finalized");
  assert.equal(finalized.data.execution.independentlyVerified,true);
  assert.equal(finalized.data.execution.receipt.recipient,row.recipient);
  assert.equal(finalized.data.execution.receipt.amountUnits,String(row.amount_units));
  const onceMore=await endpoint("execution-reconcile",{body:{workspaceId,id:row.id},session:token,csrf,client:rpc});
  assert.equal(onceMore.data.idempotent,true);assert.equal(onceMore.data.execution.status,"finalized");

  // RPC timeout is ambiguous, so never rebroadcast; only manual reconciliation.
  const retryRow=await prepared(),retryPacked=signed(retryRow);
  let retryCalls=0;
  const timeoutRpc={transaction:{submit:async()=>{retryCalls++;throw Error("timeout after forwarding")}},
   chain:{getStats:async()=>({stats:{rooted_height:0}})}};
  const retryBody={workspaceId,id:retryRow.id,...retryPacked};
  const timeout=await endpoint("execution-submit",{body:retryBody,session:token,csrf,client:timeoutRpc});
  assert.equal(timeout.status,202);assert.equal(timeout.data.execution.status,"uncertain");
  const duplicate=await endpoint("execution-submit",{body:retryBody,session:token,csrf,client:timeoutRpc});
  assert.equal(duplicate.data.idempotent,true);assert.equal(retryCalls,1);
  const uncertain=await endpoint("execution-status",{method:"GET",session:token,query:{workspaceId,id:retryRow.id}});
  assert.equal(uncertain.data.execution.mayRetryBroadcast,false);
  const mismatchRpc={transaction:{get:async hash=>ciChain(retryRow,hash,{match:false,finalized:true})},chain:{getStats:async()=>({stats:{rooted_height:100}})}};
  const dispute=await endpoint("execution-reconcile",{body:{workspaceId,id:retryRow.id},session:token,csrf,client:mismatchRpc});
  assert.equal(dispute.data.execution.status,"disputed");assert.equal(dispute.data.execution.independentlyVerified,false);

  // Beneficiary changed after approval prevents any broadcast reservation.
  const revoked=await prepared(),revokedPacked=signed(revoked);
  await updateBeneficiary({workspaceId,actor:owner,address:recipient,status:"blocked",label:"Risk hold"});
  const prevented=await endpoint("execution-submit",{body:{workspaceId,id:revoked.id,...revokedPacked},session:token,csrf,client:rpc});
  assert.equal(prevented.status,409);assert.equal(attempts,1);
  assert.equal(await readExecution({workspaceId,id:revoked.id,actor:owner}),null);
  const audit=await sql.unsafe("SELECT event FROM ama_v3_payment_events WHERE workspace_id=$1 AND event LIKE 'm4_%'",[workspaceId]);
  assert.ok(audit.length>=4);
 }finally{
  if(oldFlags.enable===undefined)delete process.env.AMA_M4_ENABLE_BROADCAST;else process.env.AMA_M4_ENABLE_BROADCAST=oldFlags.enable;
  if(oldFlags.wallet===undefined)delete process.env.AMA_M4_WALLET_EXTENSION_VERIFIED;else process.env.AMA_M4_WALLET_EXTENSION_VERIFIED=oldFlags.wallet;
  if(oldFlags.two===undefined)delete process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED;else process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED=oldFlags.two;
  await sql.end();
 }
});
