import React, {useEffect,useState} from "react";
import {AmadeusSDK} from "@amadeus-protocol/sdk";
import "./amadeus.css";

const API="/api/v3/ama";
const RPC="https://testnet-rpc.ama.one/api";
const sdk=new AmadeusSDK({baseUrl:RPC,timeout:30000});
async function api(operation,options={}){
 const res=await fetch(API+"?operation="+operation+(options.query||""),{
  method:options.body?"POST":"GET",headers:{"Content-Type":"application/json"},
  ...(options.body?{body:JSON.stringify(options.body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error||"Amadeus API unavailable");
 return data;
}

export default function AmadeusWorkspace({seed=null}){
 const [wallet,setWallet]=useState("");const [recipient,setRecipient]=useState("");
 const [amount,setAmount]=useState("1");const [health,setHealth]=useState(null);
 const [balance,setBalance]=useState(null);const [reviewed,setReviewed]=useState(false);
 const [testnet,setTestnet]=useState(false);const [plan,setPlan]=useState(null);
 const [txHash,setTxHash]=useState("");const [receipt,setReceipt]=useState(null);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
 useEffect(()=>{api("health").then(x=>setHealth(x.rpc)).catch(()=>setHealth({reachable:false}));},[]);
 useEffect(()=>{if(seed)setMessage("Invoice noted. Enter exact native AMA terms manually; no fiat conversion is implied.");},[seed]);
 useEffect(()=>{const fn=(accounts)=>{setWallet(accounts?.[0]||"");setPlan(null);setReviewed(false);};
  window.amadeus?.on?.("accountsChanged",fn);
  return()=>window.amadeus?.removeListener?.("accountsChanged",fn);},[]);
 async function run(task){setBusy(true);setError("");setMessage("");try{await task();}catch(e){setError(e?.message||"Operation failed");}finally{setBusy(false);}}
 async function connect(){await run(async()=>{if(!window.amadeus?.requestAccounts)throw new Error("Install Amadeus Wallet extension and switch it to Testnet.");
  const accounts=await window.amadeus.requestAccounts();if(!accounts?.[0])throw new Error("Wallet did not return an address");
  setWallet(accounts[0]);setReviewed(false);setPlan(null);setMessage("Amadeus wallet connected; no funds moved.");});}
 async function refresh(){await run(async()=>{if(!wallet)throw new Error("Connect wallet first");
 const data=await api("balance",{query:"&address="+encodeURIComponent(wallet)});setBalance(data.balance.balance);});}
 async function prepare(){await run(async()=>{if(!wallet)throw new Error("Connect a wallet first");
 const data=await api("plan",{body:{network:"amadeus-testnet",payer:wallet,recipient,amount,token:"AMA"}});
 setPlan(data);setReviewed(false);setTxHash("");setReceipt(null);
 setMessage("Payment plan prepared. Review the exact recipient, amount and network before signing.");});}
 async function send(){await run(async()=>{if(!testnet||!reviewed||!plan)throw new Error("Review exact terms and confirm Testnet first");
 if(wallet!==plan.proposal.payer||recipient!==plan.proposal.recipient||amount!==plan.proposal.amount)
  throw new Error("Payment terms changed; prepare a new proposal");
 if(!window.amadeus?.signTransaction)throw new Error("Amadeus Wallet extension is required for signing");
 if(!window.confirm("Sign a TESTNET transfer of "+amount+" AMA to "+recipient+"?"))return;
 const signed=await window.amadeus.signTransaction({contract:"Coin",method:"transfer",args:plan.call.args,description:plan.call.description});
 if(!signed?.txPacked||!signed?.txHash)throw new Error("Wallet did not return a signed transaction");
 const submitted=await sdk.transaction.submitAndWait(signed.txPacked);
 if(submitted.error!=="ok")throw new Error("Testnet rejected transaction: "+String(submitted.error));
 if(submitted.hash && signed.txHash!==submitted.hash)throw new Error("Submitted hash differs from wallet signature");
 setTxHash(signed.txHash);setMessage("Testnet submission acknowledged. Inspect the transaction receipt before treating it as settled.");});}
 async function inspect(){await run(async()=>{if(!txHash)throw new Error("No transaction hash");
 const data=await api("transaction",{query:"&hash="+encodeURIComponent(txHash)});setReceipt(data.tx);});}
 return <section className="ama-v3">
  <header><span className="ama-eyebrow">33JACK V3 · AMADEUS TESTNET</span><h2>Native AI-agent payments, with your wallet in control.</h2>
    <p>A testnet-first payment workflow using Amadeus Coin.transfer, Base58 accounts and the Amadeus Wallet extension. No Celo, EVM transaction or automatic fiat payout.</p></header>
  <div className="ama-stats"><div><small>Network</small><b>Amadeus Testnet</b></div><div><small>RPC</small><b>{health===null?"Checking":health.reachable?"Reachable":"Unavailable"}</b></div><div><small>Asset</small><b>AMA</b></div><div><small>Custody</small><b>User wallet</b></div></div>
  <article><h3>1. Connect Amadeus Wallet</h3><p>Set the extension to Testnet and use a testnet-only wallet. Never enter a seed phrase into 33JACK.</p>
    <button onClick={connect} disabled={busy}>{wallet?wallet.slice(0,12)+"…"+wallet.slice(-8):"Connect Amadeus wallet"}</button>
    <button onClick={refresh} disabled={busy||!wallet}>Read AMA balance</button>{balance&&<p>Balance: {String(balance.float)} AMA</p>}</article>
  <article><h3>2. Prepare an AMA test payment</h3><label>Recipient native address<input value={recipient} onChange={e=>{setRecipient(e.target.value);setPlan(null)}} placeholder="Base58 Amadeus public key"/></label>
    <label>Amount (AMA)<input value={amount} onChange={e=>{setAmount(e.target.value);setPlan(null)}} inputMode="decimal"/></label>
    <button onClick={prepare} disabled={busy||!wallet}>Prepare exact transfer</button></article>
  {plan&&<article><h3>3. Approve and sign in your wallet</h3><p>Sender: <code>{plan.proposal.payer}</code></p><p>Recipient: <code>{plan.proposal.recipient}</code></p><p>Amount: <strong>{plan.proposal.amount} AMA</strong> ({plan.proposal.amountUnits} atomic units)</p>
    <label className="ama-check"><input type="checkbox" checked={testnet} onChange={e=>setTestnet(e.target.checked)}/>I confirmed my Amadeus Wallet extension is on Testnet.</label>
    <label className="ama-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I independently checked the exact sender, recipient and amount.</label>
    <button disabled={busy||!reviewed||!testnet} onClick={send}>Sign and submit with my wallet</button></article>}
  {txHash&&<article><h3>4. Inspect testnet evidence</h3><p>Transaction hash: <code>{txHash}</code></p><button disabled={busy} onClick={inspect}>Read testnet receipt</button>
    {receipt&&<pre>{JSON.stringify({hash:receipt.hash,signer:receipt.tx?.signer,action:receipt.tx?.action,receipt:receipt.receipt},null,2)}</pre>}
    <p>Do not treat a broadcast as verified settlement until on-chain terms and receipt have been checked.</p></article>}
  {message&&<p role="status" className="ama-notice">{message}</p>}{error&&<p role="alert" className="ama-error">{error}</p>}
 </section>;
}
