import React, { useEffect, useState } from "react";
import "./ama.css";
import { AmadeusSDK } from "@amadeus-protocol/sdk";

const API = "/api/v3/operator";
const AMA = "/api/v3/ama";
const DEFAULT_NETWORK = {
  chainId: Testnet, chainIdHex: "", name: "Amadeus Testnet",
  rpcUrls: ["https://testnet-rpc.ama.one/api"],
  nativeCurrency: { name: "Amadeus", symbol: "AMA", decimals: 18 },
  explorer: "https://amascan.io"
};

async function jsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new Error(data.error || "Request failed");
  return data;
}

export default function AMAWorkspace({ seed = null }) {
  const [network, setNetwork] = useState(DEFAULT_NETWORK);
  const [tokens, setTokens] = useState([]);
  const [health, setHealth] = useState(null);
  const [wallet, setWallet] = useState("");
  const [operator, setOperator] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState(null);
  const [selfTransferAcknowledged, setSelfTransferAcknowledged] = useState(false);
  useEffect(() => { fetch("/api/v3/auth?operation=session").then(r=>r.ok?r.json():null).then(r=>setOperator(r?.actor||null)).catch(()=>{}); },[]);
  const [token, setToken] = useState("AMA");
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [memo, setMemo] = useState("");
  const [intent, setIntent] = useState(null);
  const [unsignedTx, setUnsignedTx] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [acknowledgements, setAcknowledgements] = useState({});
  const [exactTermsChecked, setExactTermsChecked] = useState(false);
  const [channelProof] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const channel = params.get("channel");
    const paymentId = params.get("paymentId");
    if (!["telegram","whatsapp","wechat"].includes(channel) || !paymentId) return null;
    return { channel, paymentId, token: params.get(channel === "whatsapp" ? "waToken" : "wxToken") || "",
      telegramLaunchToken: params.get("telegramLaunchToken") || "" };
  });


  useEffect(() => {
    let active = true;
    fetch(AMA + "?operation=health").then(async response => {
      const data = await response.json();
      if (!active) return;
      if (data.network) setNetwork(data.network);
      if (data.tokens) setTokens(data.tokens);
      setHealth(data.rpc?.correctNetwork === true);
    }).catch(() => { if (active) setHealth(false); });
    return () => { active = false; };
  }, []);


  useEffect(() => {
    if (!seed || channelProof) return;
    setMemo("33JACK invoice:" + String(seed.paymentId || seed.invoice || "").slice(0,120));
    // Invoice fiat amounts never auto-convert to Amadeus stablecoins.
    setMessage("Invoice reference added. Verify and enter Amadeus token, exact amount and recipient manually.");
  }, [seed?.paymentId, channelProof]);

  function channelCredentials() {
    if (!channelProof) return null;
    return {
      ...channelProof,
      telegramInitData: channelProof.channel === "telegram" ?
        (window.Telegram?.WebApp?.initData || "") : undefined
    };
  }

  async function channelRequest(operation, payload = {}, extraHeaders = {}) {
    if (!channelProof) throw new Error("No signed invoice review was supplied");
    return jsonResponse(await fetch("/api/v3/channel?operation=" + operation, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify({ ...channelCredentials(), ...payload })
    }));
  }

  useEffect(() => {
    if (!channelProof) return;
    let active = true;
    const load = async () => {
      try {
        const data = await channelRequest("context");
        if (!active) return;
        setInvoice(data.invoice);
        if (data.intent) {
          setIntent(data.intent);
          if (data.intent.status === "approved") {
            const pending = await channelRequest("refresh", { id:data.intent.id });
            if (active) setUnsignedTx(pending.unsignedTransaction);
          }
        }
        setMemo("33JACK invoice:" + data.invoice.id);
      } catch(e) {
        if (active) setError("Signed invoice review failed: " + (e.message || "unknown error"));
      }
    };
    load();
    // Signed channel tokens remain in component memory, not navigation history.
    if (window.history.replaceState) window.history.replaceState(null, "", "/app/ama");
    return () => { active = false; };
  }, [channelProof]);

  async function request(operation, method = "GET", payload = {}, extraHeaders = {}) {
    const url = API + "?operation=" + operation + (method === "GET" && payload.id ? "&id=" + encodeURIComponent(payload.id) : "");
    return jsonResponse(await fetch(url, {
      method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      ...(method === "POST" ? { body: JSON.stringify(payload) } : {})
    }));
  }

  async function checkReadiness() {
    await perform(async () => {
      if(!operator) throw new Error("Sign in with the owner account first.");
      const data=await request("readiness");
      setReadiness(data);
      setMessage("Amadeus RPC, database and owner session are ready. This is read-only; no money has moved.");
    });
  }

  async function perform(fn) {
    setError("");
    setMessage("");
    setWorking(true);
    try { await fn(); } catch (e) { setError(e?.message || "Action failed"); }
    finally { setWorking(false); }
  }

  async function connect() {
    await perform(async () => {
      if (!window.amadeus?.requestAccounts) throw new Error("Install Amadeus Wallet Extension and select its Testnet network.");
      const accounts = await window.amadeus.requestAccounts();
      if (!accounts?.[0]) throw new Error("Wallet connection declined");
      setWallet(accounts[0]);
      setMessage("Native Amadeus wallet connected. Confirm that your wallet is on TESTNET.");
    });
  }

  async function propose() {
    await perform(async () => {
      if (!wallet) throw new Error("Connect a wallet first to bind the proposal to its payer");
      if (!channelProof && !operator) throw new Error("Sign in as an MFA operator to create a payment. External agent keys are never entered in the browser.");
      const data = channelProof
        ? await channelRequest("propose", {
            token, amount, recipient, payer: wallet, acknowledgements, confirmExactTerms: exactTermsChecked
          })
        : await request("propose", "POST", {
            network: "ama", token, amount, recipient, payer: wallet, memo, selfTransferAcknowledged
          }, { "Idempotency-Key": crypto.randomUUID() });
      setIntent(data.intent);
      setUnsignedTx(null);
      setTxHash("");
      setVerifiedReceipt(null);
      setMessage("Proposal saved to the secure database. Review exact details before authorising.");
    });
  }

  async function approve() {
    await perform(async () => {
      if (!intent || intent.status !== "proposed") throw new Error("No pending proposal");
      if (!window.confirm("Approve " + intent.amount + " " + intent.token + " from " + intent.payer + " to " + intent.recipient + " on Amadeus Testnet?")) return;
      const body = {
        id: intent.id, confirmation: "APPROVE:" + intent.id,
        confirmTerms: { amount:intent.amount, token:intent.token, payer:intent.payer, recipient:intent.recipient }
      };
      const data = channelProof
        ? await channelRequest("approve", body)
        : await request("approve", "POST", body);
      setIntent(data.intent);
      setUnsignedTx(data.unsignedTransaction);
      setMessage("Approved. Only your wallet can sign and broadcast this payment.");
    });
  }

  async function send() {
    await perform(async () => {
      if (!window.amadeus?.signTransaction) throw new Error("Amadeus Wallet Extension required");
      if (!intent || intent.status !== "approved" || !unsignedTx) throw new Error("A human-approved testnet transaction is required");
      if (wallet !== intent.payer) throw new Error("Connected wallet does not match approved payer");
      if (new Date(intent.expiresAt).getTime() <= Date.now()) throw new Error("Approval expired; create a new proposal");
      const accounts = await window.amadeus.requestAccounts();
      if (!accounts?.includes(wallet)) throw new Error("Wallet account changed");
      if (unsignedTx.network !== "amadeus-testnet" || unsignedTx.contract !== "Coin" ||
          unsignedTx.method !== "transfer" || unsignedTx.args?.[0] !== intent.recipient ||
          unsignedTx.args?.[1] !== intent.amountUnits || unsignedTx.args?.[2] !== "AMA")
        throw new Error("Payment terms do not match the approved native AMA transfer");
      const signed = await window.amadeus.signTransaction({
        contract: "Coin", method: "transfer", args: unsignedTx.args, description: unsignedTx.description
      });
      const sdk = new AmadeusSDK({baseUrl:"https://testnet-rpc.ama.one/api",timeout:30000});
      const submitted = await sdk.transaction.submit(signed.txPacked);
      const hash = submitted?.hash || signed.txHash;
      if (!hash) throw new Error("No transaction hash returned by the AMA testnet");
      setTxHash(hash);
      setMessage("Submitted to AMA TESTNET. Settlement remains pending until exact chain verification succeeds.");
    });
  }

  async function reconcile() {
    await perform(async () => {
      if (!intent || !txHash) throw new Error("No transaction hash yet");
      const data = channelProof
        ? await channelRequest("confirm", { id:intent.id, txHash })
        : await request("confirm", "POST", { id:intent.id, txHash });
      if (data.status === "pending") {
        setMessage((data.reason || "Transaction pending") + ". Use Reconcile again after the next Amadeus block.");
        return;
      }
      setIntent(data.intent);
      if (data.receipt) setVerifiedReceipt(data.receipt);
      setMessage("Onchain confirmed: contract, signer, calldata, amount and receipt match the approved transfer.");
    });
  }

  async function refresh() {
    await perform(async () => {
      if (!intent) throw new Error("No current proposal");
      const data = channelProof
        ? await channelRequest("refresh", { id: intent.id })
        : await request("intent", "GET", { id: intent.id });
      setIntent(data.intent);
      setUnsignedTx(data.unsignedTransaction);
      if(data.intent?.status==="confirmed" && !channelProof) {
        const result=await request("receipt","GET",{id:data.intent.id});
        setVerifiedReceipt(result.receipt||null);
      }
      setMessage("Payment status refreshed.");
    });
  }

  return (
    <section className="ama-v2">
      <header className="ama-v2-hero">
        <div><span className="eyebrow">33JACK V2 · AMA MAINNET</span><h2>Payments infrastructure for people and AI agents.</h2>
          <p>Prepare payment intents through 33JACK, require separate human approval, sign with your wallet and reconcile against Amadeus onchain evidence.</p>
          <p><a href="/login.html">Secure operator sign in</a> · <a href="/finance-ops.html">Invoice inbox</a> · <a href="/agent-console.html">Agent policies & schedules</a></p></div>
        <span className="ama-v2-chain">◉ Amadeus · Testnet</span>
      </header>
      <div className="ama-v2-metrics">
        <div><small>Settlement network</small><b>Amadeus Testnet</b></div>
        <div><small>RPC status</small><b>{health === null ? "Checking…" : health ? "Connected" : "Unavailable"}</b></div>
        <div><small>Wallet custody</small><b>Self-custody</b></div>
        <div><small>Signing policy</small><b>Human + wallet</b></div>
      </div>
      {channelProof && <article className="ama-v2-panel ama-channel-review">
        <span className="eyebrow">SIGNED {channelProof.channel.toUpperCase()} HANDOFF</span>
        <h3>{invoice ? invoice.invoice : "Verifying invoice access…"}</h3>
        {invoice && <>
          <p>Supplier: <strong>{invoice.supplier || "Not identified"}</strong> · Invoice: {invoice.originalAmount || "—"} {invoice.originalCurrency || ""}</p>
          <p>Workspace role: <strong>{invoice.role}</strong>. Amadeus payment amounts are not automatically converted from fiat invoices.</p>
          {["duplicate","beneficiary_changed","suspicious"].filter(key => invoice.risk?.[key]).map(key =>
            <label key={key} className="ama-ack"><input type="checkbox" checked={acknowledgements[key]===true}
              onChange={e=>setAcknowledgements(prev=>({...prev,[key]:e.target.checked}))} />
              I reviewed the {key.replaceAll("_"," ")} risk flag</label>
          )}
          {!!invoice.risk?.missing_fields?.length && <p className="ama-v2-error">Invoice incomplete: {invoice.risk.missing_fields.join(", ")}. Resolve these fields first.</p>}
        </>}
      </article>}
      <div className="ama-v2-grid">
        <article className="ama-v2-panel">
          <span className="eyebrow">01 / CONNECT</span><h3>Connect your Amadeus wallet</h3>
          <p>Transactions are signed in Amadeus Wallet Extension. No private key is stored by 33JACK.</p>
          <button type="button" className="ama-v2-primary" disabled={working} onClick={connect}>{wallet ? "Connected · " + wallet.slice(0, 7) + "…" + wallet.slice(-4) : "Connect wallet"}</button>
        </article>
        {!channelProof && <article className="ama-v2-panel">
          <span className="eyebrow">02 / OPERATOR LOGIN &amp; CHECKS</span><h3>Activate your workspace</h3>
          {operator
            ? <p><strong>{operator.id}</strong> is signed in ({operator.role}). Human actions use your MFA session, not an agent API key.</p>
            : <p>Sign in with your owner password and authenticator. External AI agent credentials stay on their own servers.</p>}
          <p><a href={operator?"/agent-console.html":"/setup.html"}>{operator?"Agent controls":"First-time setup"}</a> · <a href="/login.html">Operator login</a></p>
          <button type="button" disabled={working||!operator} onClick={checkReadiness}>Test database and Amadeus RPC (no funds)</button>
          {readiness && <p role="status">Database: <strong>{readiness.database}</strong> · Chain: <strong>{readiness.rpc?.chainId}</strong> · Network: <strong>{readiness.rpc?.correctNetwork?"verified":"incorrect"}</strong> · Transactions sent by test: <strong>0</strong></p>}
        </article>}
        <article className="ama-v2-panel">
          <span className="eyebrow">03 / PAYMENT INTENT</span><h3>Prepare a payment</h3>
          <div className="ama-v2-two">
            <label>Token<select value={token} onChange={e => setToken(e.target.value)}>{(tokens.length ? tokens : [{symbol:"AMA"},{symbol:"AMA"},{symbol:"AMA"}]).map(t => <option value={t.symbol} key={t.symbol}>{t.symbol}</option>)}</select></label>
            <label>Amount<input value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="1.00"/></label>
          </div>
          <label>Recipient address<input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x…" spellCheck={false}/></label>
          <label>Memo / invoice<input value={memo} readOnly={!!channelProof} onChange={e => setMemo(e.target.value)} placeholder="Vendor invoice #123"/></label>
          {!channelProof && wallet && recipient.toLowerCase()===wallet.toLowerCase() && <label className="ama-ack"><input type="checkbox" checked={selfTransferAcknowledged} onChange={e=>setSelfTransferAcknowledged(e.target.checked)}/> I intend to transfer tokens from this wallet back to itself, paying network fees.</label>}
          {channelProof && <label className="ama-ack"><input type="checkbox" checked={exactTermsChecked} onChange={e=>setExactTermsChecked(e.target.checked)}/>
            I independently verified the exact token, amount, payer wallet and recipient address.</label>}
          <button type="button" className="ama-v2-primary"
            disabled={working || !wallet || (!channelProof && !operator) || (channelProof && (!invoice?.canPropose || !!invoice?.risk?.missing_fields?.length || !exactTermsChecked || !!intent))}
            onClick={propose}>Create approval-required proposal</button>
        </article>
        <article className="ama-v2-panel">
          <span className="eyebrow">04 / APPROVE & SETTLE</span><h3>Human-controlled execution</h3>
          <p>No agent can send funds on its own. Human approval and a separate wallet signature are mandatory.</p>
          {!channelProof && (operator ? <p>Signed in as {operator.id} ({operator.role}). MFA verified.</p> : <p><a href="/login.html">Sign in with MFA to approve payments</a></p>)}
          <div className="ama-v2-actions">
            <button type="button" disabled={working || intent?.status !== "proposed" || (!channelProof && !operator) || (channelProof && !invoice?.canApprove)} onClick={approve}>Approve exact terms</button>
            <button type="button" disabled={working || intent?.status !== "approved" || !unsignedTx || Boolean(txHash)} onClick={send}>Send with wallet</button>
            <button type="button" disabled={working || !txHash || intent?.status === "confirmed"} onClick={reconcile}>Reconcile onchain</button>
          </div>
        </article>
      </div>
      {intent && <article className="ama-v2-panel ama-v2-result">
        <div className="ama-v2-result-head"><div><span className="eyebrow">PAYMENT RECEIPT</span><h3>{intent.status.toUpperCase()}</h3></div><button type="button" onClick={refresh} disabled={working}>Refresh</button></div>
        <dl><div><dt>Intent</dt><dd>{intent.id}</dd></div><div><dt>Token / amount</dt><dd>{intent.amount} {intent.token}</dd></div><div><dt>Recipient</dt><dd>{intent.recipient}</dd></div><div><dt>Expiry</dt><dd>{new Date(intent.expiresAt).toLocaleString()}</dd></div></dl>
        {(txHash || intent.txHash) && <p>Transaction: <a href={network.explorer + "/tx/" + (txHash || intent.txHash)} target="_blank" rel="noreferrer">{txHash || intent.txHash}</a></p>}
      </article>}
      {verifiedReceipt && <article className="ama-v2-panel ama-v2-result"><span className="eyebrow">VERIFIED MAINNET RECEIPT</span><h3>{verifiedReceipt.receiptId}</h3><p>Confirmed payment: {verifiedReceipt.amount} {verifiedReceipt.token}. This record corresponds to a real Amadeus transaction. <a href={verifiedReceipt.blockExplorer} target="_blank" rel="noreferrer">Verify independently on Amadeusscan</a></p></article>}
      {message && <p className="ama-v2-message" role="status">{message}</p>}
      {error && <p className="ama-v2-error" role="alert">{error}</p>}
      <p className="ama-v2-disclaimer">Live Amadeus transfer flow. AMA, AMA and AMA are testnet assets. Legacy Solana/FX sandbox routes remain separate. Do not enter credentials on an untrusted deployment.</p>
    </section>
  );
}
