import React,{useEffect,useState} from "react";
import "./amadeus-agent.css";
const API="/api/v3/ama";
async function request(op,{body,csrf,key,query}={}){
 const res=await fetch(API+"?operation="+encodeURIComponent(op)+(query||""),{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{}),
   ...(key?{"X-Idempotency-Key":key}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Native agent API unavailable");
 return data;
}
const uuid=()=>crypto.randomUUID();
const READ_TOOLS=[
 ["wallet.balance","Read my AMA Testnet wallet"],
 ["beneficiaries.list","Beneficiary allowlist"],
 ["invoices.list","Unverified invoice notes"],
 ["payments.list","Payment-intent records"],
 ["transactions.list","Transaction receipts"]
];
export default function AmadeusAgentPanel({identity,connectedWallet,onDraft}){
 const [workspaceId,setWorkspaceId]=useState("");
 const [prompt,setPrompt]=useState("");
 const [task,setTask]=useState(null);
 const [tasks,setTasks]=useState([]);
 const [result,setResult]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [invoiceRef,setInvoiceRef]=useState("");
 const [invoiceText,setInvoiceText]=useState("");
 const [invoiceAddress,setInvoiceAddress]=useState("");
 const [invoiceAmount,setInvoiceAmount]=useState("");
 const [invoiceSaved,setInvoiceSaved]=useState(null);
 const [idempotency,setIdempotency]=useState(uuid);
 const session=!!identity?.csrf&&identity.address===connectedWallet;
 const workspaces=session?(identity.workspaces||[]):[];
 const selected=workspaces.find(w=>w.workspace_id===workspaceId);
 const role=selected?.role||"";
 const mayAnalyze=["owner","admin","operator"].includes(role);
 const mayAddInvoice=mayAnalyze;
 useEffect(()=>{
  setWorkspaceId(current=>(identity?.workspaces||[]).some(w=>w.workspace_id===current)?
   current:(identity?.workspaces?.[0]?.workspace_id||""));
  setTask(null);setTasks([]);setResult(null);setInvoiceSaved(null);
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{setTask(null);setResult(null);setIdempotency(uuid())},[workspaceId,prompt]);
 async function run(cb){
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{await cb()}catch(e){setError(e?.message||"Agent request failed")}
  finally{setBusy(false)}
 }
 async function analyze(){
  if(!session||!mayAnalyze||!workspaceId)throw Error("An authenticated proposer role and organization are required");
  const response=await request("agent-analyze",{csrf:identity.csrf,key:idempotency,
   body:{workspaceId,network:"amadeus-testnet",message:prompt}});
  setTask(response.task);setResult(response.readResult?{tool:response.readTool,data:response.readResult}:null);
  setNotice(response.reused?"Exact analysis request reused, not duplicated.":
   "Read-only analysis stored. No human approval or on-chain action occurred.");
 }
 async function readTool(name){
  const response=await request("agent-read",{csrf:identity.csrf,
   body:{workspaceId,name,args:{}}});
  setResult({tool:name,data:response.data});
  setNotice("Authorized workspace read only; no financial transaction requested.");
 }
 async function listTasks(){
  const x=await request("agent-tasks",{query:"&workspaceId="+encodeURIComponent(workspaceId)});
  setTasks(x.tasks||[]);
 }
 async function saveInvoice(){
  const body={workspaceId,invoiceRef,note:invoiceText};
  if(invoiceAddress||invoiceAmount){body.recipient=invoiceAddress;body.amount=invoiceAmount;}
  const x=await request("agent-invoice-note",{csrf:identity.csrf,body});
  setInvoiceSaved(x.invoice);
  setInvoiceRef("");setInvoiceText("");setInvoiceAddress("");setInvoiceAmount("");
  setNotice("Unverified human-entered invoice note stored. It cannot instruct the agent or authorize a payment.");
 }
 const candidate=task?.proposal;
 const highRisk=task?.risk?.category==="critical"||task?.status==="blocked";
 return <section className="ama-m5">
  <div className="ama-m5-heading"><span className="ama-eyebrow">M5 · AMA TESTNET FINANCIAL AGENT</span>
   <h3>Financial intelligence without custody or signing authority</h3>
   <p>Ask the agent to read your authorized Testnet data or suggest an exact AMA transfer. Only a human can create a payment intent and approve it in M3; M4 alone handles wallet-controlled execution.</p></div>
  {!session?<p className="ama-m5-warn">Sign in through the native Amadeus wallet before accessing financial agent tools. Connecting without signing in does not grant access.</p>:<>
   <label>Organization
    <select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
     <option value="">Choose organization</option>
     {workspaces.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} · {w.role}</option>)}
    </select></label>
   {workspaceId&&<>
    <div className="ama-m5-grid">
     <div><h4>Ask 33JACK Agent</h4>
      <label>Message<textarea rows={4} maxLength={800} value={prompt}
       placeholder="Prepare 0.5 AMA to [native Testnet wallet address]"
       onChange={e=>setPrompt(e.target.value)}/></label>
      <button disabled={busy||!mayAnalyze||prompt.trim().length<3} onClick={()=>run(analyze)}>
       Analyze securely — no payment</button>
      {!mayAnalyze&&<p>Your organization role may read data, but cannot request payment analysis.</p>}
      <p>Only exact AMA Testnet instructions are recognized for payment suggestions. The agent ignores hidden instructions in uploaded or entered invoice text.</p>
     </div>
     <div><h4>Read-only native tools</h4>
      <div className="ama-m5-tool-list">
       {READ_TOOLS.map(([name,label])=><button key={name}
        disabled={busy} onClick={()=>run(()=>readTool(name))}>{label}</button>)}
      </div>
      <button disabled={busy} onClick={()=>run(listTasks)}>Read workspace agent history</button>
     </div>
    </div>
    {task&&<div className="ama-m5-output">
     <h4>Agent task · {task.status}</h4>
     <p>{task.explanation}</p>
     <p><b>Agent model:</b> {task.modelUsed?"Optional external explanation used":"Deterministic policy analysis (no external model used)"}</p>
     {task.risk&&<><p><b>Deterministic risk:</b> {task.risk.category} · {task.risk.score}/100</p>
      <div>{task.risk.flags?.map((f,i)=><p key={i}>• {f.code}: {f.description}</p>)}</div></>}
     {candidate&&<><p><b>Suggested only:</b> {candidate.amount} AMA → <code>{candidate.recipient}</code></p>
      <p><b>Atomic units:</b> {candidate.atomicUnits} · <b>Network:</b> Amadeus Testnet</p>
      <button disabled={busy||highRisk} onClick={()=>{onDraft?.({
       id:task.id,workspaceId,recipient:candidate.recipient,amount:candidate.amount,
       invoiceRef:candidate.invoiceRef
      });setNotice("Form fields copied into M3. Review them independently; nothing was submitted.");}}>
       Copy suggested fields to M3 form for human review
      </button></>}
     <p className="ama-m5-warn">An agent result is never approval, wallet signature, fiat quote or proof of settlement.</p>
    </div>}
    {result&&<div className="ama-m5-output"><h4>Tool result · {result.tool}</h4>
     <pre>{JSON.stringify(result.data,null,2)}</pre></div>}
    {tasks.length>0&&<div className="ama-m5-output"><h4>Workspace task history</h4>
     {tasks.map(item=><p key={item.id}><b>{item.status}</b> · {new Date(item.createdAt).toLocaleString()} · {item.modelUsed?"AI explanation":"Deterministic"} · {item.source}</p>)}
    </div>}
    <div className="ama-m5-output"><h4>Record an unverified invoice note</h4>
     <p>This is not OCR or a verified supplier invoice. Its text is stored as untrusted data and cannot instruct the agent.</p>
     <label>Invoice reference<input value={invoiceRef} onChange={e=>setInvoiceRef(e.target.value)} maxLength={80} placeholder="INV-001"/></label>
     <label>Human-entered note<textarea value={invoiceText} onChange={e=>setInvoiceText(e.target.value)} maxLength={2000} rows={3}/></label>
     <div className="ama-m5-grid">
      <label>Optional native recipient address<input value={invoiceAddress} onChange={e=>setInvoiceAddress(e.target.value)} /></label>
      <label>Optional exact AMA amount<input value={invoiceAmount} onChange={e=>setInvoiceAmount(e.target.value)} /></label>
     </div>
     <button disabled={busy||!mayAddInvoice||!invoiceRef||invoiceText.trim().length<3} onClick={()=>run(saveInvoice)}>
      Store unverified note — no payment</button>
     {invoiceSaved&&<p>Recorded {invoiceSaved.invoiceRef} · flagged instruction attempt: {invoiceSaved.containsInjection?"Yes":"No"}</p>}
    </div>
   </>}
  </>}
  {notice&&<p className="ama-notice" role="status">{notice}</p>}
  {error&&<p className="ama-error" role="alert">{error}</p>}
 </section>;
}
