/**
 * CI-only evidence report. Synthetic fixtures are NEVER presented as on-chain fact.
 * Must only run against disposable M9 acceptance DB from test:m9:db.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import postgres from "postgres";
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.DATABASE_URL?.endsWith("/postgres")||
 process.env.AMA_M4_ENABLE_BROADCAST==="true")
 throw Error("M9 CI report can only be generated from disposable no-broadcast GitHub Actions");
const sql=postgres(process.env.DATABASE_URL,{max:2,prepare:false,connect_timeout:10});
try{
 const [markers,reports,chain,identity,invoices,governance]=await Promise.all([
  sql.unsafe("SELECT workspace_id,expected_reports,last_hash FROM ama_v3_m9_restore_marker"),
  sql.unsafe("SELECT status,source FROM ama_v3_m9_reports"),
  sql.unsafe("SELECT status,broadcast_attempts FROM ama_v3_executions"),
  sql.unsafe("SELECT COUNT(*)::integer AS count FROM ama_v3_challenges WHERE consumed_at IS NOT NULL"),
  sql.unsafe("SELECT COUNT(*)::integer AS count FROM ama_v3_m6_invoices WHERE status='human_verified'"),
  sql.unsafe("SELECT COUNT(*)::integer AS count FROM ama_v3_m7_events")
 ]);
 if(markers.length!==1||reports.length!==markers[0].expected_reports||
  reports.some(x=>x.status==="independently_checked"||x.source==="official_testnet_rpc_live"))
  throw Error("M9 CI fixture classification failed: simulated evidence must not claim live Testnet");
 const output={
  title:"33JACK V3 M9 disposable CI acceptance witness",
  status:"NO_GO_FOR_LIVE_FUNDS_AND_MAINNET",
  evidenceType:"synthetic_ci_only",realFundedTestnetTransferVerified:false,
  nativeChain:"amadeus-testnet",
  independentSecurityReview:"not_submitted",
  twoWalletExtensionCompatibility:"not_witnessed_in_live_browser",
  databaseTests:{m9ReportCount:reports.length,m4ExecutionCount:chain.length,
   singleBroadcastReservationInvariant:chain.every(x=>x.broadcast_attempts===1),
   manualInvoiceCount:invoices[0].count,m7AuditEvents:governance[0].count,
   consumedM2LoginChallenges:identity[0].count},
  fixtureBreakdown:reports.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),
  warning:"Simulated M4 and RPC evidence in disposable CI cannot establish real chain settlement or extension compatibility. Mainnet deployment prohibited.",
  stack:"M1-M9 draft PRs unmerged"
 };
 mkdirSync("m9-artifacts",{recursive:true});
 writeFileSync("m9-artifacts/m9-synthetic-acceptance.json",JSON.stringify(output,null,2)+"\n",{mode:0o600});
 console.log("M9 CI report generated: synthetic-only, live NO-GO; no wallet keys or signed packets included");
}finally{await sql.end()}
