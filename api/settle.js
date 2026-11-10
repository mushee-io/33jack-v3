/** Legacy Solana settlement retired in V3. Native testnet approval uses /api/v3/operator. */
export default function handler(req,res){res.setHeader("Cache-Control","no-store");return res.status(410).json({ok:false,error:"Legacy chain settlement disabled. Use /app/ama for native AMA testnet payment approval.",fundsMoved:false});}
