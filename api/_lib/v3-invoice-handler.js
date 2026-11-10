/**
 * M6 native Amadeus Testnet invoice document and accounting API.
 * Invoice metadata and human reviews are NOT bank settlement or chain proof.
 */
import {validOrigin,parseCookie,hashSecret,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
import {
 recordDocument,listDocuments,createSupplier,verifySupplier,listSuppliers,
 createInvoice,verifyInvoice,invoiceDB,invoicePermission
} from "./v3-invoice-store.js";
import {
 readInvoice,listInvoices,linkPayment,reconcileInvoice,exportAccounting
} from "./v3-reconcile-store.js";
import {agentRateEvent} from "./v3-agent-store.js";

const GET=new Set(["invoice-documents","invoice-suppliers","invoice-list","invoice-get",
 "invoice-reconcile","invoice-export"]);
const POST=new Set(["invoice-ingest","invoice-supplier-create","invoice-supplier-review",
 "invoice-create","invoice-verify","invoice-link"]);
function send(res,status,value){return res.status(status).json(value)}
async function authenticate(req,mutate){
 const host=String(req.headers?.host||"");
 const origin=validOrigin(!mutate&&!req.headers?.origin?{
  ...req,headers:{...req.headers,origin:(/^localhost(?::\d+)?$/.test(host)?"http://":"https://")+host}
 }:req);
 const token=parseCookie(req);
 if(token.length<36)throw new PaymentError(401,"Native Testnet wallet login required");
 const session=await getSession(hashSecret(token));
 if(!session||session.origin!==origin)throw new PaymentError(401,"Wallet session expired or revoked");
 if(mutate){
  requireCsrf(req,session);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
   throw new PaymentError(415,"JSON body required");
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   throw new PaymentError(400,"JSON object required");
 }
 return session.address;
}
export default async function invoiceHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!GET.has(op)&&!POST.has(op))return send(res,404,{ok:false,error:"Unknown M6 invoice operation"});
 const mutate=POST.has(op);
 if((mutate&&req.method!=="POST")||(!mutate&&req.method!=="GET"))
  return send(res,405,{ok:false,error:"Incorrect invoice operation HTTP method"});
 try{
  const actor=await authenticate(req,mutate);
  const p=mutate?req.body:req.query;
  const workspaceId=assertWorkspaceId(p?.workspaceId);
  const sql=await invoiceDB();
  await invoicePermission(sql,actor,workspaceId,"invoice:read");
  if(op==="invoice-ingest"){
   // Rate-check before processing user-controlled PDF/image/text bytes.
   await agentRateEvent({workspaceId,actor,event:"m6_doc_ingest",input:String(req.body?.document?.base64||"").slice(0,4096),limit:30});
   const document=await recordDocument({workspaceId,actor,input:req.body?.document});
   return send(res,201,{ok:true,document,notice:"Unverified source provenance recorded. Raw file not saved, no automatic invoice or payment created."});
  }
  if(op==="invoice-documents")
   return send(res,200,{ok:true,documents:await listDocuments({workspaceId,actor})});
  if(op==="invoice-supplier-create"){
   const supplier=await createSupplier({actor,input:{...req.body,workspaceId}});
   return send(res,201,{ok:true,supplier,warning:"User-entered supplier identity is unverified."});
  }
  if(op==="invoice-supplier-review"){
   const supplier=await verifySupplier({workspaceId,id:req.body?.id,actor,ackAddress:req.body?.ackAddress});
   return send(res,200,{ok:true,supplier,warning:"Human review is not independent supplier identity attestation."});
  }
  if(op==="invoice-suppliers")
   return send(res,200,{ok:true,suppliers:await listSuppliers({workspaceId,actor})});
  if(op==="invoice-create"){
   const invoice=await createInvoice({actor,input:{...req.body,workspaceId}});
   return send(res,201,{ok:true,invoice:{id:invoice.id,invoiceRef:invoice.invoice_ref,status:"unverified"},
    notice:"Invoice metadata is unverified; the document must be reviewed by an authorized human."});
  }
  if(op==="invoice-verify"){
   const verified=await verifyInvoice({workspaceId,id:req.body?.id,actor,
    sourceSha256:req.body?.sourceSha256,ackSourceReviewed:req.body?.ackSourceReviewed});
   return send(res,200,{ok:true,invoice:{id:verified.id,status:verified.status,verifiedAt:verified.verified_at},
    warning:"Human data review is not supplier attestation, AMA settlement or fiat payment."});
  }
  if(op==="invoice-link"){
   const linked=await linkPayment({workspaceId,invoiceId:req.body?.invoiceId,
    intentId:req.body?.intentId,actor,ackHumanMatch:req.body?.ackHumanMatch});
   return send(res,201,{ok:true,link:{invoiceId:linked.invoice_id,intentId:linked.intent_id},
    warning:"Linking an approved M3 intent never proves payment. Only independently finalized M4 receipts count."});
  }
  if(op==="invoice-list")
   return send(res,200,{ok:true,invoices:await listInvoices({workspaceId,actor}),source:"amadeus-testnet-local-ledger"});
  if(op==="invoice-get")
   return send(res,200,{ok:true,invoice:await readInvoice({workspaceId,id:p?.id,actor})});
  if(op==="invoice-reconcile"){
   const invoice=await reconcileInvoice({workspaceId,id:p?.id,actor});
   return send(res,200,{ok:true,invoice,
    note:"Read-only projection from M4 persisted independent finality evidence; M6 never broadcasts or checks unverified chain hashes as paid."});
  }
  if(op==="invoice-export"){
   const accounting=await exportAccounting({workspaceId,actor});
   return send(res,200,{ok:true,...accounting});
  }
  return send(res,404,{ok:false,error:"M6 route missing"});
 }catch(e){
  if(e instanceof PaymentError)return send(res,e.status,{ok:false,error:e.message});
  const message=String(e?.message||"");
  if(/CSRF|Origin|origin|cross-site|Same-origin/.test(message))
   return send(res,403,{ok:false,error:"Session origin or CSRF check failed"});
  if(/must|required|invalid|Invalid|amount|document|address|Base58|Only|duplicate|exceed|positive/i.test(message))
   return send(res,400,{ok:false,error:message.slice(0,160)});
  return send(res,503,{ok:false,error:"M6 Testnet invoice service unavailable; no financial action was performed"});
 }
}
