import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {PDFDocument,StandardFonts} from "pdf-lib";
import {bls12_381 as bls} from "@noble/curves/bls12-381";
import {toBase58} from "@amadeus-protocol/sdk";
import {PaymentError} from "../api/_lib/v3-payment-core.js";
import {
 decodeDocument,extractDocument,invoiceReference,moneyUnits,validateSupplier,
 validateInvoice,verifiedM4Evidence,deriveInvoiceSettlement,accountingCSV,M6_MAX_BYTES
} from "../api/_lib/v3-invoice-core.js";
const wallet=()=>toBase58(bls.getPublicKey(bls.utils.randomPrivateKey()));
const recipient=wallet(),payer=wallet();
const workspaceId="123e4567-e89b-42d3-a456-426614174000";
const randomId=()=>"123e4567-e89b-42d3-a456-426614174001";
const text=Buffer.from("Invoice INV-100\nSupplier M6 Test\nAmount 2.00 AMA","utf8");
const textUpload={filename:"m6-invoice.txt",mime:"text/plain",base64:text.toString("base64")};
test("M6 enforces source provenance, MIME/signature, safe names, strict byte caps",async()=>{
 const source=decodeDocument(textUpload);
 assert.equal(source.sha256,createHash("sha256").update(text).digest("hex"));
 assert.equal(source.bytes.length,text.length);assert.equal(source.format,"text");
 const extracted=await extractDocument(textUpload);
 assert.equal(extracted.extractionStatus,"text_extracted_unverified");
 assert.match(extracted.extractedPreview,/Invoice INV-100/);
 assert.equal(extracted.rawFileStored,false);
 assert.equal(extracted.humanVerified,false);
 const fakePng=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const img=await extractDocument({filename:"scan.png",mime:"image/png",base64:fakePng.toString("base64")});
 assert.equal(img.extractionStatus,"image_requires_manual_review");assert.equal(img.extractedPreview,"");
 for(const payload of [
  {...textUpload,filename:"../evil.txt"},
  {...textUpload,filename:"doc.txt",mime:"image/png"},
  {...textUpload,filename:"doc.svg",mime:"image/svg+xml"},
  {...textUpload,filename:"doc.pdf",mime:"application/pdf"},
  {...textUpload,base64:"%%%"},
  {...textUpload,base64:Buffer.alloc(M6_MAX_BYTES+1,97).toString("base64")}
 ])await assert.rejects(extractDocument(payload),/Invalid|unsupported|mismatched|oversized|exceeds|unsafe/i);
});
test("M6 extracts bounded PDF text and rejects over-page-count / corrupt sources",async()=>{
 const pdf=await PDFDocument.create();
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const page=pdf.addPage([500,500]);
 page.drawText("Invoice INV-PDF-5: 4.25 AMA",{x:40,y:420,size:16,font});
 const bytes=Buffer.from(await pdf.save());
 const doc=await extractDocument({filename:"payable.pdf",mime:"application/pdf",base64:bytes.toString("base64")});
 assert.equal(doc.sourceType,"pdf");assert.equal(doc.numberOfPages,1);
 assert.equal(doc.extractionStatus,"text_extracted_unverified");
 assert.match(doc.extractedPreview,/Invoice INV-PDF-5/);
 const extra=await PDFDocument.create();
 for(let i=0;i<9;i++)extra.addPage([200,200]);
 const nine=Buffer.from(await extra.save());
 await assert.rejects(extractDocument({filename:"nine.pdf",mime:"application/pdf",base64:nine.toString("base64")}),/1–8/);
 await assert.rejects(extractDocument({filename:"bad.pdf",mime:"application/pdf",base64:Buffer.from("%PDF-broken").toString("base64")}),/Invalid|unsupported/);
});
test("M6 supplier/ref/fiat amounts validated without fabricating FX",()=>{
 assert.equal(invoiceReference("  INV-01  "),"INV-01");
 assert.throws(()=>invoiceReference("=HYPERLINK(1)"),/identifier/);
 assert.equal(moneyUnits("2.345678901","AMA").units,"2345678901");
 assert.equal(moneyUnits("250","AMA").units,"250000000000");
 assert.equal(moneyUnits("20.25","GBP").units,"2025");
 assert.equal(moneyUnits("20.2","EUR").kind,"fiat_minor_2_no_fx");
 for(const n of ["1.234","1e3","0","-3"])assert.throws(()=>moneyUnits(n,"GBP"),/positive|decimal|exceed zero/);
 assert.throws(()=>moneyUnits("1","USDC"),/currency/);
 const supplier=validateSupplier({workspaceId,name:"Test Supplier",address:recipient});
 assert.equal(supplier.address,recipient);
 const inv=validateInvoice({workspaceId,documentId:randomId(),supplierId:randomId(),invoiceRef:"INV-01",amount:"2",currency:"AMA"});
 assert.equal(inv.amountUnits,"2000000000");
 assert.throws(()=>validateInvoice({workspaceId,documentId:randomId(),supplierId:randomId(),invoiceRef:"INV-01",amount:"2",currency:"AMA",paid:true}),/cannot assert/);
});
function chain({hash,amount="1000000000",receiver=recipient,status="finalized",valid=true}={}){
 const txHash=hash||toBase58(Buffer.alloc(32,8));
 const intent={network:"amadeus-testnet",asset:"AMA",payer,recipient:receiver,amount_units:amount};
 const execution={status,tx_hash:txHash,verified_at:new Date(),receipt:valid?{
  network:"amadeus-testnet",finality:"finalized",executionSuccess:true,txHash,
  payer,recipient:receiver,amountUnits:amount,asset:"AMA",contract:"Coin",method:"transfer",
  entryHash:toBase58(Buffer.alloc(32,9)),entryHeight:30
 }:null};
 return {intent,execution};
}
test("M6 only counts independently checked exact M4 finalized receipts",()=>{
 const good=chain(),mismatch=chain({amount:"12345"});
 assert.equal(verifiedM4Evidence(good).ok,true);
 assert.equal(verifiedM4Evidence({...good,execution:{...good.execution,status:"pending"}}).ok,false);
 assert.equal(verifiedM4Evidence({...good,execution:{...good.execution,receipt:{...good.execution.receipt,amountUnits:"3"}}}).ok,false);
 assert.equal(verifiedM4Evidence({...good,execution:{...good.execution,verified_at:null}}).ok,false);
 assert.equal(verifiedM4Evidence({...good,execution:{...good.execution,receipt:null}}).ok,false);
 assert.equal(verifiedM4Evidence(mismatch).ok,true);
});
test("M6 supports unmatched, pending, partial, settled, failed, disputed; fiat no payout",()=>{
 const invoice={status:"human_verified",currency:"AMA",amount_units:"2000000000"};
 const empty=deriveInvoiceSettlement({invoice,links:[]});
 assert.equal(empty.state,"unmatched");assert.equal(empty.settledUnits,"0");
 assert.equal(deriveInvoiceSettlement({invoice:{...invoice,status:"unverified"},links:[chain()]}).state,"unverified");
 assert.equal(deriveInvoiceSettlement({invoice:{...invoice,currency:"GBP"},links:[chain()]}).state,"not_applicable");
 assert.equal(deriveInvoiceSettlement({invoice,links:[{intent:chain().intent,execution:null}]}).state,"pending");
 const half=deriveInvoiceSettlement({invoice,links:[chain()]});
 assert.equal(half.state,"partial");assert.equal(half.outstandingUnits,"1000000000");
 const full=deriveInvoiceSettlement({invoice,links:[chain(),chain({hash:toBase58(Buffer.alloc(32,7))})]});
 assert.equal(full.state,"settled");assert.equal(full.settledUnits,"2000000000");assert.equal(full.evidence.length,2);
 assert.equal(deriveInvoiceSettlement({invoice,links:[{...chain(),execution:{status:"failed"}}]}).state,"failed");
 assert.equal(deriveInvoiceSettlement({invoice,links:[{...chain(),execution:{status:"disputed"}}]}).state,"disputed");
 const over=deriveInvoiceSettlement({invoice,links:[chain({amount:"3000000000"})]});
 assert.equal(over.state,"disputed");
 assert.equal(over.bankPayoutVerified,false);
 assert.equal(over.fxQuoteVerified,false);
});
test("M6 CSV resists spreadsheet formula injection and separates native/fiat denomination",()=>{
 const file=accountingCSV([{
  id:"=1+1",invoiceRef:"@SUM(1,2)",supplier:"+CMD()",
  currency:"GBP",amount:"14.50",unitKind:"fiat_minor_2_no_fx",
  status:"human_verified",settlement:{state:"not_applicable",settledUnits:"0",outstandingUnits:"1450",evidence:[]},
  sourceSha256:"a".repeat(64),verifiedAt:"2026-11-10"
 }]);
 assert.match(file,/"'=1\+1"/);assert.match(file,/"'@SUM/);assert.match(file,/"'\+CMD/);
 assert.match(file,/fiat_minor_2_no_fx/);
 assert.match(file,/amadeus-testnet/);
 assert.doesNotMatch(file,/bank_payout_success|fx_rate_proven/);
});
