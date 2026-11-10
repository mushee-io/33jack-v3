/** M10 Testnet demo preparation: authenticated read-only endpoints only. */
import {validOrigin,parseCookie,hashSecret} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError} from "./v3-payment-core.js";
import {testnetDemoReadiness} from "./v3-demo-store.js";
const OPS=new Set(["demo-readiness","demo-grant-export"]);
const reply=(res,status,data)=>res.status(status).json(data);
export default async function demoHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'");
 if(!OPS.has(op))return reply(res,404,{ok:false,error:"Unknown M10 operation"});
 if(req.method!=="GET")return reply(res,405,{ok:false,error:"M10 export is read-only GET"});
 try{
  const h=String(req.headers?.host||"");
  const origin=validOrigin(!req.headers?.origin?{
   ...req,headers:{...req.headers,origin:(/^localhost(?::\d+)?$/.test(h)?"http://":"https://")+h}
  }:req);
  const token=parseCookie(req);
  if(token.length<36)throw new PaymentError(401,"Native AMA wallet login required");
  const session=await getSession(hashSecret(token));
  if(!session||session.origin!==origin)
   throw new PaymentError(401,"M2 wallet session revoked or wrong-origin");
  const args=req.query||{};
  if(Object.keys(args).some(k=>!["operation","workspaceId"].includes(k)))
   throw new PaymentError(400,"M10 export does not accept transaction hashes, wallet keys, alternate networks or identity overrides");
  const data=await testnetDemoReadiness({workspaceId:args.workspaceId,actor:session.address});
  if(op==="demo-readiness"){
   return reply(res,200,{ok:true,...data});
  }
  // A minimal, owner-only safe export: no invoice contents, raw wallet addresses,
  // payment hashes, raw signed packets, mutable operator claims or private keys.
  return reply(res,200,{ok:true,network:data.network,
   manifest:data.grantSnapshot,checklist:data.manualChecklist,
   disclaimer:"No real funded two-wallet proof or security audit is claimed"});
 }catch(e){
  if(e instanceof PaymentError)return reply(res,e.status,{ok:false,error:e.message});
  const message=String(e?.message||"");
  if(/Origin|origin|cross-site/.test(message))
   return reply(res,403,{ok:false,error:"Wallet session origin check failed"});
  if(/snapshot|evidence|commitment|M10/.test(message))
   return reply(res,503,{ok:false,error:"M10 source evidence cannot be safely exported"});
  return reply(res,503,{ok:false,error:"M10 native Testnet evidence unavailable; no transaction was performed"});
 }
}
