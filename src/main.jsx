import React from "react";
import { createRoot } from "react-dom/client";
import AmadeusWorkspace from "./AmadeusWorkspace.jsx";
import "./entry.css";

// Legacy application URLs converge on the one native Testnet workspace.
// A route migration must never activate old finance rails.
const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
if (pathname.startsWith("/app") && pathname !== "/app/amadeus") {
  window.history.replaceState(null, "", "/app/amadeus" + window.location.search + window.location.hash);
}

const amaSeed = null;

function Landing() {
  return <main className="jack-entry">
    <header className="jack-entry-nav" aria-label="33JACK V3">
      <a className="jack-entry-brand" href="/" aria-label="33JACK home"><span aria-hidden="true">33</span>33JACK <small>V3</small></a>
      <a className="jack-entry-link" href="/app/amadeus">Open Testnet workspace <span aria-hidden="true">→</span></a>
    </header>
    <section className="jack-entry-hero">
      <p className="jack-entry-eyebrow">AMADEUS L1 TESTNET · HUMAN-AUTHORIZED FINANCE</p>
      <h1>Your financial agent.<br/><em>Your wallet stays in control.</em></h1>
      <p className="jack-entry-intro">33JACK V3 is a native Amadeus Testnet workspace for organizations to review invoices, prepare AMA payment intents, apply human approval rules, receive AI-assisted financial explanations, and reconcile verified on-chain evidence.</p>
      <div className="jack-entry-actions">
        <a className="jack-entry-primary" href="/app/amadeus">Explore Amadeus Testnet <span aria-hidden="true">→</span></a>
        <a className="jack-entry-secondary" href="https://github.com/mushee-io/33jack-v3" target="_blank" rel="noreferrer">View GitHub project</a>
      </div>
      <div className="jack-entry-status" role="note"><span aria-hidden="true">●</span> Testnet only · AI cannot sign or authorize transactions · Real two-wallet transfer and independent security review still require external evidence.</div>
    </section>
    <section className="jack-entry-features" aria-label="What 33JACK V3 does">
      <article><small>01 / IDENTITY</small><h2>Wallet-owned access</h2><p>Native wallet authentication and organization roles, subject to official extension compatibility testing.</p></article>
      <article><small>02 / OPERATIONS</small><h2>Review before paying</h2><p>Invoice provenance, immutable intent terms, maker–checker approvals and manual risk controls.</p></article>
      <article><small>03 / EVIDENCE</small><h2>Verify, never assume</h2><p>Read-only chain checks distinguish proposed payments from independently verified Testnet settlement.</p></article>
    </section>
    <footer className="jack-entry-footer"><span>© 2026 Mushee Labs · 33JACK V3</span><span>MIT licensed · Amadeus Testnet · No mainnet launch</span></footer>
  </main>;
}

function Root() {
  return (window.location.pathname === "/" ? <Landing/> : <AmadeusWorkspace seed={amaSeed}/>);
}

createRoot(document.getElementById("root")).render(<Root/>);
