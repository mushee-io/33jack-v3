import {test} from "node:test";
import assert from "node:assert/strict";
import {AMA_TESTNET,normalizeAmaProposal,prepareAmaCall,parseAmaAmount,getAmaRpcUrl} from "../api/_lib/amadeus-testnet.js";

test("Testnet uses non-EVM native chain",()=>{assert.equal(AMA_TESTNET.id,"amadeus-testnet");assert.equal(AMA_TESTNET.decimals,9);assert.match(AMA_TESTNET.rpcUrl,/testnet-rpc/);assert.equal("chainId" in AMA_TESTNET,false)});
test("exact amount precision and safety limit",()=>{assert.equal(parseAmaAmount("1.123456789"),"1123456789");assert.equal(parseAmaAmount("0.000000001"),"1");assert.throws(()=>parseAmaAmount("0"),/exceed zero/);assert.throws(()=>parseAmaAmount("0.0000000001"),/at most 9/);assert.throws(()=>parseAmaAmount("101"),/limit/);});
test("rejects EVM addresses and mainnet RPC",()=>{assert.throws(()=>normalizeAmaProposal({payer:"0x123",recipient:"0xabc",amount:"1"}),/Base58/);const old=process.env.AMA_TESTNET_RPC_URL;try{process.env.AMA_TESTNET_RPC_URL="https://mainnet-rpc.ama.one/api";assert.throws(()=>getAmaRpcUrl(),/Refusing/);}finally{if(old===undefined)delete process.env.AMA_TESTNET_RPC_URL;else process.env.AMA_TESTNET_RPC_URL=old;}});
