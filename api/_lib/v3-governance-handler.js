/**
 * M7 governance API: M2-authenticated, CSRF-protected, testnet-only controls.
 * No compliance provider/KYC integration, no signing or broadcasting endpoints.
 */
import {validOrigin,parseCookie,hashSecret,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
import {
 governanceDB,getPolicy,updatePolicy,emergencyPause,requestResume,confirmResume,
 reportRisk,closeRisk,readRisks,reportIncident,readIncidents,auditEvidence
} from "./v3-governance-store.js";
import {agentRateEvent} from "./v3-agent-store.js";
const GET=new Set(["governance-policy","governance-risks","governance-incidents","governance-audit","governance-recovery"]);
const POST=new Set(["governance-policy-update","governance-pause","governance-resume-request",
 "governance-resume-confirm","governance-risk-report","governance-risk-close",
 "governance-incident-report"]);
function respond(res,status,body){return res.status(status).json(body)}
async function actorSession(req,mutate){
 const host=String(req.headers?.host||"");
 const wrapped=(!mutate&&!req.headers?.origin)?{...req,headers:{
  ...req.headers,origin:(/^localhost(?::\d+)?$/.test(host)?"http://":"https://")+host
 }}:req;
 const origin=validOrigin(wrapped),token=parseCookie(req);
 if(token.length<36)throw new PaymentError(401,"Native Amadeus Testnet wallet login required");
 const session=await getSession(hashSecret(token));
 if(!session||session.origin!==origin)throw new PaymentError(401,"Native Testnet session expired or revoked");
 if(mutate){
  requireCsrf(req,session);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
   throw new PaymentError(415,"JSON request content type required");
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   throw new PaymentError(400,"JSON object required");
 }
 return session.address;
}
async function recovery({workspaceId,actor}){
 const sql=await governanceDB();
 // Read permission checked in getPolicy and no chain RPC requests or writes.
 await getPolicy({workspaceId,actor});
 const rows=await sql.unsafe("SELECT e.intent_id,e.tx_hash,e.status,e.broadcast_attempts,e.created_at,e.checked_at,i.payer,i.recipient,i.amount_units FROM ama_v3_executions e JOIN ama_v3_payment_intents i ON i.id=e.intent_id WHERE e.workspace_id=$1 AND e.status IN ('reserved','uncertain','pending','confirmed','disputed','failed') ORDER BY e.created_at DESC LIMIT 50",[workspaceId]);
 return rows.map(x=>({intentId:x.intent_id,txHash:x.tx_hash,status:x.status,
  payer:x.payer,recipient:x.recipient,amountUnits:String(x.amount_units),
  broadcastAttempts:x.broadcast_attempts,lastChecked:x.checked_at,
  recovery:"Use separate authenticated M4 execution-reconcile. Never rebroadcast an uncertain or reserved signed packet.",
  fundsMoved:"not_asserted_by_M7"}));
}
export default async function governanceHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!GET.has(op)&&!POST.has(op))return respond(res,404,{ok:false,error:"Unknown M7 governance operation"});
 const mutation=POST.has(op);
 if((mutation&&req.method!=="POST")||(!mutation&&req.method!=="GET"))
  return respond(res,405,{ok:false,error:"M7 operation requires correct HTTP method"});
 try{
  const actor=await actorSession(req,mutation);
  const b=mutation?req.body:req.query;
  const workspaceId=assertWorkspaceId(b?.workspaceId);
  // Mandatory M2 membership and no default-global policy context.
  const policy=await getPolicy({workspaceId,actor});
  if(op==="governance-policy")return respond(res,200,{ok:true,policy});
  if(op==="governance-risks")return respond(res,200,{ok:true,
   risks:await readRisks({workspaceId,actor}),screening:"manual_flags_only"});
  if(op==="governance-incidents")return respond(res,200,{ok:true,
   incidents:await readIncidents({workspaceId,actor})});
  if(op==="governance-audit")return respond(res,200,{ok:true,
   audit:await auditEvidence({workspaceId,actor})});
  if(op==="governance-recovery")return respond(res,200,{ok:true,
   transactions:await recovery({workspaceId,actor}),independentChainEvidence:"not_queried_by_M7"});
  await agentRateEvent({workspaceId,actor,event:"m7_governance",input:op+JSON.stringify(b),limit:30});
  if(op==="governance-policy-update"){
   const updated=await updatePolicy({workspaceId,actor,
    expectedVersion:b.expectedVersion,patch:b.patch});
   return respond(res,200,{ok:true,policy:updated,warning:"M7 version changes invalidate earlier signed-payment approval seals"});
  }
  if(op==="governance-pause"){
   const updated=await emergencyPause({workspaceId,actor,reason:b.reason});
   return respond(res,200,{ok:true,policy:updated,
    warning:"New payment proposals, approvals and signing are halted. Existing on-chain transaction state must still be independently reconciled."});
  }
  if(op==="governance-resume-request"){
   const request=await requestResume({workspaceId,actor});
   return respond(res,201,{ok:true,request});
  }
  if(op==="governance-resume-confirm"){
   const updated=await confirmResume({workspaceId,actor,requestId:b.requestId});
   return respond(res,200,{ok:true,policy:updated,
    warning:"Separate authorized owner/admin confirmed resume. Stale financial approvals remain invalid."});
  }
  if(op==="governance-risk-report"){
   const risk=await reportRisk({workspaceId,actor,input:b});
   return respond(res,201,{ok:true,risk,screening:"human_report_only"});
  }
  if(op==="governance-risk-close"){
   const risk=await closeRisk({workspaceId,actor,id:b.id,reason:b.reason});
   return respond(res,200,{ok:true,risk,warning:"Closing a flag does not restore invalidated financial approval seals"});
  }
  if(op==="governance-incident-report"){
   const incident=await reportIncident({workspaceId,actor,severity:b.severity,
    kind:b.kind,detail:b.detail,txHash:b.txHash});
   return respond(res,201,{ok:true,incident});
  }
  return respond(res,404,{ok:false,error:"M7 endpoint unavailable"});
 }catch(error){
  if(error instanceof PaymentError)return respond(res,error.status,{ok:false,error:error.message});
  const message=String(error?.message||"");
  if(/CSRF|Same-origin|origin|Origin|cross-site/.test(message))
   return respond(res,403,{ok:false,error:"Session origin or CSRF verification failed"});
  return respond(res,503,{ok:false,error:"M7 governance unavailable; no financial operation was performed"});
 }
}
