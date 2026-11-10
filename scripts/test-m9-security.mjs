/**
 * M9 admission: deterministic security invariants, not a substitute for external audit.
 * Produces no credentials and never reads/logs env secret values.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("M9 security boundary static checks: V2 isolation, no new spend tool, locks intact",()=>{
 const legacy=read("api/_lib/legacy-access.js");
 assert.match(legacy,/retiredLegacyRoute/);
 const legacyPolicy=read("api/_lib/v3-network-policy.js");
 assert.match(legacyPolicy,/V3_LEGACY_ROUTE_DISABLED/);
 const m4=read("api/_lib/v3-execution-handler.js");
 for(const key of ["AMA_M4_ENABLE_BROADCAST","AMA_M4_WALLET_EXTENSION_VERIFIED",
  "AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED"])assert.match(m4,new RegExp(key));
 const approval=read("api/_lib/v3-payment-store.js");
 assert.match(approval,/guardPaymentTransition/);
 assert.match(approval,/sealFinancialApproval/);
 const exec=read("api/_lib/v3-execution-store.js");
 assert.match(exec,/guardExecution/);
 assert.match(exec,/broadcast_attempts integer NOT NULL CHECK\(broadcast_attempts=1\)/);
 const agent=read("api/_lib/v3-agent-core.js");
 assert.doesNotMatch(agent,/ama\.tx\.submit|ama\.payment\.approve/);
 const accept=read("api/_lib/v3-acceptance-handler.js");
 assert.doesNotMatch(accept,/transaction\.submit\(|signUnsigned\(|payment\.approve\(|txPacked/);
 assert.match(accept,/requireCsrf/);
 const get=read("api/_lib/v3-acceptance-store.js");
 assert.doesNotMatch(get,/DELETE FROM ama_v3_(payment|m6|m7)|UPDATE ama_v3_(executions|payment_intents)/);
 const m6=read("api/_lib/v3-invoice-store.js");
 assert.match(m6,/ama_v3_m6_immutable_events/);
 const m7=read("api/_lib/v3-governance-store.js");
 assert.match(m7,/ama_v3_m7_immutable_events/);
 const m9=read("api/_lib/v3-acceptance-store.js");
 assert.match(m9,/ama_v3_m9_immutable_reports/);
});
test("M9 redacted docs/source scan forbids actual committed credential strings in native financial modules",()=>{
 const paths=[
  "api/_lib/amadeus-testnet.js","api/_lib/v3-acceptance-core.js",
  "api/_lib/v3-acceptance-store.js","api/_lib/v3-acceptance-handler.js",
  "src/AmadeusAcceptancePanel.jsx","docs/M9-END-TO-END-ACCEPTANCE.md"
 ];
 for(const file of paths){
  if(!existsSync(new URL("../"+file,import.meta.url)))continue;
  const content=read(file);
  // Search for actual literal credentials, not environment variable references.
  assert.doesNotMatch(content,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(content,/AKIA[0-9A-Z]{16}/);
  assert.doesNotMatch(content,/gsk_[A-Za-z0-9_-]{30,}/);
  assert.doesNotMatch(content,/sk-proj-[A-Za-z0-9_-]{24,}/);
  assert.doesNotMatch(content,/(?:apiKey|privateKey|mnemonic|secretKey)\s*:\s*["'][A-Za-z0-9_-]{32,}["']/i);
 }
});
test("M9 no mainnet network, synthetic CI never becomes audited release",()=>{
 const docs=read("docs/M9-END-TO-END-ACCEPTANCE.md");
 assert.match(docs,/independent security review.*(not|pending)/i);
 assert.match(docs,/funded two-wallet/i);
 assert.match(docs,/synthetic/i);
 const ci=read(".github/workflows/ci.yml");
 assert.match(ci,/m9-disposable-postgres:/);
 assert.match(ci,/npm run test:m9/);
 assert.match(ci,/AMA_M4_ENABLE_BROADCAST: "false"/);
});
