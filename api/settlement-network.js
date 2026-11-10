import {AMA_TESTNET,amaHealth,normalizeAmaProposal,amaBalance} from "./_lib/ama-v3.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 const action=String(req.query?.action||"health");
 if(action==="health"&&req.method==="GET"){
  try{return res.status(200).json({ok:true,mode:"testnet",network:AMA_TESTNET,rpc:await amaHealth(),providers:[],bridges:[],fiatOfframps:[]});}
  catch{return res.status(503).json({ok:false,network:AMA_TESTNET,mode:"testnet",error:"AMA testnet RPC unavailable"});}
 }
 if(action==="quote"&&req.method==="POST"){
  try{const p=normalizeAmaProposal(req.body?.paymentIntent||req.body||{});
   const b=p.payer?await amaBalance(p.payer):null;
   return res.status(200).json({ok:true,mode:"testnet",paymentIntent:p,
    estimatedFee:null,exchangeRate:null,balance:b?.balance??null,
    detail:"Native AMA only; no live fiat payout, bridge or guaranteed fee quote"});
  }catch(e){return res.status(400).json({ok:false,error:String(e.message||"Invalid native AMA quote")});}
 }
 return res.status(501).json({ok:false,error:"Settlement Network cannot execute payment without exact owner approval and Amadeus Wallet signing",fundsMoved:false});
}
