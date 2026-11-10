/**
 * Summarize npm audit metadata without printing private registry URLs or tokens.
 * Critical findings or unavailable audit must block acceptance.
 */
import {readFileSync} from "node:fs";
const path=process.argv[2]||"m9-audit.json";
let body;
try{body=JSON.parse(readFileSync(path,"utf8"))}
catch{console.error("M9 dependency audit output unavailable; fail closed");process.exit(1)}
const v=body?.metadata?.vulnerabilities;
if(!v||!Number.isInteger(v.critical)||!Number.isInteger(v.high)||
    typeof body.error==="object"){
 console.error("M9 dependency audit metadata unavailable; fail closed");process.exit(1)
}
const counts={critical:v.critical,high:v.high,moderate:v.moderate||0,
 low:v.low||0,info:v.info||0,total:v.total||0};
console.log("M9 dependency audit severity counts (names/redacted):",JSON.stringify(counts));
if(v.critical>0){
 console.error("M9 critical vulnerability gate FAILED. Resolve before considering release.");
 process.exit(1);
}
if(v.high>0)console.warn("M9 high-severity dependencies require separate review before any GO; CI passing does not waive this.");
