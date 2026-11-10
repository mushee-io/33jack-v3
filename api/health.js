import { AMA_TESTNET, amaHealth } from "./_lib/amadeus-testnet.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ok:false,error:"GET only"});
  try {
    const rpc = await amaHealth();
    return res.status(200).json({
      ok: true, network: AMA_TESTNET.id, nativeAsset: AMA_TESTNET.asset,
      phase: "M1-foundation", environment: "testnet", rpc,
      legacyPaymentsEnabled: false, custodialSigningEnabled: false,
      settlementVerified: false
    });
  } catch {
    return res.status(503).json({
      ok:false, network:AMA_TESTNET.id, environment:"testnet",
      legacyPaymentsEnabled:false, rpc:{reachable:false},
      error:"Amadeus Testnet RPC cannot be verified"
    });
  }
}
