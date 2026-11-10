import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const pkg=JSON.parse(read("package.json"));
const vercel=JSON.parse(read("vercel.json"));
test("V3 identity, licence and dependency isolation",()=>{
  assert.equal(pkg.name,"33jack-v3");
  assert.equal(pkg.license,"MIT");
  assert.match(read("LICENSE"),/MIT License/);
  assert.ok(pkg.dependencies["@amadeus-protocol/sdk"]);
  for(const old of ["@solana/web3.js","@solana/spl-token"])assert.ok(!Object.hasOwn(pkg.dependencies,old),old+" may not ship directly");
  if(process.env.GITHUB_REPOSITORY)assert.equal(process.env.GITHUB_REPOSITORY.toLowerCase(),"mushee-io/33jack-v3");
});
test("Vercel exposes native AMA Testnet and no legacy scheduled jobs",()=>{
  assert.equal(vercel.crons?.length||0,0);
  assert.ok(vercel.rewrites.some(r=>r.source==="/api/v3/:resource"&&r.destination==="/api/v2?resource=:resource"));
  for(const r of vercel.rewrites)assert.ok(!["/mcp","/a2a","/api/settlement-execute","/.well-known/agent-card.json"].includes(r.source),"retired rewrite "+r.source);
  for(const f of Object.keys(vercel.functions))assert.match(read(f),/v3-network-policy|amadeus-testnet|api\/v2|\.\/v3-amadeus|\/\.\/amadeus-testnet/);
});
test("All legacy public serverless endpoints are stubs with no other imports",()=>{
  for(const p of ["agent","analyze","approve","payments","payout-approve","payout-quote","payout-settle","reconcile","settle","settlement-network"]){
    const s=read("api/"+p+".js");
    assert.match(s,/retiredLegacyRoute/);
    assert.ok(!/\bsolana\b|\bcelo\b|\bforno\b|@solana\b/i.test(s),"No loaded legacy code "+p);
  }
});
test("M1 native routing, testnet-only env sample and documentation are present",()=>{
  const router=read("api/v2.js");assert.match(router,/req\.query\?\.resource !== "ama"/);
  assert.ok(!router.includes("v2-celo-handler"));
  const e=read(".env.example");assert.match(e,/AMA_TESTNET_RPC_URL/);
  for(const name of ["SOLANA_RPC_URL=","CELO_RPC_URL=","SOLANA_DEVNET_PAYER_SECRET_KEY=","JACK_ENABLE_LEGACY_SANDBOX="])assert.ok(!e.includes(name));
  for(const p of ["docs/M1-FOUNDATION.md","docs/ROADMAP-M1-M10.md"])assert.match(read(p),/Amadeus/);
  assert.match(read("README.md"),/Milestone|milestone/);
});
