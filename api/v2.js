import agentHandler from "./_lib/v2-agent-handler.js";
import operatorPaymentHandler from "./_lib/v2-operator-payment-handler.js";
import authHandler from "./_lib/v2-auth-handler.js";
import credentialsHandler from "./_lib/v2-credentials-handler.js";
import mcpHandler from "./_lib/v2-mcp-handler.js";
import a2aHandler from "./_lib/v2-a2a-handler.js";
import receiptHandler from "./_lib/v2-receipt-handler.js";
import policyHandler from "./_lib/v2-policy-handler.js";
import inboxHandler from "./_lib/v2-inbox-handler.js";
import scheduleHandler from "./_lib/v2-schedule-handler.js";
import x402Handler from "./_lib/v2-x402-handler.js";
import routeHandler from "./_lib/v2-routing-handler.js";
import metricsHandler from "./_lib/v2-metrics-handler.js";
import channelHandler from "./_lib/v2-channel-handler.js";
import amaHandler from "./_lib/v3-amadeus-handler.js";

// Consolidated router keeps 33JACK on Vercel Hobby's 12-function limit.
// V3 Amadeus Testnet route. Legacy EVM rail is intentionally not routable.
const blockedV2FinanceResources = new Set(["operator","agent","channel","mcp","a2a","receipt","policy","schedule","x402","routes"]);
const handlers = Object.freeze({operator: operatorPaymentHandler, agent: agentHandler, channel: channelHandler, ama: amaHandler, auth: authHandler, credentials: credentialsHandler, mcp: mcpHandler, a2a: a2aHandler, receipt: receiptHandler, policy: policyHandler, inbox: inboxHandler, schedule: scheduleHandler, x402: x402Handler, routes: routeHandler, metrics: metricsHandler});
export default async function handler(req, res) {
  const target = String(req.query?.resource || "");
  if (blockedV2FinanceResources.has(target))
    return res.status(410).json({error:"Legacy Celo and EVM payment APIs are disabled in V3. Use native /api/v3/ama."});
  if (!Object.hasOwn(handlers, target)) return res.status(404).json({error:"Unknown V2 API resource"});
  return handlers[target](req, res);
}
