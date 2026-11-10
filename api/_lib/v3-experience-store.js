/**
 * M8 read-only Testnet UX snapshot. No transactions, no synthetic data, no writes.
 * All queries scoped to authenticated organization membership.
 */
import {invoiceDB} from "./v3-invoice-store.js";
import {executionDB} from "./v3-execution-store.js";
import {governanceDB} from "./v3-governance-store.js";
import {hasPermission} from "./v3-identity-core.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
import {normalizeNativeReceipt,overviewMetrics,UX_NETWORK} from "./v3-experience-core.js";

export async function experienceDB(){
 const sql=await executionDB();
 await invoiceDB();await governanceDB();
 return sql;
}
async function requireMember(sql,workspaceId,actor){
 const rows=await sql.unsafe("SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 LIMIT 1",
   [workspaceId,actor]);
 if(!rows.length||!hasPermission(rows[0].role,"workspace:read")||
    !hasPermission(rows[0].role,"payment:read")||
    !hasPermission(rows[0].role,"invoice:read"))
  throw new PaymentError(403,"Read-only dashboard access denied for this organization");
 return rows[0].role;
}
export async function experienceSnapshot({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await experienceDB();const role=await requireMember(sql,workspaceId,actor);
 // READ-ONLY: no state reconciliation, policy bootstrap, balance RPC or network submission.
 const [intentRows,invoiceRows,executionRows,riskRows,policyRows]=await Promise.all([
  sql.unsafe("SELECT id,status,created_by,payer FROM ama_v3_payment_intents WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200",[workspaceId]),
  sql.unsafe("SELECT id,status,currency FROM ama_v3_m6_invoices WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200",[workspaceId]),
  sql.unsafe("SELECT i.id,i.network,i.asset,i.payer,i.recipient,i.amount_units,e.tx_hash,e.status AS execution_status,e.receipt,e.verified_at,e.created_at FROM ama_v3_executions e JOIN ama_v3_payment_intents i ON i.id=e.intent_id AND i.workspace_id=e.workspace_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC LIMIT 50",[workspaceId]),
  sql.unsafe("SELECT active FROM ama_v3_m7_flags WHERE workspace_id=$1 AND active=true ORDER BY created_at DESC LIMIT 200",[workspaceId]),
  sql.unsafe("SELECT version,paused FROM ama_v3_m7_policies WHERE workspace_id=$1 LIMIT 1",[workspaceId])
 ]);
 const executions=executionRows.map(row=>({
  status:row.execution_status,intent:{
   id:row.id,network:row.network,asset:row.asset,payer:row.payer,
   recipient:row.recipient,amount_units:String(row.amount_units)
  },execution:{tx_hash:row.tx_hash,status:row.execution_status,receipt:row.receipt,
   verified_at:row.verified_at}
 }));
 const summary=overviewMetrics({intents:intentRows,invoices:invoiceRows,executions,
  risks:riskRows,policy:policyRows[0]||null});
 return {network:UX_NETWORK,workspaceId,role,summary,receiptRows:executions.map(normalizeNativeReceipt),
  countsCapped:{intents:intentRows.length>=200,invoices:invoiceRows.length>=200,
   riskFlags:riskRows.length>=200,executions:executionRows.length>=50},
  source:"organization_postgresql_M2_M7_records",updatedAt:new Date().toISOString(),
  liveAmaWalletBalanceQueried:false,liveChainQueried:false,
  caveat:"M4 previously persisted, independently checked finality is required to label a transfer verified. An RPC acknowledgement or fabricated test fixture is not live settlement."};
}
