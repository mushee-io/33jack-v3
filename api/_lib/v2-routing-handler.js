import {requireAgent} from "./agent-v2-auth.js";
import {normalizeAmaProposal,amaBalance,AMA_TESTNET} from "./ama-v3.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"POST required"});
 const actor=requireAgent(req);if(actor.error)return res.status(actor.status).json({error:actor.error});
 try{
  const p=normalizeAmaProposal(req.body||{});
  if(!p.payer)return res.status(400).json({error:"Payer is required"});
  const b=await amaBalance(p.payer), available=b.balance?.flat;
  const enough=available!=null&&BigInt(available)>=BigInt(p.amountUnits);
  return res.status(200).json({ok:true,network:AMA_TESTNET.name,quotes:[{token:"AMA",eligible:enough,sufficientTokenBalance:enough,
    balanceAtomic:available==null?null:String(available),amountAtomic:p.amountUnits,estimatedFee:null,estimatedOnly:true,
    reason:enough?null:"Insufficient or unverified native AMA balance"}],recommendedToken:enough?"AMA":null,
    disclaimer:"Native testnet AMA only. No verified fiat, bridge, stablecoin, or network fee quotes. No funds moved."});
 }catch(e){return res.status(503).json({error:"AMA testnet route unavailable"});}
}
