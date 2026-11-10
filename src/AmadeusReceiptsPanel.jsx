import React,{useEffect,useState} from "react";
import {CheckCircle2,Clock3,FileWarning,RefreshCw,ShieldAlert,WalletCards} from "lucide-react";
import {displayCount} from "./amadeus-ui-model.js";
const API="/api/v3/ama";
async function load(workspaceId){
 const response=await fetch(API+"?operation=ux-receipts&workspaceId="+encodeURIComponent(workspaceId),
  {method:"GET",credentials:"same-origin",headers:{"Accept":"application/json"}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||"Read-only chain-evidence records unavailable");
 if(body.network?.id!=="amadeus-testnet"||body.verifiedOnlyFromM4!==true)
  throw Error("Unexpected chain evidence network or provenance");
 return body;
}
function tone(status){return status==="verified"?"is-verified":status==="error"?"is-error":status==="warning"?"is-warning":"is-pending"}
export default function AmadeusReceiptsPanel({identity,connectedWallet,onNavigate}){
 const authenticated=!!identity?.csrf&&identity?.address===connectedWallet;
 const workspaces=authenticated?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [records,setRecords]=useState(null);
 const [selected,setSelected]=useState(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  const choices=identity?.workspaces||[];
  setWorkspaceId(old=>choices.some(w=>w.workspace_id===old)?old:choices[0]?.workspace_id||"");
  setRecords(null);setSelected(null);setError("");
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{
  if(!authenticated||!workspaceId){setRecords(null);return}
  let live=true;setLoading(true);setError("");setRecords(null);setSelected(null);
  load(workspaceId).then(data=>{if(live)setRecords(data)})
   .catch(e=>{if(live)setError(e?.message||"Evidence unavailable")})
   .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[authenticated,workspaceId,version]);
 return <section className="ama-m8-receipts" aria-labelledby="ama-m8-receipts-title">
  <div className="ama-m8-section-head"><div>
   <span className="ama-eyebrow">CHAIN EVIDENCE · M4 INDEPENDENT FINALITY</span>
   <h2 id="ama-m8-receipts-title">Transaction evidence, not assumptions</h2>
   <p>Only recorded native Amadeus Testnet Coin.transfer receipts verified independently by M4 can be labeled finalized. Pending, failed, uncertain and disputed transactions are not settled.</p>
  </div><button type="button" className="ama-m8-secondary" disabled={!authenticated||!workspaceId||loading}
   onClick={()=>setVersion(x=>x+1)}><RefreshCw size={16} aria-hidden="true"/> {loading?"Loading…":"Refresh records"}</button></div>
  {!authenticated?<div className="ama-m8-empty" role="status"><WalletCards aria-hidden="true" size={28}/>
   <h3>Wallet authentication required</h3><p>Chain-evidence records are organization-scoped, not publicly indexed payment claims.</p>
   <button type="button" onClick={()=>onNavigate?.("wallet")}>Open wallet sign-in</button>
  </div>:<>
   <label className="ama-m8-org-select">Organization<select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
    <option value="">Select organization</option>{workspaces.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} · {w.role}</option>)}
   </select></label>
   <div className="ama-m8-fetch" role={error?"alert":"status"} aria-live="polite">
    {loading?"Checking stored chain-evidence records…":error?"Records unavailable: "+error:
     records?"Loaded stored Testnet evidence · "+displayCount(records.records.length,{capped:records.capped})+" record(s)":"Select an organization to inspect records"}
   </div>
   {records&&<><div className="ama-m8-evidence-list">
    {!records.records.length?<div className="ama-m8-empty"><FileWarning size={27} aria-hidden="true"/>
     <h3>No recorded transactions for this organization</h3>
     <p>This does not indicate any transfer occurred. You can prepare native AMA intents using the separate human-approved payments flow.</p>
     <button type="button" onClick={()=>onNavigate?.("payments")}>Open payments</button></div>:
    records.records.map((row,index)=><button type="button"
     className={"ama-m8-evidence-row "+(selected===index?"is-selected":"")} key={row.intentId||index}
     aria-pressed={selected===index} onClick={()=>setSelected(selected===index?null:index)}>
     <span className={"ama-m8-state-indicator "+tone(row.tone)}>
      {row.independentlyVerified?<CheckCircle2 size={19} aria-hidden="true"/>:
       ["error","warning"].includes(row.tone)?<ShieldAlert size={19} aria-hidden="true"/>:
        <Clock3 size={19} aria-hidden="true"/>}
     </span>
     <span className="ama-m8-evidence-content"><b>{row.independentlyVerified?"Verified finality":row.status.replaceAll("_"," ")}</b>
      <small>{row.label}</small></span>
     <span className="ama-m8-evidence-meta"><span>{row.amountUnits?row.amountUnits+" atomic AMA":"Amount unavailable"}</span><small>{row.hash?row.hash.slice(0,16)+"…":"No chain hash"}</small></span>
    </button>)}
   </div>
   {selected!==null&&records.records[selected]&&(()=>{
    const item=records.records[selected];
    return <article className="ama-m8-evidence-details" aria-label="Selected native AMA transaction evidence">
     <h3>{item.independentlyVerified?"Independently finalized M4 receipt":"Not verified as final settlement"}</h3>
     <dl className="ama-m8-facts">
      <div><dt>Network</dt><dd>Amadeus L1 Testnet</dd></div>
      <div><dt>Native token</dt><dd>AMA</dd></div>
      <div><dt>Execution state</dt><dd>{item.status}</dd></div>
      <div><dt>Transaction hash</dt><dd><code>{item.hash||"Not recorded"}</code></dd></div>
      <div><dt>Approved payer</dt><dd><code>{item.payer||"Not recorded"}</code></dd></div>
      <div><dt>Approved recipient</dt><dd><code>{item.recipient||"Not recorded"}</code></dd></div>
      <div><dt>Exact atomic amount</dt><dd>{item.amountUnits??"Not recorded"}</dd></div>
      <div><dt>Finality evidence</dt><dd>{item.independentlyVerified?"M4 matching finalized Coin.transfer":"Not independently finalized"}</dd></div>
      {item.independentlyVerified&&<><div><dt>Block entry hash</dt><dd><code>{item.entryHash}</code></dd></div>
       <div><dt>Entry height</dt><dd>{item.entryHeight}</dd></div></>}
     </dl>
     <p className={item.independentlyVerified?"ama-m8-note":"ama-m8-danger"} role="status">
      {item.independentlyVerified?
       "Stored M4 verification matched transaction hash, payer, recipient, exact AMA units, successful Coin.transfer and finality.":
       "This record does not prove settlement. Use the authenticated M4 execution-reconcile action from Payments after official Testnet evidence is available. Never rebroadcast a reserved or uncertain packet."}</p>
     <button type="button" className="ama-m8-secondary" onClick={()=>onNavigate?.("payments")}>Open M4 payment reconciliation</button>
    </article>;
   })()}
   <p className="ama-m8-footnote">The interface reads previously recorded M4 evidence; it does not broadcast, resubmit, or independently make new RPC claims. {records.capped?"Showing the latest 50 records only.":""} {records.caveat}</p>
   </>}
  </>}
 </section>;
}
