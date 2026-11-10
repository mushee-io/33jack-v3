import React,{useEffect,useState} from "react";
import "./amadeus-agent.css";
const API="/api/v3/ama";
async function request(op,{body,csrf,query}={}){
 const res=await fetch(API+"?operation="+op+(query||""),{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Amadeus AI agent unavailable");
 return data;
}
const trunc=s=>s&&s.length>30?s.slice(0,15)+"…"+s.slice(-8):s||"—";
export default function AmadeusAgentPanel({identity,connectedWallet}){
 const signedIn=!!identity?.csrf&&identity?.address===connectedWallet;
 const workspaces=signedIn?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [prompt,setPrompt]=useState("");
 const [remote,setRemote]=useState(false);
 const [answer,setAnswer]=useState(null);
 const [tool,setTool]=useState(null);
 const [invoiceRef,setInvoiceRef]=useState("");
 const [issuer,setIssuer]=useState("");
 const [amount,setAmount]=useState("");
 const [currency,setCurrency]=useState("AMA");
 const [recipient,setRecipient]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  const choices=identity?.workspaces||[];
  setWorkspaceId(old=>choices.some(w=>w.workspace_id===old)?old:choices[0]?.workspace_id||"");
  setAnswer(null);setTool(null);
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{setAnswer(null);setTool(null)},[workspaceId]);
 async function run(fn){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{await fn()}catch(e){setError(e.message||"Agent operation failed")}
  finally{setBusy(false)}
 }
 async function query(){
  if(!signedIn||!workspaceId)throw Error("Authenticate an organization wallet first");
  const result=await request("agent-query",{csrf:identity.csrf,body:{
   workspaceId,message:prompt,includeRemoteAI:remote
  }});
  setAnswer(result);setTool(null);
  setNotice("Analysis completed as advice only. No M3 intent, approval, signature or transaction was created.");
 }
 async function read(toolName){
  if(!signedIn||!workspaceId)throw Error("Authenticate and select a workspace");
  const result=await request("agent-tool",{csrf:identity.csrf,body:{workspaceId,tool:toolName}});
  setTool(result);setAnswer(null);
 }
 async function recordInvoice(){
  if(!signedIn||!workspaceId)throw Error("Authenticate and select a workspace");
  const result=await request("agent-invoice-record",{csrf:identity.csrf,body:{
   workspaceId,invoiceRef,issuer,amount,currency,recipient:recipient||undefined
  }});
  setNotice("Unverified manual invoice reference created: "+result.record.invoiceRef+
   ". No document, supplier identity, or payment has been verified.");
  setInvoiceRef("");setIssuer("");setAmount("");setRecipient("");
 }
 return <section className="ama-agent">
  <header><span className="ama-eyebrow">M5 · AI FINANCIAL AGENT</span>
   <h3>Understand business payments without giving an agent control of funds</h3>
   <p>Native Amadeus Testnet workspace analysis. Tool calls are read-only. Only a human may create M3 intents, approve them, sign and submit through the separate M4 wallet flow.</p>
  </header>
  {!signedIn?<p className="ama-agent-lock">Connect and cryptographically authenticate your native Testnet wallet to use organization financial intelligence.</p>:<>
   <label>Organization<select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
    <option value="">Select workspace</option>{workspaces.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} — {w.role}</option>)}
   </select></label>
   {workspaceId&&<>
    <div className="ama-agent-grid">
     <div><h4>Financial agent</h4>
      <label>Ask for a risk explanation or prepare a proposal<textarea rows={4} maxLength={1200}
        value={prompt} onChange={e=>setPrompt(e.target.value)}
        placeholder="Prepare payment of 0.01 AMA to [native Base58 recipient] for invoice INV-123"/></label>
      <label className="ama-agent-check"><input type="checkbox" checked={remote} onChange={e=>setRemote(e.target.checked)}/>
       Request optional Groq explanation (sanitized aggregate risk counts only, if server enabled)</label>
      <button disabled={busy||!prompt.trim()} onClick={()=>run(query)}>Analyze request safely</button>
      <div className="ama-agent-buttons">
       <button disabled={busy} onClick={()=>run(()=>read("ama.risk.summary"))}>Risk summary</button>
       <button disabled={busy} onClick={()=>run(()=>read("ama.wallet.balance"))}>Native AMA balance</button>
       <button disabled={busy} onClick={()=>run(()=>read("ama.beneficiaries.list"))}>Beneficiaries</button>
       <button disabled={busy} onClick={()=>run(()=>read("ama.intents.list"))}>Payment intents</button>
       <button disabled={busy} onClick={()=>run(()=>read("ama.invoices.list"))}>Invoice references</button>
      </div>
     </div>
     <div><h4>Record an unverified invoice reference</h4>
      <p>Manual reference only. Document/OCR extraction and verification are reserved for M6.</p>
      <label>Reference<input maxLength={90} value={invoiceRef} onChange={e=>setInvoiceRef(e.target.value)} placeholder="INV-123"/></label>
      <label>Issuer label<input maxLength={100} value={issuer} onChange={e=>setIssuer(e.target.value)} placeholder="Supplier label (not verified)"/></label>
      <label>Claimed amount<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="10.50"/></label>
      <label>Invoice denomination<select value={currency} onChange={e=>setCurrency(e.target.value)}>
       {["AMA","GBP","USD","EUR"].map(x=><option key={x}>{x}</option>)}
      </select></label>
      <label>Optional native recipient<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Amadeus address"/></label>
      <button disabled={busy||!invoiceRef||!issuer||!amount} onClick={()=>run(recordInvoice)}>
       Save unverified reference
      </button>
     </div>
    </div>
    {answer&&<article className="ama-agent-output">
     <h4>Agent result · {answer.engine}</h4>
     <p>{answer.explanation}</p>
     {answer.proposal?.recognized&&<div className="ama-agent-terms">
      <b>Human-only payment proposal (not submitted)</b>
      <p>Network: Amadeus Testnet · Amount: {answer.proposal.amount} AMA</p>
      <p>Recipient: <code>{answer.proposal.recipient}</code></p>
      <p>Atomic units: {answer.proposal.amountUnits} · Payer: <code>{trunc(answer.proposal.payer)}</code></p>
      <p>Beneficiary: {answer.proposal.beneficiaryStatus} · Ready for human draft: {answer.proposal.readyForHumanDraft?"Yes":"No"}</p>
      <p>{answer.proposal.nextStep}</p>
     </div>}
     <p>Risk: <b>{answer.risk?.highestSeverity||"unknown"}</b> · Flags: {answer.risk?.issueCount||0}</p>
     {(answer.risk?.flags||[]).map((f,i)=><p key={i}>{f.severity}: {f.explanation} ({f.count})</p>)}
     {answer.supplementalAI&&<p><b>Optional model explanation (not financial authorization):</b> {answer.supplementalAI}</p>}
     <p className="ama-agent-lock">No intent created · No approval granted · No wallet signature · No broadcast</p>
    </article>}
    {tool&&<article className="ama-agent-output">
     <h4>{tool.tool} · {tool.source}</h4>
     <pre>{JSON.stringify(tool.result,null,2)}</pre>
     <p>Read-only evidence; absence of a record does not prove settlement or successful payment.</p>
    </article>}
   </>}
  </>}
  {notice&&<p role="status" className="ama-notice">{notice}</p>}
  {error&&<p role="alert" className="ama-error">{error}</p>}
 </section>;
}
