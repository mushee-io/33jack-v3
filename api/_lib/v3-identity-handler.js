import {randomUUID} from "node:crypto";
import {nativeAddress,randomToken,hashSecret,validOrigin,parseCookie,authCookie,buildLoginMessage,verifyNativeLoginSignature,hasPermission,validateRole,requireCsrf} from "./v3-identity-core.js";
import {identityDB,getSession,membershipFor,membershipsFor} from "./v3-identity-store.js";
function fail(res,status,error){return res.status(status).json({ok:false,error})}
async function authenticated(req,origin,mutate=false){
 const token=parseCookie(req);
 if(token.length<36)throw Error("Wallet session required");
 const session=await getSession(hashSecret(token));
 if(!session||session.origin!==origin)throw Error("Wallet session expired or revoked");
 if(mutate)requireCsrf(req,session);
 return session;
}
async function permitted(session,workspaceId,action){
 if(typeof workspaceId!=="string"||!/^[a-f0-9-]{36}$/.test(workspaceId))throw Error("Invalid workspace");
 const m=await membershipFor(session.address,workspaceId);
 if(!m||!hasPermission(m.role,action))throw Error("Workspace permission denied");
 return m;
}
const POST=new Set(["auth-challenge","auth-verify","auth-logout","workspace-create","workspace-invite","workspace-accept","workspace-role","workspace-remove"]);
const GET=new Set(["auth-session","workspace-list"]);
export default async function identityHandler(req,res,op){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!POST.has(op)&&!GET.has(op))return fail(res,404,"Unknown identity operation");
 if(POST.has(op)&&req.method!=="POST"||GET.has(op)&&req.method!=="GET")return fail(res,405,"Unsupported method");
 try{
  // Browsers omit Origin on same-site GET. For reads, reconstruct the origin
  // from the request Host only; unsafe requests always require a real Origin.
  const request=req.method==="GET"&&!req.headers?.origin?
   {...req,headers:{...req.headers,origin:(/^localhost(?::\d+)?$/.test(req.headers?.host||"")?"http://":"https://")+String(req.headers?.host||"")}}:req;
  const origin=validOrigin(request),sql=await identityDB();
  if(op==="auth-challenge"){
   const address=nativeAddress(req.body?.address);
   if(req.body?.network!=="amadeus-testnet")throw Error("Amadeus Testnet verification required");
   const counter=await sql.unsafe("SELECT COUNT(*)::integer AS n FROM ama_v3_challenges WHERE address=$1 AND created_at>NOW()-INTERVAL '10 minutes'",[address]);
   if(counter[0].n>=10)return fail(res,429,"Too many challenges for this wallet");
   const id=randomUUID(),nonce=randomToken(24),expiresAt=Date.now()+180000;
   const message=buildLoginMessage({address,origin,nonce,expiresAt});
   await sql.unsafe("INSERT INTO ama_v3_challenges(id,address,origin,network,nonce,message_hash,expires_at) VALUES($1,$2,$3,'amadeus-testnet',$4,$5,$6)",[id,address,origin,nonce,hashSecret(message),new Date(expiresAt)]);
   return res.status(200).json({ok:true,id,address,network:"amadeus-testnet",message,expiresAt,algorithm:"BLS12-381 domain-separated off-chain login",noTransaction:true});
  }
  if(op==="auth-verify"){
   const id=String(req.body?.id||""),address=nativeAddress(req.body?.address);
   if(!/^[a-f0-9-]{36}$/.test(id))throw Error("Invalid challenge ID");
   const rows=await sql.unsafe("SELECT * FROM ama_v3_challenges WHERE id=$1 AND address=$2 AND origin=$3 AND network='amadeus-testnet' LIMIT 1",[id,address,origin]);
   const ch=rows[0];
   if(!ch||ch.consumed_at||new Date(ch.expires_at).getTime()<=Date.now()||ch.attempts>=5)
    return fail(res,401,"Challenge expired, consumed or invalid");
   const message=buildLoginMessage({address,origin,nonce:ch.nonce,expiresAt:new Date(ch.expires_at).getTime()});
   const valid=hashSecret(message)===ch.message_hash&&verifyNativeLoginSignature({address,message,signature:req.body?.signature});
   if(!valid){
    await sql.unsafe("UPDATE ama_v3_challenges SET attempts=attempts+1 WHERE id=$1",[id]);
    return fail(res,401,"Invalid wallet signature");
   }
   const consumed=await sql.unsafe("UPDATE ama_v3_challenges SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL AND attempts<5 AND expires_at>NOW() RETURNING id",[id]);
   if(consumed.length!==1)return fail(res,409,"Challenge already used");
   const token=randomToken(48),csrf=randomToken(32),expiry=new Date(Date.now()+1800000);
   await sql.unsafe("INSERT INTO ama_v3_sessions(token_hash,address,origin,csrf_hash,expires_at) VALUES($1,$2,$3,$4,$5)",[hashSecret(token),address,origin,hashSecret(csrf),expiry]);
   res.setHeader("Set-Cookie",authCookie(token,origin));
   return res.status(200).json({ok:true,address,network:"amadeus-testnet",expiresAt:expiry.toISOString(),csrf,workspaces:await membershipsFor(address)});
  }
  if(op==="auth-session"){
   const s=await authenticated(req,origin);
   const csrf=randomToken(32);
   await sql.unsafe("UPDATE ama_v3_sessions SET csrf_hash=$1 WHERE token_hash=$2",[hashSecret(csrf),s.token_hash]);
   return res.status(200).json({ok:true,address:s.address,network:"amadeus-testnet",csrf,expiresAt:s.expires_at,workspaces:await membershipsFor(s.address)});
  }
  if(op==="auth-logout"){
   const s=await authenticated(req,origin,true);
   await sql.unsafe("UPDATE ama_v3_sessions SET revoked_at=NOW() WHERE token_hash=$1",[s.token_hash]);
   res.setHeader("Set-Cookie",authCookie("",origin,true));
   return res.status(200).json({ok:true,loggedOut:true});
  }
  if(op==="workspace-list"){
   const s=await authenticated(req,origin);
   return res.status(200).json({ok:true,workspaces:await membershipsFor(s.address)});
  }
  const s=await authenticated(req,origin,true);
  if(op==="workspace-create"){
   const name=String(req.body?.name||"").trim();
   if(name.length<3||name.length>80)throw Error("Organization name must contain 3–80 characters");
   const id=randomUUID();
   await sql.begin(async tx=>{
    await tx.unsafe("INSERT INTO ama_v3_workspaces(id,name,created_by) VALUES($1,$2,$3)",[id,name,s.address]);
    await tx.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,'owner')",[id,s.address]);
   });
   return res.status(201).json({ok:true,workspace:{id,name,role:"owner"}});
  }
  if(op==="workspace-invite"){
   const workspaceId=String(req.body?.workspaceId||"");
   await permitted(s,workspaceId,"workspace:invite");
   const address=nativeAddress(req.body?.address),role=validateRole(String(req.body?.role||"viewer"));
   if(role==="owner"||address===s.address)throw Error("Owner/self invitations are unavailable");
   if(await membershipFor(address,workspaceId))throw Error("Wallet already belongs to the workspace");
   const token=randomToken(32);
   await sql.unsafe("INSERT INTO ama_v3_invitations(token_hash,workspace_id,recipient,role,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6)",[hashSecret(token),workspaceId,address,role,s.address,new Date(Date.now()+1200000)]);
   return res.status(201).json({ok:true,invitation:{token,workspaceId,address,role,expiresInMinutes:20}});
  }
  if(op==="workspace-accept"){
   const token=String(req.body?.token||"");
   if(token.length<30||token.length>200)throw Error("Invalid invitation");
   const result=await sql.begin(async tx=>{
    const rows=await tx.unsafe("UPDATE ama_v3_invitations SET consumed_at=NOW() WHERE token_hash=$1 AND recipient=$2 AND consumed_at IS NULL AND expires_at>NOW() RETURNING workspace_id,role",[hashSecret(token),s.address]);
    if(!rows.length)return null;
    await tx.unsafe("INSERT INTO ama_v3_memberships(workspace_id,address,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,address) DO NOTHING",[rows[0].workspace_id,s.address,rows[0].role]);
    return rows[0];
   });
   if(!result)return fail(res,403,"Invitation expired, already used or bound to another wallet");
   return res.status(200).json({ok:true,workspaceId:result.workspace_id,role:result.role});
  }
  if(op==="workspace-role"||op==="workspace-remove"){
   const workspaceId=String(req.body?.workspaceId||"");
   await permitted(s,workspaceId,"workspace:roles");
   const address=nativeAddress(req.body?.address),target=await membershipFor(address,workspaceId);
   if(!target)return fail(res,404,"Workspace member not found");
   if(target.role==="owner")return fail(res,403,"Owner cannot be removed or demoted");
   if(op==="workspace-remove"){
    await sql.unsafe("DELETE FROM ama_v3_memberships WHERE workspace_id=$1 AND address=$2 AND role<>'owner'",[workspaceId,address]);
    return res.status(200).json({ok:true,removed:true});
   }
   const role=validateRole(String(req.body?.role||""));
   if(role==="owner")return fail(res,403,"Ownership transfer is not implemented");
   await sql.unsafe("UPDATE ama_v3_memberships SET role=$1 WHERE workspace_id=$2 AND address=$3 AND role<>'owner'",[role,workspaceId,address]);
   return res.status(200).json({ok:true,workspaceId,address,role});
  }
  return fail(res,404,"Unknown identity operation");
 }catch(e){
  const msg=String(e?.message||"Identity service unavailable");
  const forbidden=/permission denied|session|CSRF|origin|cross-site|another wallet/i.test(msg);
  const invalid=/Invalid|must|Cannot|cannot|Unsupported|required|Testnet|already|belongs|length/i.test(msg);
  return fail(res,forbidden?403:invalid?400:503,forbidden||invalid?msg.slice(0,160):"Identity service unavailable");
 }
}
