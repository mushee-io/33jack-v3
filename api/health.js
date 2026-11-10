import {amaHealth,AMA_TESTNET} from "./_lib/ama-v3.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 let rpc=null,error=null;
 try{rpc=await amaHealth();}catch{error="AMA testnet RPC unavailable";}
 const checks={databaseConfigured:Boolean(process.env.DATABASE_URL),agentConfigured:Boolean(process.env.GROQ_API_KEY),
    network:AMA_TESTNET.id,testnetOnly:true,legacyEvmExecution:false,verifiedSettlementEnabled:false};
 return res.status(rpc?200:503).json({ok:Boolean(rpc),network:AMA_TESTNET,checks,rpc,error,productionFundsSupported:false});
}
