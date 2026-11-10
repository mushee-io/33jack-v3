# 33JACK V3 — Ten stacked milestones (Amadeus Testnet)

**Execution order:** M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10. Build one milestone, record a passing CI run and acceptance evidence, then authorise the next. No automatic merging or financial execution. Every planned chain integration uses native **Amadeus Layer-1 Testnet**, never EVM/Celo or Solana. No feature may be advertised as live before transaction evidence exists.

## M1 — Foundation, isolation and security baseline
**Objective:** Create a safe, independently reviewable V3 foundation; preserve the V2 repo and rollback path.
- Verify `33jack-v3` repository and base SHA against `33jack-v2` without editing V2.
- Keep imported migration PR #1 unmerged, and stage this milestone in its own draft PR.
- Retain MIT LICENSE and official Amadeus SDK. Pin M1 network to official Testnet RPC; reject Mainnet and any unapproved alternate RPC.
- Disable imported Celo, Solana, EVM/x402, settlement, fiat payout, webhook, scheduler and background-send endpoints, including when old environment toggles are set.
- Retire V2 cron and route aliases. Remove direct Solana runtime dependencies; isolate example environment variables.
- Establish `/api/v3/ama`, read-only `/api/health`, safe error codes and network identity.
- Add CI checks for handler isolation, network guardrails, no simulated settlement claims, build, syntax and Vercel function budget.
**Acceptance:** M1 draft PR passes GitHub CI; main and V2 unchanged; no legacy route can execute; detailed risk register and rollback documented.
**State:** In progress on M1 branch.

## M2 — Amadeus-native wallet, identity and authentication
- Replace EVM/MetaMask, Celo account, and obsolete Solana wallet flows with Amadeus wallet-extension account discovery and testnet identity.
- Verify Base58/BLS public-key encoding and wallet network binding; reject wrong networks before any user action.
- Implement wallet ownership proof using supported native signing and replay-safe server challenge (confirm signature APIs against SDK).
- Introduce scoped operator/admin/member sessions with explicit origin, nonce, expiry, device/session revocation.
- Keep channel/agent credentials separate from wallet private keys; no custodied seed phrase.
- Add connect/disconnect/account-change/error UX, rate limiting and negative-path tests.
**Acceptance:** Two independent Testnet wallets can sign in, switch, disconnect, and safely reject mismatched networks.
**State:** Planned.

## M3 — AMA transaction intents, quotes and approved payment preparation
- Introduce durable, isolated V3 Testnet DB schema for intents, idempotency keys, payer, recipient, atomic units, TTL and immutable approval fingerprint.
- Validate exact AMA denominations, public keys, self-transfer flags, per-payment limits, and balance affordability.
- Build wallet-call preparation using the official SDK's `Coin.transfer` API only after verifying current call format.
- Separate agent suggestion, authenticated human approval, and external wallet signing; no auto-transfer path.
- Quote testnet execution fees using live supported RPC data (mark unavailable metrics rather than invent values).
- Guard against duplicate intents, altered beneficiaries, stale approvals and replayed requests.
**Acceptance:** Deterministic intent API tests pass and a user can review an unsigned, exact Testnet transfer without broadcasting.
**State:** Planned.

## M4 — Native testnet signing, submission and reconciliation
- Add SDK-compatible extension signing and native transaction submission with explicit wallet consent.
- Verify signer, native contract/method, destination, atomic amount, transaction hash, receipt outcome and observed height/finality.
- Protect against retry duplicates and wrongly attributing unrelated hashes.
- Display confirmation pending/rejected/verified states; never infer settlement from broadcast alone.
- Prove two-wallet Testnet transfer with reproducible hashes and redacted evidence.
**Acceptance:** A funded Testnet payment confirms and independently matches preapproved intent with no custodied key.
**State:** Planned.

## M5 — AI payment agent, MCP/A2A capability and human-in-control operation
- Rebuild AI instruction parsing, supported tools, payee validation, policy evaluation and deterministic proposal generation.
- Upgrade MCP/A2A tool descriptors to Amadeus-only actions and least-privilege agent credentials.
- Require a human to approve the exact payer, recipient, amount, fee and network before wallet signature.
- Add tool-use safety against prompt injection, agent impersonation, tool replay and policy bypass.
- Build a demonstrable agent-to-wallet proposal workflow with auditable action logs.
**Acceptance:** Agent can plan and explain; it cannot broadcast without explicit approval and external signature.
**State:** Planned.

