/** Amadeus-native Testnet client. Never use EVM RPC or server-side signing. */
import { AmadeusSDK, fromBase58 } from "@amadeus-protocol/sdk";

export const AMA_TESTNET = Object.freeze({
  id: "amadeus-testnet", name: "Amadeus Testnet", asset: "AMA", decimals: 9,
  rpcUrl: "https://testnet-rpc.ama.one/api",
  explorerUrl: "https://testnet-ama.ddns.net",
  walletUrl: "https://wallet.ama.one"
});

export function getAmaRpcUrl() {
  const value = String(process.env.AMA_TESTNET_RPC_URL || AMA_TESTNET.rpcUrl).trim();
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error("AMA_TESTNET_RPC_URL must be an HTTPS RPC API URL");
  if (parsed.hostname === "mainnet-rpc.ama.one") throw new Error("Refusing Amadeus mainnet in V3 Testnet");
  if (parsed.hostname !== "testnet-rpc.ama.one" && process.env.AMA_TESTNET_ALLOW_CUSTOM_RPC !== "true")
    throw new Error("Only official Amadeus Testnet RPC allowed unless custom Testnet RPC explicitly enabled");
  return value.replace(/\/$/, "");
}

export function getAmaClient() {
  return new AmadeusSDK({ baseUrl: getAmaRpcUrl(), timeout: 15000 });
}

export function normalizeAmaAddress(value, label = "address") {
  const address = String(value || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,85}$/.test(address))
    throw new Error(label + " must be a native Amadeus Base58 address");
  try {
    const raw=fromBase58(address);
    if (raw.length !== 48 || raw.every(byte=>byte===0)) throw new Error("invalid key");
  } catch { throw new Error(label + " must decode to a 48-byte Amadeus public key"); }
  return address;
}

export function parseAmaAmount(value) {
  const amount = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,9})?$/.test(amount))
    throw new Error("AMA amount must be a positive decimal with at most 9 places");
  const [whole, fraction = ""] = amount.split(".");
  const units = BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, "0") || "0");
  if (units <= 0n) throw new Error("AMA amount must exceed zero");
  const cap = String(process.env.AMA_TESTNET_MAX_TRANSFER || "100");
  if (!/^[1-9]\d{0,9}(?:\.\d{1,9})?$/.test(cap))
    throw new Error("Invalid AMA_TESTNET_MAX_TRANSFER limit");
  const [maxWhole, maxFraction = ""] = cap.split(".");
  const max = BigInt(maxWhole) * 1000000000n + BigInt(maxFraction.padEnd(9, "0") || "0");
  if (units > max) throw new Error("Amount exceeds configured AMA Testnet transfer limit");
  return units.toString();
}

export function normalizeAmaProposal(input = {}) {
  if (input.network && input.network !== AMA_TESTNET.id)
    throw new Error("Only Amadeus Testnet is supported");
  if (input.token && input.token !== "AMA") throw new Error("Only native AMA supported on Testnet");
  const payer = normalizeAmaAddress(input.payer, "payer");
  const recipient = normalizeAmaAddress(input.recipient, "recipient");
  if (payer === recipient && input.selfTransferAcknowledged !== true)
    throw new Error("Confirm an intentional self-transfer");
  const amount = String(input.amount || "").trim();
  const amountUnits = parseAmaAmount(amount);
  return { network: AMA_TESTNET.id, payer, recipient, token: "AMA", amount,
    amountUnits, memo: String(input.memo || "").slice(0, 140) };
}

export function prepareAmaCall(proposal) {
  const p = normalizeAmaProposal({ ...proposal, selfTransferAcknowledged: true });
  return { network: AMA_TESTNET.id, payer: p.payer, contract: "Coin", method: "transfer",
    args: [p.recipient, p.amountUnits, "AMA"],
    description: "33JACK Testnet payment: " + p.amount + " AMA to " + p.recipient };
}

export async function amaHealth() {
  const { entry } = await getAmaClient().chain.getTip();
  const height = entry?.header?.height ?? entry?.height;
  if (height === undefined || height === null) throw new Error("Invalid Amadeus testnet tip response");
  return { reachable: true, network: AMA_TESTNET.id, height };
}

export async function amaBalance(address) {
  return getAmaClient().wallet.getBalance(normalizeAmaAddress(address), "AMA");
}
