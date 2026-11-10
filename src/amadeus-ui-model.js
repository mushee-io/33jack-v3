/** Native Amadeus Testnet UX model; pure and browser/Node-safe. */
export const AMADEUS_TABS=Object.freeze([
 {id:"overview",label:"Overview",short:"Overview",description:"Read-only organization ledger"},
 {id:"wallet",label:"Wallet & identity",short:"Wallet",description:"Native wallet sign-in and organizational access"},
 {id:"payments",label:"Payments",short:"Payments",description:"Human-owned native AMA payment intents and guarded M4 signing"},
 {id:"receipts",label:"Chain evidence",short:"Receipts",description:"Stored, independently verified Testnet settlement evidence"},
 {id:"agent",label:"Financial agent",short:"AI agent",description:"Read-only organization intelligence and human-only proposals"},
 {id:"invoices",label:"Invoices",short:"Invoices",description:"Source provenance, manual review and AMA reconciliation"},
 {id:"governance",label:"Governance",short:"Security",description:"Policies, risk holds, audit, emergency pause"}
]);
export function nextAmadeusTab(key,active,ids=AMADEUS_TABS.map(x=>x.id)){
 const current=ids.indexOf(active);
 if(current<0)return ids[0]||null;
 if(key==="Home")return ids[0];
 if(key==="End")return ids.at(-1);
 if(key==="ArrowRight"||key==="ArrowDown")return ids[(current+1)%ids.length];
 if(key==="ArrowLeft"||key==="ArrowUp")return ids[(current-1+ids.length)%ids.length];
 return null;
}
export function walletUiState({wallet,session,networkVerified=false}={}){
 if(!wallet)return {status:"not_connected",message:"Connect a native Amadeus Testnet wallet",ready:false};
 if(!networkVerified)return {status:"network_unconfirmed",message:"Wallet network not independently verified in this session",ready:false};
 if(!session?.csrf||!session?.address||session.address!==wallet)
  return {status:"connected_not_authenticated",message:"Wallet connected · login signature required",ready:false};
 return {status:"authenticated",message:"Native wallet login verified by server",ready:true};
}
export function normalizeApiState({loading=false,error="",data=null}={}){
 if(loading)return {status:"loading",message:"Loading authenticated organization evidence"};
 if(error)return {status:"unavailable",message:error};
 if(data===null)return {status:"not_loaded",message:"No read-only evidence requested yet"};
 return {status:"loaded",message:"Organization evidence loaded"};
}
export function displayCount(value,{capped=false}={}){
 if(!Number.isSafeInteger(value)||value<0)return "Unavailable";
 return String(value)+(capped?"+":"");
}