## M6 — Invoices, beneficiaries, receipts and bookkeeping
- Port invoice import, PDF extraction, beneficiary management and duplicate/risk review to AMA Testnet-backed payment intents.
- Store exact evidence mapping of invoice → consent → Testnet transaction → verifiable native receipt.
- Preserve multi-currency invoice descriptions without implying on-chain FX conversion or guaranteed fiat payout.
- Rebuild exportable receipts and transaction audit API with chain-native identifiers, not EVM/Solana hashes.
- Add reconciliation idempotency, failed/partial recovery and no-fabrication reporting.
**Acceptance:** One invoice is traceable end-to-end to a verified AMA Testnet transfer and honest export.
**State:** Planned.

## M7 — Security, policy, compliance controls and telemetry
- Introduce scoped role-based access, spend caps, whitelisted destinations, transaction TTL, rate limits and emergency pause.
- Separate real screening-provider integrations from deterministic rule flags; never claim completed KYC/KYB/AML without evidence.
- Record tamper-evident audit events for approvals, policy changes, wallet transitions and transaction verification.
- Add uptime/error dashboards, masked observability and incident response procedures without exposing keys or personal financial data.
- Threat-model bridge, fiat-offramp and regulated corridors as future dependencies, not live capabilities.
**Acceptance:** Security negative-path suite and documented incident/rollback exercise pass.
**State:** Planned.

## M8 — Complete Amadeus-first UI and documentation migration
- Replace remaining visible Celo/Solana words, wallet icons, mainnet links, explorer references and stale sample activity.
- Rebuild home, agent, invoices, payments, beneficiaries, activity, receipt, mobile and settings screens around AMA Testnet status.
- Remove unused legacy modules, configs, scripts, env names, code paths and demo-only payment backends.
- Verify keyboard navigation, error messages, responsive design and no false live-state claims.
- Update all public docs, app descriptions, metadata, screenshots and SDK examples to Amadeus-only.
**Acceptance:** Static and rendered audits find no active legacy chain paths or fabricated balances/transactions.
**State:** Planned.

## M9 — Testnet end-to-end acceptance and independent verification
- Run CI unit, integration, wallet and browser tests for the payment lifecycle.
- Demonstrate two distinct Amadeus test wallets, an agent proposal, approval, signer consent, on-chain receipt and duplicate prevention.
- Inspect wallet/testnet RPC failures, balance constraints, confirmation variability, and invalid actor/beneficiary paths.
- Verify database isolation, secrets hygiene, deterministic deployments and incident rollback.
- Save reproducible evidence hashes, CI links, known gaps and third-party security-review notes.
**Acceptance:** End-to-end Testnet witness recorded; all release gates pass; unverified claims excluded.
**State:** Planned.

## M10 — Testnet-only release, grant demo and handover
- Publish a clearly labelled **Testnet demonstration** only after M9 acceptance; no mainnet/production financial claims.
- Provide official wallet setup guide, faucet/test-fund caveats, supported feature checklist and end-to-end video/script.
- Package open-source docs, architecture, API references, source and explorer proofs for the AMA Early Builders application.
- Publish public security limitations, permission model, rollback process, maintainer checklist and support channels.
- Archive release evidence and seek explicit human approval before any merge/deploy/public announcement.
**Acceptance:** Reviewer can reproduce a compliant Testnet payment from the README with independent proof.
**State:** Planned.

### Cross-cutting safeguards
1. M1–M10 run against testnet only. No real-money transfers or withdrawal keys.
2. V2 stays unchanged; no direct commits to V3 main from milestone branches.
3. Each milestone gets its own scoped branch, draft PR, success criteria and CI evidence.
4. Any cross-chain bridge, native stablecoin, FX rate or fiat payout capability must be separately evidenced, never assumed.
5. The 8-week AMA accelerator rewards pool is not a guaranteed payment; milestone evidence must be truthful.
