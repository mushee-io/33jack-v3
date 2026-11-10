import assert from "node:assert/strict";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {join,resolve,relative} from "node:path";
const root=resolve(import.meta.dirname,"..");
function find(dir){let files=[];for(const file of readdirSync(dir)){const p=join(dir,file);if(statSync(p).isDirectory()){if(!file.startsWith("_"))files.push(...find(p));}else if(file.endsWith(".js"))files.push(relative(root,p).split("\\").join("/"));}return files;}
const functions=find(join(root,"api"));
const config=JSON.parse(readFileSync(join(root,"vercel.json"),"utf8"));
assert.ok(functions.length<=12,"Serverless function limit exceeded: "+functions.length);
for(const f of Object.keys(config.functions||{}))assert.ok(functions.includes(f),"Missing function: "+f);
assert.ok(config.rewrites.some(r=>r.source==="/api/v3/:resource"&&r.destination==="/api/v2?resource=:resource"),"Amadeus V3 rewrite missing");
assert.equal(config.crons?.length||0,0,"Legacy schedule must be disabled");
console.log("Amadeus Testnet V3: "+functions.length+" functions; no scheduled legacy jobs");
