import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {toBase58} from "@amadeus-protocol/sdk";
import {
 UX_NETWORK,UX_NAV,navigationTarget,connectedStatus,normalizeNativeReceipt,
 overviewMetrics,formatAtomicAMA
} from "../api/_lib/v3-experience-core.js";
import {
 AMADEUS_TABS,nextAmadeusTab,walletUiState,normalizeApiState,displayCount
} from "../src/amadeus-ui-model.js";
const from=(byte,length=48)=>toBase58(Buffer.alloc(length,byte));
const hash=(byte)=>from(byte,32);
const payer=from(31),recipient=from(32);
const intent={id:"123e4567-e89b-42d3-a456-426614174000",
 network:"amadeus-testnet",asset:"AMA",payer,recipient,amount_units:"1230000000"};
const receipt=(overrides={})=>({
 network:"amadeus-testnet",finality:"finalized",executionSuccess:true,
 txHash:hash(23),payer,recipient,amountUnits:"1230000000",asset:"AMA",
 contract:"Coin",method:"transfer",entryHash:hash(29),entryHeight:225,...overrides
});
const execution=(overrides={})=>({tx_hash:hash(23),status:"finalized",
 verified_at:new Date("2026-11-10T10:00:00Z"),receipt:receipt(),...overrides});
test("M8 shows native Amadeus L1 Testnet only, with no implicit fiat or mainnet route",()=>{
 assert.equal(UX_NETWORK.id,"amadeus-testnet");
 assert.equal(UX_NETWORK.label,"Amadeus Testnet");
 assert.equal(UX_NETWORK.unit,"native AMA");
 assert.deepEqual(UX_NAV.map(x=>x.id),AMADEUS_TABS.map(x=>x.id));
 assert.equal(AMADEUS_TABS.length,7);
 assert.equal(AMADEUS_TABS.some(x=>/Stellar|Celo|Solana|Ethereum|USDC|USDG/i.test(x.label)),false);
});
test("M8 keyboard arrow, home/end navigation and roving focus are deterministic",()=>{
 const ids=AMADEUS_TABS.map(x=>x.id);
 assert.equal(nextAmadeusTab("ArrowRight","overview"),"wallet");
 assert.equal(nextAmadeusTab("ArrowLeft","overview"),"governance");
 assert.equal(nextAmadeusTab("ArrowDown","wallet"),"payments");
 assert.equal(nextAmadeusTab("ArrowUp","wallet"),"overview");
 assert.equal(nextAmadeusTab("Home","receipts"),"overview");
 assert.equal(nextAmadeusTab("End","overview"),"governance");
 assert.equal(nextAmadeusTab("Enter","wallet"),null);
 assert.deepEqual(ids,UX_NAV.map(x=>x.id));
 assert.equal(navigationTarget("ArrowRight","overview"),"wallet");
});
test("M8 session UX never treats wallet connection as proof of authenticated native Testnet login",()=>{
 assert.equal(walletUiState({}).ready,false);
 assert.equal(walletUiState({wallet:payer,networkVerified:false}).status,"network_unconfirmed");
 assert.equal(walletUiState({wallet:payer,networkVerified:true}).status,"connected_not_authenticated");
 assert.equal(walletUiState({wallet:payer,networkVerified:true,
  session:{address:recipient,csrf:"test"}}).ready,false);
 assert.equal(walletUiState({wallet:payer,networkVerified:true,
  session:{address:payer,csrf:"test"}}).status,"authenticated");
 assert.equal(connectedStatus({wallet:payer,networkKnown:false}).allowFinancialActions,false);
 assert.equal(normalizeApiState({loading:true}).status,"loading");
 assert.equal(normalizeApiState({error:"Offline"}).status,"unavailable");
 assert.equal(normalizeApiState({data:{ok:true}}).status,"loaded");
 assert.equal(displayCount(null),"Unavailable");
 assert.equal(displayCount(0),"0");
 assert.equal(displayCount(50,{capped:true}),"50+");
});
test("M8 native 9-decimal atomic AMA formatting cannot silently round or convert currencies",()=>{
 assert.equal(formatAtomicAMA("1"),"0.000000001");
 assert.equal(formatAtomicAMA("1000000000"),"1");
 assert.equal(formatAtomicAMA("1234567890"),"1.23456789");
 assert.equal(formatAtomicAMA("100000000000"),"100");
 for(const bad of ["1.4","-1","1e3","00"," 1 ","USDG",""]){
  assert.throws(()=>formatAtomicAMA(bad),/Invalid native AMA/);
 }
});
test("M8 labels finalized only with exact matching M4 persisted independent evidence",()=>{
 const row={status:"finalized",intent,execution:execution()};
 const valid=normalizeNativeReceipt(row);
 assert.equal(valid.independentlyVerified,true);assert.equal(valid.tone,"verified");
 assert.equal(valid.observedReceipt.finality,"finalized");
 assert.equal(valid.hash,hash(23));assert.equal(valid.entryHash,hash(29));
 assert.equal(valid.safeToRebroadcast,false);
 const cases=[
  {receipt:receipt({txHash:hash(10)})},
  {receipt:receipt({payer:recipient})},
  {receipt:receipt({recipient:payer})},
  {receipt:receipt({amountUnits:"111"})},
  {receipt:receipt({executionSuccess:false})},
  {receipt:receipt({asset:"GBP"})},
  {receipt:receipt({method:"approve"})},
  {receipt:receipt({finality:"confirmed"})},
  {receipt:receipt({network:"amadeus-mainnet"})},
  {verified_at:null},{receipt:null}
 ];
 for(const patch of cases){
  const altered=normalizeNativeReceipt({status:"finalized",intent,execution:execution(patch)});
  assert.equal(altered.independentlyVerified,false,JSON.stringify(patch));
  assert.equal(altered.tone,"warning");
  assert.equal(altered.observedReceipt,null);
 }
 const json=normalizeNativeReceipt({status:"finalized",intent,execution:execution({
  receipt:JSON.stringify(JSON.stringify(receipt()))
 })});
 assert.equal(json.independentlyVerified,true);
});
test("M8 pending, uncertain, observed, disputed, failed and no-execution states never equal settlement",()=>{
 for(const status of ["reserved","pending","uncertain","confirmed","failed","disputed"]){
  const row=normalizeNativeReceipt({status,intent,execution:execution({status})});
  assert.equal(row.independentlyVerified,false,status);
  assert.equal(row.safeToRebroadcast,false);
  assert.notEqual(row.tone,"verified");
 }
 assert.equal(normalizeNativeReceipt({status:"not_submitted",intent}).verified,false);
 assert.equal(normalizeNativeReceipt({status:"uncertain",intent,execution:execution({status:"uncertain"})}).label.includes("do not rebroadcast"),true);
});
test("M8 dashboard counts DB records, not estimated balances or fictitious on-chain flows",()=>{
 const records=[
  {status:"finalized",intent,execution:execution()},
  {status:"pending",intent,execution:execution({status:"pending",receipt:null})},
  {status:"finalized",intent,execution:execution({receipt:receipt({recipient:payer})})}
 ];
 const metrics=overviewMetrics({
  intents:[{status:"draft"},{status:"reviewed"},{status:"awaiting_wallet_signature"},{status:"cancelled"}],
  invoices:[{status:"unverified"},{status:"human_verified"}],
  executions:records,risks:[{active:true},{active:false}],
  policy:{version:7,paused:true}
 });
 assert.equal(metrics.intentCount,4);
 assert.equal(metrics.pendingHumanReview,3);
 assert.equal(metrics.invoiceCount,2);
 assert.equal(metrics.invoicesHumanReviewed,1);
 assert.equal(metrics.transfersWithVerifiedFinality,1);
 assert.equal(metrics.transfersPendingEvidence,1);
 assert.equal(metrics.transfersDisputedOrFailed,1);
 assert.equal(metrics.openManualRiskHolds,1);
 assert.equal(metrics.policyState,"emergency_paused");
 assert.equal(metrics.walletBalance,null);
 assert.equal(metrics.noFiatSettlementClaim,true);
 assert.equal(metrics.noAutonomousSigning,true);
 const empty=overviewMetrics();
 assert.equal(empty.transfersWithVerifiedFinality,0);
 assert.equal(empty.policyState,"unavailable");
 assert.equal(empty.walletBalanceEvidence.includes("Not queried"),true);
});
test("M8 application navigation, visible accessible state and honest UI are statically enforced",()=>{
 const source=readFileSync(new URL("../src/AmadeusWorkspace.jsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../src/amadeus-experience.css",import.meta.url),"utf8");
 const receipts=readFileSync(new URL("../src/AmadeusReceiptsPanel.jsx",import.meta.url),"utf8");
 const overview=readFileSync(new URL("../src/AmadeusExperiencePanel.jsx",import.meta.url),"utf8");
 const root=readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
 assert.match(source,/aria-label="Amadeus Testnet workspace sections"/);
 assert.match(source,/href="#ama-m8-content"/);
 assert.match(source,/onKeyDown=\{event=>keyNavigate/);
 assert.match(source,/onNetworkVerification=\{onNetworkVerification\}/);
 assert.match(source,/read\("balance"/);
 assert.match(source,/active==="governance"/);
 assert.match(source,/active==="payments"/);
 assert.match(source,/active==="invoices"/);
 assert.match(source,/active==="agent"/);
 assert.match(source,/active==="receipts"/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
 assert.match(receipts,/aria-live="polite"/);
 assert.match(receipts,/safeToRebroadcast|never broadcast|Never rebroadcast|never rebroadcast|No signed/i);
 assert.match(overview,/No fabricated payments/);
 assert.match(root,/<AmadeusWorkspace seed=\{amaSeed\}/);
 assert.doesNotMatch(source,/signTransaction\(|transaction\.submit\(|fetch\([^)]*execution-submit/);
 assert.doesNotMatch(receipts,/transaction\.submit\(|signTransaction\(/);
 const m4=readFileSync(new URL("../api/_lib/v3-execution-handler.js",import.meta.url),"utf8");
 assert.match(m4,/AMA_M4_ENABLE_BROADCAST/);
 assert.match(m4,/AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED/);
 const m5=readFileSync(new URL("../api/_lib/v3-agent-core.js",import.meta.url),"utf8");
 assert.doesNotMatch(m5,/ama\.transaction\.sign|ama\.payment\.approve/);
 const m6=readFileSync(new URL("../api/_lib/v3-invoice-store.js",import.meta.url),"utf8");
 assert.match(m6,/ama_v3_m6_immutable_events/);
 const m7=readFileSync(new URL("../api/_lib/v3-governance-store.js",import.meta.url),"utf8");
 assert.match(m7,/ama_v3_m7_immutable_events/);
});
