import React,{useEffect,useState} from "react";
import "./amadeus-invoices.css";
const API="/api/v3/ama";
async function request(op,{body,csrf,query}={}){
 const res=await fetch(API+"?operation="+op+(query||""),{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"M6 invoice request failed");
 return data;
}
async function asBase64(file){
 if(file.size>2097152||file.size<4)throw Error("Invoice source must contain 4 bytes–2 MiB");
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error("Could not read invoice source"));
  reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
  reader.readAsDataURL(file);
 });
}
export default function AmadeusInvoicesPanel({identity,connectedWallet}){
 const active=!!identity?.csrf&&identity?.address===connectedWallet;
 const choices=active?identity.workspaces||[]:[];
 const [workspaceId,setWorkspaceId]=useState("");
 const [documents,setDocuments]=useState([]);
 const [suppliers,setSuppliers]=useState([]);
 const [invoices,setInvoices]=useState([]);
 const [intents,setIntents]=useState([]);
 const [file,setFile]=useState(null);
 const [supplierName,setSupplierName]=useState("");
 const [supplierAddress,setSupplierAddress]=useState("");
 const [documentId,setDocumentId]=useState("");
 const [supplierId,setSupplierId]=useState("");
 const [reference,setReference]=useState("");
 const [currency,setCurrency]=useState("AMA");
 const [amount,setAmount]=useState("");
 const [invoiceId,setInvoiceId]=useState("");
 const [intentId,setIntentId]=useState("");
 const [sourceAck,setSourceAck]=useState(false);
 const [matchAck,setMatchAck]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [selected,setSelected]=useState(null);
 const role=choices.find(w=>w.workspace_id===workspaceId)?.role||"";
 const canWrite=["owner","admin","operator"].includes(role);
 const canVerifySupplier=["owner","admin"].includes(role);
 const canExport=["owner","admin"].includes(role);
 useEffect(()=>{
  const opts=identity?.workspaces||[];
  setWorkspaceId(current=>opts.some(x=>x.workspace_id===current)?current:opts[0]?.workspace_id||"");
  setDocuments([]);setSuppliers([]);setInvoices([]);setIntents([]);
 },[identity?.address,connectedWallet,identity?.workspaces]);
 useEffect(()=>{setSelected(null);setSourceAck(false);setMatchAck(false)},[workspaceId,invoiceId]);
 useEffect(()=>{
  if(!active||!workspaceId)return;
  let mounted=true;
  (async()=>{
   const q="&workspaceId="+encodeURIComponent(workspaceId);
   const results=await Promise.all([
    request("invoice-documents",{query:q}),request("invoice-suppliers",{query:q}),
    request("invoice-list",{query:q}),request("intent-list",{query:q})
   ]);
   if(mounted){
    setDocuments(results[0].documents||[]);setSuppliers(results[1].suppliers||[]);
    setInvoices(results[2].invoices||[]);setIntents(results[3].intents||[]);
   }
  })().catch(e=>{if(mounted)setError(e.message||"Cannot read invoice records")});
  return()=>{mounted=false};
 },[active,workspaceId]);
 async function reload(){
  const q="&workspaceId="+encodeURIComponent(workspaceId);
  const [d,s,i,p]=await Promise.all([
   request("invoice-documents",{query:q}),request("invoice-suppliers",{query:q}),
   request("invoice-list",{query:q}),request("intent-list",{query:q})
  ]);
  setDocuments(d.documents||[]);setSuppliers(s.suppliers||[]);
  setInvoices(i.invoices||[]);setIntents(p.intents||[]);
 }
 async function run(callback){
  if(busy)return;
  setBusy(true);setError("");setMessage("");
  try{await callback()}catch(e){setError(e.message||"M6 invoice operation failed")}
  finally{setBusy(false)}
 }
 async function ingest(){
  if(!file)throw Error("Select a PDF, image or text invoice first");
  const base64=await asBase64(file);
  const r=await request("invoice-ingest",{csrf:identity.csrf,body:{
   workspaceId,document:{filename:file.name,mime:file.type,base64}
  }});
  setDocumentId(r.document.id);setFile(null);
  setMessage("Source SHA-256: "+r.document.sha256+" · "+
   r.document.extractionStatus+". Raw file bytes are not retained; human review is required.");
  await reload();
 }
 async function supplier(){
  const r=await request("invoice-supplier-create",{csrf:identity.csrf,body:{
   workspaceId,name:supplierName,address:supplierAddress||undefined
  }});
  setSupplierId(r.supplier.id);setMessage("Supplier entered as UNVERIFIED. Administrator must review independently.");
  setSupplierName("");setSupplierAddress("");await reload();
 }
 async function reviewSupplier(){
  if(!window.confirm("Did you independently review this supplier and its native payout address? This does NOT attest legal identity."))return;
  await request("invoice-supplier-review",{csrf:identity.csrf,body:{workspaceId,id:supplierId,ackAddress:true}});
  setMessage("Supplier manually reviewed; identity is not cryptographically attested.");await reload();
 }
 async function createInvoice(){
  const r=await request("invoice-create",{csrf:identity.csrf,body:{
   workspaceId,documentId,supplierId,invoiceRef:reference,currency,amount
  }});
  setInvoiceId(r.invoice.id);setMessage("Invoice metadata recorded UNVERIFIED. A human must check source and amount.");
  await reload();
 }
 async function reviewInvoice(){
  const record=invoices.find(x=>x.id===invoiceId);
  if(!record||!sourceAck)throw Error("Select an invoice and acknowledge the exact source SHA-256");
  await request("invoice-verify",{csrf:identity.csrf,body:{
   workspaceId,id:invoiceId,sourceSha256:record.sourceSha256,ackSourceReviewed:true
  }});
  setSourceAck(false);setMessage("Human-reviewed invoice recorded. No chain or fiat payment is implied.");
  await reload();
 }
 async function linkPayment(){
  if(!matchAck||!invoiceId||!intentId)throw Error("Select invoice and M3 intent and review the exact recipient and units");
  await request("invoice-link",{csrf:identity.csrf,body:{
   workspaceId,invoiceId,intentId,ackHumanMatch:true
  }});
  setMatchAck(false);setMessage("M3 intent linked without claiming payment. Reconcile after M4 has independently verified finality.");
  await reload();
 }
 async function reconcile(){
  const r=await request("invoice-reconcile",{query:"&workspaceId="+encodeURIComponent(workspaceId)+"&id="+encodeURIComponent(invoiceId)});
  setSelected(r.invoice);
  setMessage("Recomputed against existing M4 chain evidence; no broadcast or fiat conversion performed.");
  await reload();
 }
 async function downloadCSV(){
  const result=await request("invoice-export",{query:"&workspaceId="+encodeURIComponent(workspaceId)});
  const blob=new Blob([result.csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  try{
   const link=document.createElement("a");
   link.href=url;link.download=result.filename;document.body.appendChild(link);link.click();link.remove();
  }finally{URL.revokeObjectURL(url)}
  setMessage("Export contains only provenance metadata and independently verified M4 receipts. No bank payouts or FX are claimed.");
 }
 const source=documents.find(d=>d.id===documentId);
 const current=invoices.find(i=>i.id===invoiceId);
 return <section className="ama-m6">
  <header><span className="ama-eyebrow">M6 · INVOICE INTELLIGENCE / NATIVE AMA TESTNET</span>
   <h3>Secure source intake and evidence-based accounting</h3>
   <p>Invoices remain unverified until an authorized human reviews the source. Images require manual transcription: no OCR or external invoice authenticity is claimed.</p>
  </header>
  {!active?<p className="ama-m6-warning">Authenticate your native Amadeus Testnet wallet before accessing organizational invoice data.</p>:<>
   <label>Organization<select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
    <option value="">Select workspace</option>{choices.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} · {w.role}</option>)}
   </select></label>
   {workspaceId&&<>
    <div className="ama-m6-grid">
     <article><h4>1. Invoice source / provenance</h4>
      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain"
       onChange={e=>setFile(e.target.files?.[0]||null)}/>
      <p>Max 2 MiB; up to eight PDF pages. PDF text extraction is unverified; image OCR is disabled. Uploaded bytes are not persisted.</p>
      <button disabled={!canWrite||busy||!file} onClick={()=>run(ingest)}>Validate source and record SHA-256</button>
      <label>Stored document<select value={documentId} onChange={e=>setDocumentId(e.target.value)}>
       <option value="">Select source</option>{documents.map(d=><option key={d.id} value={d.id}>{d.filename} · {d.extraction_status}</option>)}
      </select></label>
      {source&&<p><b>Digest:</b> <code>{source.sha256}</code> · <b>Pages:</b> {source.page_count||"—"}<span className="ama-m6-preview">{source.extracted_preview||"No machine-readable text; manual review required."}</span></p>}
     </article>
     <article><h4>2. Supplier directory and human review</h4>
      <label>Supplier name<input maxLength={100} value={supplierName} onChange={e=>setSupplierName(e.target.value)}/></label>
      <label>Native AMA payout address (optional for fiat invoices)<input value={supplierAddress} onChange={e=>setSupplierAddress(e.target.value)} placeholder="Native Base58 account"/></label>
      <button disabled={!canWrite||busy||!supplierName} onClick={()=>run(supplier)}>Record unverified supplier</button>
      <label>Supplier<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}>
       <option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name} · {s.status}</option>)}
      </select></label>
      <button disabled={!canVerifySupplier||busy||!supplierId} onClick={()=>run(reviewSupplier)}>Human review supplier and payout address</button>
      <p>Native payout addresses must already be on M3's allowlist.</p>
     </article>
     <article><h4>3. Create an unverified invoice</h4>
      <p>Select an uploaded source and supplier first.</p>
      <label>Invoice reference<input maxLength={90} value={reference} onChange={e=>setReference(e.target.value)} placeholder="INV-2026-001"/></label>
      <label>Declared amount<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{["AMA","GBP","USD","EUR"].map(x=><option key={x}>{x}</option>)}</select></label>
      <button disabled={busy||!canWrite||!documentId||!supplierId||!reference||!amount} onClick={()=>run(createInvoice)}>Create unverified invoice metadata</button>
      <p>{currency!=="AMA"?"Fiat invoices cannot be matched to AMA settlement without verified FX and payout rails.":"Native AMA invoices can be matched only to independently finalized on-chain transactions."}</p>
     </article>
     <article><h4>4. Human verification and M3 linkage</h4>
      <label>Invoice<select value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}>
       <option value="">Select invoice</option>{invoices.map(i=><option key={i.id} value={i.id}>{i.invoiceRef} · {i.status} · {i.settlement?.state}</option>)}
      </select></label>
      {current&&<div><p><b>Supplier:</b> {current.supplier} · {current.currency} {current.amount}</p>
       <p><b>Source digest:</b> <code>{current.sourceSha256}</code></p>
       <p><b>Reconciliation:</b> {current.settlement?.state} · Native settled atomic: {current.settlement?.settledUnits}</p></div>}
      <label className="ama-m6-check"><input type="checkbox" checked={sourceAck} onChange={e=>setSourceAck(e.target.checked)}/>
       I personally reviewed the original source, invoice amount, supplier and digest above.</label>
      <button disabled={busy||!canWrite||!invoiceId||!sourceAck||current?.status!=="unverified"} onClick={()=>run(reviewInvoice)}>Record human invoice verification</button>
      <label>Human-approved M3 payment intent<select value={intentId} onChange={e=>setIntentId(e.target.value)}>
       <option value="">Select linked AMA intent</option>{intents.filter(i=>i.status==="awaiting_wallet_signature").map(i=><option key={i.id} value={i.id}>{i.amount} AMA · {i.invoiceRef||"no invoice ref"} · {i.id.slice(0,8)}</option>)}
      </select></label>
      <label className="ama-m6-check"><input type="checkbox" checked={matchAck} onChange={e=>setMatchAck(e.target.checked)}/>
       I checked exact invoice reference, native AMA recipient and atomic amount. Linking is not proof of payment.</label>
      <button disabled={busy||!canWrite||!invoiceId||!intentId||!matchAck||current?.currency!=="AMA"||current?.status!=="human_verified"} onClick={()=>run(linkPayment)}>Link approved M3 intent</button>
      <button disabled={busy||!invoiceId} onClick={()=>run(reconcile)}>Read M4-verified reconciliation</button>
     </article>
    </div>
    <article className="ama-m6-ledger"><h4>5. Organization accounting evidence</h4>
     <div className="ama-m6-actions"><button disabled={busy} onClick={()=>run(reload)}>Refresh ledger</button>
      <button disabled={busy||!canExport} onClick={()=>run(downloadCSV)}>Export injection-safe accounting CSV</button></div>
     <div className="ama-m6-table"><table><thead><tr><th>Invoice</th><th>Declared</th><th>Source review</th><th>Settlement</th><th>Verified native AMA atomic units</th></tr></thead>
      <tbody>{invoices.map(i=><tr key={i.id}><td>{i.invoiceRef}</td><td>{i.amount} {i.currency}</td><td>{i.status}</td><td>{i.settlement?.state||"unmatched"}</td><td>{i.settlement?.settledUnits||"0"}</td></tr>)}</tbody>
     </table></div>
     {selected&&<pre>{JSON.stringify({invoice:selected.invoiceRef,settlement:selected.settlement,network:selected.network},null,2)}</pre>}
     <p className="ama-m6-warning">Unmatched/pending/partial/failed/disputed are not successful settlement. A fiat invoice is never marked paid by native AMA amounts without independently verified conversion and payout evidence.</p>
    </article>
   </>}
  </>}
  {message&&<p className="ama-notice" role="status">{message}</p>}
  {error&&<p className="ama-error" role="alert">{error}</p>}
 </section>;
}
