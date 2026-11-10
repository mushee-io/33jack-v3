import {randomUUID} from "node:crypto";
import {agentDB,requireAgentMembership} from "./v3-agent-store.js";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
import {validateSupplier,validateInvoice,extractDocument} from "./v3-invoice-core.js";

let initialized;
const DDL=[
 "CREATE TABLE IF NOT EXISTS ama_v3_m6_documents(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),filename text NOT NULL,mime text NOT NULL,byte_count integer NOT NULL CHECK(byte_count BETWEEN 4 AND 2097152),source_type text NOT NULL CHECK(source_type IN ('pdf','image','text')),extraction_status text NOT NULL,extracted_preview text NOT NULL DEFAULT '',page_count integer NOT NULL DEFAULT 0,uploaded_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),UNIQUE(workspace_id,sha256))",
 "CREATE TABLE IF NOT EXISTS ama_v3_m6_suppliers(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,name text NOT NULL,payout_address text,status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','human_reviewed')),reviewed_by text,reviewed_at timestamptz,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE UNIQUE INDEX IF NOT EXISTS ama_v3_m6_supplier_name ON ama_v3_m6_suppliers(workspace_id,lower(name))",
 "CREATE TABLE IF NOT EXISTS ama_v3_m6_invoices(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,document_id text NOT NULL REFERENCES ama_v3_m6_documents(id) ON DELETE RESTRICT,supplier_id text NOT NULL REFERENCES ama_v3_m6_suppliers(id) ON DELETE RESTRICT,invoice_ref text NOT NULL,currency text NOT NULL CHECK(currency IN ('AMA','GBP','USD','EUR')),amount text NOT NULL,amount_units numeric(40,0) NOT NULL CHECK(amount_units>0),unit_kind text NOT NULL CHECK(unit_kind IN ('ama_atomic_9','fiat_minor_2_no_fx')),status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','human_verified')),verified_by text,verified_at timestamptz,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE UNIQUE INDEX IF NOT EXISTS ama_v3_m6_invoice_reference ON ama_v3_m6_invoices(workspace_id,lower(invoice_ref))",
 "CREATE INDEX IF NOT EXISTS ama_v3_m6_invoice_document ON ama_v3_m6_invoices(workspace_id,document_id)",
 "CREATE TABLE IF NOT EXISTS ama_v3_m6_matches(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,invoice_id text NOT NULL REFERENCES ama_v3_m6_invoices(id) ON DELETE RESTRICT,intent_id text NOT NULL UNIQUE REFERENCES ama_v3_payment_intents(id) ON DELETE RESTRICT,linked_by text NOT NULL,linked_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE INDEX IF NOT EXISTS ama_v3_m6_matches_invoice ON ama_v3_m6_matches(workspace_id,invoice_id)",
 "CREATE TABLE IF NOT EXISTS ama_v3_m6_events(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES ama_v3_workspaces(id) ON DELETE RESTRICT,actor text NOT NULL,event text NOT NULL,entity_id text NOT NULL,source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT NOW())",
 "CREATE INDEX IF NOT EXISTS ama_v3_m6_event_timeline ON ama_v3_m6_events(workspace_id,created_at DESC)",
 "CREATE OR REPLACE FUNCTION ama_v3_m6_immutable_events() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'M6 audit events are append-only'; END; $$",
 "DO $body$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ama_v3_m6_no_update_or_delete') THEN CREATE TRIGGER ama_v3_m6_no_update_or_delete BEFORE UPDATE OR DELETE ON ama_v3_m6_events FOR EACH ROW EXECUTE FUNCTION ama_v3_m6_immutable_events(); END IF; END $body$"
];
export async function invoiceDB(){
 const sql=await agentDB();
 if(!initialized)initialized=(async()=>{for(const ddl of DDL)await sql.unsafe(ddl);return true})().catch(e=>{initialized=null;throw e});
 await initialized;return sql;
}
export async function invoicePermission(sql,actor,workspaceId,permission){
 workspaceId=assertWorkspaceId(workspaceId);
 return requireAgentMembership(sql,{actor,workspaceId,permission});
}
export async function invoiceEvent(sql,{workspaceId,actor,event,entityId,sourceHash,details={}}){
 await sql.unsafe("INSERT INTO ama_v3_m6_events(id,workspace_id,actor,event,entity_id,source_hash,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",[
  randomUUID(),workspaceId,actor,event,entityId,sourceHash,JSON.stringify(details)
 ]);
}
export async function recordDocument({workspaceId,actor,input,pdfLoader}){
 workspaceId=assertWorkspaceId(workspaceId);
 const extracted=await extractDocument(input,{pdfLoader});
 const sql=await invoiceDB();
 return sql.begin(async tx=>{
  await invoicePermission(tx,actor,workspaceId,"invoice:write");
  const rows=await tx.unsafe("INSERT INTO ama_v3_m6_documents(id,workspace_id,sha256,filename,mime,byte_count,source_type,extraction_status,extracted_preview,page_count,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(workspace_id,sha256) DO NOTHING RETURNING *",[
   randomUUID(),workspaceId,extracted.sha256,extracted.filename,extracted.mime,extracted.bytes,
   extracted.sourceType,extracted.extractionStatus,extracted.extractedPreview,extracted.numberOfPages,actor
  ]);
  if(!rows.length)throw new PaymentError(409,"Duplicate document SHA-256 in this workspace");
  await invoiceEvent(tx,{workspaceId,actor,event:"document_ingested",entityId:rows[0].id,
   sourceHash:extracted.sha256,details:{mime:extracted.mime,bytes:extracted.bytes,
    extraction:extracted.extractionStatus,rawFileStored:false}});
  return {id:rows[0].id,...extracted};
 });
}
export async function listDocuments({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await invoiceDB();await invoicePermission(sql,actor,workspaceId,"invoice:read");
 return sql.unsafe("SELECT id,sha256,filename,mime,byte_count,source_type,extraction_status,extracted_preview,page_count,created_at FROM ama_v3_m6_documents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[workspaceId]);
}
export async function createSupplier({actor,input}){
 const x=validateSupplier(input),sql=await invoiceDB();
 return sql.begin(async tx=>{
  await invoicePermission(tx,actor,x.workspaceId,"invoice:write");
  const rows=await tx.unsafe("INSERT INTO ama_v3_m6_suppliers(id,workspace_id,name,payout_address,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *",[
   randomUUID(),x.workspaceId,x.name,x.address,actor
  ]);
  if(!rows.length)throw new PaymentError(409,"Duplicate supplier name; manual investigation required");
  await invoiceEvent(tx,{workspaceId:x.workspaceId,actor,event:"supplier_entered",entityId:rows[0].id,
   sourceHash:"0".repeat(64),details:{nativePayoutAccount:!!x.address,humanReviewed:false}});
  return rows[0];
 });
}
export async function verifySupplier({workspaceId,id,actor,ackAddress}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 if(ackAddress!==true)throw new PaymentError(400,"Explicit manual review of supplier payout address is required");
 const sql=await invoiceDB();
 return sql.begin(async tx=>{
  await invoicePermission(tx,actor,workspaceId,"beneficiary:manage");
  const rows=await tx.unsafe("SELECT * FROM ama_v3_m6_suppliers WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[id,workspaceId]);
  if(!rows.length)throw new PaymentError(404,"Supplier not found in this organization");
  const x=rows[0];
  if(x.status!=="unverified")throw new PaymentError(409,"Supplier already reviewed");
  if(x.payout_address){
   const allow=await tx.unsafe("SELECT status FROM ama_v3_beneficiaries WHERE workspace_id=$1 AND address=$2 FOR SHARE",[workspaceId,x.payout_address]);
   if(allow[0]?.status!=="allowed")throw new PaymentError(409,"Supplier address is not on the native AMA beneficiary allowlist");
  }
  const updated=await tx.unsafe("UPDATE ama_v3_m6_suppliers SET status='human_reviewed',reviewed_by=$1,reviewed_at=NOW() WHERE id=$2 AND workspace_id=$3 RETURNING *",[actor,id,workspaceId]);
  await invoiceEvent(tx,{workspaceId,actor,event:"supplier_human_reviewed",entityId:id,sourceHash:"0".repeat(64),
   details:{manualOnly:true,supplierIdentityCryptographicallyAttested:false}});
  return updated[0];
 });
}
export async function listSuppliers({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await invoiceDB();await invoicePermission(sql,actor,workspaceId,"invoice:read");
 return sql.unsafe("SELECT id,name,payout_address,status,reviewed_at,created_at FROM ama_v3_m6_suppliers WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[workspaceId]);
}
export async function createInvoice({actor,input}){
 const x=validateInvoice(input),sql=await invoiceDB();
 return sql.begin(async tx=>{
  await invoicePermission(tx,actor,x.workspaceId,"invoice:write");
  const docs=await tx.unsafe("SELECT * FROM ama_v3_m6_documents WHERE workspace_id=$1 AND id=$2 FOR SHARE",[x.workspaceId,x.documentId]);
  const suppliers=await tx.unsafe("SELECT * FROM ama_v3_m6_suppliers WHERE workspace_id=$1 AND id=$2 FOR SHARE",[x.workspaceId,x.supplierId]);
  if(!docs.length||!suppliers.length)throw new PaymentError(404,"Document and supplier must belong to the organization");
  if(x.currency==="AMA"&&!suppliers[0].payout_address)
   throw new PaymentError(400,"Native AMA invoice requires a supplier payout address");
  const duplicates=await tx.unsafe("SELECT id FROM ama_v3_m6_invoices WHERE workspace_id=$1 AND (lower(invoice_ref)=lower($2) OR document_id=$3) LIMIT 5",[x.workspaceId,x.invoiceRef,x.documentId]);
  if(duplicates.length)throw new PaymentError(409,"Potential duplicate invoice reference or reused document");
  const rows=await tx.unsafe("INSERT INTO ama_v3_m6_invoices(id,workspace_id,document_id,supplier_id,invoice_ref,currency,amount,amount_units,unit_kind,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *",[
   randomUUID(),x.workspaceId,x.documentId,x.supplierId,x.invoiceRef,x.currency,x.amount,x.amountUnits,x.unitKind,actor
  ]);
  if(!rows.length)throw new PaymentError(409,"Duplicate invoice reference");
  await invoiceEvent(tx,{workspaceId:x.workspaceId,actor,event:"invoice_entered",entityId:rows[0].id,
   sourceHash:docs[0].sha256,details:{currency:x.currency,amountUnits:x.amountUnits,verification:"unverified"}});
  return rows[0];
 });
}
export async function verifyInvoice({workspaceId,id,actor,sourceSha256,ackSourceReviewed}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 if(ackSourceReviewed!==true||typeof sourceSha256!=="string"||!/^[a-f0-9]{64}$/.test(sourceSha256))
  throw new PaymentError(400,"Exact source digest and explicit human source review required");
 const sql=await invoiceDB();
 return sql.begin(async tx=>{
  await invoicePermission(tx,actor,workspaceId,"invoice:write");
  const rows=await tx.unsafe(
   "SELECT i.*,d.sha256,s.status AS supplier_status,s.payout_address FROM ama_v3_m6_invoices i JOIN ama_v3_m6_documents d ON d.id=i.document_id JOIN ama_v3_m6_suppliers s ON s.id=i.supplier_id WHERE i.workspace_id=$1 AND i.id=$2 FOR UPDATE OF i",[workspaceId,id]
  );
  if(!rows.length)throw new PaymentError(404,"Invoice not found in organization");
  const inv=rows[0];
  if(inv.status!=="unverified")throw new PaymentError(409,"Invoice already reviewed");
  if(inv.sha256!==sourceSha256)throw new PaymentError(409,"Document SHA-256 does not match reviewed source");
  if(inv.supplier_status!=="human_reviewed")throw new PaymentError(409,"Supplier must be human-reviewed before invoice can be verified");
  if(inv.currency==="AMA"){
   const allow=await tx.unsafe("SELECT status FROM ama_v3_beneficiaries WHERE workspace_id=$1 AND address=$2 FOR SHARE",[workspaceId,inv.payout_address]);
   if(allow[0]?.status!=="allowed")throw new PaymentError(409,"Supplier payout address must currently be allowlisted");
  }
  const updated=await tx.unsafe("UPDATE ama_v3_m6_invoices SET status='human_verified',verified_by=$1,verified_at=NOW() WHERE workspace_id=$2 AND id=$3 AND status='unverified' RETURNING *",[actor,workspaceId,id]);
  await invoiceEvent(tx,{workspaceId,actor,event:"invoice_human_verified",entityId:id,sourceHash:sourceSha256,
   details:{humanSourceReview:true,externalSupplierAttestation:false,chainPaymentProven:false}});
  return updated[0];
 });
}
export async function invoiceRow(sql,workspaceId,id,lock=false){
 const rows=await sql.unsafe(
 "SELECT i.*,d.sha256 AS source_sha256,d.extraction_status,s.name AS supplier_name,s.payout_address FROM ama_v3_m6_invoices i JOIN ama_v3_m6_documents d ON d.id=i.document_id JOIN ama_v3_m6_suppliers s ON s.id=i.supplier_id WHERE i.workspace_id=$1 AND i.id=$2"+(lock?" FOR UPDATE OF i":"")+" LIMIT 1",
 [workspaceId,id]);
 if(!rows.length)throw new PaymentError(404,"Invoice not found in organization");
 return rows[0];
}
