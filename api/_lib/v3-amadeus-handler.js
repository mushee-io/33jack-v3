import {AMA_TESTNET, amaHealth, amaBalance, normalizeAmaProposal, prepareAmaCall, getAmaClient} from "./amadeus-testnet.js";
import identityHandler from "./v3-identity-handler.js";

export default async function handler(req,res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const op = String(req.query?.operation || "config").toLowerCase();
  if(op.startsWith("auth-")||op.startsWith("workspace-"))return identityHandler(req,res,op);
  try {
    if (req.method === "GET" && op === "config")
      return res.status(200).json({ok:true, network:AMA_TESTNET, custody:"user-wallet-only", status:"testnet"});
    if (req.method === "GET" && op === "health")
      return res.status(200).json({ok:true, network:AMA_TESTNET, rpc:await amaHealth()});
    if (req.method === "GET" && op === "balance")
      return res.status(200).json({ok:true, balance:await amaBalance(req.query?.address)});
    if (req.method === "POST" && op === "plan") {
      const proposal=normalizeAmaProposal(req.body);
      return res.status(200).json({ok:true,proposal,call:prepareAmaCall(proposal),
        warning:"Plan only. The connected Amadeus wallet must sign and broadcast; this endpoint cannot move funds."});
    }
    if (req.method === "GET" && op === "transaction") {
      const hash=String(req.query?.hash||"");
      if(!/^[1-9A-HJ-NP-Za-km-z]{25,100}$/.test(hash))return res.status(400).json({error:"Invalid Amadeus transaction hash"});
      const tx=await getAmaClient().transaction.get(hash);
      return res.status(200).json({ok:true,tx, independentlyVerified:false,
        message:"Review receipt, signer and Coin.transfer arguments before treating a payment as reconciled."});
    }
    return res.status(405).json({error:"Unsupported AMA V3 API operation"});
  }catch(error){return res.status(/must|required|exceeds|confirm|Only|Invalid/.test(error.message)?400:503).json({ok:false,error:String(error.message||"Amadeus testnet request failed").slice(0,180)});}
}
