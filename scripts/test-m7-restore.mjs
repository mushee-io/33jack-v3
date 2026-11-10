import {test} from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import {verifyAuditRows} from "../api/_lib/v3-governance-core.js";
test("M7 restored independent PostgreSQL snapshot retains financial gates and hash-linked audit",async()=>{
 if(!process.env.DATABASE_URL?.endsWith("/m7restore"))
  throw Error("Restore acceptance requires separate disposable m7restore database");
 const db=postgres(process.env.DATABASE_URL,{max:2,prepare:false,connect_timeout:10});
 try{
  const marker=await db.unsafe("SELECT * FROM ama_v3_m7_restore_marker");
  assert.equal(marker.length,1);
  const w=marker[0].workspace_id;
  const ps=await db.unsafe("SELECT * FROM ama_v3_m7_policies WHERE workspace_id=$1",[w]);
  assert.equal(ps.length,1);
  assert.equal(ps[0].version,marker[0].policy_version);
  assert.equal(ps[0].paused,false);
  assert.equal(ps[0].enforce_two_person,true);
  const seals=await db.unsafe("SELECT * FROM ama_v3_m7_approval_seals WHERE workspace_id=$1",[w]);
  assert.ok(seals.length>=2);
  assert.ok(seals.some(x=>x.high_risk===true&&x.maker!==x.approver));
  const events=await db.unsafe("SELECT * FROM ama_v3_m7_events WHERE workspace_id=$1 ORDER BY seq",[w]);
  assert.equal(events.length,marker[0].expected_events);
  const integrity=verifyAuditRows(events,w);
  assert.equal(integrity.valid,true);
  assert.equal(integrity.lastHash,marker[0].original_head);
  const flagged=await db.unsafe("SELECT kind,active FROM ama_v3_m7_flags WHERE workspace_id=$1",[w]);
  assert.ok(flagged.length>=1);
  assert.equal(flagged[0].active,false);
  const resumes=await db.unsafe("SELECT requested_by,confirmed_by,confirmed_at FROM ama_v3_m7_resumes WHERE workspace_id=$1",[w]);
  assert.equal(resumes.length,1);
  assert.notEqual(resumes[0].requested_by,resumes[0].confirmed_by);
  assert.ok(resumes[0].confirmed_at);
  const incidents=await db.unsafe("SELECT severity,state FROM ama_v3_m7_incidents WHERE workspace_id=$1",[w]);
  assert.ok(incidents.length>=2);
  // M3/M4 core persisted, M6 ledger and immutability survived without a live broadcast.
  const originals=await db.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_payment_intents WHERE workspace_id=$1",[w]);
  assert.ok(originals[0].n>=3);
  const transfers=await db.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_executions WHERE workspace_id=$1",[w]);
  assert.equal(transfers[0].n,0);
  const m6=await db.unsafe("SELECT to_regclass('public.ama_v3_m6_events') AS name");
  assert.equal(m6[0].name,"ama_v3_m6_events");
  await assert.rejects(db.unsafe("DELETE FROM ama_v3_m7_events WHERE workspace_id=$1",[w]),/append-only/);
  const migrations=await db.unsafe("SELECT to_regclass('public.ama_v3_m7_approval_seals') AS name");
  assert.equal(migrations[0].name,"ama_v3_m7_approval_seals");
 }finally{await db.end()}
});
