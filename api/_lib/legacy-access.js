import { retiredLegacyRoute } from "./v3-network-policy.js";

// Deliberate permanent fail-closed V3 compatibility shim.
// NODE_ENV, operator credentials, and legacy feature flags cannot reopen V2.
export function gateLegacy(req, res) {
  retiredLegacyRoute(req, res);
  return false;
}
