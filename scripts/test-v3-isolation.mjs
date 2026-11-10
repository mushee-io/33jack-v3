import {test} from "node:test";
import assert from "node:assert/strict";
import handler from "../api/v2.js";
async function request(resource) {
  return new Promise(resolve=>{
    const response={
      statusCode:200,
      setHeader(){return this;},
      status(code){this.statusCode=code;return this;},
      json(data){resolve({status:this.statusCode,data});return this;}
    };
    Promise.resolve(handler({method:"GET",query:{resource,operation:"config"},headers:{}},response))
      .catch(error=>resolve({status:500,error:error.message}));
  });
}
test("Celo, EVM, agent payment, payment router and x402 endpoints fail closed",async()=>{
  for(const resource of ["celo","operator","agent","channel","mcp","a2a","receipt","policy","schedule","x402","routes"]){
    const res=await request(resource);
    assert.ok([404,410].includes(res.status),resource+" is not blocked: "+res.status);
  }
});
test("Amadeus Testnet config still works",async()=>{
  const response=await request("ama");assert.equal(response.status,200);
  assert.equal(response.data.network.id,"amadeus-testnet");
});
