import {test} from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {LOGIN_DST,nativeAddress,randomToken,hashSecret,matchesHash,buildLoginMessage,verifyNativeLoginSignature,normalizeWalletNetwork,hasPermission,validateRole,validOrigin,requireCsrf,authCookie} from "../api/_lib/v3-identity-core.js";
const origin="https://33jack-v3.vercel.app";
const secret=bls.utils.randomPrivateKey(),otherSecret=bls.utils.randomPrivateKey();
const address=toBase58(bls.getPublicKey(secret)),other=toBase58(bls.getPublicKey(otherSecret));
const nonce=randomToken(24),expiresAt=Date.now()+120000;
const message=buildLoginMessage({address,nonce,expiresAt,origin});
const signature=toBase58(bls.sign(new TextEncoder().encode(message),secret,{DST:LOGIN_DST}));
test("native Base58 identity and Testnet validation",()=>{
 assert.equal(nativeAddress(address),address);
 for(const addr of ["0x12","solana",toBase58(randomBytes(32))])assert.throws(()=>nativeAddress(addr),/Base58|48-byte/);
 assert.equal(normalizeWalletNetwork("testnet"),"amadeus-testnet");
 assert.equal(normalizeWalletNetwork({network:"testnet",rpcUrl:"https://testnet-rpc.ama.one/api"}),"amadeus-testnet");
 for(const n of ["mainnet","unknown",undefined,{network:"testnet",rpcUrl:"https://mainnet-rpc.ama.one/api"}])
  assert.throws(()=>normalizeWalletNetwork(n),/Testnet|RPC|network/);
});
test("BLS signature binds address, message and login DST",()=>{
 assert.equal(verifyNativeLoginSignature({address,message,signature}),true);
 assert.equal(verifyNativeLoginSignature({address:other,message,signature}),false);
 assert.equal(verifyNativeLoginSignature({address,message:message+"!",signature}),false);
 assert.equal(verifyNativeLoginSignature({address,message,signature:"invalid"}),false);
 const wrong=toBase58(bls.sign(new TextEncoder().encode(message),secret));
 assert.equal(verifyNativeLoginSignature({address,message,signature:wrong}),false);
});
test("challenge binds network, origin, expiry and nonce",()=>{
 assert.match(message,/Chain: amadeus-testnet/);
 assert.match(message,/Origin: https:\/\/33jack-v3\.vercel\.app/);
 assert.match(message,/Nonce:/);assert.match(message,/Expires:/);
 assert.doesNotMatch(message,/Coin\.transfer|signTransaction/);
 assert.notEqual(buildLoginMessage({address,nonce:randomToken(24),expiresAt,origin}),message);
});
test("session hash, strict cookie and CSRF",()=>{
 const token=randomToken(48),hash=hashSecret(token),csrf=randomToken(32),session={csrf_hash:hashSecret(csrf)};
 assert.equal(matchesHash(token,hash),true);
 assert.equal(matchesHash(token+"X",hash),false);
 assert.doesNotThrow(()=>requireCsrf({headers:{"x-33jack-csrf":csrf}},session));
 assert.throws(()=>requireCsrf({headers:{"x-33jack-csrf":randomToken(32)}},session),/CSRF/);
 assert.match(authCookie(token,origin),/HttpOnly; SameSite=Strict; Secure; Max-Age=1800/);
 assert.match(authCookie("",origin,true),/Max-Age=0/);
});
test("origin and workspace roles enforce least privilege",()=>{
 assert.equal(validOrigin({headers:{host:"33jack-v3.vercel.app",origin}}),origin);
 assert.throws(()=>validOrigin({headers:{host:"33jack-v3.vercel.app",origin:"https://malicious.site"}}),/Origin/);
 assert.throws(()=>validOrigin({headers:{host:"33jack-v3.vercel.app",origin:"http://33jack-v3.vercel.app"}}),/Origin/);
 assert.equal(hasPermission("viewer","payment:approve"),false);
 assert.equal(hasPermission("operator","payment:propose"),true);
 assert.equal(hasPermission("operator","workspace:roles"),false);
 assert.equal(hasPermission("approver","payment:approve"),true);
 assert.equal(hasPermission("owner","workspace:roles"),true);
 assert.throws(()=>validateRole("superadmin"),/Unsupported/);
});
