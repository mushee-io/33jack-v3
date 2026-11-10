/**
 * M9 human/operator acceptance endpoint. No private-key handling or funds movement.
 * Official RPC may only be queried for an ALREADY RESERVED M4 transaction hash.
 */
import {validOrigin,parseCookie,hashSecret,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
import {agentRateEvent} from "./v3-agent-store.js";
import {acceptanceReadiness,acceptanceWitness,acceptanceReports,
 acceptanceAudit,ACCEPTANCE_MATRIX,ACCEPTANCE_LIMITATIONS} from "./v3-acceptance-store.js";
const GET=new Set(["acceptance-matrix","acceptance-status","acceptance-reports","acceptance-audit"]);
const POST=new Set(["acceptance-witness"]);
function respond(res,status,data){return res.status(status).json(data)}
async function authenticated(req,mutation){
 const host=String(req.headers?.host||"");
 const origin=validOrigin(!mutation&&!req.headers?.origin?{
  ...req,headers:{...req.headers,origin:(/^localhost(?::\d+)?$/.test(host)?"http://":"https://")+host}
 }:req);
 const token=parseCookie(req);
 if(token.length<36)throw new PaymentError(401,"Authenticated native Testnet owner/admin session required");
 const session=await getSession(hashSecret(token));
 if(!session||session.origin!==origin)
  throw new PaymentError(401,"Native wallet session invalid, expired or wrong origin");
 if(mutation){
  requireCsrf(req,session);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
   throw new PaymentError(415,"Acceptance witness requires JSON content type");
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   throw new PaymentError(400,"M9 acceptance expects a JSON object");
 }
 return {actor:session.address,origin};
}
export default async function acceptanceHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!GET.has(op)&&!POST.has(op))
  return respond(res,404,{ok:false,error:"M9 acceptance operation unavailable"});
 const mutate=POST.has(op);
 if((mutate&&req.method!=="POST")||(!mutate&&req.method!=="GET"))
  return respond(res,405,{ok:false,error:"M9 acceptance operation uses the declared HTTP method only"});
 try{
  const {actor,origin}=await authenticated(req,mutate);
  const args=mutate?req.body:req.query||{};
  const allowed=mutate?["workspaceId","intentId"]:["operation","workspaceId","intentId"];
  if(Object.keys(args).some(key=>!allowed.includes(key)))
   throw new PaymentError(400,"M9 will not accept payment terms, signed packets, keys, arbitrary RPC or manual proof claims");
  const workspaceId=assertWorkspaceId(args.workspaceId);
  if(op==="acceptance-matrix"){
   // Authenticate owner/admin before revealing private acceptance criteria.
   await acceptanceReports({workspaceId,actor});
   return respond(res,200,{ok:true,network:"amadeus-testnet",
    matrix:ACCEPTANCE_MATRIX,limitations:ACCEPTANCE_LIMITATIONS,
    note:"Real two-wallet and independent external security acceptance remain unverified"});
  }
  if(op==="acceptance-reports"){
   const reports=await acceptanceReports({workspaceId,actor});
   return respond(res,200,{ok:true,network:"amadeus-testnet",reports});
  }
  if(op==="acceptance-audit"){
   const audit=await acceptanceAudit({workspaceId,actor});
   return respond(res,200,{ok:true,audit});
  }
  const intentId=assertIntentId(args.intentId);
  if(op==="acceptance-status"){
   return respond(res,200,{ok:true,...await acceptanceReadiness({workspaceId,intentId,actor,origin})});
  }
  if(op==="acceptance-witness"){
   await agentRateEvent({workspaceId,actor,event:"m9_witness",input:workspaceId+":"+intentId,limit:5});
   const result=await acceptanceWitness({workspaceId,intentId,actor,origin});
   return respond(res,200,{ok:true,...result});
  }
  return respond(res,404,{ok:false,error:"Unknown M9 acceptance operation"});
 }catch(e){
  if(e instanceof PaymentError)return respond(res,e.status,{ok:false,error:e.message});
  const message=String(e?.message||"");
  if(/CSRF|Origin|origin|cross-site|Same-origin/.test(message))
   return respond(res,403,{ok:false,error:"M2 wallet origin or CSRF validation failed"});
  return respond(res,503,{ok:false,error:"M9 acceptance evidence unavailable; no financial action performed and no settlement claimed"});
 }
}
