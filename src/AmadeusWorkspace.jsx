import React,{useCallback,useEffect,useState} from "react";
import "./amadeus.css";
import AmadeusIdentityPanel from "./AmadeusIdentityPanel.jsx";
import AmadeusPaymentPanel from "./AmadeusPaymentPanel.jsx";
import AmadeusAgentPanel from "./AmadeusAgentPanel.jsx";

const API="/api/v3/ama";
async function get(operation,query=""){
 const response=await fetch(API+"?operation="+operation+query,{credentials:"same-origin"});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||"Amadeus Testnet request failed");
 return body;
}
export default function AmadeusWorkspace({seed=null}){
 const [wallet,setWallet]=useState("");
 const [session,setSession]=useState(null);
 const [health,setHealth]=useState(null);
 const [balance,setBalance]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const onWalletChange=useCallback(address=>{
  setWallet(address||"");setBalance(null);
  if(!address)setSession(null);
 },[]);
 const onSessionChange=useCallback(value=>setSession(value||null),[]);
 useEffect(()=>{get("health").then(x=>setHealth(x.rpc)).catch(()=>setHealth({reachable:false}));},[]);
 async function refreshBalance(){
  if(!wallet) return;
  setBusy(true);setError("");
  try{const d=await get("balance","&address="+encodeURIComponent(wallet));setBalance(d.balance)}
  catch(e){setError(e.message||"Unable to read wallet balance")}
  finally{setBusy(false)}
 }
 return <section className="ama-v3">
  <header><span className="ama-eyebrow">33JACK V3 · AMADEUS TESTNET · M5</span>
   <h2>AI-assisted payments, governed by your wallet.</h2>
   <p>AI-assisted native AMA payment proposals, risk analysis and wallet-owner controls. AI tools are read-only; no AI approval, wallet signature or transaction broadcast is permitted.</p>
  </header>
  <AmadeusIdentityPanel onWalletChange={onWalletChange} onSessionChange={onSessionChange}/>
  <div className="ama-stats"><div><small>Network</small><b>Amadeus Testnet</b></div>
   <div><small>RPC</small><b>{health===null?"Checking":health.reachable?"Reachable":"Unavailable"}</b></div>
   <div><small>Asset</small><b>Native AMA</b></div><div><small>Custody</small><b>User wallet only</b></div></div>
  <article><h3>Read-only Testnet wallet</h3>
   <p>{wallet?"Connected address: "+wallet:"Connect and authenticate a native Testnet wallet above."}</p>
   <button disabled={!wallet||busy} onClick={refreshBalance}>Read AMA balance</button>
   {balance&&<p>Raw balance response: <code>{JSON.stringify(balance)}</code></p>}
   {error&&<p role="alert" className="ama-error">{error}</p>}
  </article>
  <AmadeusAgentPanel identity={session} connectedWallet={wallet}/>
  <AmadeusPaymentPanel identity={session} connectedWallet={wallet} seed={seed}/>
 </section>;
}
