import {test} from "node:test";
import assert from "node:assert/strict";
import v3Router from "../api/v2.js";
import {gateLegacy} from "../api/_lib/legacy-access.js";
import {V3_NETWORK} from "../api/_lib/v3-network-policy.js";

function response(){
  let resolve;
  const outcome=new Promise(ok=>{resolve=ok;});
  const res={
    statusCode:200,headers:{},
    setHeader(name,value){this.headers[name]=value;return this;},
    status(code){this.statusCode=code;return this;},
    json(data){resolve({status:this.statusCode,headers:this.headers,data});return this;}
  };
  return {res,outcome};
}
async function run(handler,query={},method="GET"){
  const {res,outcome}=response();
  await Promise.resolve(handler({method,query,headers:{},body:{}},res));
  return outcome;
}
test("V3 blocks every imported V2 resource for both GET and POST",async()=>{
  const resources=["celo","operator","agent","channel","mcp","a2a","receipt","policy","schedule","x402","routes","credentials","inbox","auth","metrics","unknown"];
  for(const resource of resources)for(const method of ["GET","POST"]){
    const r=await run(v3Router,{resource,operation:"runDue"},method);
    assert.equal(r.status,410,resource+" "+method);
    assert.equal(r.data.code,"V3_LEGACY_ROUTE_DISABLED");
    assert.equal(r.data.network,"amadeus-testnet");
  }
});
test("V3 Amadeus configuration is available while wrong methods reject",async()=>{
  const config=await run(v3Router,{resource:"ama",operation:"config"},"GET");
  assert.equal(config.status,200);
  assert.equal(config.data.network.id,"amadeus-testnet");
  assert.equal(config.data.network.asset,"AMA");
  assert.equal(config.data.network.decimals,9);
  assert.equal(config.data.custody,"user-wallet-only");
  const notAllowed=await run(v3Router,{resource:"ama",operation:"config"},"POST");
  assert.equal(notAllowed.status,405);
});
test("All retired direct HTTP payment routes fail closed with toggles on",async()=>{
  const old={NODE_ENV:process.env.NODE_ENV,JACK_ENABLE_LEGACY_SANDBOX:process.env.JACK_ENABLE_LEGACY_SANDBOX,JACK_LEGACY_TEST_ACCESS:process.env.JACK_LEGACY_TEST_ACCESS};
  try {
    process.env.NODE_ENV="test";process.env.JACK_ENABLE_LEGACY_SANDBOX="true";process.env.JACK_LEGACY_TEST_ACCESS="enabled";
    const paths=["agent","analyze","approve","payments","payout-approve","payout-quote","payout-settle","reconcile","settle","settlement-network"];
    for(const path of paths){
      const h=(await import("../api/"+path+".js")).default;
      for(const method of ["GET","POST"]){
        const r=await run(h,{},method);
        assert.equal(r.status,410,path+" "+method);
        assert.equal(r.data.code,"V3_LEGACY_ROUTE_DISABLED");
        assert.match(r.headers["Cache-Control"],/no-store/);
      }
    }
    const {res,outcome}=response();
    assert.equal(gateLegacy({method:"POST",headers:{}},res),false);
    assert.equal((await outcome).status,410);
  }finally{
    for(const [key,value] of Object.entries(old))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});
test("Native chain identity is separate from legacy finance rails",()=>{
  assert.deepEqual(V3_NETWORK,{id:"amadeus-testnet",nativeAsset:"AMA",legacyPaymentsEnabled:false,custody:"user-wallet-only"});
});
