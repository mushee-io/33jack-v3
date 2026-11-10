/** Previous demo bank/chain route prices were illustrative, not verifiable on AMA. */
export function rankRoutes({destinationCurrency}={}){return {mode:"unavailable",currency:String(destinationCurrency||"AMA").toUpperCase(),best:null,alternatives:[],reason:"Native AMA testnet only. No active fiat bridge/off-ramp prices."};}
