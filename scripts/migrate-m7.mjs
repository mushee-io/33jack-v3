// M7 schema bootstrap is forward-only, scoped to a dedicated V3 Testnet database.
import {paymentDB} from "../api/_lib/v3-payment-store.js";
import {invoiceDB} from "../api/_lib/v3-invoice-store.js";
import {governanceDB} from "../api/_lib/v3-governance-store.js";
if(!process.env.DATABASE_URL)throw Error("Dedicated non-production DATABASE_URL required");
if(process.env.AMA_M4_ENABLE_BROADCAST==="true"||
   process.env.AMA_M4_WALLET_EXTENSION_VERIFIED==="true"||
   process.env.AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED==="true")
 throw Error("M7 migration refuses any enabled wallet/broadcast gates");
await paymentDB();
await invoiceDB();
const sql=await governanceDB();
const p=await sql.unsafe("SELECT to_regclass('public.ama_v3_m7_policies') AS policy,to_regclass('public.ama_v3_m7_events') AS audit,to_regclass('public.ama_v3_m7_approval_seals') AS seals");
if(!p[0].policy||!p[0].audit||!p[0].seals)throw Error("M7 schema bootstrap incomplete");
console.log("M7 governance schema ready; all native Testnet transfer gates remain disabled");
await sql.end();
