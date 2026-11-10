import amaHandler from "./_lib/v3-amadeus-handler.js";
import { retiredLegacyRoute } from "./_lib/v3-network-policy.js";

// V3 preserves an Amadeus-only API within the existing Vercel function budget.
// Every imported V2 resource (Celo, agents, x402, operator, channel, schedules)
// is denied even when NODE_ENV=test or old deployment flags are present.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.query?.resource !== "ama") return retiredLegacyRoute(req, res);
  return amaHandler(req, res);
}
