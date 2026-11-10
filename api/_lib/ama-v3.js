/**
 * 33JACK V3 — native Amadeus TESTNET rail.
 * Never use EVM RPC or a custodied secret. The wallet signs locally.
 * The chain/database adapter uses legacy integer chainId=0 ONLY to fit
 * the existing SQL schema; this is NOT an Amadeus chain identifier.
 */
import { AmadeusSDK } from "@amadeus-protocol/sdk";

export const AMA_TESTNET = Object.freeze({
  id: "amadeus-testnet", name: "Amadeus Testnet",
  rpcUrl: "https://testnet-rpc.ama.one/api",
  explorer: "https://testnet-ama.ddns.net",
  nativeCurrency: { name: "AMA", symbol: "AMA", decimals: 8 },
  isTestnet: true
});
export const AMA_ASSETS = Object.freeze({AMA:{symbol:"AMA",decimals:8,kind:"native",address:"native:AMA"}});
const B58=/^[1-9A-HJ-NP-Za-km-z]{32,100}$/;
const AMOUNT=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;
function base58(value,label){
 const s=String(value||"").trim();
 if(!B58.test(s))throw new Error(label+" must be a Base58 Amadeus address");
 return s; // Base58 is case sensitive. NEVER lowercase.
}
export function normalizeAmaAddress(value,label="address"){return base58(value,label);}
export function parseAmaAmount(value){
 const str=String(value??"").trim();
 if(!AMOUNT.test(str))throw new Error("AMA amount must have at most eight decimal places");
 const [whole,frac=""]=str.split(".");
 const atomic=BigInt(whole)*100000000n+BigInt(frac.padEnd(8,"0")||"0");
 if(atomic<=0n)throw new Error("AMA transfer amount must be greater than zero");
 const max=String(process.env.AMA_MAX_PAYMENT_AMOUNT||"5");
 if(!AMOUNT.test(max))throw new Error("AMA_MAX_PAYMENT_AMOUNT invalid");
 const [mw,mf=""]=max.split(".");
 const upper=BigInt(mw)*100000000n+BigInt(mf.padEnd(8,"0")||"0");
 if(atomic>upper)throw new Error("Amount exceeds testnet AMA per-payment policy");
 return atomic.toString();
}
export function normalizeAmaProposal(input={}){
 const token=String(input.token||"AMA").toUpperCase();
 if(token!=="AMA")throw new Error("Only native AMA is enabled on Amadeus Testnet");
 const recipient=base58(input.recipient,"recipient");
 const payer=input.payer?base58(input.payer,"payer"):null;
 const amount=String(input.amount??"").trim();
 const amountUnits=parseAmaAmount(amount);
 const memo=String(input.memo||"").trim().slice(0,240);
 return {network:AMA_TESTNET.id,chainId:0,token:"AMA",tokenAddress:"native:AMA",decimals:8,
   amount,amountUnits,recipient,payer,memo};
}
export function prepareAmaTransfer(proposal){
 if(!proposal || proposal.token!=="AMA" || proposal.tokenAddress!=="native:AMA")
  throw new Error("Not an approved native AMA transfer");
 if(!proposal.payer)throw new Error("A payer wallet is required");
 const recipient=base58(proposal.recipient,"recipient");
 return {network:AMA_TESTNET.id,contract:"Coin",method:"transfer",
  args:[recipient,String(proposal.amountUnits),"AMA"],payer:proposal.payer,
  description:"33JACK V3 approved testnet payment: "+proposal.amount+" AMA"};
}
export function amaSdk(){
 // Block accidental mainnet RPC configuration. V3 is testnet only.
 const configured=String(process.env.AMA_TESTNET_RPC_URL||AMA_TESTNET.rpcUrl).trim().replace(/\/$/,"");
 if(configured!==AMA_TESTNET.rpcUrl)throw new Error("V3 accepts only the official Amadeus testnet RPC URL");
 return new AmadeusSDK({baseUrl:configured,timeout:15000});
}
export async function amaHealth(){
 const tip=await amaSdk().chain.getTip();
 if(!tip?.entry)throw new Error("Amadeus testnet RPC returned no chain tip");
 return {reachable:true,correctNetwork:true,network:AMA_TESTNET.id,
   height:tip.entry?.header?.height??tip.entry?.height??null};
}
export async function amaBalance(address){
 const result=await amaSdk().wallet.getBalance(base58(address,"wallet"),"AMA");
 return {network:AMA_TESTNET.id, balance:result?.balance??null};
}
export async function submitAmaPacked(signedBase58){
 // Signed transaction bytes are produced solely by the user's wallet extension.
 const input=String(signedBase58||"");
 if(!B58.test(input) || input.length>180000)throw new Error("Invalid packed transaction");
 const result=await amaSdk().transaction.submit(input);
 if(!result?.hash)throw new Error("Amadeus testnet did not return a transaction hash");
 return {hash:String(result.hash),network:AMA_TESTNET.id,accepted:true,confirmed:false};
}
export async function verifyAmaPayment(proposal,hash,approvedAt){
 const txHash=base58(hash,"transaction hash");
 const tx=await amaSdk().transaction.get(txHash);
 if(!tx?.tx)return {pending:true,reason:"Testnet transaction not indexed"};
 if(tx.hash!==txHash)throw new Error("Amadeus transaction hash mismatch");
 // Do not trust a transaction hash alone. SDK's parsed action/receipt vary by node version.
 // Independent exact signer, recipient, amount AND success verification is required
 // before recording a 'confirmed' payment; this conservative adapter fails closed.
 return {pending:true,reason:"Transaction found; exact native transfer and finality verification awaiting validated decoder",
   txHash,network:AMA_TESTNET.id};
}
