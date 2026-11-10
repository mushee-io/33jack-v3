/**
 * Authenticated M8 native Testnet overview/receipts. GET-only.
 * Never alters M3 intents, M4 signed-packet reservation or M7 policies.
 */
import {parseCookie,hashSecret,validOrigin} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
import {experienceSnapshot} from "./v3-experience-store.js";
const OPS=new Set(["ux-overview","ux-receipts"]);
function respond(res,status,data){return res.status(status).json(data)}
export default async function experienceHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!OPS.has(op))return respond(res,404,{ok:false,error:"Unsupported native Testnet UX endpoint"});
 if(req.method!=="GET")return respond(res,405,{ok:false,error:"This dashboard only supports read-only GET"});
 try{
  // Only the supported query keys are accepted; no model/network override.
  const query=req.query||{};
  if(Object.keys(query).some(k=>!["operation","workspaceId"].includes(k)))
   throw new PaymentError(400,"Unsupported UX query parameter; no override of wallet or network");
  const host=String(req.headers?.host||"");
  const wrapped=!req.headers?.origin?{...req,headers:{...req.headers,
   origin:(/^localhost(?::\d+)?$/.test(host)?"http://":"https://")+host}}:req;
  const origin=validOrigin(wrapped);
  const cookie=parseCookie(req);
  if(cookie.length<36)throw new PaymentError(401,"Native wallet authentication required");
  const session=await getSession(hashSecret(cookie));
  if(!session||session.origin!==origin)
   throw new PaymentError(401,"Native wallet session expired or wrong origin");
  const workspaceId=assertWorkspaceId(query.workspaceId);
  const data=await experienceSnapshot({workspaceId,actor:session.address});
  if(op==="ux-receipts")return respond(res,200,{ok:true,network:data.network,
   workspaceId:data.workspaceId,records:data.receiptRows,capped:data.countsCapped.executions,
   verifiedOnlyFromM4:true,updatedAt:data.updatedAt,caveat:data.caveat});
  return respond(res,200,{ok:true,network:data.network,workspaceId:data.workspaceId,
   role:data.role,summary:data.summary,countsCapped:data.countsCapped,
   source:data.source,updatedAt:data.updatedAt,caveat:data.caveat,
   liveWalletBalanceQueried:false,liveChainQueried:false});
 }catch(error){
  if(error instanceof PaymentError)return respond(res,error.status,{ok:false,error:error.message});
  if(/origin|cross-site/i.test(String(error?.message||"")))
   return respond(res,403,{ok:false,error:"Native wallet session origin mismatch"});
  return respond(res,503,{ok:false,error:"Read-only Testnet dashboard unavailable; no financial action was taken"});
 }
}
