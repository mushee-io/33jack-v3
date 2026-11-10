import React,{useEffect,useState} from "react";
import {toBase58} from "@amadeus-protocol/sdk";
import "./amadeus-identity.css";

const BASE="/api/v3/ama";
const ROLES=["admin","operator","approver","viewer"];
function short(value){return value?value.slice(0,12)+"…"+value.slice(-8):"—"}
function nativeTestnet(raw){
 const name=typeof raw==="string"?raw:(raw?.network??raw?.name??raw?.id);
 if(typeof name!=="string"||name.trim().toLowerCase()!=="testnet")
  throw Error("Wallet network must report Testnet. Unknown networks and Mainnet are blocked.");
 const rpc=typeof raw==="object"?(raw?.rpcUrl??raw?.rpc):null;
 if(rpc&&String(rpc).replace(/\/$/,"")!=="https://testnet-rpc.ama.one/api")
  throw Error("Wallet reports an unsupported RPC. Select the official Amadeus Testnet.");
}
async function checkWalletNetwork(provider){
 const method=typeof provider?.getNetwork==="function"?provider.getNetwork:
  typeof provider?.getCurrentNetwork==="function"?provider.getCurrentNetwork:null;
 if(!method)throw Error("This Amadeus extension version does not expose verified network information. Identity sign-in is disabled until compatibility is confirmed.");
 const result=await method.call(provider);nativeTestnet(result);
}
async function call(operation,{body,csrf}={}){
 const res=await fetch(BASE+"?operation="+operation,{
  method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"Content-Type":"application/json",...(csrf?{"X-33Jack-CSRF":csrf}:{})}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Identity API returned HTTP "+res.status);
 return data;
}
function formatSignature(raw){
 if(typeof raw==="string")return raw;
 if(raw instanceof Uint8Array)return toBase58(raw);
 const inner=raw?.signature??raw?.data?.signature;
 if(typeof inner==="string")return inner;
 if(inner instanceof Uint8Array)return toBase58(inner);
 throw Error("Wallet returned an unsupported signature format.");
}

export default function AmadeusIdentityPanel({onWalletChange}){
 const [account,setAccount]=useState("");
 const [session,setSession]=useState(null);
 const [csrf,setCsrf]=useState("");
 const [workspaces,setWorkspaces]=useState([]);
 const [name,setName]=useState("");
 const [workspace,setWorkspace]=useState("");
 const [member,setMember]=useState("");
 const [role,setRole]=useState("viewer");
 const [invitation,setInvitation]=useState("");
 const [inviteInput,setInviteInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 useEffect(()=>{
  let alive=true;
  call("auth-session").then(x=>{if(!alive)return;setSession(x);setCsrf(x.csrf);setAccount(x.address);setWorkspaces(x.workspaces||[]);onWalletChange?.(x.address)})
   .catch(()=>{});
  return()=>{alive=false};
 },[]);
 useEffect(()=>{
  const provider=window.amadeus;
  const invalidated=()=>{
   setAccount("");setSession(null);setCsrf("");setWorkspaces([]);
   onWalletChange?.("");
   setInfo("Account or network changed. Reconnect and authenticate.");
  };
  provider?.on?.("accountsChanged",invalidated);
  provider?.on?.("networkChanged",invalidated);
  provider?.on?.("disconnect",invalidated);
  provider?.on?.("lock",invalidated);
  return()=>{
   for(const event of ["accountsChanged","networkChanged","disconnect","lock"])
    provider?.removeListener?.(event,invalidated);
  };
 },[onWalletChange]);
 async function run(task){
  setBusy(true);setError("");setInfo("");
  try{await task()}catch(e){setError(e?.message||"Identity operation failed")}
  finally{setBusy(false)}
 }
 async function refresh(){
  const data=await call("auth-session");
  setSession(data);setCsrf(data.csrf);setWorkspaces(data.workspaces||[]);
  setAccount(data.address);
 }
 async function connect(){
  const provider=window.amadeus;
  if(!provider?.requestAccounts)throw Error("Install the official Amadeus Wallet extension.");
  await checkWalletNetwork(provider);
  const accounts=await provider.requestAccounts();
  const address=accounts?.[0];
  if(!address||typeof address!=="string"||address.startsWith("0x"))
   throw Error("Wallet did not return a native Amadeus address.");
  await checkWalletNetwork(provider);
  setAccount(address);onWalletChange?.(address);
  setSession(null);setCsrf("");setWorkspaces([]);
  setInfo("Native Testnet wallet connected. You are not yet authenticated.");
 }
 async function signIn(){
  const provider=window.amadeus;
  if(!account||!provider)throw Error("Connect the Testnet wallet first.");
  await checkWalletNetwork(provider);
  if(typeof provider.signMessage!=="function")
   throw Error("This Amadeus Wallet build does not support verified off-chain message signing. No login session will be issued.");
  const challenge=await call("auth-challenge",{body:{address:account,network:"amadeus-testnet"}});
  if(challenge.address!==account||challenge.network!=="amadeus-testnet"||!challenge.noTransaction)
   throw Error("Invalid login challenge.");
  // No signTransaction fallback: login must not move funds or create a chain transaction.
  const result=await provider.signMessage(challenge.message);
  await checkWalletNetwork(provider);
  const signature=formatSignature(result);
  const data=await call("auth-verify",{body:{id:challenge.id,address:account,signature}});
  if(data.address!==account)throw Error("Wallet identity mismatch.");
  setSession(data);setCsrf(data.csrf);setWorkspaces(data.workspaces||[]);
  setInfo("Server-verified wallet session active. No AMA transferred.");
 }
 async function logout(){
  if(session&&csrf)await call("auth-logout",{body:{logout:true},csrf});
  window.amadeus?.disconnect?.();
  setSession(null);setCsrf("");setWorkspaces([]);setAccount("");
  onWalletChange?.("");
  setInfo("Local wallet identity disconnected and session revoked.");
 }
 async function createWorkspace(){
  if(!session)throw Error("Sign in first.");
  await call("workspace-create",{body:{name},csrf});
  setName("");await refresh();setInfo("New organization created under your wallet.");
 }
 async function invite(){
  const result=await call("workspace-invite",{body:{workspaceId:workspace,address:member,role},csrf});
  setInvitation(result.invitation?.token||"");
  setInfo("Single-recipient invitation created. Share it securely with the intended wallet owner.");
 }
 async function accept(){
  await call("workspace-accept",{body:{token:inviteInput.trim()},csrf});
  setInviteInput("");await refresh();setInfo("Invitation redeemed for this signed-in wallet.");
 }
 async function changeRole(op){
  await call(op,{body:{workspaceId:workspace,address:member,...(op==="workspace-role"?{role}:{})},csrf});
  await refresh();setInfo(op==="workspace-role"?"Member role updated.":"Member removed from organization.");
 }
 const current=workspaces.find(w=>w.workspace_id===workspace)||workspaces[0];
 return <section className="ama-identity">
  <div className="ama-identity-heading"><div><span className="ama-eyebrow">M2 · NATIVE AMADEUS IDENTITY</span><h3>Wallet authentication & organization permissions</h3></div><span className="ama-identity-state">{session?"SIGNED IN":account?"CONNECTED ONLY":"DISCONNECTED"}</span></div>
  <p>Identity sign-in requires a native BLS signature validated by the server. Simply connecting a wallet does not authorize organization data or payments.</p>
  <div className="ama-identity-actions">
   <button disabled={busy} onClick={()=>run(connect)}>{account?"Reconnect Testnet wallet":"Connect Testnet wallet"}</button>
   <button disabled={busy||!account||!!session} onClick={()=>run(signIn)}>Sign wallet login challenge</button>
   <button disabled={busy||!session} onClick={()=>run(logout)}>Revoke session & disconnect</button>
  </div>
  <p>Native account: <code>{short(account)}</code> · Network: <b>Amadeus Testnet only</b></p>
  {session&&<><p role="status">Authenticated until {new Date(session.expiresAt).toLocaleString()} · Organization memberships: {workspaces.length}</p>
   <div className="ama-identity-grid">
    <div><h4>Create organization</h4><label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Organization name"/></label>
     <button disabled={busy||name.trim().length<3} onClick={()=>run(createWorkspace)}>Create organization</button>
    </div>
    <div><h4>Your organizations</h4>{workspaces.length?
      <ul>{workspaces.map(w=><li key={w.workspace_id}><b>{w.name}</b> — {w.role} <small>{short(w.workspace_id)}</small></li>)}</ul>
      :<p>No organizations yet.</p>}
     <button disabled={busy} onClick={()=>run(refresh)}>Refresh memberships</button>
    </div>
   </div>
   <div className="ama-identity-grid">
    <div><h4>Invite or manage members</h4>
     <label>Workspace<select value={workspace} onChange={e=>setWorkspace(e.target.value)}>
      <option value="">Select organization</option>{workspaces.map(w=><option key={w.workspace_id} value={w.workspace_id}>{w.name} · {w.role}</option>)}</select></label>
     <label>Native member address<input value={member} onChange={e=>setMember(e.target.value)} placeholder="Amadeus Base58 wallet"/></label>
     <label>Role<select value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
     <button disabled={busy||!workspace||!member} onClick={()=>run(invite)}>Create address-bound invitation</button>
     {current?.role==="owner"&&<><button disabled={busy||!workspace||!member} onClick={()=>run(()=>changeRole("workspace-role"))}>Update member role</button>
      <button disabled={busy||!workspace||!member} onClick={()=>run(()=>changeRole("workspace-remove"))}>Remove member</button></>}
     {invitation&&<p>Invite token (shown once): <code className="ama-identity-token">{invitation}</code></p>}
    </div>
    <div><h4>Accept invitation</h4><label>Invitation token<input value={inviteInput} onChange={e=>setInviteInput(e.target.value)} placeholder="Private invitation token"/></label>
     <button disabled={busy||!inviteInput.trim()} onClick={()=>run(accept)}>Join with authenticated wallet</button>
     <p>Invitations expire after 20 minutes and are valid only for their designated wallet address.</p>
    </div>
   </div>
  </>}
  {!session&&<p className="ama-identity-warning">Authentication remains unavailable if the extension cannot expose Testnet status or sign the expected off-chain BLS challenge. No transaction-signing login fallback is permitted.</p>}
  {error&&<p role="alert" className="ama-error">{error}</p>}
  {info&&<p role="status" className="ama-notice">{info}</p>}
 </section>;
}
