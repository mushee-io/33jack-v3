import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("All active public entrypoints identify Amadeus Testnet only", () => {
  const entry = read("src/main.jsx");
  const metadata = read("index.html");
  const readme = read("README.md");
  assert.match(entry, /<AmadeusWorkspace seed=\{amaSeed\}\/>/);
  assert.match(entry, /\/app\/amadeus/);
  assert.match(entry, /window\.history\.replaceState/);
  for (const source of [entry, metadata, readme]) {
    assert.match(source, /Amadeus/);
    assert.doesNotMatch(source, /\bCelo\b|\bSolana\b|\bMetaMask\b|\bUSDG\b|\bUSDC\b/i);
  }
  assert.equal(existsSync(new URL("../src/CeloWorkspace.jsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/celo.css", import.meta.url)), false);
  assert.match(read("src/AmadeusWorkspace.jsx"), /AMADEUS L1 TESTNET/);
});

test("V3 API stays fail-closed and MIT licensed; external Testnet evidence is not fabricated", () => {
  const policy = read("api/_lib/v3-network-policy.js");
  const router = read("api/v2.js");
  const env = read(".env.example");
  const pkg = JSON.parse(read("package.json"));
  const readme = read("README.md");
  assert.match(policy, /V3_LEGACY_ROUTE_DISABLED/);
  assert.match(router, /req\.query\?\.resource !== "ama"/);
  assert.match(env, /AMA_M4_ENABLE_BROADCAST=false/);
  assert.equal(pkg.license, "MIT");
  assert.match(read("LICENSE"), /^MIT License/);
  assert.match(readme, /two distinct funded Testnet wallets/);
  assert.match(readme, /still needs a real witness/);
});
