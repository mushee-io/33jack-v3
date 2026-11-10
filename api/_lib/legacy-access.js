import {requireLegacyAccess} from "./operator-auth.js";
// All imported Solana / fiat-demo legacy settlement routes fail closed in V3.
export function gateLegacy(req,res) {
  if (process.env.NODE_ENV !== "test") {
    res.setHeader("Cache-Control","no-store");
    res.status(410).json({error:"Legacy settlement rails are disabled in 33JACK V3. Use Amadeus Testnet."});
    return false;
  }
  const gate=requireLegacyAccess(req);
  if(gate.error) {
    res.setHeader("Cache-Control","no-store");
    res.status(gate.status).json({error:gate.error});
    return false;
  }
  return true;
}
