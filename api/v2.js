/** Old Celo V2 interface disabled on V3 testnet. */
export default function handler(req,res){res.setHeader("Cache-Control","no-store");return res.status(410).json({ok:false,error:"Legacy V2 endpoints retired; use /api/v3/* on AMA testnet"});}
