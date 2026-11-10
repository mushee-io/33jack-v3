import React,{useEffect,useState} from "react";
import {Activity,AlertTriangle,ArrowRight,FileText,RefreshCw,ShieldAlert,ShieldCheck,WalletCards} from "lucide-react";
import {displayCount,normalizeApiState} from "./amadeus-ui-model.js";

const API="/api/v3/ama";
async function overview(workspaceId){
 const res=await fetch(API+"?operation=ux-overview&workspaceId="+encodeURIComponent(workspaceId),
  {method:"GET",credentials:"same-origin",headers:{"Accept":"application/json"}});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Read-only Testnet overview unavailable");
 if(data?.network?.id!=="amadeus-testnet")throw Error("Unexpected network in overview evidence");
 return data;
}
export default function AmadeusExperiencePanel({identity,connectedWallet,onNavigate}){
 const authenticated=!!identity?.csrf&&identity.address===connectedWallet;
 const workspaces=authenticated?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [snapshot,setSnapshot]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [updated,setUpdated]=useState(0);
 useEffect(()=>{
  const ws=identity?.workspaces||[];
  setWorkspaceId(old=>ws.some(x=>x.workspace_id===old)?old:ws[0]?.workspace_id||"");
  setSnapshot(null);setError("");
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{
  if(!authenticated||!workspaceId){setSnapshot(null);return}
  let current=true;
  setBusy(true);setError("");setSnapshot(null);
  overview(workspaceId).then(result=>{if(current)setSnapshot(result)})
   .catch(e=>{if(current)setError(e?.message||"Dashboard evidence unavailable")})
   .finally(()=>{if(current)setBusy(false)});
  return()=>{current=false};
 },[authenticated,workspaceId,updated]);
 const status=normalizeApiState({loading:busy,error,data:snapshot});
 const s=snapshot?.summary;
 const cap=snapshot?.countsCapped||{};
 const metrics=[
  {label:"Open human review",value:s?.pendingHumanReview,icon:Activity,note:"M3 drafts and unsigned intents",capped:cap.intents},
  {label:"Invoices recorded",value:s?.invoiceCount,icon:FileText,note:"Includes unverified sources",capped:cap.invoices},
  {label:"Finality verified",value:s?.transfersWithVerifiedFinality,icon:ShieldCheck,note:"M4 matching finalized receipts only",capped:cap.executions},
  {label:"Open risk holds",value:s?.openManualRiskHolds,icon:ShieldAlert,note:"Human reports, not AML clearance",capped:cap.riskFlags}
 ];
 return <section className="ama-m8-dashboard" aria-labelledby="ama-m8-overview-title">
  <div className="ama-m8-section-head">
   <div><span className="ama-eyebrow">ORGANIZATION OVERVIEW · READ-ONLY</span>
    <h2 id="ama-m8-overview-title">Your Amadeus Testnet workspace</h2>
    <p>Real organization records only. No fabricated payments, fiat settlement, trading activity, or inferred wallet balance.</p></div>
   <button type="button" className="ama-m8-secondary" disabled={!authenticated||!workspaceId||busy}
     onClick={()=>setUpdated(x=>x+1)} aria-label="Refresh read-only Testnet dashboard">
    <RefreshCw size={16} aria-hidden="true"/>{busy?"Refreshing…":"Refresh evidence"}</button>
  </div>
  {!authenticated?<div className="ama-m8-empty" role="status">
   <WalletCards aria-hidden="true" size={28}/>
   <h3>Authenticate your wallet to see organization data</h3>
   <p>Connection alone is not an authenticated session. The released extension must support a verified native Testnet login challenge.</p>
   <button type="button" onClick={()=>onNavigate?.("wallet")}>Go to wallet authentication <ArrowRight size={16} aria-hidden="true"/></button>
  </div>:<>
   <label className="ama-m8-org-select">Selected organization
    <select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
     <option value="">Choose an organization</option>
     {workspaces.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} · {w.role}</option>)}
    </select>
   </label>
   {!workspaceId?<div className="ama-m8-empty"><h3>No organization selected</h3><p>Create or join one in Wallet & identity.</p>
    <button type="button" onClick={()=>onNavigate?.("wallet")}>Manage organizations</button></div>:<>
    <p className={"ama-m8-fetch "+(error?"is-error":"")} role={error?"alert":"status"} aria-live="polite">
     {status.status==="loading"?"Loading authenticated organization evidence…":
      status.status==="unavailable"?"Could not load this organization's evidence: "+status.message:
      status.status==="loaded"?"Read-only records loaded from your organization. Network: Amadeus Testnet.":
      "Waiting for verified organization data."}
    </p>
    {s&&<>
     <div className="ama-m8-kpis">
      {metrics.map(({label,value,icon:Icon,note,capped})=><article className="ama-m8-kpi" key={label}>
       <div className="ama-m8-kpi-top"><span>{label}</span><Icon size={20} aria-hidden="true"/></div>
       <strong>{displayCount(value,{capped:!!capped})}</strong><small>{note}</small>
      </article>)}
     </div>
     <div className="ama-m8-summary-grid">
      <article className="ama-m8-surface">
       <h3><ShieldCheck size={18} aria-hidden="true"/> Security & operations</h3>
       <dl className="ama-m8-facts">
        <div><dt>Policy state</dt><dd>{s.policyState==="emergency_paused"?"EMERGENCY PAUSED":
         s.policyState==="configured"?"Configured — M7 rules apply":"Policy record not yet initialized"}</dd></div>
        <div><dt>Policy version</dt><dd>{s.policyVersion??"Unavailable"}</dd></div>
        <div><dt>Transactions awaiting chain evidence</dt><dd>{displayCount(s.transfersPendingEvidence,{capped:cap.executions})}</dd></div>
        <div><dt>Failed, disputed or conflicting evidence</dt><dd>{displayCount(s.transfersDisputedOrFailed,{capped:cap.executions})}</dd></div>
        <div><dt>Wallet balance</dt><dd>Not queried · use Wallet tab</dd></div>
       </dl>
       {s.policyState==="emergency_paused"&&<p className="ama-m8-danger" role="alert">
        <AlertTriangle size={16} aria-hidden="true"/> M7 emergency pause is active. New financial actions must remain blocked.</p>}
       <button type="button" className="ama-m8-secondary" onClick={()=>onNavigate?.("governance")}>Review policy & holds <ArrowRight size={16} aria-hidden="true"/></button>
      </article>
      <article className="ama-m8-surface">
       <h3><WalletCards size={18} aria-hidden="true"/> Human-controlled workflow</h3>
       <ol className="ama-m8-workflow">
        <li><span>01</span><div><b>Authenticate native wallet</b><small>Server-verified login; no custody transfer</small></div></li>
        <li><span>02</span><div><b>Review exact AMA terms</b><small>Allowlisted recipient, human approval and M7 policy</small></div></li>
        <li><span>03</span><div><b>Owner signs using extension</b><small>M4 sign-only capability must be independently confirmed</small></div></li>
        <li><span>04</span><div><b>Check chain finality</b><small>Only matching M4 verified receipts establish settlement</small></div></li>
       </ol>
       <button type="button" className="ama-m8-secondary" onClick={()=>onNavigate?.("payments")}>Open payment intents <ArrowRight size={16} aria-hidden="true"/></button>
      </article>
     </div>
     <p className="ama-m8-footnote">Data source: M2–M7 organization PostgreSQL. Snapshot time: {snapshot.updatedAt?new Date(snapshot.updatedAt).toLocaleString():"Unavailable"}. These are record counts, not bank balances or guaranteed blockchain confirmations. {Object.values(cap).some(Boolean)?"Some lists reached the bounded read limit; counts may be lower than total history.":""}</p>
    </>}
   </>}
  </>}
 </section>;
}
