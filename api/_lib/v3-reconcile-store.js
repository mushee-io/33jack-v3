/**
 * M6 proof-driven accounting. No FX quotes and no bank-payout assertions.
 * Only M4 independently checked finalized native AMA receipts contribute to paid totals.
 */
import {randomUUID} from "node:crypto";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
import {deriveInvoiceSettlement,accountingCSV} from "./v3-invoice-core.js";
import {invoiceDB,invoicePermission,invoiceEvent,invoiceRow} from "./v3-invoice-store.js";

async function links(sql,workspaceId,invoiceId){
 const rows=await sql.unsafe(
  "SELECT i.id AS intent_id,i.network,i.asset,i.payer,i.recipient,i.invoice_ref,i.amount_units,i.status AS intent_status,e.tx_hash,e.status AS execution_status,e.receipt,e.verified_at FROM ama_v3_m6_matches m JOIN ama_v3_payment_intents i ON i.id=m.intent_id LEFT JOIN ama_v3_executions e ON e.intent_id=i.id WHERE m.workspace_id=$1 AND m.invoice_id=$2 ORDER BY m.linked_at ASC LIMIT 100",
  [workspaceId,invoiceId]
 );
 return rows.map(r=>({
  intent:{id:r.intent_id,network:r.network,asset:r.asset,payer:r.payer,
   recipient:r.recipient,invoice_ref:r.invoice_ref,amount_units:String(r.amount_units),
   status:r.intent_status},
  execution:r.tx_hash?{tx_hash:r.tx_hash,status:r.execution_status,receipt:r.receipt,verified_at:r.verified_at}:null
 }));
}
function present(row,matching){
 return {
  id:row.id,workspaceId:row.workspace_id,documentId:row.document_id,supplierId:row.supplier_id,
  invoiceRef:row.invoice_ref,supplier:row.supplier_name,payoutAddress:row.payout_address,
  currency:row.currency,amount:row.amount,amountUnits:String(row.amount_units),
  unitKind:row.unit_kind,status:row.status,verifiedBy:row.verified_by,
  verifiedAt:row.verified_at,sourceSha256:row.source_sha256,
  extractionStatus:row.extraction_status,linkedIntents:matching.length,
  settlement:deriveInvoiceSettlement({invoice:row,links:matching}),network:"amadeus-testnet",
  bankPayoutVerified:false,fxRateVerified:false
 };
}
export async function readInvoice({workspaceId,id,actor}){
 workspaceId=assertWorkspaceId(workspaceId);id=assertIntentId(id);
 const sql=await invoiceDB();await invoicePermission(sql,actor,workspaceId,"invoice:read");
 const row=await invoiceRow(sql,workspaceId,id);
 return present(row,await links(sql,workspaceId,id));
}
export async function listInvoices({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await invoiceDB();await invoicePermission(sql,actor,workspaceId,"invoice:read");
 const rows=await sql.unsafe("SELECT id FROM ama_v3_m6_invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[workspaceId]);
 const output=[];for(const row of rows)output.push(await readInvoice({workspaceId,id:row.id,actor}));
 return output;
}
export async function linkPayment({workspaceId,invoiceId,intentId,actor,ackHumanMatch}){
 workspaceId=assertWorkspaceId(workspaceId);
 invoiceId=assertIntentId(invoiceId);intentId=assertIntentId(intentId);
 if(ackHumanMatch!==true)throw new PaymentError(400,"Human must acknowledge exact native recipient and invoice amount");
 const sql=await invoiceDB();
 return sql.begin(async tx=>{
  await invoicePermission(tx,actor,workspaceId,"invoice:write");
  const invoice=await invoiceRow(tx,workspaceId,invoiceId,true);
  if(invoice.status!=="human_verified"||invoice.currency!=="AMA")
   throw new PaymentError(409,"Only human-reviewed native AMA invoices may link to Testnet payment");
  const rows=await tx.unsafe("SELECT * FROM ama_v3_payment_intents WHERE workspace_id=$1 AND id=$2 FOR SHARE",[workspaceId,intentId]);
  if(!rows.length)throw new PaymentError(404,"M3 payment intent not found in organization");
  const intent=rows[0];
  if(intent.network!=="amadeus-testnet"||intent.asset!=="AMA"||
    intent.status!=="awaiting_wallet_signature"||
    intent.recipient!==invoice.payout_address||
    intent.invoice_ref.toLowerCase()!==invoice.invoice_ref.toLowerCase())
   throw new PaymentError(409,"Approved native payment does not match invoice reference, recipient, chain or asset");
  const prior=await tx.unsafe("SELECT invoice_id FROM ama_v3_m6_matches WHERE intent_id=$1",[intentId]);
  if(prior.length)throw new PaymentError(409,"A payment intent cannot be linked twice");
  const rowsTotal=await tx.unsafe(
   "SELECT COALESCE(SUM(i.amount_units),0)::text AS units FROM ama_v3_m6_matches m JOIN ama_v3_payment_intents i ON i.id=m.intent_id WHERE m.workspace_id=$1 AND m.invoice_id=$2",
   [workspaceId,invoiceId]
  );
  if(BigInt(rowsTotal[0].units)+BigInt(intent.amount_units)>BigInt(invoice.amount_units))
   throw new PaymentError(409,"Link would exceed invoice's native AMA amount; manual investigation required");
  const match=await tx.unsafe(
   "INSERT INTO ama_v3_m6_matches(id,workspace_id,invoice_id,intent_id,linked_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
   [randomUUID(),workspaceId,invoiceId,intentId,actor]
  );
  await invoiceEvent(tx,{workspaceId,actor,event:"human_intent_link",entityId:invoiceId,
   sourceHash:invoice.source_sha256,details:{intentId,amountUnits:String(intent.amount_units),
    settlementVerified:false,humanAcknowledgement:true}});
  return match[0];
 });
}
export async function reconcileInvoice({workspaceId,id,actor}){
 // Read-only. M4 must independently verify Testnet transaction receipts first.
 return readInvoice({workspaceId,id,actor});
}
export async function exportAccounting({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await invoiceDB();await invoicePermission(sql,actor,workspaceId,"audit:read");
 const records=await listInvoices({workspaceId,actor});
 return {filename:"33jack-ama-testnet-"+workspaceId+".csv",mime:"text/csv",
  csv:accountingCSV(records),count:records.length,network:"amadeus-testnet",
  note:"Export is record metadata and M4-verified native Testnet receipts, not bank payout/FX evidence"};
}
