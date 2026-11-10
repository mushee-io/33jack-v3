# 33JACK V3 — M9/10: Amadeus L1 Testnet end-to-end acceptance and independent security readiness

## Verified stacked prerequisite
- M8 draft PR #11 exact SHA **84c3fafb8c8f13a33a43f636e6f061c1e4823cf0**, open/unmerged.
- M8 push CI **42808946009** and PR CI **42808998767** both successful, seven jobs each.
- M9 branch: **feat/ama-v3-m9-e2e-security-acceptance**. Base: M8. All prior PRs remain draft/unmerged, V2 and main untouched. No mainnet deployment.

## Previously agreed M9 goal
M9 completes internal system and adversarial acceptance across clean install/production build; API/DB/wallet/frontend integration; invoice → read-only agent → human authorization → wallet-owner signature → independently checked native AMA transfer → reconciled invoice and receipt; two distinct Testnet wallets; tenant isolation; changed/expired/duplicate/replay protections; RPC timeout/interruption recovery; migrations, backup/restore; dependency/permissions/secrets review; redacted evidence artifacts; explicit independent security review status. **Do not claim supported live workflows without real chain evidence or hide unresolved critical security findings.**

## M9.1 — Acceptance is not authorization
- Reuse M2 native wallet session checks, M3 exact immutable payment terms, M4 one-attempt reserved signed packet + official Testnet reconciliation, M5 read-only AI, M6 source-hashed invoice and settlement, M7 independent maker–checker/pause/audit, and M8 accessible experience.
- M9 adds ONLY a read-only acceptance and evidence ledger. It cannot sign, create M3 payment intents, create or broadcast transactions, unlock M4 release flags, relax M7 policy or approve a payment.
- Read-only M9 verification is a separate, explicit owner/admin action; it never requests a signed packet or private key.
- All queries must use **official Amadeus Testnet** RPC. Mainnet or arbitrary/custom hostnames remain rejected by the existing exact Testnet RPC allowlist.

## M9.2 — Distinguishing synthetic CI from independently witnessed Testnet
- The accepted subject is an already-created M3 human-approved native AMA Testnet intent with exactly matching immutable terms and a separately reserved M4 transaction.
- M4 stored receipt must include native Coin.transfer, sender/recipient, atomic amount, transaction hash, successful execution, finalized entry hash/height, verification timestamp and exactly one broadcast reservation.
- M9 will reject an M4 receipt flagged syntheticCIOnly, simulated or fixture, or lacking official M4 verification attribution.
- Owner/admin can explicitly invoke acceptance-witness. It re-reads the existing Testnet transaction through the official SDK and independently compares original hash, sender, recipient, amount, Coin.transfer and rooted/finalized entry metadata. RPC outage, missing proof or mismatched terms **fail closed**; an RPC acknowledgement alone is not enough.
- Injected SDK clients in test code can never create a "real" witness status. CI records are 'blocked' or 'synthetic_ci_only' and must not be represented as actual transfers.
- A complete funded two-wallet operator witness needs **two distinct actual wallet owners with recently consumed M2 signed login challenges** on the same trusted origin, plus real M4 packet, independent Testnet finality and matching human-reviewed M6 invoice. None is assumed from CI fixtures.

## M9.3 — Evidence matrix and NO-GO status
The acceptance matrix includes clean install/build; two authenticated wallets; immutable human approval; M4 one-attempt broadcast; independently observed finality; no autonomous M5 agent privileges; human-reviewed invoice and M6 chain-backed settlement; M7 audit integrity/current policy; cross-tenant/adversarial tests; database restore; dependency/secrets/permissions checks; and a **separate independent security review**.
- M9 runtime readiness checks only evidence it can actually observe from the authenticated workspace DB and direct official RPC; missing run provenance is always marked blocked.
- Independent security review is **not submitted**. The acceptance report does not mark GO on the strength of synthetic CI.
- M9 produces a tamper-evident, append-only, hash-linked PostgreSQL acceptance report, validated on a separate restored DB. Sensitive user prompts, private keys, raw packet bytes and secrets are not stored or emitted.
- Hash-chain continuity is a database-level invariant, **not external notarization**. A separate third-party security audit must be assessed before product launch.

