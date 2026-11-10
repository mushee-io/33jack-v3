import {test} from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
test("M6 restored disposable PostgreSQL backup preserves provenance, invoice terms, links and append-only audit",async()=>{
 if(!process.env.DATABASE_URL||!process.env.DATABASE_URL.endsWith("/m6restore"))
  throw Error("Restore validation must point at disposable m6restore database");
 const sql=postgres(process.env.DATABASE_URL,{max:2,prepare:false,connect_timeout:10});
 try{
  const markers=await sql.unsafe("SELECT workspace_id,source_sha256,expected_count FROM ama_v3_m6_restore_marker LIMIT 5");
  assert.equal(markers.length,1);
  const w=markers[0].workspace_id;
  const docs=await sql.unsafe("SELECT sha256,extraction_status FROM ama_v3_m6_documents WHERE workspace_id=$1",[w]);
  assert.equal(docs.length,2);
  assert.equal(docs.some(x=>x.sha256===markers[0].source_sha256),true);
  assert.equal(docs.every(x=>x.extraction_status==="text_extracted_unverified"),true);
  const invoices=await sql.unsafe("SELECT id,invoice_ref,status,amount_units,currency FROM ama_v3_m6_invoices WHERE workspace_id=$1",[w]);
  assert.equal(invoices.length,2);
  assert.equal(invoices.every(x=>x.status==="human_verified"),true);
  assert.equal(invoices.some(x=>x.currency==="GBP"&&String(x.amount_units)==="5000"),true);
  const links=await sql.unsafe("SELECT invoice_id,intent_id FROM ama_v3_m6_matches WHERE workspace_id=$1",[w]);
  assert.equal(links.length,2);
  const executions=await sql.unsafe("SELECT status,receipt,tx_hash FROM ama_v3_executions WHERE workspace_id=$1",[w]);
  assert.equal(executions.length,2);
  assert.equal(executions.every(x=>{
   let evidence=x.receipt;
   for(let i=0;i<2&&typeof evidence==="string";i++)evidence=JSON.parse(evidence);
   return x.status==="finalized"&&evidence?.txHash===x.tx_hash;
  }),true);
  const events=await sql.unsafe("SELECT id,source_hash,event FROM ama_v3_m6_events WHERE workspace_id=$1",[w]);
  assert.equal(events.length,markers[0].expected_count);
  assert.equal(events.every(x=>/^[a-f0-9]{64}$/.test(x.source_hash)),true);
  await assert.rejects(sql.unsafe("DELETE FROM ama_v3_m6_events WHERE workspace_id=$1",[w]),/append-only/);
  const fk=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_m6_matches m LEFT JOIN ama_v3_m6_invoices i ON i.id=m.invoice_id LEFT JOIN ama_v3_payment_intents p ON p.id=m.intent_id WHERE i.id IS NULL OR p.id IS NULL");
  assert.equal(fk[0].n,0);
  const docBytesTable=await sql.unsafe("SELECT column_name FROM information_schema.columns WHERE table_name='ama_v3_m6_documents'");
  assert.equal(docBytesTable.some(x=>["raw_data","content_bytes","base64","blob"].includes(x.column_name)),false);
 }finally{await sql.end()}
});
