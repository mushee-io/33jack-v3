/**
 * M1 fail-closed guard. Legacy payment APIs remain callable as endpoints only
 * to return HTTP 410: never reach retired external-chain payment services, payout providers, or databases.
 */
export const V3_NETWORK = Object.freeze({
  id: "amadeus-testnet",
  nativeAsset: "AMA",
  legacyPaymentsEnabled: false,
  custody: "user-wallet-only"
});

export function retiredLegacyRoute(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(410).json({
    ok: false,
    code: "V3_LEGACY_ROUTE_DISABLED",
    network: V3_NETWORK.id,
    error: "This imported payment rail is disabled in 33JACK V3. No transaction was executed. Use Amadeus Testnet only."
  });
}
