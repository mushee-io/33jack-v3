import {test} from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import {testnetDemoReadiness} from "../api/_lib/v3-demo-store.js";
import {verifyM10GrantSnapshot} from "../api/_lib/v3-demo-core.js";
test("M10 separate restored PostgreSQL faithfully reproduces the redacted grant SHA-256 manifest",async()=>{
 if(!process.env.DATABASE_URL?.endsWith("/m10restore"))
  throw Error("M10 restore acceptance requires isolated m10restore database");
 const sql=postgres(process.env.DATABASE_URL,{max:2,prepare:false,connect_timeout:10});
 try{
  const markers=await sql.unsafe("SELECT * FROM ama_v3_m10_restore_marker");
  assert.equal(markers.length,1);
  const m=markers[0];
  const [intent]=await sql.unsafe(
   "SELECT payer,network,asset,terms_hash,approval_terms_hash FROM ama_v3_payment_intents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1",
   [m.workspace_id]
  );
  assert.equal(intent.network,"amadeus-testnet");assert.equal(intent.asset,"AMA");
  assert.equal(intent.terms_hash,intent.approval_terms_hash);
  const r=await testnetDemoReadiness({workspaceId:m.workspace_id,actor:intent.payer});
  assert.equal(r.grantSnapshot.digest,m.digest);
  assert.equal(r.grantSnapshot.sourceSnapshot.m9AuditHead,m.m9_head);
  assert.equal(verifyM10GrantSnapshot(r.grantSnapshot),true);
  assert.equal(r.grantSnapshot.sourceSnapshot.sampledM9Records,m.expected_reports);
  assert.equal(r.decision,"NO_GO_FOR_PUBLIC_FUNDS_AND_MAINNET");
  assert.equal(r.grantSnapshot.claims.verifiedPrivateDBRestore,false,
   "A CI restore does not establish a deployed production database restore witness");
  const [exec]=await sql.unsafe(
   "SELECT COUNT(*)::integer AS n,MAX(broadcast_attempts)::integer AS attempts FROM ama_v3_executions WHERE workspace_id=$1",
   [m.workspace_id]);
  assert.equal(exec.n,1);assert.equal(exec.attempts,1);
  const [inv]=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_m6_invoices WHERE workspace_id=$1 AND status='human_verified'",[m.workspace_id]);
  assert.equal(inv.n,1);
  const [policy]=await sql.unsafe("SELECT paused FROM ama_v3_m7_policies WHERE workspace_id=$1",[m.workspace_id]);
  assert.equal(policy.paused,true);
  const [flag]=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_m7_flags WHERE workspace_id=$1 AND active=true",[m.workspace_id]);
  assert.equal(flag.n,1);
  const reports=await sql.unsafe("SELECT status,source FROM ama_v3_m9_reports WHERE workspace_id=$1",[m.workspace_id]);
  assert.equal(reports.length,2);
  assert.equal(reports.every(x=>x.status!=="independently_checked"),true);
  await assert.rejects(sql.unsafe("UPDATE ama_v3_m9_reports SET status='independently_checked' WHERE workspace_id=$1",[m.workspace_id]),/append-only/);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m7_events WHERE workspace_id=$1",[m.workspace_id]),/append-only/);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m6_events WHERE workspace_id=$1",[m.workspace_id]),/append-only/);
 }finally{await sql.end()}
});
