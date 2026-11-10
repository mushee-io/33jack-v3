import {test} from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import {experienceSnapshot} from "../api/_lib/v3-experience-store.js";
import {identityDB} from "../api/_lib/v3-identity-store.js";
test("M8 independent PostgreSQL restore preserves authentic scoped UX evidence and M3–M7 safety",async()=>{
 if(!process.env.DATABASE_URL?.endsWith("/m8restore"))
  throw Error("M8 restore must use the independent disposable m8restore database");
 const sql=postgres(process.env.DATABASE_URL,{max:2,prepare:false,connect_timeout:10});
 try{
  const markers=await sql.unsafe("SELECT * FROM ama_v3_m8_restore_marker");
  assert.equal(markers.length,1);
  const marker=markers[0],w=marker.workspace_id;
  const rows=await sql.unsafe("SELECT * FROM ama_v3_m7_policies WHERE workspace_id=$1",[w]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].paused,false);
  assert.equal(rows[0].enforce_two_person,true);
  const invoices=await sql.unsafe("SELECT id,workspace_id,currency,status FROM ama_v3_m6_invoices WHERE workspace_id=$1",[w]);
  assert.equal(invoices.length,marker.expected_invoices);
  assert.equal(invoices[0].currency,"GBP");
  assert.equal(invoices[0].status,"unverified");
  const events=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_m7_events",[ ]);
  assert.equal(events[0].n,marker.expected_audit_count);
  const limited=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_executions WHERE workspace_id=$1",[w]);
  assert.equal(limited[0].n,marker.expected_evidence_count);
  const primary=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_payment_intents WHERE workspace_id=$1",[w]);
  assert.equal(primary[0].n,marker.expected_intents);
  const snap=await experienceSnapshot({workspaceId:w,actor:marker.owner_address});
  assert.equal(snap.summary.intentCount,marker.expected_intents);
  assert.equal(snap.summary.invoiceCount,marker.expected_invoices);
  assert.equal(snap.summary.transfersWithVerifiedFinality,marker.expected_verified);
  assert.equal(snap.receiptRows.length,marker.expected_evidence_count);
  assert.equal(snap.summary.walletBalance,null);
  assert.equal(snap.network.id,"amadeus-testnet");
  assert.equal(snap.receiptRows.every(x=>x.safeToRebroadcast===false),true);
  assert.equal(snap.receiptRows.filter(x=>x.independentlyVerified).length,1);
  assert.equal(snap.liveChainQueried,false);
  const provenance=await sql.unsafe("SELECT sha256 FROM ama_v3_m6_documents WHERE workspace_id=$1",[w]);
  assert.equal(provenance.length,1);
  assert.match(provenance[0].sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m7_events WHERE workspace_id=$1",[w]),/append-only/);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m6_events WHERE workspace_id=$1",[w]),/append-only/);
  const owner=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2",[w,marker.owner_address]);
  assert.equal(owner[0].role,"owner");
  const fx=await sql.unsafe("SELECT to_regclass('public.ama_v3_m7_approval_seals') AS seal");
  assert.equal(fx[0].seal,"ama_v3_m7_approval_seals");
 }finally{
  await sql.end();
  const db=await identityDB();await db.end();
 }
});
