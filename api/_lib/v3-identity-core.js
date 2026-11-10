import {randomBytes,createHash,timingSafeEqual} from "node:crypto";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {fromBase58} from "@amadeus-protocol/sdk";
import {normalizeAmaAddress,AMA_TESTNET} from "./amadeus-testnet.js";

// Off-chain domain. Confirm extension signMessage DST with official extension before public login.
export const LOGIN_DST="33JACK_AMA_V3_LOGIN_BLS12381G2_XMD:SHA-256_SSWU_RO_";
export const ROLES=Object.freeze(["owner","admin","operator","approver","viewer"]);
const PERMISSIONS=Object.freeze({
 owner:["workspace:read","workspace:invite","workspace:roles","invoice:read","invoice:write","payment:read","payment:propose","payment:approve","beneficiary:read","beneficiary:manage","audit:read"],
 admin:["workspace:read","workspace:invite","invoice:read","invoice:write","payment:read","payment:propose","payment:approve","beneficiary:read","beneficiary:manage","audit:read"],
 operator:["workspace:read","invoice:read","invoice:write","payment:read","payment:propose","beneficiary:read"],
 approver:["workspace:read","invoice:read","payment:read","payment:approve","beneficiary:read"],
 viewer:["workspace:read","invoice:read","payment:read","beneficiary:read"]
});
export function hasPermission(role,action){return (PERMISSIONS[role]||[]).includes(action)}
export function validateRole(role){if(!ROLES.includes(role))throw Error("Unsupported organization role");return role}
export function nativeAddress(value){return normalizeAmaAddress(value,"account")}
export function randomToken(n=32){return randomBytes(n).toString("base64url")}
export function hashSecret(s){return createHash("sha256").update(String(s),"utf8").digest("hex")}
export function matchesHash(s,hash){
 if(!/^[a-f0-9]{64}$/.test(String(hash||"")))return false;
 return timingSafeEqual(Buffer.from(hashSecret(s),"hex"),Buffer.from(hash,"hex"));
}
export function normalizeWalletNetwork(input){
 const network=typeof input==="string"?input:(input?.network??input?.name??input?.id??null);
 if(typeof network!=="string"||network.toLowerCase().trim()!=="testnet")
  throw Error("Wallet must report Amadeus Testnet; unknown or missing network is rejected");
 const rpc=typeof input==="object"?(input?.rpcUrl??input?.rpc??null):null;
 if(rpc!==null&&rpc!==undefined&&String(rpc).replace(/\/$/,"")!==AMA_TESTNET.rpcUrl)
  throw Error("Wallet RPC must be the official Amadeus Testnet");
 return AMA_TESTNET.id;
}
export function validOrigin(req){
 const sent=String(req.headers?.origin||""),host=String(req.headers?.host||"");
 if(!sent||!host||sent.length>300||host.length>255)throw Error("Same-origin request required");
 let u;try{u=new URL(sent)}catch{throw Error("Invalid request origin")}
 if(u.username||u.password||u.pathname!=="/"||u.search||u.hash||u.host.toLowerCase()!==host.toLowerCase()||
  (u.protocol!=="https:"&&!(u.protocol==="http:"&&/^localhost(?::\d+)?$/.test(host))))
  throw Error("Origin mismatch: cross-site requests rejected");
 return u.origin;
}
export function buildLoginMessage({address,origin,nonce,expiresAt}){
 nativeAddress(address);
 if(!/^https?:\/\/[a-z0-9.:-]+$/i.test(origin))throw Error("Invalid origin");
 if(!/^[a-zA-Z0-9_-]{20,90}$/.test(nonce))throw Error("Invalid nonce");
 if(!Number.isSafeInteger(expiresAt))throw Error("Invalid expiry");
 return ["33JACK V3 wallet authentication","Chain: amadeus-testnet","Origin: "+origin,"Account: "+address,
 "Nonce: "+nonce,"Expires: "+new Date(expiresAt).toISOString(),
 "This signature authenticates a session only; it cannot move funds."].join("\n");
}
export function verifyNativeLoginSignature({address,message,signature}){
 if(typeof message!=="string"||message.length>850||!message.startsWith("33JACK V3 wallet authentication\n"))return false;
 if(typeof signature!=="string"||signature.length>190||!/^[1-9A-HJ-NP-Za-km-z]+$/.test(signature))return false;
 try{
  const pk=fromBase58(nativeAddress(address)),sig=fromBase58(signature);
  return sig.length===96&&bls.verify(sig,new TextEncoder().encode(message),pk,{DST:LOGIN_DST});
 }catch{return false}
}
export function parseCookie(req,name="jackv3_session"){
 const row=String(req.headers?.cookie||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
 if(!row)return "";
 try{return decodeURIComponent(row.slice(name.length+1))}catch{return ""}
}
export function authCookie(token,origin,clear=false){
 return "jackv3_session="+(clear?"":encodeURIComponent(token))+"; Path=/; HttpOnly; SameSite=Strict"+
 (String(origin).startsWith("https:")?"; Secure":"")+(clear?"; Max-Age=0":"; Max-Age=1800");
}
export function requireCsrf(req,session){
 const token=String(req.headers?.["x-33jack-csrf"]||"");
 if(token.length<30||!matchesHash(token,session.csrf_hash))throw Error("Invalid CSRF token");
}
