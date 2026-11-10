/**
 * M5: bounded, deterministic Amadeus Testnet financial-agent policy.
 * User prompts, invoice fields, AI model output and remote MCP/A2A messages are DATA.
 * Only a human may create M3 payment intents, approve terms, sign or broadcast.
 */
import {normalizeAmaProposal,AMA_TESTNET} from "./amadeus-testnet.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
export const AGENT_TOOLS=Object.freeze([
 {name:"ama.wallet.balance",description:"Read authenticated wallet native AMA Testnet balance",action:"read",permission:"workspace:read"},
 {name:"ama.beneficiaries.list",description:"List organization recipient status without mutations",action:"read",permission:"beneficiary:read"},
 {name:"ama.invoices.list",description:"Read unverified, user-entered invoice reference records",action:"read",permission:"invoice:read"},
 {name:"ama.invoices.get",description:"Read one organization-scoped unverified invoice reference",action:"read",permission:"invoice:read"},
 {name:"ama.intents.list",description:"Read organization-scoped signed-owner payment proposals",action:"read",permission:"payment:read"},
 {name:"ama.intents.get",description:"Read one scoped immutable payment intent and approval status",action:"read",permission:"payment:read"},
 {name:"ama.executions.status",description:"Read reserved payment status, never trigger broadcast or polling",action:"read",permission:"payment:read"},
 {name:"ama.risk.summary",description:"Explain deterministic risks using authorized organization snapshots",action:"read",permission:"workspace:read"}
]);
export const AGENT_NAMES=Object.freeze(AGENT_TOOLS.map(x=>x.name));
const TOOL_INDEX=new Map(AGENT_TOOLS.map(x=>[x.name,x]));
export function allowedTool(name){
 if(typeof name!=="string"||!TOOL_INDEX.has(name))
   throw new PaymentError(403,"Agent tool is not permitted; payment authorization and signing are human-only");
 return TOOL_INDEX.get(name);
}
export function normalizeAgentText(input,{max=1200}={}){
 if(typeof input!=="string"||!input.trim()||input.length>max||
   /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(input))
  throw new PaymentError(400,"Invalid or excessively long agent request");
 const cleaned=input.normalize("NFKC").trim();
 if(/(?:ignore|override|bypass|disable)\s+(?:all\s+|your\s+|the\s+)?(?:previous|above|safety|security|system|developer|approval|permission|instructions|policies)/i.test(cleaned)||
    /(?:<\|im_start\|>|<system>|<\/system>|^\s*(?:system|developer)\s*:)/im.test(cleaned)||
    /(?:private\s*key|seed\s*phrase|mnemonic|wallet\s*secret|sign\s*for\s*me|approve\s*for\s*me|broadcast\s*without|send\s*funds\s*without)/i.test(cleaned))
   throw new PaymentError(400,"Prompt-injection or prohibited financial-action request blocked");
 return cleaned;
}
export function parseNaturalPayment(text,{wallet,beneficiaries=[]}={}){
 const cleaned=normalizeAgentText(text);
 const pattern=/^(?:please\s+)?(?:prepare|draft|propose)\s+(?:an?\s+)?(?:ama\s+)?payment\s+of\s+((?:0|[1-9]\d{0,11})(?:\.\d{1,9})?)\s+AMA\s+to\s+([1-9A-HJ-NP-Za-km-z]{60,85})(?:\s+for\s+invoice\s+([A-Za-z0-9/_-]{2,90}))?\.?$/i;
 const match=cleaned.match(pattern);
 if(!match)return {recognized:false,reason:"Use: Prepare payment of 0.01 AMA to [native Amadeus address] for invoice INV-123"};
 const p=normalizeAmaProposal({payer:wallet,recipient:match[2],amount:match[1],token:"AMA",network:AMA_TESTNET.id});
 const b=beneficiaries.find(row=>row.address===p.recipient);
 const ready=b?.status==="allowed";
 return {
  recognized:true,readyForHumanDraft:ready,network:AMA_TESTNET.id,asset:"AMA",
  payer:p.payer,recipient:p.recipient,amount:p.amount,amountUnits:p.amountUnits,
  invoiceRef:match[3]||"",beneficiaryStatus:b?.status||"not_allowlisted",
  beneficiaryVersion:ready?Number(b.version):null,
  nextStep:ready?"Copy these details into M3; a human must create and explicitly review the intent":
   "Owner/admin must independently allowlist recipient before any M3 draft can be created",
  walletSignatureRequested:false,humanAuthorizationRequired:true,
  intentCreated:false,chainSubmission:false
 };
}
export function deterministicRisk({balances=null,beneficiaries=[],invoices=[],intents=[],executions=[]}={}){
 const issues=[];
 const blocked=beneficiaries.filter(x=>x.status!=="allowed").length;
 if(blocked)issues.push({code:"blocked_recipients",severity:"medium",count:blocked,
   explanation:"At least one recipient is blocked; never propose their payment as ready"});
 const pending=executions.filter(x=>!["finalized","failed","disputed"].includes(x.status)).length;
 if(pending)issues.push({code:"unsettled_chain",severity:"high",count:pending,
   explanation:"A reserved transaction is not independently finalized; do not rebroadcast it"});
 const disputed=executions.filter(x=>x.status==="disputed").length;
 if(disputed)issues.push({code:"disputed_chain",severity:"high",count:disputed,
   explanation:"Observed chain data contradicts approved terms; manual review required"});
 const unverified=invoices.filter(x=>x.verification_status!=="verified").length;
 if(unverified)issues.push({code:"unverified_invoices",severity:"medium",count:unverified,
   explanation:"User-entered invoice records are not verified documents; confirm source before payment"});
 const awaiting=intents.filter(x=>x.status==="awaiting_wallet_signature").length;
 if(awaiting)issues.push({code:"awaiting_owner_signature",severity:"low",count:awaiting,
   explanation:"Human-approved intents are still unsigned until the owner signs in M4"});
 const knowledge=balances===null?"unavailable":"live_testnet_read";
 return {
  network:AMA_TESTNET.id,balancesEvidence:knowledge,issueCount:issues.length,
  flags:issues,highestSeverity:issues.some(x=>x.severity==="high")?"high":
    issues.some(x=>x.severity==="medium")?"medium":issues.length?"low":"none",
  isAdviceOnly:true,canAuthorize:false,canSign:false,canBroadcast:false
 };
}
export function strictAgentArgs(input={}){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new PaymentError(400,"Agent tool arguments must be an object");
 const workspaceId=assertWorkspaceId(input.workspaceId);
 const extras=Object.keys(input).filter(k=>!["workspaceId","id"].includes(k));
 if(extras.length)throw new PaymentError(400,"Agent read tools reject unrecognized or action parameters");
 if(input.id!==undefined&&(typeof input.id!=="string"||input.id.length>100))
   throw new PaymentError(400,"Invalid read-only record identifier");
 return {workspaceId,id:input.id};
}
export function responseEnvelope({tool,workspaceId,result,source}){
 allowedTool(tool);
 return {ok:true,protocol:"33jack-m5-read-only",network:AMA_TESTNET.id,
  tool,workspaceId,source,result,humanApprovalRequired:true,
  intentCreated:false,walletSigned:false,broadcasted:false};
}
