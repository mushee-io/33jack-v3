import {AMA_TESTNET,AMA_ASSETS,amaHealth,amaBalance} from "./ama-v3.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const op=String(req.query?.operation||"config");
 const config={ok:true,network:AMA_TESTNET,tokens:Object.values(AMA_ASSETS),
  mode:"wallet-signed-testnet",backendCustody:false,settlementVerified:false};
 if(op==="config")return res.status(200).json(config);
 if(op==="balance"){
  try{return res.status(200).json({ok:true,...await amaBalance(req.query?.address)});}
  catch{return res.status(503).json({ok:false,error:"AMA testnet balance unavailable"});}
 }
 if(op==="health"){
  try{return res.status(200).json({...config,rpc:await amaHealth()});}
  catch{return res.status(503).json({...config,ok:false,rpc:{reachable:false,correctNetwork:false},error:"AMA testnet RPC unavailable"});}
 }
 return res.status(400).json({error:"Unsupported AMA testnet action"});
}
