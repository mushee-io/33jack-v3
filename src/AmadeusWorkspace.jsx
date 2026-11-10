import React,{useCallback,useEffect,useRef,useState} from "react";
import {Activity,ArrowRight,ShieldCheck,WalletCards,Wifi,WifiOff} from "lucide-react";
import "./amadeus.css";
import "./amadeus-experience.css";
import {AMADEUS_TABS,nextAmadeusTab,walletUiState} from "./amadeus-ui-model.js";
import AmadeusIdentityPanel from "./AmadeusIdentityPanel.jsx";
import AmadeusPaymentPanel from "./AmadeusPaymentPanel.jsx";
import AmadeusAgentPanel from "./AmadeusAgentPanel.jsx";
import AmadeusInvoicesPanel from "./AmadeusInvoicesPanel.jsx";
import AmadeusGovernancePanel from "./AmadeusGovernancePanel.jsx";
import AmadeusExperiencePanel from "./AmadeusExperiencePanel.jsx";
import AmadeusAcceptancePanel from "./AmadeusAcceptancePanel.jsx";
import AmadeusDemoPanel from "./AmadeusDemoPanel.jsx";
import AmadeusReceiptsPanel from "./AmadeusReceiptsPanel.jsx";

const API="/api/v3/ama";
async function read(operation,query=""){
 const response=await fetch(API+"?operation="+operation+query,{method:"GET",credentials:"same-origin",
  headers:{"Accept":"application/json"}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||"Native Amadeus Testnet request unavailable");
 return body;
}
export default function AmadeusWorkspace({seed=null}){
 const [active,setActive]=useState("overview");
 const [wallet,setWallet]=useState("");
 const [session,setSession]=useState(null);
 const [networkVerified,setNetworkVerified]=useState(false);
 const [health,setHealth]=useState(null);
 const [healthBusy,setHealthBusy]=useState(false);
 const [balance,setBalance]=useState(null);
 const [balanceBusy,setBalanceBusy]=useState(false);
 const [balanceError,setBalanceError]=useState("");
 const navRefs=useRef({});
 const onWalletChange=useCallback(address=>{
  setWallet(address||"");setBalance(null);setBalanceError("");
  if(!address){setSession(null);setNetworkVerified(false)}
 },[]);
 const onSessionChange=useCallback(value=>{
  setSession(value||null);
  setBalance(null);setBalanceError("");
 },[]);
 const onNetworkVerification=useCallback(value=>setNetworkVerified(value===true),[]);
 useEffect(()=>{
  let alive=true;
  read("health").then(data=>{if(alive)setHealth(data.rpc)})
   .catch(()=>{if(alive)setHealth({reachable:false})});
  return()=>{alive=false};
 },[]);
 const state=walletUiState({wallet,session,networkVerified});
 const authenticated=!!session?.csrf&&session?.address===wallet;
 const rpc=health===null?"Checking RPC":health.reachable===true?"RPC reachable":"RPC unavailable";
 function changeSection(id){
  if(!AMADEUS_TABS.some(x=>x.id===id))return;
  setActive(id);
  setBalanceError("");
 }
 function keyNavigate(event,id){
  const next=nextAmadeusTab(event.key,id);
  if(!next)return;
  event.preventDefault();
  changeSection(next);
  navRefs.current[next]?.focus();
 }
 async function refreshBalance(){
  if(!state.ready)throw Error("Authenticate a native Testnet wallet and independently verify its network first");
  setBalanceBusy(true);setBalanceError("");
  try{
   const data=await read("balance","&address="+encodeURIComponent(wallet));
   if(data?.balance===undefined||data?.balance===null)
    throw Error("Official Testnet RPC returned no wallet balance evidence");
   setBalance(data.balance);
  }catch(e){setBalance(null);setBalanceError(e?.message||"Native balance unavailable")}
  finally{setBalanceBusy(false)}
 }
 async function refreshHealth(){
  setHealthBusy(true);
  try{const result=await read("health");setHealth(result.rpc)}
  catch{setHealth({reachable:false})}
  finally{setHealthBusy(false)}
 }
 return <section className="ama-v3 ama-m8-shell" aria-label="33JACK V3 native Amadeus Testnet workspace">
  <a className="ama-m8-skip" href="#ama-m8-content">Skip to Testnet workspace content</a>
  <header className="ama-m8-hero">
   <div className="ama-m8-hero-top">
    <div className="ama-m8-brand"><span className="ama-m8-brand-symbol" aria-hidden="true">33</span>
     <span>33JACK <small>V3 · M10</small></span></div>
    <span className="ama-m8-net-chip"><span className="ama-m8-net-dot" aria-hidden="true"/> AMADEUS L1 TESTNET</span>
   </div>
   <div className="ama-m8-hero-body">
    <div><span className="ama-eyebrow">WALLET-OWNED FINANCIAL OPERATIONS</span>
     <h1>Business finance, without handing over your keys.</h1>
     <p>One native Testnet workspace for payment intents, invoice provenance, read-only AI insights and independently checked transaction evidence. You remain in control of approval and signing.</p>
     <div className="ama-m8-hero-actions">
      <button type="button" onClick={()=>changeSection("payments")}>Open native AMA payments <ArrowRight size={16} aria-hidden="true"/></button>
      <button type="button" className="ama-m8-secondary" onClick={()=>changeSection("wallet")}>Manage wallet & organizations</button>
     </div>
    </div>
    <aside className="ama-m8-trust-card" aria-label="Safety boundaries">
     <div><ShieldCheck size={18} aria-hidden="true"/><strong>User wallet custody</strong></div>
     <p>Agent cannot approve or sign. Native Testnet transfers require M3/M4 human-controlled checks.</p>
     <div><Activity size={18} aria-hidden="true"/><strong>Chain evidence, not estimates</strong></div>
     <p>No transaction is called settled without matching independently verified M4 finality.</p>
    </aside>
   </div>
  </header>

  <div className="ama-m8-network-grid" aria-label="Testnet connection and safety status">
   <div><small>Network</small><strong>Amadeus Testnet</strong></div>
   <div><small>Native asset</small><strong>AMA · 9 decimals</strong></div>
   <div><small>Official RPC</small><strong className="ama-m8-inline-icon">
    {health?.reachable?<Wifi aria-hidden="true" size={15}/>:<WifiOff aria-hidden="true" size={15}/>}
    {rpc}</strong></div>
   <div><small>Wallet status</small><strong>{state.message}</strong></div>
  </div>
  <div className="ama-m8-shell-status">
   <span>Connection to the native Amadeus Testnet RPC alone is not proof of a completed transfer. A real wallet-authorized transaction needs independently verified finality.</span>
   <button type="button" className="ama-m8-text-link" onClick={refreshHealth} disabled={healthBusy}>
    {healthBusy?"Checking RPC…":"Recheck RPC"}</button>
  </div>
  <nav className="ama-m8-navigation" aria-label="Amadeus Testnet workspace sections">
   <div className="ama-m8-nav-scroll">
    {AMADEUS_TABS.map(item=><button key={item.id} type="button"
     className={"ama-m8-nav-item "+(active===item.id?"is-active":"")}
     aria-current={active===item.id?"page":undefined}
     title={item.description}
     ref={element=>{navRefs.current[item.id]=element}}
     onKeyDown={event=>keyNavigate(event,item.id)}
     onClick={()=>changeSection(item.id)}>
      {item.label}
     </button>)}
   </div>
  </nav>
  <main id="ama-m8-content" className="ama-m8-content" tabIndex={-1}>
   {active==="overview"&&<><AmadeusExperiencePanel identity={session} connectedWallet={wallet} onNavigate={changeSection}/>
    {authenticated&&<AmadeusAcceptancePanel identity={session} connectedWallet={wallet}/>}
    {authenticated&&<AmadeusDemoPanel identity={session} connectedWallet={wallet}/>}</>}
   {active==="wallet"&&<div className="ama-m8-wallet-content">
    <div className="ama-m8-section-head"><div>
     <span className="ama-eyebrow">NATIVE WALLET · NO SERVER-SIDE CUSTODY</span>
     <h2>Connect, verify and authenticate</h2>
     <p>A wallet connection alone is not an authenticated financial session. Network inspection and off-chain message signing must be supported by the installed official extension.</p>
    </div></div>
    <AmadeusIdentityPanel onWalletChange={onWalletChange} onSessionChange={onSessionChange}
     onNetworkVerification={onNetworkVerification}/>
    <article className="ama-m8-surface">
     <h3><WalletCards size={18} aria-hidden="true"/> Native AMA balance</h3>
     <p>Read from the official Testnet RPC for your selected authenticated wallet. Not a live trading valuation or bank balance.</p>
     <button type="button" className="ama-m8-secondary" disabled={balanceBusy||!state.ready}
      onClick={refreshBalance}>{balanceBusy?"Reading official RPC…":"Read native AMA balance"}</button>
     {balance!==null&&<div className="ama-m8-raw-balance"><strong>RPC response (uninterpreted)</strong>
      <pre>{JSON.stringify(balance,null,2)?.slice(0,2000)}</pre>
      <small>Raw SDK output is shown without fabricated conversions.</small></div>}
     {balanceError&&<p className="ama-m8-danger" role="alert">{balanceError}</p>}
     {!state.ready&&<p className="ama-m8-note">Balance request disabled until this browser has verified the wallet network and the server has authenticated the matching address.</p>}
    </article>
   </div>}
   {active==="payments"&&(authenticated?<AmadeusPaymentPanel identity={session} connectedWallet={wallet} seed={seed}/>:
    <div className="ama-m8-empty" role="status"><h2>Human-controlled AMA payments</h2>
     <p>Authenticate your native Testnet wallet to access the M3 approval and M4 guarded-signing workflows.</p>
     <button type="button" onClick={()=>changeSection("wallet")}>Authenticate wallet <ArrowRight size={16} aria-hidden="true"/></button></div>)}
   {active==="receipts"&&<AmadeusReceiptsPanel identity={session} connectedWallet={wallet} onNavigate={changeSection}/>}
   {active==="agent"&&(authenticated?<AmadeusAgentPanel identity={session} connectedWallet={wallet}/>:
    <div className="ama-m8-empty" role="status"><h2>Read-only financial agent</h2>
     <p>Connect and authenticate to get organization-scoped analysis. The AI never signs or broadcasts funds.</p>
     <button type="button" onClick={()=>changeSection("wallet")}>Authenticate wallet</button></div>)}
   {active==="invoices"&&(authenticated?<AmadeusInvoicesPanel identity={session} connectedWallet={wallet}/>:
    <div className="ama-m8-empty" role="status"><h2>Invoice provenance and reconciliation</h2>
     <p>Authenticate a native wallet to access organization invoices. No unsupported FX or bank payouts are assumed.</p>
     <button type="button" onClick={()=>changeSection("wallet")}>Authenticate wallet</button></div>)}
   {active==="governance"&&(authenticated?<AmadeusGovernancePanel identity={session} connectedWallet={wallet}/>:
    <div className="ama-m8-empty" role="status"><h2>Financial governance</h2>
     <p>Security policy and emergency controls require authenticated organization membership.</p>
     <button type="button" onClick={()=>changeSection("wallet")}>Authenticate wallet</button></div>)}
  </main>
  <footer className="ama-m8-footer"><span>33JACK V3 · Amadeus L1 Testnet only</span>
   <span>Unverified wallet extension / funded two-wallet acceptance is not a completed real transfer</span>
  </footer>
 </section>;
}
