/**
 * 33JACK V3 M5 — session-scoped, Testnet-only AI-agent API.
 * Only read-only tools plus explicit human-proposal analysis.
 * MCP/A2A represent restricted JSON-RPC / task-style subsets, not full compliance.
 */
import {parseCookie,hashSecret,validOrigin,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError,assertWorkspaceId} from "./v3-payment-core.js";
import {AGENT_TOOLS,validateAgentRequest,assertAgentTool} from "./v3-agent-core.js";
import {agentDB,authorizeAgent,readAgentTool,createInvoiceNote,listAgentTasks} from "./v3-agent-store.js";
import {analyzeAgentMessage} from "./v3-agent-engine.js";

const GET=new Set(["agent-tools","agent-tasks"]);
const POST=new Set(["agent-analyze","agent-read","agent-invoice-note","agent-mcp","agent-a2a"]);
function send(res,code,body){return res.status(code).json(body)}
function originFrom(req){
 const host=String(req.headers?.host||"");
 if(req.method==="GET"&&!req.headers?.origin){
  const scheme=/^localhost(?::\d+)?$/.test(host)?"http://":"https://";
  return validOrigin({...req,headers:{...req.headers,origin:scheme+host}});
 }
 return validOrigin(req);
}
async function account(req){
 const origin=originFrom(req),token=parseCookie(req);
 if(token.length<36)throw new PaymentError(401,"Native wallet authentication required");
 const session=await getSession(hashSecret(token));
 if(!session||session.origin!==origin)throw new PaymentError(401,"Wallet session unavailable or expired");
 if(req.method==="POST"){
  requireCsrf(req,session);
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
   throw new PaymentError(415,"JSON content type required");
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   throw new PaymentError(400,"JSON object body required");
 }
 return session.address;
}
async function requireWorkspace(workspaceId,actor){
 workspaceId=assertWorkspaceId(workspaceId);
 const sql=await agentDB();await authorizeAgent({sql,workspaceId,actor});
 return workspaceId;
}
const MCP_TOOLS=AGENT_TOOLS.map(tool=>({
 name:tool.name,description:tool.description,
 inputSchema:{type:"object",properties:{
  workspaceId:{type:"string",description:"Authenticated workspace UUID"},
  ...(tool.name==="risk.assess"?{message:{type:"string",description:"Exact AMA Testnet payment instruction"}}:{})
 },required:["workspaceId",...(tool.name==="risk.assess"?["message"]:[])],
 additionalProperties:false}
}));
function mcpResult(id,result){return {jsonrpc:"2.0",id,result}}
function mcpError(id,code,message){return {jsonrpc:"2.0",id,error:{code,message}}}
export default async function agentHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("X-Robots-Tag","noindex, nofollow");
 if(!GET.has(op)&&!POST.has(op))return send(res,404,{ok:false,error:"Unknown native agent operation"});
 if(GET.has(op)&&req.method!=="GET"||POST.has(op)&&req.method!=="POST")
  return send(res,405,{ok:false,error:"Unsupported method"});
 try{
  const actor=await account(req),body=req.method==="POST"?req.body:req.query||{};
  if(op==="agent-tools"){
   await requireWorkspace(body.workspaceId,actor);
   return send(res,200,{ok:true,network:"amadeus-testnet",
    mode:"read-only-tools",tools:AGENT_TOOLS,canSign:false,canApprove:false,canBroadcast:false});
  }
  if(op==="agent-tasks"){
   const workspaceId=await requireWorkspace(body.workspaceId,actor);
   return send(res,200,{ok:true,tasks:await listAgentTasks({workspaceId,actor})});
  }
  if(op==="agent-invoice-note"){
   const workspaceId=await requireWorkspace(body.workspaceId,actor);
   const invoice=await createInvoiceNote({
    workspaceId,actor,invoiceRef:body.invoiceRef,note:body.note,
    ...(Object.hasOwn(body,"recipient")?{recipient:body.recipient}:{}),
    ...(Object.hasOwn(body,"amount")?{amount:body.amount}:{})
   });
   return send(res,201,{ok:true,invoice,
    warning:"Human-entered unverified source text. Instructions inside the invoice are ignored. No payment was created."});
  }
  if(op==="agent-read"){
   const workspaceId=await requireWorkspace(body.workspaceId,actor);
   const name=assertAgentTool(body.name);
   const data=await readAgentTool({workspaceId,actor,name,args:body.args??{}});
   return send(res,200,{ok:true,network:"amadeus-testnet",tool:name,data,
    readOnly:true,mayCreateIntent:false,mayApprove:false,mayBroadcast:false});
  }
  if(op==="agent-analyze"){
   const validated=validateAgentRequest(body);
   await requireWorkspace(validated.workspaceId,actor);
   const result=await analyzeAgentMessage({input:validated,actor,
    key:req.headers?.["x-idempotency-key"],source:"web"});
   return send(res,result.reused?200:201,{ok:true,...result});
  }
  if(op==="agent-mcp"){
   if(body.jsonrpc!=="2.0"||!["string","number"].includes(typeof body.id))
    throw new PaymentError(400,"MCP requires JSON-RPC 2.0 and a request id");
   const id=body.id,method=body.method,params=body.params||{};
   await requireWorkspace(params.workspaceId,actor);
   if(method==="initialize")
    return send(res,200,mcpResult(id,{protocolVersion:"2025-03-26",
      capabilities:{tools:{}},serverInfo:{name:"33jack-amadeus-testnet-readonly",version:"0.5.0"},
      limitations:"Session-only JSON-RPC subset, not a claimed compliant standalone MCP server"}));
   if(method==="tools/list")
    return send(res,200,mcpResult(id,{tools:MCP_TOOLS,nextCursor:null}));
   if(method==="tools/call"){
    const tool=assertAgentTool(params.name);
    const args=params.arguments??{};
    if(args.workspaceId!==params.workspaceId)
     throw new PaymentError(403,"MCP workspace argument mismatch");
    const data=await readAgentTool({workspaceId:params.workspaceId,actor,name:tool,
      args:tool==="risk.assess"?{message:args.message}:{}});
    return send(res,200,mcpResult(id,{isError:false,
      content:[{type:"text",text:JSON.stringify({network:"amadeus-testnet",tool,data,readOnly:true})}]}));
   }
   return send(res,400,mcpError(id,-32601,"MCP method not implemented or forbidden"));
  }
  if(op==="agent-a2a"){
   if(body.operation!=="message/send"||!Array.isArray(body.message?.parts)||
      body.message.parts.length!==1||body.message.parts[0]?.type!=="text")
    throw new PaymentError(400,"Only authenticated text-message A2A tasks are supported");
   const validated=validateAgentRequest({
    workspaceId:body.workspaceId,message:body.message.parts[0].text,
    network:"amadeus-testnet"
   });
   await requireWorkspace(validated.workspaceId,actor);
   const result=await analyzeAgentMessage({input:validated,actor,
    key:req.headers?.["x-idempotency-key"],source:"a2a"});
   return send(res,201,{ok:true,network:"amadeus-testnet",
    a2aProfile:"restricted-session-task-subset",task:{
     id:result.task.id,status:{state:"completed"},artifacts:[{
      name:"read-only-financial-analysis",parts:[{type:"data",data:{
       explanation:result.task.explanation,proposal:result.task.proposal,risk:result.task.risk,
       noWalletAuthority:true}}]
     }]
    },reused:result.reused});
  }
  return send(res,404,{ok:false,error:"Unsupported agent operation"});
 }catch(error){
  if(error instanceof PaymentError)return send(res,error.status,{ok:false,error:error.message});
  const msg=String(error?.message||"");
  if(/Origin|origin|CSRF|cross-site|Same-origin/.test(msg))
   return send(res,403,{ok:false,error:"Same-origin or CSRF validation failed"});
  return send(res,503,{ok:false,error:"Amadeus Testnet agent unavailable; no payment action occurred"});
 }
}
