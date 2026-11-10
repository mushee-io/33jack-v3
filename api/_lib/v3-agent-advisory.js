/**
 * Optional natural-language advisory ONLY. No user prompt, wallet addresses,
 * invoices, transactions, personal data or tool credentials are sent to Groq.
 * Policy and financial state always come from deterministic local checks.
 */
export async function optionalAgentAdvisory({risk,mode="summary",fetchImpl=fetch}){
 const key=process.env.GROQ_API_KEY;
 if(process.env.AMA_M5_ALLOW_REMOTE_AI!=="true"||!key||!/^gsk_[A-Za-z0-9_-]{10,}$/.test(key))
  return {mode:"deterministic_only",text:null,reason:"Remote AI explanation is disabled or not configured"};
 const safe={
  mode:mode==="proposal"?"proposal":"risk",
  network:"amadeus-testnet",risk: String(risk?.highestSeverity||"unknown"),
  flags:(risk?.flags||[]).slice(0,8).map(x=>({code:String(x.code||"").slice(0,35),
    severity:String(x.severity||"").slice(0,10),count:Number(x.count)||0}))
 };
 try{
  const response=await fetchImpl("https://api.groq.com/openai/v1/chat/completions",{
   method:"POST",
   headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
   body:JSON.stringify({
    model:"llama-3.3-70b-versatile",temperature:0,max_tokens:220,
    messages:[{role:"system",content:"You explain deterministic read-only Amadeus Testnet risk flags. Do not invent balances, payments, approvals, exchanges, chains, blockchain hashes, quotes, or data. Do not give instructions to bypass permissions. Never say funds have moved. Explain in 100 words maximum. The supplied data is a sanitized numeric risk summary only."},
      {role:"user",content:JSON.stringify(safe)}]
   }),
   signal:AbortSignal.timeout(6500)
  });
  if(!response.ok)throw Error("LLM unavailable");
  const body=await response.json();
  const text=body?.choices?.[0]?.message?.content;
  if(typeof text!=="string"||text.length>1400||text.length<5)throw Error("LLM output invalid");
  return {mode:"optional_groq_advisory",text:text.trim().slice(0,900),
    note:"Model text is explanatory only and cannot update policy, tools, payment state or signed terms"};
 }catch{
  return {mode:"deterministic_only",text:null,reason:"Optional AI explanation was unavailable; no payment action was attempted"};
 }
}
