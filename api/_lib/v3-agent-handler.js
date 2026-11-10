/**
 * Authenticated V3 Amadeus financial agent, internal MCP and A2A-compatible envelopes.
 * No autonomous signing, M3 approval, M4 submission or cross-tenant tools.
 */
import {validOrigin,parseCookie,hashSecret,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
import {AGENT_TOOLS,normalizeAgentText,parseNaturalPayment,deterministicRisk} from "./v3-agent-core.js";
import {agentDB,agentSnapshot,agentRateEvent,agentReadTool,createManualInvoice,listManualInvoices,requireAgentMembership} from "./v3-agent-store.js";
import {optionalAgentAdvisory} from "./v3-agent-advisory.js";

const GET=new Set(["agent-tools","agent-invoice-list"]);
const POST=new Set(["agent-query","agent-tool","agent-mcp","agent-a2a","agent-invoice-record"]);
function send(res,status,body){return res.status(status).json(body)}
async function sessionActor(req,mutate){
 const host=String(req.headers?.host||"");
 const wrapped=!mutate&&!req.headers?.origin?
  {...req,headers:{...req.headers,origin:(/^localhost(?::\d+)?$/.test(host)?"http://":"https://")+host}}:req;
 const origin=validOrigin(wrapped);
 const raw=parseCookie(req);
 if(raw.length<36)throw new PaymentError(401,"Signed-in Amadeus Testnet wallet is required");
 const s=await getSession(hashSecret(raw));
 if(!s||s.origin!==origin)throw new PaymentError(401,"Wallet session expired or revoked");
 if(mutate){
  requireCsrf(req,s);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
   throw new PaymentError(415,"JSON content type required");
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   throw new PaymentError(400,"JSON object required");
 }
 return s.address;
}
function workspaceFrom(req,post){
 return assertWorkspaceId(post?req.body?.workspaceId:req.query?.workspaceId);
}
function safeRecordId(value){
 if(typeof value!=="string"||value.length>100)return null;
 return value;
}
async function answerNatural({actor,workspaceId,message,includeRemoteAI}){
 const sql=await agentDB();await requireAgentMembership(sql,{actor,workspaceId});
 const text=normalizeAgentText(message);
 const snapshot=await agentSnapshot({actor,workspaceId});
 const risk=deterministicRisk(snapshot);
 let proposal;
 if(/^\s*(?:please\s+)?(?:prepare|draft|propose)\b/i.test(text)){
  proposal=parseNaturalPayment(text,{wallet:actor,beneficiaries:snapshot.beneficiaries});
 }
 const safeText=proposal?.recognized?
  (proposal.readyForHumanDraft?
   "Native AMA payment terms parsed. The wallet owner must independently create the M3 intent and explicitly approve/sign using separate human-only actions.":
   "Native AMA recipient is not currently allowlisted; owner/admin approval of recipient is required before a human may create an intent."):
  "Read-only risk and workspace context returned. To propose a payment use the exact native AMA proposal syntax; no action was executed.";
 const ai=includeRemoteAI===true?await optionalAgentAdvisory({risk,mode:proposal?.recognized?"proposal":"summary"}):
  {mode:"deterministic_only",text:null,reason:"No external AI call was requested"};
 return {ok:true,network:"amadeus-testnet",engine:ai.mode,explanation:safeText,
  supplementalAI:ai.text,remoteAISharing:"sanitized aggregate risk counts only",
  proposal:proposal||null,risk,counts:{beneficiaries:snapshot.beneficiaries.length,
   unverifiedInvoices:snapshot.invoices.length,intents:snapshot.intents.length,
   executionRecords:snapshot.executions.length},
  evidence:"organization-scoped records; no fabricated Testnet transactions",
  userMustApprove:true,requiresHumanWallet:true,agentCannotSign:true,agentCannotBroadcast:true,
  actionTaken:"none"};
}
export default async function agentHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!GET.has(op)&&!POST.has(op))return send(res,404,{ok:false,error:"Unknown M5 agent operation"});
 const post=POST.has(op);
 if((post&&req.method!=="POST")||(!post&&req.method!=="GET"))
  return send(res,405,{ok:false,error:"Unsupported HTTP method"});
 try{
  const actor=await sessionActor(req,post);
  const workspaceId=workspaceFrom(req,post);
  const sql=await agentDB();
  await requireAgentMembership(sql,{actor,workspaceId});
  if(op==="agent-tools"){
   return send(res,200,{ok:true,network:"amadeus-testnet",tools:AGENT_TOOLS,
    protocols:["33jack-mcp-authenticated-read-only","33jack-a2a-authenticated-envelope"],
    noTransactionActions:true});
  }
  if(op==="agent-invoice-list"){
   return send(res,200,{ok:true,source:"manual_unverified",records:await listManualInvoices({workspaceId,actor})});
  }
  if(op==="agent-invoice-record"){
   await agentRateEvent({workspaceId,actor,event:"manual_invoice",input:JSON.stringify(req.body)});
   const record=await createManualInvoice({actor,input:req.body});
   return send(res,201,{ok:true,record:{id:record.id,invoiceRef:record.invoice_ref,
    verificationStatus:"unverified",sourceType:"manual_unverified"},
    notice:"This is a manually supplied, unverified invoice reference. No invoice document was validated and no AMA was sent."});
  }
  if(op==="agent-tool"){
   const name=req.body.tool;
   await agentRateEvent({workspaceId,actor,event:"read_tool",input:String(name||"")});
   const result=await agentReadTool({tool:name,args:{workspaceId,id:req.body.id},actor});
   return send(res,200,result);
  }
  if(op==="agent-mcp"){
   // This is an authenticated MCP-shaped JSON-RPC adapter, NOT a public remote MCP server.
   const j=req.body.jsonrpc,id=req.body.id,method=req.body.method;
   if(j!=="2.0"||typeof method!=="string"||id===null||id===undefined||
       (typeof id!=="string"&&typeof id!=="number"))
    throw new PaymentError(400,"Invalid authenticated MCP JSON-RPC envelope");
   let result;
   if(method==="initialize"){
    result={protocolVersion:"2025-03-26",capabilities:{tools:{}},
     serverInfo:{name:"33jack-v3-amadeus-testnet-readonly",version:"0.5.0"}};
   }else if(method==="tools/list"){
    result={tools:AGENT_TOOLS.map(t=>({name:t.name,description:t.description,
     inputSchema:{type:"object",properties:{workspaceId:{type:"string"},id:{type:"string"}},
      required:["workspaceId"],additionalProperties:false}}))};
   }else if(method==="tools/call"){
    const name=req.body.params?.name, args=req.body.params?.arguments;
    if(!args||args.workspaceId!==workspaceId)
     throw new PaymentError(403,"Agent tool workspace must match the authenticated request workspace");
    await agentRateEvent({workspaceId,actor,event:"mcp_read_tool",input:String(name||"")});
    const data=await agentReadTool({tool:name,args,actor});
    result={content:[{type:"text",text:JSON.stringify(data)}],isError:false};
   }else throw new PaymentError(403,"MCP agent method is not allowed: no tools for signing, approval, broadcast, or payment creation");
   return send(res,200,{jsonrpc:"2.0",id,result});
  }
  if(op==="agent-query"||op==="agent-a2a"){
   const text=op==="agent-a2a"?req.body?.message?.text:req.body?.message;
   if(op==="agent-a2a"){
    if(req.body?.message?.role!=="user"||typeof text!=="string")
     throw new PaymentError(400,"A2A request must be an authenticated user-message envelope");
   }
   const normalized=normalizeAgentText(text);
   await agentRateEvent({workspaceId,actor,event:op==="agent-a2a"?"a2a_question":"agent_question",input:normalized});
   const answer=await answerNatural({actor,workspaceId,message:normalized,
     includeRemoteAI:op==="agent-query"&&req.body.includeRemoteAI===true});
   return send(res,200,op==="agent-a2a"?{
    ok:true,protocol:"33jack-a2a-authenticated-envelope",message:{role:"agent",parts:[
     {type:"text",text:answer.explanation}]},data:answer}:answer);
  }
  return send(res,404,{ok:false,error:"Agent operation not found"});
 }catch(e){
  if(e instanceof PaymentError)return send(res,e.status,{ok:false,error:e.message});
  const msg=String(e?.message||"");
  if(/CSRF|origin|Origin|cross-site|Same-origin/.test(msg))
   return send(res,403,{ok:false,error:"Session origin or CSRF check failed"});
  if(/Only Amadeus|Base58|amount|recipient|payer|self-transfer|exceed|decimal|invalid|Invalid|must|required|positive|too large/i.test(msg))
   return send(res,400,{ok:false,error:msg.slice(0,150)});
  return send(res,503,{ok:false,error:"M5 agent context unavailable; no financial action was taken"});
 }
}
