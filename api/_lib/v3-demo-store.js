/**
 * M10 public-grant-safe export: owner/admin only, read-only source-backed
 * organization proof commitments, no raw wallet/transaction or invoice data.
 */
import {acceptanceDB,acceptanceReports,acceptanceAudit} from "./v3-acceptance-store.js";
import {auditEvidence} from "./v3-governance-store.js";
import {assertWorkspaceId,PaymentError} from "./v3-payment-core.js";
import {makeM10GrantSnapshot,M10_SCOPE,m10ManualChecklist} from "./v3-demo-core.js";

export async function testnetDemoReadiness({workspaceId,actor}){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await acceptanceDB();
 // Reject unauthorized roles BEFORE performing parallel M7/M9 source reads.
 const member=await sql.unsafe(
  "SELECT role FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 LIMIT 1",
  [workspaceId,actor]
 );
 if(!member.length||!["owner","admin"].includes(member[0].role))
  throw new PaymentError(403,"M10 grant evidence requires authenticated owner/admin");
 const [records,audit,m7Audit]=await Promise.all([
  acceptanceReports({workspaceId,actor}),
  acceptanceAudit({workspaceId,actor}),
  auditEvidence({workspaceId,actor})
 ]);
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
