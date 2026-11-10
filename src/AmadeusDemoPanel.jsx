import React,{useEffect,useState} from "react";
import {ClipboardList,Download,ShieldAlert,FileCheck2} from "lucide-react";
import "./amadeus-demo.css";
const API="/api/v3/ama";
async function getDemo(operation,workspaceId){
 const response=await fetch(API+"?operation="+operation+
  "&workspaceId="+encodeURIComponent(workspaceId),{
   method:"GET",credentials:"same-origin",headers:{"Accept":"application/json"}});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||"Testnet evidence currently unavailable");
 if(result.network!=="amadeus-testnet")throw Error("Unexpected blockchain network");
 return result;
}
export default function AmadeusDemoPanel({identity,connectedWallet}){
 const auth=!!identity?.csrf&&identity.address===connectedWallet;
 const workspaces=auth?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [result,setResult]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [status,setStatus]=useState("");
 const role=workspaces.find(w=>w.workspace_id===workspaceId)?.role;
 const canReview=auth&&["owner","admin"].includes(role);
 useEffect(()=>{
  const available=identity?.workspaces||[];
  setWorkspaceId(old=>available.some(w=>w.workspace_id===old)?old:available[0]?.workspace_id||"");
 },[identity?.address,identity?.workspaces,connectedWallet]);
 useEffect(()=>{setResult(null);setError("");setStatus("")},[workspaceId,connectedWallet]);
 async function refresh(exportFile=false){
  if(!canReview||busy)return;
  setError("");setStatus("");setBusy(true);
  try{
   const data=await getDemo(exportFile?"demo-grant-export":"demo-readiness",workspaceId);
   const manifest=exportFile?data.manifest:data.grantSnapshot;
   if(!manifest||manifest.release.decision!=="NO_GO_FOR_PUBLIC_FUNDS_AND_MAINNET")
    throw Error("M10 refuses to export an unverified positive release claim");
   if(exportFile){
    const content=JSON.stringify({schema:manifest.schema,manifest,checklist:data.checklist,
     warning:"Testnet-only documentation — NOT a funded live transfer or approved external security audit"},null,2);
    const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
    try{
     const a=document.createElement("a");a.href=url;
     a.download="33jack-v3-m10-testnet-evidence-"+manifest.digest.slice(0,10)+".json";
     document.body.appendChild(a);a.click();a.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),500)}
    setStatus("Redacted grant-evidence JSON prepared. This is not a live financial settlement certificate.");
   }else{
    setResult(data);
    setStatus("Source-backed organization snapshot generated. External blockers remain open.");
   }
  }catch(e){setError(e?.message||"M10 evidence unavailable")}
  finally{setBusy(false)}
 }
 return <section className="ama-m10" aria-labelledby="ama-m10-heading">
  <div className="ama-m10-heading">
   <div><span className="ama-eyebrow">M10 · FINAL TESTNET DEMO & GRANT EVIDENCE</span>
    <h2 id="ama-m10-heading">Build the case. Preserve the proof.</h2>
    <p>Generate a read-only, redacted evidence manifest for the Amadeus Early Builders application. CI fixtures, incomplete external review and unverified live transfers stay clearly marked.</p></div>
   <span className="ama-m10-no-go"><ShieldAlert size={17} aria-hidden="true"/> Live funds NO-GO</span>
  </div>
  {!auth?<p role="status" className="ama-m10-empty">Authenticate your native Testnet wallet to access your private organization evidence.</p>:<>
   <label>Organization
    <select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
     <option value="">Choose organization</option>
     {workspaces.map(w=><option value={w.workspace_id} key={w.workspace_id}>{w.name} · {w.role}</option>)}
    </select>
   </label>
   {!canReview?<p role="status" className="ama-m10-empty">Only signed-in organization owners/admins can export grant evidence. Other roles retain their existing permissions.</p>:<>
    <div className="ama-m10-buttons">
     <button type="button" disabled={busy||!workspaceId} onClick={()=>refresh(false)}>
      <ClipboardList size={16} aria-hidden="true"/> {busy?"Loading evidence…":"Prepare demo readiness"}</button>
     <button type="button" disabled={busy||!workspaceId} className="ama-m10-outline" onClick={()=>refresh(true)}>
      <Download size={16} aria-hidden="true"/> Export redacted evidence JSON</button>
    </div>
    {result&&<article className="ama-m10-result" aria-live="polite">
     <div className="ama-m10-result-header"><strong>{result.decision.replaceAll("_"," ")}</strong><span>{result.network}</span></div>
     <p><FileCheck2 size={16} aria-hidden="true"/> Snapshot SHA-256: <code>{result.grantSnapshot.digest}</code></p>
     <p>Sampled M9 evidence records: {result.grantSnapshot.sourceSnapshot.sampledM9Records}. This is a bounded sample, not the full financial ledger.</p>
     <h3>Human and external witness checklist</h3>
     <ol>{result.manualChecklist?.map(x=><li key={x.id}>
      <strong>{x.label}</strong><small>Awaiting evidence: {x.proofNeeded.replaceAll("_"," ")}</small>
     </li>)}</ol>
     <p className="ama-m10-caution">No automatic mainnet deployment, blockchain broadcast, wallet signing, agent approval or false grant certification is available from this screen.</p>
    </article>}
   </>}
  </>}
  {status&&<p role="status" className="ama-m10-notice">{status}</p>}
  {error&&<p role="alert" className="ama-m10-error">{error}</p>}
 </section>;
}