## M9.4 — New authenticated operations and UI
Under \`/api/v3/ama?operation=\`:
- GET acceptance-matrix: declared criteria and explicit external blockers.
- GET acceptance-status: owner/admin-scoped read-only check of M2–M7 linked records.
- GET acceptance-reports: bounded list of previous witness results.
- GET acceptance-audit: validate M9 append-only evidence hash chain.
- POST acceptance-witness: M2 session, valid origin, CSRF, bounded rate limit, exact workspace/intent IDs, **existing signed M4 reservation only**; rechecks official Testnet RPC, never submits/broadcasts, never accepts wallet keys or arbitrary transaction payloads.

M8's seven navigation sections remain unchanged (preserving accessibility and prior unit tests). The M9 acceptance panel appears in the authenticated Overview and requires owner/admin membership. It has truthful NO-GO/pending states and a confirmation before **read-only** official RPC lookup.

## M9.5 — Exact acceptance tests and inherited safety
- \`npm run test:m9\`: true native network, terms, verified/synthetic/mismatched receipts, independent Testnet-only RPC comparison, wallet isolation, evidence chain tamper detection, credential rejection and no new agent/transfer capabilities.
- \`npm run test:m9:security\`: static invariants covering M4 broadcast gates, M3/M7 approvals, M5 tool limitations, M6/M7 audit immutability, M9 read-only handler, and no literal committed provider secrets.
- \`npm run test:m9:db\`: full **disposable** PostgreSQL 16 flow (M2 test identities; SHA-256 invoice ingestion and manual supplier review; M5 read-only trace; M3 immutable intent/replay/maker approval; native Testnet BLS/VecPack signing fixtures; M4 one-attempt signed-packet reservation, timeout/uncertain recovery and synthetic finality; M6 invoice accounting; M7 risk/pause; M8-style organization scope; M9 API origin/CSRF/foreign-tenant/unknown-field rejection; explicit synthetic-only witness labeling).
- This CI flow **NEVER** invokes \`transaction.submit\` against live RPC and never represents disposable receipt fixtures as on-chain funds.
- Repeated \`npm run migrate:m9\` verifies idempotent schema bootstrap. \`npm run test:m9:restore\` validates a fresh pg_dump → pg_restore snapshot: exact native transfer/intent, invoice source hash, single reservation, M5 read audit, M6 invoice link, M7 pause/risk, M9 append-only event hash chain and no live witness evidence.
- The CI job generates a redacted JSON artifact explicitly labeled **NO_GO_FOR_LIVE_FUNDS_AND_MAINNET** and **synthetic_ci_only**.
- Existing M1–M8 unit, frontend build and all M3–M8 PostgreSQL suites remain mandatory in both exact-SHA push and PR workflows.
- Dependency audit reports critical/high/moderate severity counts without leaking credentials; any critical vulnerability or unavailable audit metadata makes the M9 CI security gate fail. High vulnerabilities still require independent security review.
- Clean dependency installation and production Vite build are tested, but the repository presently has no committed npm lockfile: **fully locked reproducibility remains an external release gap** until a pinned lockfile is committed and verified. Do not claim byte-identical builds.

## M9.6 — Still-open real-world acceptance blockers
1. Actual installed official Amadeus extension arbitrary-message BLS login capability and compatible sign-only Coin.transfer not witnessed.
2. Two distinct real funded native Testnet wallets, independently observed transaction hash and finality not witnessed.
3. Dedicated deployed private V3 PostgreSQL instance / full production backup-restoration not independently verified.
4. Independent third-party security review not submitted; no conclusion that there are no critical findings can be drawn from absence of a report.
5. Actual browser screenshots and redacted operator log evidence from a funded Testnet walkthrough are missing.
6. Locked, reproducible dependency install and any reported dependency advisories need review.
7. External supplier identity, KYC/KYB/AML and fiat bank/FX integrations are not present. They are NOT prerequisites for a native AMA-only proof but must not be claimed.

**M9 cannot grant GO for mainnet or a public-money launch. M10 is Testnet demo/grant/release documentation only once missing evidence and approvals are collected.** Existing M4 flags must remain disabled. All earlier PRs remain unmerged.
