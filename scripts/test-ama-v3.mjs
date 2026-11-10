import test from "node:test";
import assert from "node:assert/strict";
import {AMA_TESTNET,normalizeAmaProposal,parseAmaAmount,prepareAmaTransfer} from "../api/_lib/ama-v3.js";
const payer="5KJvsngHeMoo884xkJ6Cyb5StvnRN6f9tYiqwqJzLpQq";
const recipient="5Kd3NGzvh23KtjvWv1mA8ePj7G2foawFvWM3e5NL2rV2";
test("Amadeus V3 only identifies native testnet",()=>{
 assert.equal(AMA_TESTNET.isTestnet,true);
 assert.equal(AMA_TESTNET.nativeCurrency.decimals,8);
 assert.equal(AMA_TESTNET.rpcUrl,"https://testnet-rpc.ama.one/api");
});
test("precise native AMA atomic units",()=>{
 assert.equal(parseAmaAmount("1.00000001"),"100000001");
 assert.equal(parseAmaAmount("0.00000001"),"1");
 assert.throws(()=>parseAmaAmount("0"),/greater than zero/);
 assert.throws(()=>parseAmaAmount("1.000000001"),/at most eight/);
});
test("native Coin transfer, no EVM calldata",()=>{
 const p=normalizeAmaProposal({payer,recipient,amount:"1.25",token:"AMA"});
 const t=prepareAmaTransfer(p);
 assert.equal(t.contract,"Coin");
 assert.equal(t.method,"transfer");
 assert.deepEqual(t.args,[recipient,"125000000","AMA"]);
 assert.equal(p.recipient,recipient);
 assert.throws(()=>normalizeAmaProposal({payer,recipient,amount:"1",token:"USDC"}),/Only native AMA/);
 assert.throws(()=>normalizeAmaProposal({payer,recipient:"0x0000000000000000000000000000000000000001",amount:"1"}),/Base58/);
});
