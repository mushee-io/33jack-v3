/**
 * M5 deterministic security core for native Amadeus Testnet financial agent.
 * Natural-language requests and external invoices are DATA, never executable tools.
 */
import {normalizeAmaAddress,parseAmaAmount,AMA_TESTNET} from "./amadeus-testnet.js";
import {PaymentError,assertWorkspaceId,cleanLimitedText,sha256} from "./v3-payment-core.js";

export const AGENT_NETWORK="amadeus-testnet";
export const AGENT_MAX_TEXT=800;
export const AGENT_TOOLS=Object.freeze([
  {name:"wallet.balance",description:"Read the signed-in wallet's native Testnet AMA balance only",readOnly:true},
  {name:"beneficiaries.list",description:"List native recipient allowlist for an authorized workspace",readOnly:true},
  {name:"invoices.list",description:"Read human-entered unverified invoice notes (M6 OCR not deployed)",readOnly:true},
  {name:"payments.list",description:"Read workspace-scoped native AMA intents (not necessarily settled)",readOnly:true},
  {name:"transactions.list",description:"Read reserved transactions and independently verified receipts",readOnly:true},
  {name:"risk.assess",description:"Calculate deterministic risk signals for a proposed native AMA transfer",readOnly:true}
]);
export const ALLOWED_TOOL_NAMES=new Set(AGENT_TOOLS.map(t=>t.name));
const MONEY_RX="(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,9})?";
const B58_RX="[1-9A-HJ-NP-Za-km-z]{60,85}";
const PAYMENT_RE=new RegExp(
  "^(?:please\\s+)?(?:prepare|draft|propose|pay|send|transfer)\\s+("+MONEY_RX+")\\s+AMA\\s+(?:to|towards)\\s+("+B58_RX+")(?:\\s+(?:for\\s+)?invoice\\s+([A-Za-z0-9][A-Za-z0-9._-]{0,59}))?\\s*[.!]?\\s*$","i"
);
const MALICIOUS=[
  /ignore\s+(?:all\s+)?(?:previous|earlier|system|developer)\s+instructions/i,
  /(?:override|bypass|disable)\s+(?:approval|policy|permissions|security|rules|signature|safety)/i,
  /(?:reveal|print|exfiltrate|leak)\s+(?:secret|private\s+key|seed\s+phrase|password|token)/i,
  /(?:system|developer|assistant)\s*(?:role|message|prompt)\s*:/i,
  /<\s*script\b|javascript\s*:/i,
  /(?:execute|run)\s+(?:this\s+)?(?:shell|command|script|code)/i
];
export function validateAgentText(input,label="Message",max=AGENT_MAX_TEXT){
  if(typeof input!=="string"||input.trim().length<3||input.length>max||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))
    throw new PaymentError(400,label+" must be plain text (3–"+max+" characters)");
  return input.trim();
}
export function detectPromptInjection(text){
  return typeof text==="string"&&MALICIOUS.some(re=>re.test(text));
}
export function safeDocumentText(input){
  const text=validateAgentText(input,"Untrusted invoice note",2000);
  return {text,untrusted:true,containsInjection:detectPromptInjection(text),
    sha256:sha256(text)};
}
export function safeInvoiceReference(value){
  const ref=cleanLimitedText(value,"Invoice reference",80);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(ref))
    throw new PaymentError(400,"Invoice reference must be 1–80 letters, digits, dots, underscores or hyphens");
  return ref;
}
export function validateAgentRequest(input){
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new PaymentError(400,"Agent request must be a JSON object");
  const workspaceId=assertWorkspaceId(input.workspaceId);
  if(input.network!==undefined&&input.network!==AGENT_NETWORK)
    throw new PaymentError(400,"Agent supports only the Amadeus Testnet");
  const message=validateAgentText(input.message);
  if(input.payer||input.privateKey||input.seed||input.txPacked||input.signature||
     input.autonomous===true||input.autoApprove===true||input.autoSign===true||
     input.autoBroadcast===true||input.chainId||input.fiatRoute)
    throw new PaymentError(403,"Agent cannot impersonate a payer, sign, approve or broadcast");
  return {workspaceId,network:AGENT_NETWORK,message};
}
export function parseNaturalPaymentProposal(text){
  const message=validateAgentText(text);
  if(detectPromptInjection(message))return null;
  const m=PAYMENT_RE.exec(message);
  if(!m)return null;
  try{
    const amountUnits=parseAmaAmount(m[1]);const recipient=normalizeAmaAddress(m[2]);
    return Object.freeze({asset:"AMA",network:AMA_TESTNET.id,
      amount:m[1],atomicUnits:amountUnits,recipient,
      invoiceRef:m[3]||"",kind:"unsigned_payment_suggestion",
      autonomous:false,canSign:false,canApprove:false,canBroadcast:false,
      requiresHumanPreparation:true,requiresHumanReview:true,
      description:"Candidate only; manually create a new M3 payment intent to proceed."});
  }catch{return null}
}
export function buildRiskReport({proposal=null,beneficiaries=[],invoices=[],intents=[],transactions=[],balanceAvailable=false}){
  const flags=[];let score=0;
  const flag=(code,weight,description)=>{flags.push({code,severity:weight>=40?"critical":weight>=20?"high":weight>=10?"medium":"low",description});score+=weight};
  if(!proposal){flag("NO_STRICT_NATIVE_TRANSFER",20,"No complete, exact native AMA Testnet transfer was parsed");}
  else{
    const b=beneficiaries.find(x=>x.address===proposal.recipient);
    if(!b){flag("RECIPIENT_NOT_ALLOWLISTED",45,"Recipient has not been allowlisted by an owner/admin");}
    else if(b.status!=="allowed"){flag("RECIPIENT_BLOCKED",60,"Recipient is blocked by organization policy");}
    else if(Number(b.version)>1){flag("BENEFICIARY_CHANGED",15,"Beneficiary policy was changed; new review is required");}
    if(BigInt(proposal.atomicUnits)>10_000_000_000n)
      flag("HIGH_AMOUNT",15,"Proposed amount exceeds ten AMA; human review required");
    if(proposal.invoiceRef){
      const match=invoices.find(x=>(x.invoice_ref??x.invoiceRef)===proposal.invoiceRef);
      if(!match)flag("INVOICE_NOT_FOUND",15,"No matching workspace invoice note is available");
      else {
        if(match.contains_injection||match.containsInjection)
          flag("UNTRUSTED_INVOICE_INJECTION",35,"Invoice text contains instructions that must not control the agent");
        if((match.source_status??match.source)!=="manually_entered_unverified")
          flag("UNKNOWN_INVOICE_SOURCE",15,"Invoice source provenance is not trusted");
        if(match.recipient&&match.recipient!==proposal.recipient)
          flag("INVOICE_RECIPIENT_MISMATCH",40,"Recipient differs from human-entered invoice notes");
        if((match.amount_units??match.amountUnits)&&String(match.amount_units??match.amountUnits)!==proposal.atomicUnits)
          flag("INVOICE_AMOUNT_MISMATCH",40,"Amount differs from human-entered invoice notes");
      }
    }
    const duplicate=intents.some(x=>x.recipient===proposal.recipient&&
      String(x.atomicUnits??x.amount_units)===proposal.atomicUnits&&
      !["cancelled","expired"].includes(x.status));
    if(duplicate)flag("POSSIBLE_DUPLICATE",25,"Similar active or historical payment intent exists");
  }
  if(!balanceAvailable)flag("BALANCE_UNVERIFIED",10,"Live native AMA Testnet balance was not independently retrieved");
  if(transactions.some(x=>["uncertain","disputed"].includes(x.status)))
    flag("UNRESOLVED_PAYMENT",20,"Workspace has an uncertain or disputed Testnet execution");
  score=Math.min(100,score);
  return Object.freeze({score,category:score>=60?"critical":score>=30?"high":score>=10?"review":"low",
    flags,decision:"human_review_required",canApprove:false,canSign:false,
    canBroadcast:false,assessment:"Deterministic policy warnings, not a KYC/AML check or a payment authorization."});
}
export function assertAgentTool(name){
  if(typeof name!=="string"||!ALLOWED_TOOL_NAMES.has(name))
    throw new PaymentError(403,"Tool not available; payment approval, signing and broadcasting are forbidden");
  return name;
}
export function agentTaskFingerprint({workspaceId,actor,message}){
  return sha256(JSON.stringify({workspaceId,actor,network:AGENT_NETWORK,message}));
}
export function noModelPrivilege(output){
  if(!output||typeof output!=="object")throw new PaymentError(400,"Agent explanation must be structured");
  const explanation=typeof output.explanation==="string"?output.explanation.trim():"";
  if(explanation.length<5||explanation.length>1500)throw new PaymentError(400,"Invalid AI explanation length");
  return {explanation:explanation.slice(0,1500)}; // NEVER return model tool calls or financial directives.
}
