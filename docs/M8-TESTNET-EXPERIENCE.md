# 33JACK V3 M8 — Native Amadeus Testnet User Experience

## Verified predecessor and stacked boundaries
M7 draft PR #10 exact SHA b92395c2ede619ef668b555f58cdea3b5a3d4a13; push CI 42804311713 and PR CI 42804321371 completed with all six jobs successful in each. M8 branch feat/ama-v3-m8-testnet-experience is based on M7 and its draft PR must target M7, not main. All earlier PRs remain draft/unmerged; main unchanged and no mainnet deployment.

## M8.1 — Dedicated native Testnet route
- The existing "/" redirect enters /app/amadeus. M8 renders the Amadeus native V3 workspace directly at /app/amadeus, not inside the legacy V2 payment-rail navigation, loaders and labels.
- Previous V2 routes are not rewritten or merged; no Celo, Stellar, Solana, EVM, fiat bank, stablecoin or alternate-chain functions are enabled by M8.
- V3 network is exactly Amadeus L1 Testnet; native asset AMA with nine atomic decimals.
- RPC "reachable" status is network availability only, NOT evidence of a compatible browser wallet or a completed transaction.

## M8.2 — Product design, accessible sections and wallet state
- Dedicated navigation: Overview, Wallet & identity, Payments, Chain evidence, Financial agent, Invoices and Governance.
- Responsive layout for mobile and desktop, accessible semantic nav/main, keyboard arrow/Up/Down/Home/End navigation, visible focus indicator and skip-to-content link.
- Screen-reader status/error feedback, no hover-only required actions and reduced-motion support.
- Distinct disconnected, network-unverified, connected-only and server-authenticated wallet states. A restored session cookie does not independently prove an installed extension currently reports Testnet.
- M2 native login uses a verified BLS challenge with no transaction-signing fallback, and account/network change invalidates state.
- The explicit read AMA balance action requires authenticated matching wallet and independently checked Testnet network; raw RPC balance is shown without invented FX, converted valuations, or synthetic zero.

## M8.3 — Organization overview and evidence transparency
- Added read-only GET /api/v3/ama?operation=ux-overview with exact authenticated workspace ID.
- M2 session and role checks happen before scoped SELECTs. Overview uses existing M3 intents, M6 invoices, M7 risk flags and policies, and M4 independently verified persisted receipts.
- Counts are bounded with cap indicators. The dashboard distinguishes "not loaded," "loading," "unavailable" and real zero; no fabricated financial activity.
- Native wallet balance is explicitly NOT loaded by this aggregate overview; an RPC read is requested separately by the operator.
- M7 emergency pause or missing policy displays truthfully; no disabled financial function appears operational.

## M8.4 — Chain evidence and truthful finality
- Added read-only GET /api/v3/ama?operation=ux-receipts, returning a bounded list of latest native M4 execution records with approved M3 payer, recipient and AMA units from the exact same organization.
- The only verified state requires M4 stored successful finalized Coin.transfer evidence with exact native network, tx hash, payer, recipient, token, atomic amount, entry hash/height, successful execution and verified_at timestamp.
- "Reserved," "uncertain," "pending," "confirmed but not finalized," "failed," "disputed," and a mismatched finalized label are all NOT successful settlement; do not re-broadcast a reserved or uncertain signed packet.
- No manufactured explorer URL, fabricated Testnet hash, fake confirmations, fictional bank payouts or fiat FX routes. Verification is presented with the precise provenance of previously stored M4 evidence.
- M8 displays data and links back to the human-controlled existing M4 reconciliation UI; it does not sign, submit, rebroadcast or itself query the official chain.

## M8.5 — Security preservation and endpoint hardening
- GET-only UX endpoints; rejects POST mutations, unexpected network/account query overrides, unauthenticated clients, mismatched same-origin requests and unauthorized workspaces.
- Existing M4 broadcast flags remain default-off pending independent installed wallet-extension and funded two-wallet acceptance.
- M5 read-only AI tool allowlist, M6 verified source/invoice integrity, and M7 maker-checker, emergency pause and append-only audit remain unchanged.
- User-selected section is unmounted when switching, resetting transient M4 staged signed packet React state. No wallet secrets, raw signed packets, invoice binary data or other tenant records are returned.

## M8.6 — Exact-SHA CI and PostgreSQL restore acceptance
- npm run test:m8: checks native network labels, safe wallet auth status, keyboard navigation model, accessible screen semantics, reduced-motion CSS, exact AMA decimal math, confirmed vs finalized evidence and all previous financial/AI safeguards.
- npm run test:m8:db: disposable PostgreSQL 16 with M2 organization sessions, multi-tenant data, M3 native payment intents, M4 synthetic finalized/pending/uncertain/conflicting rows, an M6 unverified fiat invoice and M7 policy/manual risk. Tests authorization, cross-workspace isolation, session/origin/method failure, immutable read-only financial tables, accurate counts and evidence labels.
- Synthetic M4 chain receipt fixtures exist ONLY in disposable CI; they do NOT represent live on-chain transactions or actual wallet payments.
- The M8 CI job exports a PostgreSQL snapshot, restores into a NEW disposable m8restore database, checks native receipt truth, exact M6 source provenance, M7 policy and append-only audit triggers, preserved M3/M4 rows and exact organization scope.
- Prior M1–M7 unit, Vite build and M3/M4/M5/M6/M7 disposable PostgreSQL jobs continue in each run. Both push and PR CI at the exact M8 head SHA must be successful.

## External no-go requirements
The real installed Amadeus Wallet extension signMessage and sign-only packed native transaction APIs have not been witnessed. A funded real two-wallet Amadeus Testnet settlement, external source-backed chain acceptance and deployed dedicated V3 PostgreSQL are unverified. No mainnet deployment, external KYC/KYB/AML integration, autonomous agent execution, fiat payout or FX conversion is claimed. Keep PR draft/unmerged pending independent security and operator acceptance.
