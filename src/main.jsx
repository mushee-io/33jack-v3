import React from "react";
import { createRoot } from "react-dom/client";
import AmadeusWorkspace from "./AmadeusWorkspace.jsx";
import MainframeHero from "./MainframeHero";
import "./entry.css";

// Legacy application URLs converge on the one native Testnet workspace.
// A route migration must never activate old finance rails.
const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
if (pathname.startsWith("/app") && pathname !== "/app/amadeus") {
  window.history.replaceState(null, "", "/app/amadeus" + window.location.search + window.location.hash);
}

const amaSeed = null;

function Root() {
  return pathname === "/" ? <MainframeHero /> : <AmadeusWorkspace seed={amaSeed}/>;
}

createRoot(document.getElementById("root")).render(<Root/>);
