import React,{useEffect,useState} from "react";
import {AlertTriangle,CheckCircle2,ShieldCheck} from "lucide-react";
import "./amadeus-acceptance.css";
const API="/api/v3/ama";
async function query(op,{body,csrf,query=""}={}){
 const res=await fetch(API+"?operation="+op+query,{method:body?"POST":"GET",
  credentials:"same-origin",headers:body?{"Content-Type":"application/json",
   "X-33Jack-CSRF":csrf}:{"Accept":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Acceptance evidence unavailable");
 if(data.network&&data.network!=="amadeus-testnet")throw Error("Unexpected Testnet network");
 return data;
}
export default function AmadeusAcceptancePanel({identity,connectedWallet}){
 const signed=!!identity?.csrf&&identity?.address===connectedWallet;
 const workspaces=signed?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [intentId,setIntentId]=useState("");
 const [intents,setIntents]=useState([]);
 const [reports,setReports]=useState([]);
 const [readiness,setReadiness]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const role=workspaces.find(w=>w.workspace_id===workspaceId)?.role;
 const authorized=signed&&["owner","admin"].includes(role);
 useEffect(()=>{
  const list=identity?.workspaces||[];
  setWorkspaceId(old=>list.some(w=>w.workspace_id===old)?old:list[0]?.workspace_id||"");
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{
  setIntents([]);setReports([]);setReadiness(null);setIntentId("");setError("");
  if(!authorized)return;
  let active=true;
  const q="&workspaceId="+encodeURIComponent(workspaceId);
  Promise.all([query("intent-list",{query:q}),query("acceptance-reports",{query:q})])
   .then(([a,b])=>{if(active){setIntents(a.intents||[]);setReports(b.reports||[])}})
   .catch(e=>{if(active)setError(e.message)});
  return()=>{active=false};
 },[workspaceId,authorized]);
 async function execute(op){
  if(!authorized||!intentId||busy)return;
  if(op==="acceptance-witness"&&!window.confirm(
   "Re-query the OFFICIAL Amadeus Testnet RPC for an EXISTING M4 transfer? No signing, submission or rebroadcast will occur."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const q="&workspaceId="+encodeURIComponent(workspaceId)+
     "&intentId="+encodeURIComponent(intentId);
   const r=op==="acceptance-witness"?
    await query(op,{csrf:identity.csrf,body:{workspaceId,intentId}}):
    await query(op,{query:q});
   setReadiness(op==="acceptance-witness"?r.acceptance:r.result);
   setNotice(op==="acceptance-witness"?
    "Witness result recorded as "+r.status+". No money was moved.":
    "Stored readiness assessed. Missing independent evidence remains NO-GO.");
   if(op==="acceptance-witness"){
    const reports=await query("acceptance-reports",{query:"&workspaceId="+encodeURIComponent(workspaceId)});
    setReports(reports.reports||[]);
   }
  }catch(e){setError(e.message||"Witness unavailable")}
  finally{setBusy(false)}
 }
 return <section className="ama-m9" aria-labelledby="ama-m9-title">
  <div className="ama-m9-top"><div><span className="ama-eyebrow">M9 · END-TO-END TESTNET ACCEPTANCE</span>
   <h2 id="ama-m9-title">Evidence before release.</h2>
   <p>Inspect M2 signed identities, M3 approval, M4 finality, M5 agent traces, M6 invoice settlement and M7 governance. Synthetic CI fixtures are not live blockchain evidence.</p></div>
   <span className="ama-m9-warning"><AlertTriangle size={17} aria-hidden="true"/> External review pending</span></div>
  {!signed?<p role="status">Sign in with your native Amadeus Testnet wallet to inspect acceptance.</p>:<>
   <label>Organization<select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
    <option value="">Choose organization</option>
    {workspaces.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} · {w.role}</option>)}
   </select></label>
   {!authorized?<p>Acceptance review requires an authenticated owner or administrator.</p>:<>
    <label>Previously created M3 payment intent<select value={intentId}
     onChange={e=>{setIntentId(e.target.value);setReadiness(null)}}>
     <option value="">Choose Testnet intent</option>
     {intents.map(i=><option key={i.id} value={i.id}>{i.invoiceRef||"No invoice"} · {i.status} · {i.id.slice(0,8)}</option>)}
    </select></label>
    <div className="ama-m9-actions">
     <button type="button" disabled={busy||!intentId} onClick={()=>execute("acceptance-status")}>Assess stored records</button>
     <button type="button" disabled={busy||!intentId} onClick={()=>execute("acceptance-witness")}>Check official Testnet RPC (read only)</button>
    </div>
    {readiness&&<article className="ama-m9-matrix">
     <h3>{readiness.acceptance==="no_go"?"NO-GO — evidence still outstanding":"Evidence matrix complete; no mainnet authorization"}</h3>
     <p>Independent live-chain proof: {readiness.liveTransferProven?"Checked":"Not yet verified"}</p>
     {readiness.requirements?.map(item=><div className="ama-m9-criterion" key={item.id}>
      {item.status==="passed"?<CheckCircle2 size={17} aria-hidden="true"/>:
       <AlertTriangle size={17} aria-hidden="true"/>}
      <span><strong>{item.id.replaceAll("_"," ")}</strong><small>{item.evidence}</small></span>
      <b>{item.status}</b>
     </div>)}
    </article>}
    <article className="ama-m9-history">
     <h3>Recorded acceptance evidence</h3>
     {reports.length===0?<p>No independent Testnet checks recorded yet.</p>:reports.map(r=>
      <div className="ama-m9-criterion" key={r.id}>
       <ShieldCheck size={17} aria-hidden="true"/>
       <span><strong>{r.status.replaceAll("_"," ")}</strong>
        <small>{r.txHash} · {new Date(r.checkedAt).toLocaleString()}</small></span>
       <b>{r.isLiveRPCAcceptance?"Live RPC":"Not live proof"}</b>
      </div>)}
     <p>This interface never authorizes transfer, bypasses M4 NO-GO restrictions, or claims an independent security audit has been completed.</p>
    </article>
   </>}
  </>}
  {notice&&<p role="status" className="ama-notice">{notice}</p>}
  {error&&<p role="alert" className="ama-error">{error}</p>}
 </section>;
}
