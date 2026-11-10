import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 M7_DEFAULTS,M7_EXTERNAL_COMPLIANCE,M7_RISK_KINDS,positiveAtomic,
 strictPolicyPatch,humanRiskClassification,assertFinancialPolicy,
 canonicalAuditHash,verifyAuditRows,validateRiskFlag
} from "../api/_lib/v3-governance-core.js";
const owner="maker-native-wallet",checker="independent-checker";
const workspaceId="123e4567-e89b-42d3-a456-426614174000";
const basic={workspace_id:workspaceId,network:"amadeus-testnet",asset:"AMA",
 payer:owner,recipient:"native-recipient",amount_units:"3000000000",
 invoice_ref:"INV-3",terms_hash:"a".repeat(64),created_by:owner,approved_by:checker};
const policy={...M7_DEFAULTS,workspace_id:workspaceId,version:3,paused:false,
 max_payment_units:"100000000000",daily_units:"500000000000",high_risk_units:"1000000000",
 enforce_two_person:true};
const seal={policy_version:3,terms_hash:basic.terms_hash,payer:owner,approver:checker};
test("M7 rejects unsafe limits, weakened controls and unknown policy fields",()=>{
 assert.equal(positiveAtomic("1000000000","units"),1000000000n);
 for(const amount of ["-1","0","1e9","1.0"," 1","010","999999999999999999999999999"])
  assert.throws(()=>positiveAtomic(amount,"units"),/exact|exceeds/);
 assert.deepEqual(strictPolicyPatch({highRiskUnits:"1000000000"}),{highRiskUnits:"1000000000"});
 assert.throws(()=>strictPolicyPatch({enforceTwoPersonHighRisk:false}),/cannot be disabled/);
 assert.throws(()=>strictPolicyPatch({mainnet:true}),/bounded/);
 assert.throws(()=>strictPolicyPatch({unlimitedTransfers:true}),/bounded/);
 assert.equal(M7_DEFAULTS.network,"amadeus-testnet");
 assert.equal(M7_EXTERNAL_COMPLIANCE.kyc,"not_integrated");
 assert.equal(M7_EXTERNAL_COMPLIANCE.aml,"not_integrated");
});
test("M7 forces distinct high-risk checker and sealed policy at execution",()=>{
 assert.equal(humanRiskClassification(basic,[],policy).highRisk,true);
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy,flags:[],actor:owner,action:"approve"}),/separate maker/);
 assert.doesNotThrow(()=>assertFinancialPolicy({intent:basic,policy,flags:[],actor:checker,action:"approve"}));
 assert.doesNotThrow(()=>assertFinancialPolicy({intent:basic,policy,flags:[],actor:owner,action:"execute",approvalSeal:seal}));
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy:{...policy,version:4},flags:[],actor:owner,action:"execute",approvalSeal:seal}),/policy changed/);
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy,flags:[],actor:owner,action:"execute",approvalSeal:null}),/seal missing/);
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy,flags:[],actor:owner,action:"execute",approvalSeal:{...seal,terms_hash:"b"}}),/policy changed/);
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy,flags:[],actor:owner,action:"execute",approvalSeal:{...seal,approver:owner}}),/policy changed/);
 assert.throws(()=>assertFinancialPolicy({intent:{...basic,approved_by:owner},policy,flags:[],actor:owner,action:"execute",approvalSeal:{...seal,approver:owner}}),/maker-checker/);
});
test("M7 emergency pause and active manual-risk flags fail closed",()=>{
 const hold=[{kind:"manual_risk_hold",active:true}];
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy:{...policy,paused:true},flags:[],actor:checker,action:"approve"}),/Emergency pause/);
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy,flags:hold,actor:checker,action:"approve"}),/Active compliance risk hold/);
 assert.throws(()=>assertFinancialPolicy({intent:basic,policy,flags:hold,actor:owner,action:"execute",approvalSeal:seal}),/Active compliance risk hold/);
 assert.throws(()=>assertFinancialPolicy({intent:{...basic,network:"amadeus-mainnet"},policy,actor:owner,action:"approve"}),/native AMA Testnet/);
 assert.throws(()=>assertFinancialPolicy({intent:{...basic,amount_units:"101000000000"},policy,actor:checker,action:"approve"}),/limit/);
 const low={...basic,amount_units:"1000000000"};
 assert.equal(humanRiskClassification(low,[],policy).requiresDistinctChecker,false);
 assert.doesNotThrow(()=>assertFinancialPolicy({intent:low,policy,flags:[],actor:owner,action:"approve"}));
});
test("M7 hash-chained audit is verifiable, altered or missing events are detected",()=>{
 const at1="2026-11-10T08:00:00.000Z",at2="2026-11-10T08:05:00.000Z",zero="0".repeat(64);
 const d1={maxPaymentUnits:"30000000000",version:2};
 const d2={confirmedBy:checker};
 const first=canonicalAuditHash({workspaceId,previousHash:zero,event:"m7_policy_updated",actor:owner,entityId:workspaceId,details:d1,timestamp:at1});
 const second=canonicalAuditHash({workspaceId,previousHash:first,event:"m7_resume_confirmed",actor:checker,entityId:workspaceId,details:d2,timestamp:at2});
 const rows=[
 {id:"1",previous_hash:zero,event_hash:first,event:"m7_policy_updated",actor:owner,entity_id:workspaceId,details:JSON.stringify(d1),occurred_at:at1},
 {id:"2",previous_hash:first,event_hash:second,event:"m7_resume_confirmed",actor:checker,entity_id:workspaceId,details:JSON.stringify(d2),occurred_at:at2}
 ];
 assert.equal(verifyAuditRows(rows,workspaceId).valid,true);
 assert.equal(verifyAuditRows(rows,workspaceId).checked,2);
 assert.equal(verifyAuditRows([rows[0],{...rows[1],previous_hash:zero}],workspaceId).valid,false);
 assert.equal(verifyAuditRows([rows[0],{...rows[1],details:'{"confirmedBy":"fake"}'}],workspaceId).valid,false);
 assert.equal(verifyAuditRows([rows[1]],workspaceId).valid,false);
});
test("M7 manual risk reports are explicit, bounded and not sanctions screening",()=>{
 const r=validateRiskFlag({kind:"suspected_duplicate_invoice",invoiceRef:"INV-3",
  reason:"Supplier submitted the same invoice reference twice."});
 assert.equal(r.reasonHash.length,64);
 assert.match(r.reasonSummary,/Human-submitted/);
 assert.equal(M7_RISK_KINDS.includes("possible_sanctions_match_unverified"),true);
 assert.throws(()=>validateRiskFlag({kind:"kyc_verified",reason:"Legal check completed"}),/Unknown/);
 assert.throws(()=>validateRiskFlag({kind:"manual_risk_hold",invoiceRef:"=cmd",reason:"Suspicious invoice"}),/Invalid risk/);
 assert.throws(()=>validateRiskFlag({kind:"manual_risk_hold",invoiceRef:"INV",reason:"short"}),/requires/);
});
test("M7 cannot introduce transaction signing, model-accessible governance or mainnet",()=>{
 const path=new URL("../api/_lib/v3-governance-handler.js",import.meta.url);
 const src=readFileSync(path,"utf8");
 assert.doesNotMatch(src,/\.transaction\.submit\(|signTransaction\(|submitAndWait\(|reserveSignedExecution\(/);
 assert.match(src,/governance-pause/);
 const agent=readFileSync(new URL("../api/_lib/v3-agent-core.js",import.meta.url),"utf8");
 assert.doesNotMatch(agent,/ama\.governance\.pause|ama\.payment\.approve/);
 const main=readFileSync(new URL("../api/_lib/v3-execution-handler.js",import.meta.url),"utf8");
 assert.match(main,/AMA_M4_ENABLE_BROADCAST/);
 assert.match(main,/AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED/);
});
