import {invoiceDB} from "../api/_lib/v3-invoice-store.js";
if(!process.env.DATABASE_URL)throw Error("M6 migration requires a dedicated DATABASE_URL");
if(process.env.AMA_M4_ENABLE_BROADCAST==="true")throw Error("M6 migration must not enable M4 broadcast");
const db=await invoiceDB();
const rows=await db.unsafe("SELECT to_regclass('public.ama_v3_m6_invoices') AS invoices,to_regclass('public.ama_v3_m6_events') AS events");
if(!rows[0].invoices||!rows[0].events)throw Error("M6 invoice schema missing");
console.log("M6 schema ready; no transfer or settlement operation was attempted");
await db.end();
