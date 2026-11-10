/**
 * Source-pinned CI artifact. Not a grant application, external audit,
 * transaction certificate or release approval.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {acceptanceReports,acceptanceAudit} from "../api/_lib/v3-acceptance-store.js";
import {auditEvidence} from "../api/_lib/v3-governance-store.js";
import {testnetDemoReadiness} from "../api/_lib/v3-demo-store.js";
import {makeM10GrantSnapshot,verifyM10GrantSnapshot,M10_SCOPE,sha256} from "../api/_lib/v3-demo-core.js";
import {identityDB} from "../api/_lib/v3-identity-store.js";
if(process.env.GITHUB_ACTIONS!=="true"||
 !process.env.DATABASE_URL?.endsWith("/postgres")||
 !/^[a-f0-9]{40}$/.test(String(process.env.M10_SOURCE_SHA||process.env.GITHUB_SHA||""))||
 process.env.AMA_M4_ENABLE_BROADCAST==="true"||
 process.env.AMA_M4_WALLET_EXTENSION_VERIFIED==="true"||
 process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED==="true")
 throw Error("M10 CI artifact requires exact source SHA and disposable broadcast-disabled PostgreSQL");
const sql=await identityDB();
try{
 const marker=await sql.unsafe("SELECT workspace_id,digest FROM ama_v3_m10_restore_marker");
 if(marker.length!==1)throw Error("One synthetic M10 grant acceptance fixture required");
 const workspaceId=marker[0].workspace_id;
 const [owner]=await sql.unsafe("SELECT payer FROM ama_v3_payment_intents WHERE workspace_id=$1 LIMIT 1",[workspaceId]);
 if(!owner)throw Error("M10 synthetic fixture does not have M3 wallet owner");
 const [live,records,audit,m7Audit]=await Promise.all([
  testnetDemoReadiness({workspaceId,actor:owner.payer}),
  acceptanceReports({workspaceId,actor:owner.payer}),
  acceptanceAudit({workspaceId,actor:owner.payer}),
  auditEvidence({workspaceId,actor:owner.payer})
 ]);
 if(live.grantSnapshot.digest!==marker[0].digest||!audit.valid||!m7Audit.valid||
    records.some(x=>x.isLiveRPCAcceptance||x.status==="independently_checked"))
  throw Error("M10 synthetic CI data may not claim live funded settlement");
 const payload=makeM10GrantSnapshot({
  workspaceId,records,audit,m7Audit,
  invoiceCount:live.grantSnapshot.sourceSnapshot.humanInvoiceRecordCount,
  flagsCount:live.grantSnapshot.sourceSnapshot.activeManualRiskFlags,
  origin:"ci_disposable_postgres",buildSha:(process.env.M10_SOURCE_SHA||process.env.GITHUB_SHA)
 });
 if(!verifyM10GrantSnapshot(payload))throw Error("M10 evidence integrity verification failed");
 const output={
  product:"33JACK V3",milestone:"M10-final",
  sourceCommit:(process.env.M10_SOURCE_SHA||process.env.GITHUB_SHA),githubRunId:String(process.env.GITHUB_RUN_ID||""),
  evidenceType:"synthetic_ci_only",
  source:"independent_disposable_PostgreSQL16_M2-M10",
  claim:"NO_GO_FOR_LIVE_FINANCIAL_SETTLEMENT_AND_MAINNET",
  version:M10_SCOPE.network,
  CIStatusAtGeneration:"running_not_yet_final",
  manifest:payload,
  notice:"No private wallet key, raw signed packet, customer invoice, payment address or funded live transaction is included. GitHub CI success must be checked independently."
 };
 mkdirSync("m10-artifacts",{recursive:true});
 writeFileSync("m10-artifacts/m10-grant-evidence.json",JSON.stringify(output,null,2)+"\n",{mode:0o600});
 writeFileSync("m10-artifacts/m10-sha256.txt",
  sha256(JSON.stringify(output))+"  m10-grant-evidence.json\n",{mode:0o600});
 console.log("M10 exact-SHA redacted evidence generated; offline Testnet CI only; external/security/mainnet gates NO-GO");
}finally{await sql.end()}
