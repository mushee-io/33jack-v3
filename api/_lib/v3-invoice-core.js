/**
 * M6: strict invoice intake and reconciliation math for Amadeus Testnet.
 * Human verification is NOT supplier attestation, OCR certainty or bank payout.
 */
import {createHash} from "node:crypto";
import {PaymentError,assertWorkspaceId,assertIntentId} from "./v3-payment-core.js";
import {nativeAddress} from "./v3-identity-core.js";
import {parseAmaAmount} from "./amadeus-testnet.js";
export const M6_MAX_BYTES=1024*1024*2;
export const M6_MAX_PDF_PAGES=8;
export const M6_ALLOWED_CURRENCIES=Object.freeze(["AMA","GBP","USD","EUR"]);
export const M6_RECON_STATUSES=Object.freeze([
 "unverified","unmatched","pending","partial","settled","failed","disputed","not_applicable"
]);
export function sha256Buffer(buffer){return createHash("sha256").update(buffer).digest("hex")}
export function cleanField(value,name,max=120,{required=true}={}){
 if((value===undefined||value===null||value==="")&&!required)return "";
 if(typeof value!=="string"||value.trim().length<(required?1:0)||value.length>max||
  /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value))
  throw new PaymentError(400,"Invalid "+name);
 return value.trim();
}
export function invoiceReference(value){
 const raw=cleanField(value,"invoice reference",90);
 if(!/^[a-z0-9][a-z0-9._/-]{1,89}$/i.test(raw))
  throw new PaymentError(400,"Invoice reference must be a simple identifier");
 return raw;
}
export function moneyUnits(amount,currency){
 if(!M6_ALLOWED_CURRENCIES.includes(currency))throw new PaymentError(400,"Unsupported invoice currency");
 if(currency==="AMA")return {units:parseAmaAmount(String(amount)),kind:"ama_atomic_9"};
 if(typeof amount!=="string"||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amount))
  throw new PaymentError(400,"Fiat invoice must be a positive exact decimal with at most two places");
 const [whole,frac=""]=amount.split(".");
 const cents=BigInt(whole)*100n+BigInt(frac.padEnd(2,"0")||"0");
 if(cents<=0n)throw new PaymentError(400,"Fiat invoice amount must exceed zero");
 return {units:cents.toString(),kind:"fiat_minor_2_no_fx"};
}
export function safeFilename(value){
 const name=cleanField(value,"file name",110);
 if(/[\\/:*?"<>|]/.test(name)||name.startsWith(".")||name.includes(".."))
  throw new PaymentError(400,"Invalid or unsafe filename");
 return name;
}
export function decodeDocument({filename,mime,base64}){
 const name=safeFilename(filename);
 if(typeof base64!=="string"||base64.length<8||
   base64.length>Math.ceil(M6_MAX_BYTES/3)*4+8||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length%4!==0)
  throw new PaymentError(413,"Invalid or oversized base64 invoice document");
 const bytes=Buffer.from(base64,"base64");
 if(bytes.length<4||bytes.length>M6_MAX_BYTES||bytes.toString("base64")!==base64)
  throw new PaymentError(413,"Invoice file is invalid or exceeds 2 MiB");
 const kind=String(mime||"").toLowerCase().trim();
 const pdf=bytes.subarray(0,5).toString("ascii")==="%PDF-";
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
 const txt=kind==="text/plain"&&name.toLowerCase().endsWith(".txt");
 let format;
 if(kind==="application/pdf"&&name.toLowerCase().endsWith(".pdf")&&pdf)format="pdf";
 else if(kind==="image/png"&&name.toLowerCase().endsWith(".png")&&png)format="image";
 else if(kind==="image/jpeg"&&/\.jpe?g$/i.test(name)&&jpg)format="image";
 else if(kind==="image/webp"&&name.toLowerCase().endsWith(".webp")&&webp)format="image";
 else if(txt&&bytes.toString("utf8").indexOf("\ufffd")===-1&&
  !bytes.includes(0))format="text";
 else throw new PaymentError(415,"Invoice MIME, extension or signature is unsupported/mismatched");
 return {name,mime:kind,bytes,format,sha256:sha256Buffer(bytes)};
}
export async function extractDocument(input,{pdfLoader}={}){
 const uploaded=decodeDocument(input);
 let preview="",state="requires_manual_review",pages=0;
 if(uploaded.format==="text"){
  preview=uploaded.bytes.toString("utf8").slice(0,12000);
  state="text_extracted_unverified";
 }else if(uploaded.format==="pdf"){
  try{
   const pdfjs=pdfLoader?await pdfLoader():await import("pdfjs-dist/legacy/build/pdf.js");
   const lib=pdfjs.getDocument?pdfjs:pdfjs.default;
   const task=lib.getDocument({
    data:new Uint8Array(uploaded.bytes),useSystemFonts:false,
    isEvalSupported:false,disableFontFace:true,stopAtErrors:true
   });
   const document=await task.promise;
   pages=document.numPages;
   if(!Number.isSafeInteger(pages)||pages<1||pages>M6_MAX_PDF_PAGES)
    throw new PaymentError(413,"Invoice PDF must have 1–8 readable pages");
   const chunks=[];
   for(let pageNo=1;pageNo<=pages;pageNo++){
    const page=await document.getPage(pageNo);
    const content=await page.getTextContent();
    chunks.push(content.items.map(item=>String(item.str||"")).join(" ").slice(0,2400));
    page.cleanup();
   }
   preview=chunks.join("\n").slice(0,12000);
   state=preview.trim()?"text_extracted_unverified":"pdf_no_text_manual_review";
   await document.destroy();
  }catch(err){
   if(err instanceof PaymentError)throw err;
   throw new PaymentError(422,"Invalid, encrypted or unsupported invoice PDF; no extraction is trusted");
  }
 }else{
  // No OCR is claimed. Upload hash is retained; raw image bytes are not.
  state="image_requires_manual_review";
 }
 return {filename:uploaded.name,mime:uploaded.mime,bytes:uploaded.bytes.length,
  sha256:uploaded.sha256,sourceType:uploaded.format,
  extractionStatus:state,extractedPreview:preview,numberOfPages:pages,
  evidence:"sha256_of_user_supplied_bytes",rawFileStored:false,
  humanVerified:false};
}
export function validateSupplier(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new PaymentError(400,"Supplier must be an object");
 return {workspaceId:assertWorkspaceId(input.workspaceId),
  name:cleanField(input.name,"supplier name",100),
  address:input.address?nativeAddress(input.address):null};
}
export function validateInvoice(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new PaymentError(400,"Invoice must be an object");
 const workspaceId=assertWorkspaceId(input.workspaceId);
 const documentId=assertIntentId(input.documentId);
 const supplierId=assertIntentId(input.supplierId);
 const invoiceRef=invoiceReference(input.invoiceRef);
 const currency=String(input.currency||"").toUpperCase();
 const amount=cleanField(input.amount,"invoice amount",45);
 const {units,kind}=moneyUnits(amount,currency);
 if(input.paid||input.verified||input.fxRate||input.walletSignature||input.transactionHash)
  throw new PaymentError(400,"Invoice data cannot assert payment, verification, signatures or FX");
 return {workspaceId,documentId,supplierId,invoiceRef,currency,amount,amountUnits:units,unitKind:kind};
}
export function verifiedM4Evidence({intent,execution}){
 if(!intent||!execution)return {ok:false,reason:"No linked M4 chain evidence"};
 if(intent.network!=="amadeus-testnet"||intent.asset!=="AMA")
  return {ok:false,reason:"Non-native payment is not reconcilable"};
 if(execution.status!=="finalized"||!execution.receipt||!execution.verified_at)
  return {ok:false,reason:"M4 chain finality is absent"};
 let receipt=execution.receipt;
 if(typeof receipt==="string"){try{receipt=JSON.parse(receipt)}catch{return {ok:false,reason:"Invalid receipt encoding"}}}
 if(!receipt||receipt.network!=="amadeus-testnet"||
    receipt.finality!=="finalized"||receipt.executionSuccess!==true||
    receipt.txHash!==execution.tx_hash||receipt.payer!==intent.payer||
    receipt.recipient!==intent.recipient||String(receipt.amountUnits)!==String(intent.amount_units)||
    receipt.asset!=="AMA"||receipt.contract!=="Coin"||receipt.method!=="transfer"||
    !Number.isSafeInteger(Number(receipt.entryHeight))||
    typeof receipt.entryHash!=="string"||receipt.entryHash.length<25)
  return {ok:false,reason:"Finalized receipt does not match reserved native AMA transfer"};
 return {ok:true,hash:execution.tx_hash,amountUnits:String(intent.amount_units),
  inclusionHeight:Number(receipt.entryHeight)};
}
export function deriveInvoiceSettlement({invoice,links=[]}){
 if(invoice.status!=="human_verified")return {state:"unverified",settledUnits:"0",outstandingUnits:String(invoice.amount_units),evidence:[]};
 if(invoice.currency!=="AMA")return {state:"not_applicable",settledUnits:"0",
  outstandingUnits:String(invoice.amount_units),evidence:[],reason:"Fiat invoices require a separate verified FX/payout workflow; no fiat payment is claimed"};
 const due=BigInt(String(invoice.amount_units));
 let settled=0n,pending=0,failed=0,disputed=0;
 const evidence=[];
 for(const link of links){
  const result=verifiedM4Evidence({intent:link.intent,execution:link.execution});
  if(result.ok){
   settled+=BigInt(result.amountUnits);
   evidence.push({transactionHash:result.hash,amountUnits:result.amountUnits,height:result.inclusionHeight,chain:"amadeus-testnet"});
  }else if(link.execution?.status==="failed")failed++;
  else if(link.execution?.status==="disputed")disputed++;
  else pending++;
 }
 if(settled>due)return {state:"disputed",settledUnits:settled.toString(),outstandingUnits:"0",evidence,
  reason:"Chain evidence exceeds invoice amount; manual investigation required"};
 const outstanding=due-settled;
 let state;
 if(settled===due)state="settled";
 else if(settled>0n)state="partial";
 else if(disputed)state="disputed";
 else if(failed&&pending===0)state="failed";
 else if(links.length)state="pending";
 else state="unmatched";
 return {state,settledUnits:settled.toString(),outstandingUnits:outstanding.toString(),
  pendingLinks:pending,failedLinks:failed,disputedLinks:disputed,evidence,
  chainVerificationRequired:true,bankPayoutVerified:false,fxQuoteVerified:false};
}
function csvSafe(value){
 const s=String(value??"");
 // Spreadsheet applications interpret +,-,=,@, TAB and CR as formulas.
 const escaped=/^[\t\r\n ]*[=+\-@\t\r]/.test(s)?"'"+s:s;
 return '"'+escaped.replaceAll('"','""')+'"';
}
export function accountingCSV(rows){
 const columns=["invoice_id","invoice_ref","supplier","currency","declared_amount","unit_kind","verification","reconciliation","settled_native_ama_atomic","outstanding_units","testnet_hashes","source_sha256","manual_reviewed_at","export_network"];
 const lines=[columns.map(csvSafe).join(",")];
 for(const row of rows){
  const values=[row.id,row.invoiceRef,row.supplier,row.currency,row.amount,row.unitKind,
   row.status,row.settlement?.state,row.settlement?.settledUnits,
   row.settlement?.outstandingUnits,
   (row.settlement?.evidence||[]).map(x=>x.transactionHash).join(";"),
   row.sourceSha256,row.verifiedAt||"","amadeus-testnet"];
  lines.push(values.map(csvSafe).join(","));
 }
 return lines.join("\r\n")+"\r\n";
}
