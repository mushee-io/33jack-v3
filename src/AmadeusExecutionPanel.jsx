import React,{useEffect,useState} from "react";
import {fromBase58,toBase58} from "@amadeus-protocol/sdk";
import "./amadeus-execution.css";
const API="/api/v3/ama";
async function api(operation,{body,csrf,query}={}){
 const res=await fetch(API+"?operation="+operation+(query||""),{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"M4 transaction request failed");
 return data;
}
async function assertOfficialWalletNetwork(provider){
 const networkCall=typeof provider?.getNetwork==="function"?provider.getNetwork:
   typeof provider?.getCurrentNetwork==="function"?provider.getCurrentNetwork:null;
 if(!networkCall)throw Error("Amadeus Wallet network inspection API is unavailable; signing is disabled.");
 const raw=await networkCall.call(provider);
 const network=typeof raw==="string"?raw:(raw?.network??raw?.name??raw?.id);
 const rpc=typeof raw==="object"?(raw?.rpcUrl??raw?.rpc):null;
 if(typeof network!=="string"||network.trim().toLowerCase()!=="testnet")
  throw Error("Wallet must independently report Amadeus Testnet before signing.");
 if(rpc&&String(rpc).replace(/\/$/,"")!=="https://testnet-rpc.ama.one/api")
  throw Error("Wallet RPC does not match the official Amadeus Testnet.");
}
async function assertSigningCapability(provider){
 if(typeof provider?.signTransaction!=="function"||typeof provider?.getCapabilities!=="function")
  throw Error("Installed Amadeus Wallet does not expose a documented sign-only capability check. Execution is disabled.");
 const capabilities=await provider.getCapabilities();
 // Unverified extensions MUST NOT be assumed to sign without broadcasting.
 if(capabilities?.offlineSigning!==true||capabilities?.returnsPackedTransaction!==true)
  throw Error("Cannot verify that this wallet signs without submitting. Do not use transaction signing as a fallback.");
}
function packSigned(signed){
 const value=signed?.txPacked??signed?.packed;
 if(value instanceof Uint8Array)return toBase58(value);
 if(typeof value==="string"&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(value))return value;
 throw Error("Wallet did not return a canonical native Base58 signed packet.");
}
export default function AmadeusExecutionPanel({intent,identity,connectedWallet,workspaceId}){
 const [staged,setStaged]=useState(null);
 const [checked,setChecked]=useState(false);
 const [execution,setExecution]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const active=!!identity?.csrf&&identity.address===connectedWallet&&
   intent?.payer===identity.address;
 useEffect(()=>{setStaged(null);setChecked(false);setExecution(null)},[
  intent?.id,intent?.termsHash,intent?.status,connectedWallet,identity?.address,workspaceId
 ]);
 async function run(task){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{await task()}catch(e){setError(e?.message||"Execution unavailable")}
  finally{setBusy(false)}
 }
 async function status(){
  if(!identity||!workspaceId)throw Error("Sign into the matching wallet");
  const result=await api("execution-status",{query:
   "&workspaceId="+encodeURIComponent(workspaceId)+"&id="+encodeURIComponent(intent.id)});
  setExecution(result.execution);
  if(result.execution)setNotice("Reserved hash found. Reconcile on the official Testnet; never broadcast again.");
  else setNotice("No signed packet has been reserved.");
 }
 async function sign(){
  if(!active||intent.status!=="awaiting_wallet_signature"||!intent.beneficiaryCurrent)
   throw Error("Exact approved terms and wallet-owner authentication are required.");
  if(new Date(intent.expiresAt).getTime()<=Date.now())throw Error("Payment approval expired.");
  const provider=window.amadeus;
  if(!provider)throw Error("Install the native Amadeus Wallet extension.");
  await assertOfficialWalletNetwork(provider);
  await assertSigningCapability(provider);
  const accounts=await provider.requestAccounts?.();
  if(!accounts?.length||accounts[0]!==identity.address)
   throw Error("Selected extension wallet does not own the approved payment.");
  if(!window.confirm("Request an OFFLINE signature for "+intent.amount+" AMA on AMADEUS TESTNET to "+intent.recipient+"? The wallet must NOT broadcast."))return;
  // Never request a private key. The extension must confirm native, sign-only semantics.
  const signed=await provider.signTransaction({
   network:"testnet",contract:"Coin",method:"transfer",
   args:[fromBase58(intent.recipient),intent.atomicUnits,"AMA"],
   signOnly:true,description:"33JACK M4: signed native AMA Testnet transfer"
  });
  await assertOfficialWalletNetwork(provider);
  const packed=packSigned(signed);
  const preview=await api("execution-preflight",{csrf:identity.csrf,body:{
   workspaceId,id:intent.id,txPacked:packed,walletTxHash:signed.txHash
  }});
  if(!preview.verifiedSignature||preview.payer!==intent.payer||
     preview.recipient!==intent.recipient||preview.amountUnits!==intent.atomicUnits||
     preview.termsHash!==intent.termsHash||preview.broadcasted!==false)
   throw Error("Server-side wallet signature verification did not match the exact approved terms.");
  setStaged({packed,walletTxHash:preview.hash,preview});setChecked(false);
  setNotice("Signature checked by server for exact Testnet transfer. NO submission has occurred.");
 }
 async function broadcast(){
  if(!active||!staged||!checked)throw Error("Review and confirm the verified signed packet first");
  if(!window.confirm("Broadcast EXACTLY ONE verified native AMA TESTNET transaction "+staged.walletTxHash+"? An RPC timeout may mean it was submitted. NEVER retry automatically."))return;
  try{
   const response=await api("execution-submit",{csrf:identity.csrf,body:{
    workspaceId,id:intent.id,txPacked:staged.packed,walletTxHash:staged.walletTxHash
   }});
   setExecution(response.execution||null);
   setNotice("A broadcast reservation was recorded. Check the official Testnet receipt; no settlement is claimed yet.");
  }finally{
   // Prevent repeat submissions even when the transport fails. Recover via status/reconcile.
   setStaged(null);setChecked(false);
  }
 }
 async function reconcile(){
  const result=await api("execution-reconcile",{csrf:identity.csrf,body:{workspaceId,id:intent.id}});
  setExecution(result.execution);setStaged(null);setChecked(false);
  setNotice(result.execution?.independentlyVerified?
   "Official Testnet RPC confirms exact payment terms, successful execution and finality.":
   "Chain receipt is not finalized. Funds status remains pending, uncertain, failed or disputed.");
 }
 return <section className="ama-m4">
  <span className="ama-eyebrow">M4 · TESTNET TRANSACTION & EVIDENCE</span>
  <h4>Wallet-owned signature → one-attempt broadcast → independent chain proof</h4>
  <p>M4 refuses signing if the installed wallet cannot prove sign-only compatibility and the Testnet network. Broadcast is disabled server-side by default until real two-wallet acceptance is verified.</p>
  <p><b>Approved intent:</b> {intent.status} · {intent.amount} AMA · {intent.atomicUnits} atomic units · to <code>{intent.recipient}</code></p>
  {intent.status==="awaiting_wallet_signature"&&<>
   <button disabled={busy||!active||!intent.beneficiaryCurrent||!!execution} onClick={()=>run(sign)}>
    Verify wallet capabilities and request sign-only Testnet signature
   </button>
   {staged&&<div className="ama-m4-stage">
    <p><b>Cryptographically verified signed hash:</b> <code>{staged.walletTxHash}</code></p>
    <p><b>Sender:</b> {staged.preview.payer} · <b>Recipient:</b> {staged.preview.recipient} · <b>Atomic units:</b> {staged.preview.amountUnits}</p>
    <p>Signature is held only in this browser session until one user-directed submission attempt. No wallet keys are stored.</p>
    <label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
     I checked the exact native Testnet packet and authorize ONE broadcast attempt.</label>
    <button disabled={busy||!checked} onClick={()=>run(broadcast)}>Broadcast once (when Testnet release gates are enabled)</button>
   </div>}
  </>}
  <div className="ama-m4-actions">
   <button disabled={busy||!active} onClick={()=>run(status)}>Recover reserved transaction status</button>
   <button disabled={busy||!active||!execution||execution.status==="finalized"} onClick={()=>run(reconcile)}>Independently reconcile from Testnet RPC</button>
  </div>
  {execution&&<div className="ama-m4-receipt">
   <p><b>State:</b> {execution.status} · <b>Broadcast attempts:</b> {execution.broadcastAttempts} · <b>No retry allowed</b></p>
   <p><b>Reserved transaction hash:</b> <code>{execution.txHash}</code></p>
   {execution.receipt&&<><p><b>Verified signer:</b> <code>{execution.receipt.payer}</code></p>
    <p><b>Verified recipient:</b> <code>{execution.receipt.recipient}</code></p>
    <p><b>Verified AMA atomic units:</b> {execution.receipt.amountUnits}</p>
    <p><b>Block height:</b> {execution.receipt.entryHeight} · <b>Finality:</b> {execution.receipt.finality}</p></>}
   <p><b>Independent final settlement:</b> {execution.independentlyVerified?"VERIFIED":"NOT VERIFIED"}</p>
   {execution.reason&&<p className="ama-m4-warning">{execution.reason}</p>}
  </div>}
  {notice&&<p role="status" className="ama-notice">{notice}</p>}
  {error&&<p role="alert" className="ama-error">{error}</p>}
  <p className="ama-m4-warning">Never submit private keys or seed phrases. Do not treat transaction hash, RPC acknowledgement, or a pending receipt as a successful or finalized payment.</p>
 </section>;
}
