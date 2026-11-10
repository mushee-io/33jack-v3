/**
 * M10 isolated Testnet preflight: source-only, no external network requests,
 * no Vercel deployment, no wallet access and no signing.
 */
import {readFileSync,existsSync} from "node:fs";
import {validateM10Environment,M10_SCOPE} from "../api/_lib/v3-demo-core.js";
const result=validateM10Environment(process.env);
const config=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
if(config.framework!=="vite"||config.buildCommand!=="npm run build")
 throw Error("M10 cannot prepare an unrecognized Vercel build");
if(config.rewrites?.some(x=>/mainnet|celo|stellar/i.test(x.destination||"")))
 throw Error("M10 forbids custom settlement/legacy deployment rewrites");
if(pkg.license!=="MIT")throw Error("M10 requires MIT license");
if(process.env.GITHUB_ACTIONS==="true"){
 const sha=process.env.M10_SOURCE_SHA||process.env.GITHUB_SHA||"";
 if(!/^[a-f0-9]{40}$/.test(sha))
  throw Error("M10 GitHub CI evidence requires an exact 40-character source commit");
 const branch=process.env.GITHUB_HEAD_REF||String(process.env.GITHUB_REF||"").replace(/^refs\\/heads\\//,"");
 const base=process.env.GITHUB_BASE_REF||"";
 const originalM10=branch==="feat/ama-v3-m10-final-testnet-demo-grants"&&
  (base===""||base==="feat/ama-v3-m9-e2e-security-acceptance");
 const reviewedM10Successor=branch==="fix/ama-v3-native-only-experience"&&
  (base===""||base==="feat/ama-v3-m10-final-testnet-demo-grants");
 if(!originalM10&&!reviewedM10Successor)
  throw Error("M10 preflight requires the original stacked M10 branch or its explicit Amadeus-only draft successor");
}
console.log(JSON.stringify({
 prepared:true,network:result.network,rpc:result.rpc,
 releaseStatus:M10_SCOPE.releaseDecision,mainnetDeployment:false,
 broadcastLocked:true,packageLicense:pkg.license,
 vercelConfiguredButNotDeployed:true,
 dependencyLockfilePresent:existsSync(new URL("../package-lock.json",import.meta.url)),
 externalSecurityReview:"not_submitted",
 twoWalletFundedWitness:"not_witnessed",
 limitation:"This is code/config-only Testnet readiness, not a live Vercel/SSO/database/wallet acceptance witness"
},null,2));
