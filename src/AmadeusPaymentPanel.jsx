import React,{useEffect,useState} from "react";
import "./amadeus-payment.css";
import AmadeusExecutionPanel from "./AmadeusExecutionPanel.jsx";

const API="/api/v3/ama";
const makeKey=()=>crypto.randomUUID();
async function paymentApi(op,{body,csrf,key,query}={}){
 const res=await fetch(API+"?operation="+op+(query||""),{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{}),...(key?{"X-Idempotency-Key":key}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Payment-intent API returned HTTP "+res.status);
 return data;
}
const short=(value)=>value?.length>30?value.slice(0,13)+"…"+value.slice(-10):value||"—";
const approvalRoles=new Set(["owner","admin","approver"]);
const proposalRoles=new Set(["owner","admin","operator"]);
const manageRoles=new Set(["owner","admin"]);

export default function AmadeusPaymentPanel({identity,connectedWallet,seed}){
 const [workspaceId,setWorkspaceId]=useState("");
 const [rec,setRec]=useState("");
 const [amount,setAmount]=useState("1");
 const [memo,setMemo]=useState("");
 const [invoiceRef,setInvoiceRef]=useState("");
 const [expires,setExpires]=useState(20);
 const [selfTransfer,setSelfTransfer]=useState(false);
 const [key,setKey]=useState(makeKey);
 const [intent,setIntent]=useState(null);
 const [checked,setChecked]=useState(false);
 const [beneficiaries,setBeneficiaries]=useState([]);
 const [intents,setIntents]=useState([]);
 const [beneficiaryLabel,setBeneficiaryLabel]=useState("");
 const [beneficiaryAddress,setBeneficiaryAddress]=useState("");
 const [beneficiaryStatus,setBeneficiaryStatus]=useState("allowed");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const sessionActive=!!identity?.csrf&&!!identity?.address&&identity.address===connectedWallet;
 const workspaces=sessionActive?(identity.workspaces||[]):[];
 const selected=workspaces.find(x=>x.workspace_id===workspaceId);
 const role=selected?.role||"";
 const canPropose=proposalRoles.has(role);
 const canApprove=approvalRoles.has(role);
 const canManage=manageRoles.has(role);
 useEffect(()=>{
  const choices=identity?.workspaces||[];
  setWorkspaceId(current=>choices.some(x=>x.workspace_id===current)?current:choices[0]?.workspace_id||"");
  setIntent(null);setIntents([]);setBeneficiaries([]);
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{
  if(!sessionActive||!workspaceId)return;
  let live=true;
  Promise.all([
   paymentApi("beneficiary-list",{query:"&workspaceId="+encodeURIComponent(workspaceId)}),
   paymentApi("intent-list",{query:"&workspaceId="+encodeURIComponent(workspaceId)})
  ]).then(([b,i])=>{if(live){setBeneficiaries(b.beneficiaries||[]);setIntents(i.intents||[]);}})
   .catch(e=>{if(live)setError(e.message||"Cannot read payment ledger")});
  return()=>{live=false};
 },[workspaceId,sessionActive]);
 useEffect(()=>{
  setIntent(null);setChecked(false);setKey(makeKey());
 },[workspaceId,rec,amount,memo,invoiceRef,expires,selfTransfer,connectedWallet]);
 async function run(task){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{await task()}catch(e){setError(e.message||"Payment request failed")}
  finally{setBusy(false)}
 }
 async function reload(){
  if(!workspaceId)return;
  const [b,i]=await Promise.all([
   paymentApi("beneficiary-list",{query:"&workspaceId="+encodeURIComponent(workspaceId)}),
   paymentApi("intent-list",{query:"&workspaceId="+encodeURIComponent(workspaceId)})
  ]);
  setBeneficiaries(b.beneficiaries||[]);setIntents(i.intents||[]);
 }
 async function updateBeneficiary(){
  const data=await paymentApi("beneficiary-set",{csrf:identity.csrf,body:{
   workspaceId,address:beneficiaryAddress,status:beneficiaryStatus,label:beneficiaryLabel
  }});
  if(data.beneficiary?.status==="allowed")setRec(data.beneficiary.address);
  setNotice("Recipient policy saved. Any prior payment review for this recipient must be revalidated.");
  await reload();
 }
 async function create(){
  if(!sessionActive||!canPropose)throw Error("Authenticated proposer permission required");
  const data=await paymentApi("intent-create",{csrf:identity.csrf,key,body:{
   workspaceId,network:"amadeus-testnet",payer:identity.address,
   recipient:rec,amount,token:"AMA",memo,invoiceRef,expiresInMinutes:expires,
   selfTransferAcknowledged:selfTransfer
  }});
  setIntent(data.intent);setChecked(false);
  setNotice(data.reused?"Existing idempotent draft returned; no duplicate created.":
    "Durable native AMA payment draft created. No transaction submitted.");
  await reload();
 }
 async function transition(op){
  if(!intent||!checked||!sessionActive)throw Error("Check the exact terms and authenticate first");
  const data=await paymentApi("intent-"+op,{csrf:identity.csrf,body:{
   workspaceId,id:intent.id,termsHash:intent.termsHash,ackExactTerms:true
  }});
  setIntent(data.intent);setChecked(false);
  setNotice(data.warning||"Payment review updated without broadcasting");
  await reload();
 }
 async function open(item){
  const data=await paymentApi("intent-get",{query:
   "&workspaceId="+encodeURIComponent(workspaceId)+"&id="+encodeURIComponent(item.id)});
  setIntent(data.intent);setChecked(false);
 }
 const known=beneficiaries.find(x=>x.address===rec);
 return <div className="ama-m3">
  <header><span className="ama-eyebrow">M3 · NATIVE AMA PAYMENT ENGINE</span>
   <h3>Prepare exact wallet-owned transfer intents</h3>
   <p>Prepared calls are unsigned JSON instructions, not signed blockchain transactions. They cannot move AMA in M3.</p></header>
  {!sessionActive?<div className="ama-m3-warning">You must connect and authenticate the same Amadeus Testnet wallet in M2 before creating or viewing organization payment intents. Database availability and extension-compatible login are required.</div>:<>
   <label>Organization
    <select value={workspaceId} onChange={e=>{setWorkspaceId(e.target.value);setIntent(null)}}>
     <option value="">Select workspace</option>
     {workspaces.map(x=><option key={x.workspace_id} value={x.workspace_id}>{x.name} · {x.role}</option>)}
    </select></label>
   {!workspaceId?<p>Create an organization in the identity panel first.</p>:<>
    <div className="ama-m3-grid">
     <section><h4>1. Recipient allowlist</h4>
      <p>Only administrators can allow or block native Amadeus Testnet recipients. Changing an entry invalidates previous review snapshots.</p>
      {canManage&&<>
       <label>Native Base58 account<input value={beneficiaryAddress} onChange={e=>setBeneficiaryAddress(e.target.value)} placeholder="Amadeus recipient public key"/></label>
       <label>Display label<input maxLength={80} value={beneficiaryLabel} onChange={e=>setBeneficiaryLabel(e.target.value)} placeholder="Approved supplier"/></label>
       <label>Policy<select value={beneficiaryStatus} onChange={e=>setBeneficiaryStatus(e.target.value)}>
        <option value="allowed">Allowed</option><option value="blocked">Blocked</option>
       </select></label>
       <button disabled={busy||!beneficiaryAddress} onClick={()=>run(updateBeneficiary)}>Save recipient policy</button>
      </>}
      <div className="ama-m3-list">{beneficiaries.length?beneficiaries.map(b=>
       <button key={b.address} type="button" disabled={busy||b.status!=="allowed"} onClick={()=>setRec(b.address)}>
        <b>{b.label||short(b.address)}</b><span>{b.status.toUpperCase()} · v{b.version}</span>
       </button>):<p>No approved recipients. An owner/admin must add one before a proposal can be created.</p>}</div>
     </section>
     <section><h4>2. Build native AMA proposal</h4>
      <p>Authenticated payer: <code>{short(identity.address)}</code></p>
      <label>Recipient native Base58 address<input value={rec} onChange={e=>setRec(e.target.value)} placeholder="Choose allowlisted recipient"/></label>
      <label>Amount (AMA, up to 9 decimal places)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="1.000000001"/></label>
      <label>Invoice reference (optional)<input maxLength={90} value={invoiceRef} onChange={e=>setInvoiceRef(e.target.value)}/></label>
      <label>Memo (optional)<input maxLength={140} value={memo} onChange={e=>setMemo(e.target.value)}/></label>
      <label>Expiry (minutes, 5–1440)<input type="number" min="5" max="1440" step="1" value={expires} onChange={e=>setExpires(Number(e.target.value))}/></label>
      <label className="ama-m3-check"><input type="checkbox" checked={selfTransfer} onChange={e=>setSelfTransfer(e.target.checked)}/> Allow an intentional self-transfer</label>
      {rec&&<p>Allowlist: <b>{known?.status==="allowed"?"Approved v"+known.version:"Not approved"}</b></p>}
      <button disabled={busy||!canPropose||!rec||!!intent} onClick={()=>run(create)}>Create durable unsigned AMA intent</button>
      {!canPropose&&<p>Role {role} cannot create payment intents.</p>}
     </section>
    </div>
    {intent&&<section className="ama-m3-review"><h4>3. Immutable terms and staged human review</h4>
     <p><b>State:</b> {intent.status} · <b>Network:</b> Amadeus Testnet · <b>Asset:</b> AMA</p>
     <dl><div><dt>Payer</dt><dd><code>{intent.payer}</code></dd></div>
      <div><dt>Recipient</dt><dd><code>{intent.recipient}</code></dd></div>
      <div><dt>Exact amount</dt><dd><strong>{intent.amount} AMA</strong> ({intent.atomicUnits} atomic units)</dd></div>
      <div><dt>Contract / call</dt><dd><code>{intent.unsignedCall.contract}.{intent.unsignedCall.method}</code></dd></div>
      <div><dt>Call arguments</dt><dd><code>{JSON.stringify(intent.unsignedCall.args)}</code></dd></div>
      <div><dt>Terms fingerprint</dt><dd><code>{intent.termsHash}</code></dd></div>
      <div><dt>Expiry</dt><dd>{new Date(intent.expiresAt).toLocaleString()}</dd></div>
      <div><dt>Recipient policy current</dt><dd>{intent.beneficiaryCurrent?"Yes":intent.blockReason||"No"}</dd></div>
     </dl>
     <label className="ama-m3-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
      I compared the exact network, payer, recipient, atomic amount, expiry, and terms hash above.</label>
     <div className="ama-m3-actions">
      {intent.status==="draft"&&<button disabled={busy||!checked||!canApprove||!intent.beneficiaryCurrent} onClick={()=>run(()=>transition("review"))}>Record exact-term review</button>}
      {intent.status==="reviewed"&&<button disabled={busy||!checked||!canApprove||!intent.beneficiaryCurrent} onClick={()=>run(()=>transition("approve"))}>Approve terms for future wallet signature</button>}
      {["draft","reviewed","awaiting_wallet_signature"].includes(intent.status)&&
       <button disabled={busy||!checked} onClick={()=>run(()=>transition("cancel"))}>Cancel unsigned intent</button>}
     </div>
     <p className="ama-m3-warning">M3 approval only records human review. The separate M4 execution panel requires a verified native wallet signature and fresh beneficiary/expiry checks. Never interpret review as settlement.</p>
    </section>}
    {intent&&<AmadeusExecutionPanel intent={intent} identity={identity} connectedWallet={connectedWallet} workspaceId={workspaceId}/>}
    <section><h4>4. Workspace intent history</h4>
     <button disabled={busy} onClick={()=>run(reload)}>Refresh intents</button>
     <div className="ama-m3-list">{intents.length?intents.map(item=>
      <button type="button" key={item.id} onClick={()=>run(()=>open(item))}>
       <b>{item.amount} AMA · {short(item.recipient)}</b>
       <span>{item.status} · {short(item.id)}</span>
      </button>):<p>No stored intents in this workspace yet.</p>}</div>
    </section>
   </>}
  </>}
  {seed&&<p>Imported invoice context is informational only; no unsupported currency-to-AMA exchange rate has been inferred.</p>}
  {notice&&<p className="ama-notice" role="status">{notice}</p>}
  {error&&<p className="ama-error" role="alert">{error}</p>}
 </div>;
}
