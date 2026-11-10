/**
 * M4 API: Testnet packet preflight, exactly-once reservation, one-attempt broadcast,
 * independently checked on-chain receipt and manual recovery. No background retries.
 */
import {getAmaClient,getAmaRpcUrl} from "./amadeus-testnet.js";
import {validOrigin,parseCookie,hashSecret,requireCsrf} from "./v3-identity-core.js";
import {getSession} from "./v3-identity-store.js";
import {PaymentError} from "./v3-payment-core.js";
import {verifyPackedTestnetTransfer,verifyObservedChainTransaction} from "./v3-execution-core.js";
import {preflightIntent,reserveSignedExecution,recordBroadcastResult,readExecution,recordChainVerification} from "./v3-execution-store.js";

const OPERATIONS=new Set(["execution-preflight","execution-submit","execution-status","execution-reconcile"]);
function answer(res,code,obj){return res.status(code).json(obj)}
function requestedOrigin(req){
  const host=String(req.headers?.host||"");
  if(req.method==="GET"&&!req.headers?.origin)
    return validOrigin({...req,headers:{...req.headers,origin:(/^localhost(?::\d+)?$/.test(host)?"http://":"https://")+host}});
  return validOrigin(req);
}
function broadcastGate(){
  // Explicit environmental evidence flags are operational locks, not proof by themselves.
  // The release operator must witness official extension compatibility and funded two-wallet acceptance.
  if(process.env.AMA_M4_ENABLE_BROADCAST!=="true"||
     process.env.AMA_M4_WALLET_EXTENSION_VERIFIED!=="true"||
     process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED!=="true")
    throw new PaymentError(503,"M4 broadcasting is disabled until native extension and two-wallet acceptance are independently verified");
  getAmaRpcUrl(); // Fail closed against mainnet/custom RPC even if every flag is enabled.
}
async function authorizedRequest(req,post){
  const origin=requestedOrigin(req),token=parseCookie(req);
  if(token.length<36)throw new PaymentError(401,"Authenticated native wallet session required");
  const session=await getSession(hashSecret(token));
  if(!session||session.origin!==origin)throw new PaymentError(401,"Wallet session expired or revoked");
  if(post){
    requireCsrf(req,session);
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))
      throw new PaymentError(415,"JSON content-type required");
    if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
      throw new PaymentError(400,"JSON request body required");
  }
  return session.address;
}
async function pollOfficialChain({record,workspaceId,id,actor,sdk}){
  let chainTx;
  try { chainTx=await sdk.transaction.get(record.tx_hash) }
  catch(e) {
    // Unknown/not-found or unavailable chain evidence must NEVER create a successful receipt.
    return {status:"pending",reason:"Transaction not independently confirmed by Testnet RPC"};
  }
  let rootedHeight;
  try{
    const stats=await sdk.chain.getStats();
    const height=stats?.stats?.rooted_height;
    rootedHeight=Number.isSafeInteger(height)?height:undefined;
  }catch{rootedHeight=undefined}
  const observation=verifyObservedChainTransaction({record,chainTx,rootedHeight});
  return observation;
}
export default async function executionHandler(req,res,op,{clientFactory=getAmaClient}={}){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!OPERATIONS.has(op))return answer(res,404,{ok:false,error:"Unknown M4 execution operation"});
  const post=op!=="execution-status";
  if((post&&req.method!=="POST")||(!post&&req.method!=="GET"))
    return answer(res,405,{ok:false,error:"Unsupported execution method"});
  try{
    const actor=await authorizedRequest(req,post);
    const body=post?req.body:req.query;
    const workspaceId=body.workspaceId,id=body.id;
    if(op==="execution-status"){
      const result=await readExecution({workspaceId,id,actor});
      return answer(res,200,{ok:true,network:"amadeus-testnet",execution:result?.public||null,
        note:"Only M4 confirmed/finalized chain evidence is a verified receipt."});
    }
    if(op==="execution-preflight"||op==="execution-submit"){
      // Never log or persist raw signed packet bytes; preflight is read-only.
      const intent=await preflightIntent({workspaceId,id,actor}).catch(async e=>{
        // Recover existing reservation without allowing an unsanctioned second broadcast.
        if(op==="execution-submit"&&e instanceof PaymentError&&e.status===409) {
          const previous=await readExecution({workspaceId,id,actor});
          if(previous?.record){
            if(typeof body.txPacked!=="string")
              throw new PaymentError(409,"Already reserved: recover by hash; do not resubmit a new signed packet");
            const inspected=verifyPackedTestnetTransfer({
              packed:body.txPacked,intent:{
                ...previous.record,network:"amadeus-testnet",asset:"AMA",
                status:"awaiting_wallet_signature",approval_terms_hash:previous.record.terms_hash,
                terms_hash:previous.record.terms_hash
              },walletTxHash:body.walletTxHash
            });
            if(inspected.hash===previous.record.tx_hash&&inspected.packetDigest===previous.record.packet_digest)
              return null;
          }
        }
        throw e;
      });
      if(intent===null){
        const previous=await readExecution({workspaceId,id,actor});
        return answer(res,200,{ok:true,idempotent:true,execution:previous.public,
          note:"Previously reserved signed packet returned without rebroadcast. Reconcile the original hash."});
      }
      const checked=verifyPackedTestnetTransfer({
        packed:body.txPacked,intent,walletTxHash:body.walletTxHash
      });
      if(op==="execution-preflight")
        return answer(res,200,{ok:true,network:"amadeus-testnet",verifiedSignature:true,
          hash:checked.hash,payer:checked.signer,recipient:checked.recipient,
          amountUnits:checked.amountUnits,asset:"AMA",termsHash:intent.terms_hash,
          signedForTestnet:true,broadcasted:false,
          note:"Local signed packet verified by server; no transaction submitted."});
      broadcastGate();
      const reserved=await reserveSignedExecution({
        workspaceId,id,actor,verified:checked
      });
      if(!reserved.created) {
        const prev=await readExecution({workspaceId,id,actor});
        return answer(res,200,{ok:true,idempotent:true,execution:prev.public,
          note:"No second broadcast; recover by original transaction hash."});
      }
      let status="uncertain",reason="No reliable RPC acknowledgement; DO NOT retry a broadcast";
      try{
        const client=clientFactory();
        const response=await client.transaction.submit(body.txPacked);
        if(response?.hash!==checked.hash){
          reason="RPC acknowledgement hash differed from the cryptographically verified signed packet";
        }else{
          status="pending";reason=null;
        }
      }catch{
        // Network timeout may mean submission succeeded. Exactly-once safety: NEVER retry.
        reason="RPC submission returned an error or timed out. Query chain; do not rebroadcast";
      }
      const execution=await recordBroadcastResult({workspaceId,id,hash:checked.hash,status,actor,reason});
      return answer(res,status==="pending"?202:202,{ok:true,idempotent:false,execution,
        note:"Broadcast was attempted once. Use independent Testnet reconciliation; receipt is not yet verified."});
    }
    if(op==="execution-reconcile"){
      const execution=await readExecution({workspaceId,id,actor});
      if(!execution)return answer(res,404,{ok:false,error:"No execution reserved for this intent"});
      if(execution.record.status==="finalized")
        return answer(res,200,{ok:true,execution:execution.public,idempotent:true});
      const observation=await pollOfficialChain({
        record:execution.record,workspaceId,id,actor,sdk:clientFactory()
      });
      const updated=await recordChainVerification({workspaceId,id,actor,observation});
      return answer(res,200,{ok:true,network:"amadeus-testnet",execution:updated,
        evidence:updated.independentlyVerified?"Checked against independent Testnet transaction + finality data":"Not finalized or not independently verified"});
    }
    return answer(res,404,{ok:false,error:"Unsupported M4 execution operation"});
  }catch(error){
    if(error instanceof PaymentError)
      return answer(res,error.status,{ok:false,error:error.message});
    const message=String(error?.message||"");
    if(/CSRF|Origin|origin|cross-site|Same-origin/.test(message))
      return answer(res,403,{ok:false,error:"Session origin or CSRF check failed"});
    return answer(res,503,{ok:false,error:"M4 Testnet execution is unavailable; no settlement has been claimed"});
  }
}
