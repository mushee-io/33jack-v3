import React,{useEffect,useState} from "react";
import "./amadeus-governance.css";
const API="/api/v3/ama";
async function call(op,{body,csrf,query}={}){
 const response=await fetch(API+"?operation="+op+(query||""),{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||"M7 governance is not available");
 return result;
}
const RISK_KINDS=[
 "suspected_duplicate_invoice","invoice_content_mismatch","recipient_changed",
 "unusual_payment_request","suspicious_transaction","possible_sanctions_match_unverified",
 "manual_risk_hold"
];
export default function AmadeusGovernancePanel({identity,connectedWallet}){
 const authenticated=!!identity?.csrf&&identity?.address===connectedWallet;
 const workspaces=authenticated?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [policy,setPolicy]=useState(null);
 const [risks,setRisks]=useState([]);
 const [incidents,setIncidents]=useState([]);
 const [recovery,setRecovery]=useState([]);
 const [audit,setAudit]=useState(null);
 const [reason,setReason]=useState("");
 const [requestId,setRequestId]=useState("");
 const [maxPayment,setMaxPayment]=useState("");
 const [daily,setDaily]=useState("");
 const [highRisk,setHighRisk]=useState("");
 const [riskKind,setRiskKind]=useState("manual_risk_hold");
 const [riskInvoice,setRiskInvoice]=useState("");
 const [riskRecipient,setRiskRecipient]=useState("");
 const [riskReason,setRiskReason]=useState("");
 const [incidentKind,setIncidentKind]=useState("payment_risk");
 const [incidentSeverity,setIncidentSeverity]=useState("medium");
 const [incidentDetail,setIncidentDetail]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const role=workspaces.find(w=>w.workspace_id===workspaceId)?.role||"";
 const admin=["owner","admin"].includes(role);
 const canReport=["owner","admin","operator"].includes(role);
 useEffect(()=>{
  const ws=identity?.workspaces||[];
  setWorkspaceId(current=>ws.some(w=>w.workspace_id===current)?current:ws[0]?.workspace_id||"");
 },[identity?.address,connectedWallet,identity?.workspaces]);
 async function refresh(){
  if(!workspaceId||!authenticated)return;
  const query="&workspaceId="+encodeURIComponent(workspaceId);
  const [p,r,i,x,a]=await Promise.all([
   call("governance-policy",{query}),call("governance-risks",{query}),
   call("governance-incidents",{query}),call("governance-recovery",{query}),
   ...(admin?[call("governance-audit",{query})]:[Promise.resolve(null)])
  ]);
  setPolicy(p.policy);setRisks(r.risks||[]);setIncidents(i.incidents||[]);
  setRecovery(x.transactions||[]);setAudit(a?.audit||null);
  setMaxPayment(p.policy.maxPaymentUnits);
  setDaily(p.policy.dailyUnits);
  setHighRisk(p.policy.highRiskUnits);
 }
 useEffect(()=>{
  setPolicy(null);setRisks([]);setIncidents([]);setRecovery([]);setAudit(null);
  if(!workspaceId||!authenticated)return;
  let live=true;
  const query="&workspaceId="+encodeURIComponent(workspaceId);
  Promise.all([
   call("governance-policy",{query}),call("governance-risks",{query}),
   call("governance-incidents",{query}),call("governance-recovery",{query}),
   ...(admin?[call("governance-audit",{query})]:[Promise.resolve(null)])
  ]).then(([p,r,i,x,a])=>{
   if(!live)return;
   setPolicy(p.policy);setRisks(r.risks||[]);setIncidents(i.incidents||[]);
   setRecovery(x.transactions||[]);setAudit(a?.audit||null);
   setMaxPayment(p.policy.maxPaymentUnits);setDaily(p.policy.dailyUnits);
   setHighRisk(p.policy.highRiskUnits);
  }).catch(e=>{if(live)setError(e.message)});
  return()=>{live=false};
 },[workspaceId,authenticated,role]);
 async function perform(op,fields={},confirmation=null){
  if(busy)return;
  if(confirmation&&!window.confirm(confirmation))return;
  setBusy(true);setNotice("");setError("");
  try{
   const out=await call(op,{csrf:identity.csrf,body:{workspaceId,...fields}});
   if(out.request?.id)setRequestId(out.request.id);
   setNotice(out.warning||"Governance event recorded. No AMA was transferred.");
   await refresh();
  }catch(e){setError(e.message||"Governance action refused")}
  finally{setBusy(false)}
 }
 return <section className="ama-m7">
  <header><span className="ama-eyebrow">M7 · AMADEUS TESTNET GOVERNANCE</span>
   <h3>Compliance controls, financial security and incident response</h3>
   <p>Deterministic internal rules only. No external KYC, KYB, AML or sanctions provider is integrated. The AI agent cannot alter policy, approve, sign or broadcast funds.</p>
  </header>
  {!authenticated?<p className="ama-m7-warning">Authenticate the native Amadeus Testnet wallet to inspect organization security controls.</p>:<>
   <label>Organization<select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
    <option value="">Choose organization</option>
    {workspaces.map(w=><option value={w.workspace_id} key={w.workspace_id}>{w.name} · {w.role}</option>)}
   </select></label>
   {workspaceId&&<div className="ama-m7-grid">
    <article>
     <h4>Active financial policy</h4>
     <p>State: <strong>{policy?.paused?"EMERGENCY PAUSED":"New actions subject to M7 policy"}</strong> · Version {policy?.version??"…"}</p>
     <p>High risk requires a checker distinct from the payment maker. Changes invalidate old approval seals.</p>
     <label>Per-payment limit (AMA atomic units)<input inputMode="numeric" value={maxPayment} onChange={e=>setMaxPayment(e.target.value)} disabled={!admin||busy}/></label>
     <label>24-hour organization limit (AMA atomic units)<input inputMode="numeric" value={daily} onChange={e=>setDaily(e.target.value)} disabled={!admin||busy}/></label>
     <label>Two-person threshold (AMA atomic units)<input inputMode="numeric" value={highRisk} onChange={e=>setHighRisk(e.target.value)} disabled={!admin||busy}/></label>
     <button disabled={!admin||busy||!policy} onClick={()=>perform("governance-policy-update",{
      expectedVersion:policy.version,patch:{maxPaymentUnits:maxPayment,dailyUnits:daily,highRiskUnits:highRisk,enforceTwoPersonHighRisk:true}
     },"Change the organization Testnet security policy? Already approved but unsubmitted payments will require new authorization.")}>
      Apply versioned policy
     </button>
    </article>
    <article>
     <h4>Emergency incident controls</h4>
     <p>Owner/admin can immediately pause new intents, approvals and signatures. Recovery of an uncertain previously sent transaction remains read-only and available.</p>
     <label>Emergency reason<textarea rows={3} maxLength={400} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     <button disabled={!admin||busy||!!policy?.paused||reason.trim().length<12}
       onClick={()=>perform("governance-pause",{reason},"Activate immediate Testnet financial pause? This will invalidate earlier approvals.")}>
       Emergency pause
     </button>
     <div className="ama-m7-actions">
      <button disabled={!admin||busy||!policy?.paused} onClick={()=>perform("governance-resume-request",{},
       "Request resumed financial processing? A different owner/admin must confirm.")}>Request unpause</button>
      <input placeholder="Independent resume request ID" value={requestId} onChange={e=>setRequestId(e.target.value)}/>
      <button disabled={!admin||busy||!policy?.paused||!requestId} onClick={()=>perform("governance-resume-confirm",{
       requestId
      },"Confirm another admin's pending resume request? Old approvals stay invalid.")}>Independent confirm</button>
     </div>
    </article>
    <article>
     <h4>Manual risk holds</h4>
     <p>Reported invoice or recipient holds block both approval and signing. A report is not a verified sanctions or AML match.</p>
     <label>Risk category<select value={riskKind} onChange={e=>setRiskKind(e.target.value)}>
      {RISK_KINDS.map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
     </select></label>
     <label>Invoice reference<input value={riskInvoice} maxLength={90} onChange={e=>setRiskInvoice(e.target.value)}/></label>
     <label>Native recipient (alternative to invoice reference)<input value={riskRecipient} onChange={e=>setRiskRecipient(e.target.value)}/></label>
     <label>Factual report reason<textarea rows={2} value={riskReason} maxLength={300} onChange={e=>setRiskReason(e.target.value)}/></label>
     <button disabled={!canReport||busy||riskReason.length<8||(!riskInvoice&&!riskRecipient)}
      onClick={()=>perform("governance-risk-report",{kind:riskKind,invoiceRef:riskInvoice,recipient:riskRecipient,reason:riskReason})}>
       Add scoped security hold
     </button>
     {risks.slice(0,20).map(r=><div className="ama-m7-record" key={r.id}>
      <strong>{r.kind}</strong> · {r.active?"ACTIVE HOLD":"closed"}
      <p>{r.invoice_ref||r.recipient||"Unknown scope"}</p>
      {r.active&&admin&&<button disabled={busy} onClick={()=>perform("governance-risk-close",{id:r.id,reason:"Reviewed reported risk and documented current independent evidence"},
       "Close this manual risk hold and invalidate previous approvals?")}>Close after review</button>}
     </div>)}
    </article>
    <article>
     <h4>Incident report and recovery</h4>
     <label>Incident type<input maxLength={40} value={incidentKind} onChange={e=>setIncidentKind(e.target.value)}/></label>
     <label>Severity<select value={incidentSeverity} onChange={e=>setIncidentSeverity(e.target.value)}>
      {["low","medium","high","critical"].map(v=><option key={v}>{v}</option>)}</select></label>
     <label>Factual description<textarea rows={2} maxLength={500} value={incidentDetail} onChange={e=>setIncidentDetail(e.target.value)}/></label>
     <button disabled={busy||incidentDetail.length<12} onClick={()=>perform("governance-incident-report",{
      severity:incidentSeverity,kind:incidentKind,detail:incidentDetail
     })}>Record incident</button>
     <p>Uncertain M4 transactions require independent Testnet lookup. Never retry raw broadcasts.</p>
     {recovery.slice(0,12).map(tx=><div className="ama-m7-record" key={tx.intentId}>
      <strong>{tx.status}</strong> · {tx.broadcastAttempts} reserved attempt(s)
      <p><code>{tx.txHash}</code></p>
      <p>{tx.recovery}</p>
     </div>)}
     <p>Recorded incidents: {incidents.length}</p>
    </article>
    <article className="ama-m7-wide">
     <h4>Security audit and regulatory boundaries</h4>
     <p>Database event hash-chain verification: <strong>{audit?(audit.valid?"Continuity valid":"Integrity failure"):"Owner/admin audit access required"}</strong>. This is not externally notarized.</p>
     {audit&&<p>{audit.checked} audited governance events · Last hash: <code>{audit.lastHash}</code></p>}
     <p><strong>Compliance providers:</strong> KYC not integrated; KYB not integrated; AML/sanctions not integrated. Manual risk flags are not legal compliance clearance.</p>
     <button disabled={busy} onClick={()=>{setBusy(true);setError("");refresh().catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>Refresh policy and incident evidence</button>
    </article>
   </div>}
  </>}
  {notice&&<p role="status" className="ama-notice">{notice}</p>}
  {error&&<p role="alert" className="ama-error">{error}</p>}
 </section>;
}
