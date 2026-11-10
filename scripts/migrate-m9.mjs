/**
 * M9 independent acceptance schema migration. Never enables signing, broadcasting,
 * mainnet configuration, or any payment transaction.
 */
import {acceptanceDB} from "../api/_lib/v3-acceptance-store.js";
if(!process.env.DATABASE_URL)throw Error("M9 migration requires disposable/private V3 Testnet DATABASE_URL");
for(const flag of ["AMA_M4_ENABLE_BROADCAST","AMA_M4_WALLET_EXTENSION_VERIFIED",
 "AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED"]){
 if(process.env[flag]==="true")throw Error("M9 migration refuses enabled wallet or broadcast release gates");
}
const sql=await acceptanceDB();
const rows=await sql.unsafe("SELECT to_regclass('public.ama_v3_m9_reports') AS m9, to_regclass('public.ama_v3_m7_events') AS m7, to_regclass('public.ama_v3_m6_invoices') AS m6");
if(!rows[0]?.m9||!rows[0]?.m7||!rows[0]?.m6)
 throw Error("M9 schema bootstrap incomplete; earlier invoice/governance integrity unavailable");
console.log("M9 append-only Testnet acceptance schema ready; broadcast stays NO-GO");
await sql.end();
