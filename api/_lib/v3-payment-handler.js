/**
 * M3: authenticated AMA Testnet payment-intent API. No submit/broadcast route.
 */
import {validOrigin,parseCookie,hashSecret,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertFeeUnsupported} from "./v3-payment-core.js";
import {createIntent,getIntent,listIntents,transitionIntent,updateBeneficiary,listBeneficiaries} from "./v3-payment-store.js";

const GET=new Set(["intent-get","intent-list","beneficiary-list"]);
const POST=new Set(["intent-create","intent-review","intent-approve","intent-cancel","beneficiary-set"]);
function result(res,code,body){return res.status(code).json(body)}
function sessionOrigin(req){
 const h=req.headers||{};
 if(req.method==="GET"&&!h.origin){
  const host=String(h.host||"");
  const scheme=/^localhost(?::\d+)?$/.test(host)?"http://":"https://";
  return validOrigin({...req,headers:{...h,origin:scheme+host}});
 }
 return validOrigin(req);
}
export default async function paymentHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!GET.has(op)&&!POST.has(op))return result(res,404,{ok:false,error:"Unknown M3 API operation"});
 if(GET.has(op)&&req.method!=="GET"||POST.has(op)&&req.method!=="POST")
  return result(res,405,{ok:false,error:"Unsupported HTTP method"});
 try{
  const origin=sessionOrigin(req);
  const token=parseCookie(req);
  if(token.length<36)throw new PaymentError(401,"Authenticated Amadeus wallet session required");
  const session=await getSession(hashSecret(token));
  if(!session||session.origin!==origin)throw new PaymentError(401,"Wallet session expired or revoked");
  if(POST.has(op)){
   requireCsrf(req,session);
   if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
    throw new PaymentError(415,"JSON content-type required");
   if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
    throw new PaymentError(400,"JSON request body required");
  }
  const actor=session.address;
  if(op==="beneficiary-list")
   return result(res,200,{ok:true,network:"amadeus-testnet",beneficiaries:await listBeneficiaries({workspaceId:req.query?.workspaceId,actor})});
  if(op==="beneficiary-set"){
   const row=await updateBeneficiary({workspaceId:req.body.workspaceId,actor,
    address:req.body.address,status:req.body.status,label:req.body.label||""});
   return result(res,200,{ok:true,network:"amadeus-testnet",beneficiary:row,
    warning:"Changes to an allowlisted recipient invalidate prior payment reviews."});
  }
  if(op==="intent-create"){
   for(const field of ["fiatCurrency","fxRate","fee","feeEstimate","stablecoin","chainId","transactionHash","txPacked"]){
    assertFeeUnsupported(req.body[field]);
   }
   const data=await createIntent({input:req.body,actor,idempotencyKey:req.headers?.["x-idempotency-key"]});
   const item=await getIntent({workspaceId:data.row.workspace_id,id:data.row.id,actor});
   return result(res,data.reused?200:201,{ok:true,reused:data.reused,intent:item,
    warning:"Unsigned native Coin.transfer parameters only. No wallet signature or on-chain payment."});
  }
  if(op==="intent-list")
   return result(res,200,{ok:true,network:"amadeus-testnet",intents:await listIntents({workspaceId:req.query?.workspaceId,actor})});
  if(op==="intent-get")
   return result(res,200,{ok:true,intent:await getIntent({workspaceId:req.query?.workspaceId,id:req.query?.id,actor})});
  if(["intent-review","intent-approve","intent-cancel"].includes(op)){
   if(req.body?.ackExactTerms!==true)
    throw new PaymentError(400,"Explicit review of exact immutable terms is required");
   const action=op.split("-")[1];
   const updated=await transitionIntent({
    workspaceId:req.body.workspaceId,id:req.body.id,actor,
    expectedHash:req.body.termsHash,action
   });
   const item=await getIntent({workspaceId:updated.row.workspace_id,id:updated.row.id,actor});
   return result(res,200,{ok:true,intent:item,
    warning:action==="approve"?
     "Review recorded. Awaiting independent payer wallet signature in a future milestone. No AMA transferred.":
     "No chain transaction submitted."});
  }
  return result(res,404,{ok:false,error:"Unknown M3 API operation"});
 }catch(error){
  if(error instanceof PaymentError)return result(res,error.status,{ok:false,error:error.message});
  const message=String(error?.message||"");
  if(/CSRF|Origin|origin|cross-site|Same-origin/.test(message))
   return result(res,403,{ok:false,error:"Session origin or CSRF check failed"});
  if(/must|invalid|Invalid|Only|exceed|exceeds|Confirm|required|support|self-transfer|amount|recipient|payer|decimal/i.test(message))
   return result(res,400,{ok:false,error:message.slice(0,160)});
  return result(res,503,{ok:false,error:"M3 intent service is unavailable; no payment was submitted"});
 }
}
