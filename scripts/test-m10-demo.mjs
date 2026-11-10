import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 M10_PROTOCOL,M10_SCOPE,M10_OPEN_BLOCKERS,M10_DEMO_STEPS,sha256,
 validateM10Environment,makeM10GrantSnapshot,verifyM10GrantSnapshot,m10ManualChecklist
} from "../api/_lib/v3-demo-core.js";
const work="123e4567-e89b-42d3-a456-426614174999";
const hx=x=>x.repeat(64);
const report={evidenceHash:hx("a"),status:"synthetic_ci_only",source:"synthetic_ci_only",
 intentId:"private-m9-intent-id",txHash:"private-tx-hash",rawWallet:"private-wallet-should-not-leak"};
const base={workspaceId:work,records:[report],audit:{valid:true,lastHash:hx("b"),count:1},
 m7Audit:{valid:true,lastHash:hx("c")},invoiceCount:1,flagsCount:1,origin:"ci_disposable_postgres",
 buildSha:"a7b04f0e5d0f6925514de6935cad6069db01a993"};
test("M10 native Testnet-only grant and operator demo gates",()=>{
 assert.equal(M10_SCOPE.network,"amadeus-testnet");
 assert.equal(M10_SCOPE.asset,"AMA");assert.equal(M10_SCOPE.decimals,9);
 assert.equal(M10_SCOPE.allowedRPC,"https://testnet-rpc.ama.one/api");
 assert.equal(M10_SCOPE.mainnet,"PROHIBITED");
 assert.equal(M10_DEMO_STEPS.length,10);
 assert.equal(m10ManualChecklist().length,10);
 assert.ok(M10_OPEN_BLOCKERS.some(x=>/funded/.test(x)));
 assert.ok(M10_OPEN_BLOCKERS.some(x=>/security audit/.test(x)));
 for(const step of m10ManualChecklist())assert.equal(step.evidenceState,"unwitnessed");
 const ok=validateM10Environment({AMA_TESTNET_RPC_URL:M10_SCOPE.allowedRPC,
  AMA_M4_ENABLE_BROADCAST:"false",AMA_M4_WALLET_EXTENSION_VERIFIED:"false",
  AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED:"false",VERCEL_ENV:"preview"});
 assert.equal(ok.ok,true);
 assert.equal(ok.productionDeploymentAllowed,false);
 for(const env of [
  {AMA_TESTNET_RPC_URL:"https://mainnet-rpc.ama.one/api"},
  {AMA_TESTNET_RPC_URL:"https://testnet-rpc.ama.one/api?x=evil"},
  {AMA_TESTNET_RPC_URL:"https://evil.example/api"},
  {VERCEL_ENV:"production"},
  {AMA_M4_ENABLE_BROADCAST:"true"},
  {AMA_M4_WALLET_EXTENSION_VERIFIED:"true"},
  {AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED:"true"},
  {AMA_M5_ALLOW_REMOTE_AI:"true"}
 ])assert.throws(()=>validateM10Environment(env),/M10|Testnet/);
});
test("M10 privacy-safe SHA-256 export is deterministic, tamper-evident and NO-GO",()=>{
 const a=makeM10GrantSnapshot(base),b=makeM10GrantSnapshot(base);
 assert.equal(a.schema,M10_PROTOCOL);
 assert.equal(a.digest,b.digest);
 assert.equal(a.digestAlgorithm,"sha256:canonical-json-v1");
 assert.equal(a.buildCommit,base.buildSha);
 assert.equal(verifyM10GrantSnapshot(a),true);
 assert.equal(a.release.decision,"NO_GO_FOR_PUBLIC_FUNDS_AND_MAINNET");
 assert.equal(a.release.canEnableM4Broadcast,false);
 assert.equal(a.release.canDeployMainnet,false);
 assert.equal(a.claims.realFundedTwoWalletTransferVerified,false);
 assert.equal(a.claims.independentSecurityReview,"not_submitted");
 assert.equal(a.sourceSnapshot.sampledM9Records,1);
 const exported=JSON.stringify(a);
 for(const s of [report.intentId,report.txHash,report.rawWallet,work])
  assert.equal(exported.includes(s),false,"Do not leak "+s);
 assert.equal(a.sourceSnapshot.evidence[0].kind,"synthetic_ci_only");
 assert.equal(a.sourceSnapshot.evidence[0].twoWalletFundingVerified,false);
 assert.equal(a.organizationCommitment,sha256("m10-workspace:"+work));
 assert.equal(verifyM10GrantSnapshot({...a,claims:{...a.claims,mainnetDeployed:true}}),false);
 assert.equal(verifyM10GrantSnapshot({...a,digest:hx("0")}),false);
 assert.equal(verifyM10GrantSnapshot({...a,release:{...a.release,canEnableM4Broadcast:true}}),false);
});
test("M10 cannot convert any claimed M9 RPC check into funded two-wallet evidence",()=>{
 const live=makeM10GrantSnapshot({...base,origin:"runtime_db",records:[
  {...report,status:"independently_checked",source:"official_testnet_rpc_live"}
 ]});
 assert.equal(live.sourceSnapshot.evidence[0].kind,"official_rpc_comparison_recorded");
 assert.equal(live.claims.realFundedTwoWalletTransferVerified,false);
 assert.equal(live.release.canIssueLiveFundingClaim,false);
 assert.equal(live.claims.extensionCompatibilityVerified,false);
 assert.equal(live.claims.verifiedPreviewProtection,false);
 assert.equal(live.claims.verifiedPrivateDBRestore,false);
 for(const record of [
  {...report,evidenceHash:"not-a-hash"},
  {...report,status:"mainnet_finalized"},
  {...report,source:"fabricated"}
 ])assert.throws(()=>makeM10GrantSnapshot({...base,records:[record]}),/M10/);
 assert.throws(()=>makeM10GrantSnapshot({...base,records:new Array(51).fill(report)}),/M10/);
 assert.throws(()=>makeM10GrantSnapshot({...base,origin:"mainnet"}),/M10/);
 assert.throws(()=>makeM10GrantSnapshot({...base,buildSha:"ab"}),/M10/);
});
test("M10 backend is read-only and preserves M1–M9 security boundaries",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const handler=read("api/_lib/v3-demo-handler.js");
 assert.match(handler,/req\.method!=="GET"/);
 assert.match(handler,/session\.origin!==origin/);
 assert.match(handler,/testnetDemoReadiness/);
 assert.doesNotMatch(handler,/transaction\.submit|signTransaction|txPacked|privateKey\s*=/);
 const store=read("api/_lib/v3-demo-store.js");
 assert.match(store,/acceptanceReports/);
 assert.match(store,/acceptanceAudit/);
 assert.doesNotMatch(store,/INSERT INTO |DELETE FROM |UPDATE ama_v3_/);
 const m4=read("api/_lib/v3-execution-handler.js");
 for(const flag of ["AMA_M4_ENABLE_BROADCAST","AMA_M4_WALLET_EXTENSION_VERIFIED",
  "AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED"])assert.match(m4,new RegExp(flag));
 const agent=read("api/_lib/v3-agent-core.js");
 assert.doesNotMatch(agent,/ama\.tx\.submit|ama\.payment\.approve/);
 const m9=read("api/_lib/v3-acceptance-store.js");
 assert.match(m9,/ama_v3_m9_immutable_reports/);
 const ui=read("src/AmadeusWorkspace.jsx");
 assert.match(ui,/AmadeusAcceptancePanel/);
 assert.match(ui,/AmadeusDemoPanel/);
 const css=read("src/amadeus-demo.css");
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:650px\)/);
});
test("M10 operator/grant package explicitly documents independently unwitnessed items",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 for(const path of ["docs/M10-DEMO-OPERATOR-PLAYBOOK.md",
  "docs/M10-AMA-FOUNDATION-APPLICATION.md",
  "docs/M10-TESTNET-DEPLOYMENT-PREPARATION.md",
  "docs/M10-SECURITY-AND-RELEASE-GATES.md"]){
  const content=read(path);
  assert.match(content,/Amadeus|AMA/);
  assert.match(content,/Testnet/i);
  assert.match(content,/(unverified|not witnessed|not submitted|NO-GO)/i);
 }
 const config=read(".env.example");
 assert.match(config,/AMA_M4_ENABLE_BROADCAST=false/);
 assert.doesNotMatch(read("api/_lib/amadeus-testnet.js"),/mainnet.*baseUrl:/);
});
