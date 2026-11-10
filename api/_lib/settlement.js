/** No legacy chain route should be treated as real in 33JACK V3. */
import {AMA_TESTNET} from "./ama-v3.js";
export function getSettlementRegistry(){return {networks:[{id:AMA_TESTNET.id,name:AMA_TESTNET.name,mode:"testnet",status:"manual-wallet-only",asset:"AMA"}],providers:[]};}
export function quoteSettlementRoutes(input={}){return {mode:"testnet",paymentIntent:input,recommended:null,alternatives:[],reason:"Only native AMA wallet-approved transfers are supported; no fiat or bridge quotes available"};}
export function executeDemoSettlement(){return {ok:false,status:"unavailable",detail:"Legacy simulated payment execution retired on Amadeus testnet",fundsMoved:false};}
