/**
 * M10 public-grant-safe export: owner/admin only, read-only source-backed
 * organization proof commitments, no raw wallet/transaction or invoice data.
 */
import {acceptanceDB,acceptanceReports,acceptanceAudit} from "./v3-acceptance-store.js";
import {auditEvidence} from "./v3-governance-store.js";
import {assertWorkspaceId} from "./v3-payment-core.js";
import {makeM10GrantSnapshot,M10_SCOPE,m10ManualChecklist} from "./v3-demo-core.js";

export async function testnetDemoReadiness({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 // M9's owner/admin guard is intentionally reused before any scoped query.
 const [records,audit,m7Audit]=await Promise.all([
  acceptanceReports({workspaceId,actor}),
  acceptanceAudit({workspaceId,actor}),
  auditEvidence({workspaceId,actor})
 ]);
 const sql=await acceptanceDB();
 const rows=await sql.unsafe(
  "SELECT (SELECT COUNT(*)::integer FROM ama_v3_m6_invoices WHERE workspace_id=$1 AND status='human_verified') AS reviewed_invoices,(SELECT COUNT(*)::integer FROM ama_v3_m7_flags WHERE workspace_id=$1 AND active=true) AS active_flags",
  [workspaceId]
 );
 const snapshot=makeM10GrantSnapshot({
  workspaceId,records,audit,m7Audit,invoiceCount:rows[0]?.reviewed_invoices??0,
  flagsCount:rows[0]?.active_flags??0,origin:"runtime_db"
 });
 return {network:M10_SCOPE.network,readOnly:true,source:"owner_admin_scoped_source_backed_data",
  grantSnapshot:snapshot,manualChecklist:m10ManualChecklist(),
  decision:snapshot.release.decision,
  note:"Redacted export of M9/M7 evidence commitments; not an independent funded transfer, deployment or third-party audit."};
}
