import {test} from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import {verifyEvidenceHistory,persistedM4Proof} from "../api/_lib/v3-acceptance-core.js";
import {deriveInvoiceSettlement} from "../api/_lib/v3-invoice-core.js";
test("M9 independent PostgreSQL restore preserves agent, invoice, exact M3/M4, governance and immutable evidence",async()=>{
 if(!process.env.DATABASE_URL?.endsWith("/m9restore"))
  throw Error("M9 restore acceptance requires separate disposable m9restore database");
 const sql=postgres(process.env.DATABASE_URL,{max:2,prepare:false,connect_timeout:10});
 try{
  const markers=await sql.unsafe("SELECT * FROM ama_v3_m9_restore_marker");
  assert.equal(markers.length,1);
  const m=markers[0],workspaceId=m.workspace_id;
  const rows=await sql.unsafe(
   "SELECT i.*,e.tx_hash,e.packet_digest,e.status AS execution_status,e.receipt,e.verified_at,e.broadcast_attempts FROM ama_v3_payment_intents i JOIN ama_v3_executions e ON e.intent_id=i.id WHERE i.id=$1 AND i.workspace_id=$2",
   [m.intent_id,workspaceId]
  );
  assert.equal(rows.length,1);
  const x=rows[0];
  assert.equal(x.network,"amadeus-testnet");assert.equal(x.asset,"AMA");
  assert.equal(x.terms_hash,x.approval_terms_hash);
  assert.equal(x.tx_hash,m.tx_hash);
  assert.equal(x.broadcast_attempts,1);
  assert.equal(x.execution_status,"finalized");
  assert.equal(String(x.amount_units),"100");
  const receipt={tx_hash:x.tx_hash,status:x.execution_status,receipt:x.receipt,
   verified_at:x.verified_at,broadcast_attempts:x.broadcast_attempts};
  assert.equal(persistedM4Proof({...x,amount_units:String(x.amount_units)},receipt).ok,true);
  const docs=await sql.unsafe(
   "SELECT d.sha256,i.status,i.amount_units,i.currency,i.invoice_ref FROM ama_v3_m6_invoices i JOIN ama_v3_m6_documents d ON d.id=i.document_id WHERE i.workspace_id=$1",[workspaceId]);
  assert.equal(docs.length,1);assert.equal(docs[0].sha256,m.source_sha256);
  assert.equal(docs[0].status,"human_verified");
  assert.equal(docs[0].currency,"AMA");
  const links=await sql.unsafe("SELECT * FROM ama_v3_m6_matches WHERE workspace_id=$1",[workspaceId]);
  assert.equal(links.length,1);
  assert.equal(links[0].intent_id,m.intent_id);
  const aggregate=deriveInvoiceSettlement({
   invoice:{status:"human_verified",currency:"AMA",amount_units:String(docs[0].amount_units)},
   links:[{intent:{network:"amadeus-testnet",asset:"AMA",payer:x.payer,
    recipient:x.recipient,amount_units:String(x.amount_units)},
    execution:receipt}]
  });
  assert.equal(aggregate.state,"settled");
  const agent=await sql.unsafe("SELECT event,input_hash FROM ama_v3_agent_events WHERE workspace_id=$1",[workspaceId]);
  assert.equal(agent.length>=1,true);
  assert.equal(agent.every(e=>/^[0-9a-f]{64}$/.test(e.input_hash)),true);
  const policies=await sql.unsafe("SELECT * FROM ama_v3_m7_policies WHERE workspace_id=$1",[workspaceId]);
  assert.equal(policies.length,1);
  assert.equal(policies[0].paused,true);
  const flags=await sql.unsafe("SELECT * FROM ama_v3_m7_flags WHERE workspace_id=$1 AND active=true",[workspaceId]);
  assert.equal(flags.length,1);
  const events=await sql.unsafe(
   "SELECT * FROM ama_v3_m9_reports WHERE workspace_id=$1 ORDER BY seq ASC",[workspaceId]);
  assert.equal(events.length,m.expected_reports);
  assert.equal(events.every(e=>e.status!=="independently_checked"),true);
  const integrity=verifyEvidenceHistory(events,workspaceId);
  assert.equal(integrity.valid,true);
  assert.equal(integrity.lastHash,m.last_hash);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m9_reports WHERE workspace_id=$1",[workspaceId]),/append-only/);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m6_events WHERE workspace_id=$1",[workspaceId]),/append-only/);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m7_events WHERE workspace_id=$1",[workspaceId]),/append-only/);
  const checks=await sql.unsafe("SELECT (SELECT COUNT(*)::integer FROM ama_v3_m9_reports WHERE workspace_id=$1) AS reports,(SELECT COUNT(*)::integer FROM ama_v3_executions WHERE workspace_id=$1) AS executions",[workspaceId]);
  assert.equal(checks[0].reports,2);
  assert.equal(checks[0].executions,1);
 }finally{await sql.end()}
});
