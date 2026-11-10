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
  return (
    <main>
      <iframe
        src="/medusa-jf4.html?v=2"
        title="Medusa JF-4 field simulator"
        style={{ display: "block", width: "100%", height: "100svh", border: 0 }}
      />
    </main>
  );
}

function Root() {
  return (window.location.pathname === "/" ? <Landing/> : <AmadeusWorkspace seed={amaSeed}/>);
}

createRoot(document.getElementById("root")).render(<Root/>);
