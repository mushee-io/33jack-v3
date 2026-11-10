/**
 * 33JACK V3 M10 — final Testnet-only, privacy-preserving demo/grant evidence.
 * This module NEVER upgrades CI/synthetic output into live funding evidence.
 * No wallet operations, keys, passwords, chain submission or mainnet routes.
 */
import {createHash} from "node:crypto";
import {AMA_TESTNET} from "./amadeus-testnet.js";

export const M10_PROTOCOL="33jack-v3-amadeus-testnet-grant-evidence-v1";
export const M10_DEMO_STEPS=Object.freeze([
 {id:"m2-native-wallet",label:"Verify official native wallet and signed login",proof:"distinct_live_M2_challenges",status:"operator_witness_required"},
 {id:"m2-organization",label:"Create a scoped Testnet organization",proof:"membership_and_roles",status:"operator_witness_required"},
 {id:"m6-invoice",label:"Ingest an invoice and verify human-reviewed supplier/source hash",proof:"m6_document_digest",status:"operator_witness_required"},
 {id:"m5-advisory",label:"Request an organization-scoped read-only AI explanation",proof:"m5_agent_audit",status:"operator_witness_required"},
 {id:"m3-terms",label:"Create and human-review an exact native AMA intent",proof:"m3_terms_hash",status:"operator_witness_required"},
 {id:"m7-governance",label:"Check maker-checker policy and emergency-stop behavior",proof:"m7_hash_linked_audit",status:"operator_witness_required"},
 {id:"m4-owner-signature",label:"Witness compatible wallet-owner sign-only Coin.transfer",proof:"extension_capability_and_signature",status:"operator_witness_required"},
 {id:"m4-finality",label:"Verify exact transaction against official Testnet RPC and rooted finality",proof:"independent_chain_hash_and_height",status:"operator_witness_required"},
 {id:"m6-reconciliation",label:"Match only independently finalized native AMA receipt to invoice",proof:"m6_link_and_m4_receipt",status:"operator_witness_required"},
 {id:"m9-independent-audit",label:"Review external security findings and separate database restore",proof:"external_reviewer_and_restore_attestation",status:"external_witness_required"}
]);
export const M10_OPEN_BLOCKERS=Object.freeze([
 "Official extension signMessage/sign-only compatibility has not been independently witnessed",
 "Two real funded native AMA Testnet wallets and finality have not been witnessed",
 "A protected Preview environment and isolated V3 deployment database have not been independently validated",
 "No completed independent security audit report is supplied",
 "An operator-signed production-grade backup/restore witness is not supplied",
 "Dependency lockfile is not committed; installs are not byte-for-byte reproducible",
 "KYC/KYB/AML and fiat FX/bank payout providers have not been integrated"
]);
export const M10_SCOPE=Object.freeze({
 network:AMA_TESTNET.id,asset:"AMA",decimals:9,
 allowedRPC:AMA_TESTNET.rpcUrl,
 deploymentTarget:"protected_testnet_preview_only",
 mainnet:"PROHIBITED",agentSpending:"PROHIBITED",
 rawSigningMaterials:"PROHIBITED",broadcast:"LOCKED_UNTIL_EXTERNAL_WITNESS",
 releaseDecision:"NO_GO_FOR_PUBLIC_FUNDS_AND_MAINNET"
});
const hex64=/^[a-f0-9]{64}$/;
function hash(text){return createHash("sha256").update(String(text),"utf8").digest("hex")}
export function sha256(value){return hash(value)}
export function validateM10Environment(env=process.env){
 // This is a preparation guard, NOT a verifier of a protected Vercel deployment.
 if(env.VERCEL_ENV==="production"||env.NODE_ENV==="production"&&env.M10_DEPLOY_CONTEXT==="production")
  throw Error("M10 forbids production deployment");
 if(env.AMA_M4_ENABLE_BROADCAST==="true"||
    env.AMA_M4_WALLET_EXTENSION_VERIFIED==="true"||
    env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED==="true")
  throw Error("M10 preparation refuses enabled M4 broadcast and wallet-release flags");
 if(env.AMA_M5_ALLOW_REMOTE_AI==="true")
  throw Error("M10 reproducible offline security acceptance refuses external AI");
 // Same exact allowlist as M1, without changing global environment values.
 // No optional mainnet or arbitrary host fallback.
 if(String(env.AMA_TESTNET_RPC_URL||AMA_TESTNET.rpcUrl)!==AMA_TESTNET.rpcUrl)
  throw Error("M10 only accepts the official HTTPS Amadeus Testnet RPC");
 return {ok:true,network:M10_SCOPE.network,rpc:M10_SCOPE.allowedRPC,
  broadcastLocked:true,productionDeploymentAllowed:false,
  note:"Environment preparation only; not a live wallet, SSO, RPC-finality or database-deployment witness"};
}
function cleanReports(input=[]){
 if(!Array.isArray(input)||input.length>50)throw Error("M10 evidence sample exceeds 50 records");
 return input.map(r=>{
  if(!hex64.test(String(r.evidenceHash||"")))
   throw Error("M10 requires M9 append-only SHA-256 evidence hashes");
  if(!["blocked","synthetic_ci_only","independently_checked"].includes(r.status)||
     !["synthetic_ci_only","official_testnet_rpc_live","unavailable"].includes(r.source))
   throw Error("M10 rejects unknown or unverified witness classification");
  const liveCandidate=r.status==="independently_checked"&&r.source==="official_testnet_rpc_live";
  return {evidenceHash:r.evidenceHash,
   kind:liveCandidate?"official_rpc_comparison_recorded":
    r.source==="synthetic_ci_only"?"synthetic_ci_only":"not_verified",
   auditReviewerVerdict:"not_submitted",twoWalletFundingVerified:false};
 });
}
export function makeM10GrantSnapshot({
 workspaceId,records=[],audit=null,m7Audit=null,invoiceCount=0,
 flagsCount=0,origin="runtime_db",buildSha=null
}={}){
 if(typeof workspaceId!=="string"||!workspaceId||
    !["runtime_db","ci_disposable_postgres"].includes(origin))
  throw Error("M10 snapshot requires an authorized organization scope and source");
 if(!Number.isSafeInteger(invoiceCount)||invoiceCount<0||
    !Number.isSafeInteger(flagsCount)||flagsCount<0)
  throw Error("M10 evidence counters must be bounded nonnegative integers");
 if(records.length>50||invoiceCount>1000000||flagsCount>1000000)
  throw Error("M10 evidence sample or counter exceeded safe reporting bounds");
 const sample=cleanReports(records);
 if(buildSha!==null&&!/^[a-f0-9]{40}$/.test(String(buildSha)))throw Error("M10 commit must be an exact 40-character Git SHA");
 const lastM9=audit?.lastHash;
 const lastM7=m7Audit?.lastHash;
 const body={
  schema:M10_PROTOCOL,network:M10_SCOPE.network,asset:"AMA",
  provenance:origin==="runtime_db"?"authenticated_owner_admin_readonly_organization":"synthetic_ci_disposable_database",
  organizationCommitment:hash(["m10-workspace",workspaceId].join(":")),
  // No raw wallets, Tx hash, invoice contents, supplier labels, session cookie or address.
  sourceSnapshot:{
   sampledM9Records:sample.length,
   m9AuditValid:audit?.valid===true,m9AuditHead:hex64.test(String(lastM9||""))?lastM9:null,
   m9AuditEntries:Number.isSafeInteger(audit?.count)?audit.count:null,
   m7AuditValid:m7Audit?.valid===true,m7AuditHead:hex64.test(String(lastM7||""))?lastM7:null,
   humanInvoiceRecordCount:invoiceCount,activeManualRiskFlags:flagsCount,
   evidence:sample,
   boundedSample:true,completeRecordInventory:false
  },
  claims:{
   CIOnly:origin==="ci_disposable_postgres",
   realFundedTwoWalletTransferVerified:false,extensionCompatibilityVerified:false,
   independentSecurityReview:"not_submitted",
   verifiedPreviewProtection:false,verifiedPrivateDBRestore:false,
   mainnetDeployed:false,fiatBankPayoutsIntegrated:false
  },
  release:{
   decision:M10_SCOPE.releaseDecision,
   canEnableM4Broadcast:false,canDeployMainnet:false,canIssueLiveFundingClaim:false,
   reason:"Testnet-only software and CI do not establish real wallet, external audit or live settlement evidence"
  },
  blockers:[...M10_OPEN_BLOCKERS],
  buildCommit:buildSha
 };
 const digest=hash(JSON.stringify(body));
 return {...body,digestAlgorithm:"sha256:canonical-json-v1",digest,
  generatedAt:new Date().toISOString()};
}
export function verifyM10GrantSnapshot(snapshot){
 if(!snapshot||snapshot.schema!==M10_PROTOCOL||snapshot.network!==M10_SCOPE.network||
    snapshot.release?.decision!==M10_SCOPE.releaseDecision||
    snapshot.claims?.realFundedTwoWalletTransferVerified!==false||
    snapshot.release?.canEnableM4Broadcast!==false||
    snapshot.release?.canDeployMainnet!==false)return false;
 const {digest,digestAlgorithm,generatedAt,...body}=snapshot;
 return digestAlgorithm==="sha256:canonical-json-v1"&&
  hex64.test(String(digest||""))&&digest===hash(JSON.stringify(body));
}
export function m10ManualChecklist(){
 return M10_DEMO_STEPS.map(step=>({...step,
  evidenceState:"unwitnessed",
  proofNeeded:step.proof,
  witnessSource:"requires_real_operator_or_external_reviewer"}));
}
