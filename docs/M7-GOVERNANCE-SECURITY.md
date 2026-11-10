# 33JACK V3 — M7 Native Amadeus Testnet Governance and Security

## Verified stacked predecessor
- M6 draft PR #9: exact b9ead7d2463b217d76f1599440dd8bc593d16fb0.
- M6 push CI 42799556106 and PR CI 42799563584 completed with five green jobs each.
- M7 head branch feat/ama-v3-m7-compliance-governance targets the M6 branch, not main.
- All preceding PRs remain draft/unmerged. V2, mainnet and main remain unchanged.

## Agreed scope
The M7 roadmap concerns compliance, financial security, governance and incident controls on **native Amadeus Testnet**: organizational permissions; maker-checker approvals for high-risk proposals; native AMA transfer limits and allowed recipients; suspicious invoice/transaction flags; emergency pause; audited policy updates; append-only hash-linked events; recovery of ambiguous transactions; and future KYC/KYB/AML boundaries.

No regulated compliance-provider service is integrated. Human risk flags are not proven sanctions matches, verified identity checks, independent bank settlements, or legal compliance determinations.

## M7.1 — Financial policy and deterministic authorization
- Durable PostgreSQL policy per authenticated M2 workspace with monotonic version and row-level transaction locking.
- Default native AMA limit: 100 AMA per proposal, 500 AMA aggregate active intents in a rolling 24-hour window, and maker-checker for proposals strictly above 1 AMA or with high-risk conditions. These policy limits are expressed in exact 9-decimal atomic AMA units via BigInt, never floats.
- Changes are allowed only to owner/admin through same-origin, M2 session and CSRF checks, with exact expected prior version. Two-person high-risk enforcement cannot be disabled, nor can the code-level native per-payment limit be raised.
- A policy change advances the policy version and invalidates all prior M3 approval seals for execution.

## M7.2 — Bind M3 and M4, not just new interfaces
- Existing M3 intent creation checks current organization policy, aggregate active-intent budget, emergency pause, and scoped invoice/recipient risk flags before new insertion. M3 idempotency stays immutable; neither the agent nor a replay can create a new payment outside authorization.
- M3 review and approval recheck policy while holding the actual intent row lock. For high-risk intents, the authorized checker must be distinct from the maker. The M2 role permission matrix remains required.
- When M3 review reaches awaiting-wallet-signature, the transaction atomically stores an M7 seal containing exact M3 terms hash, policy version, native payer, maker, checker and risk classification.
- Existing M4 preflight and one-attempt signature reservation verify that seal against current M7 policy, current risk flags and current immutable M3 terms. Stale, tampered, paused or blocked proposals fail closed before any M4 broadcast call.
- M3 cancellation remains allowed during pause. Existing uncertain/on-chain M4 transfers remain visible and independently reconcilable; emergency pause does not purport to reverse a transaction already sent to the network.

## M7.3 — Emergency pause and two-person recovery
- Owner/admin can immediately freeze new M3 creation/review/approvals and M4 preflight/reservation, requiring a bounded incident reason stored as a SHA-256 hash.
- Unpausing requires a request from one owner/admin and an approval by a different owner/admin within one hour, on the same policy version. Reused, expired, self-confirmed or stale requests fail closed.
- Pause and resume advance policy version; old M3 approval seals remain invalid. No agent, cron, public API or simulated audit can enable M4 broadcast.
- Dedicated read-only recovery view lists reserved/uncertain/pending/confirmed/disputed/failed M4 transfers with their original transaction hashes and explicit no-rebroadcast instructions.

## M7.4 — Risk reports and incident records
- Organization operators may report evidence-based, bounded manual risk flags targeting a specific invoice reference or native payout recipient.
- Categories include potential invoice duplication, content mismatch, recipient change, unusual payment, suspicious transaction, unverified possible sanctions match, and manual hold. They are **unverified human reports**, not external screening.
- Active flags block matching M3 review/approval and M4 execution. Owner/admin resolution records a hashed reason and advances policy version to prevent previously approved terms from silently becoming executable again.
- Members can record severity-labelled incidents with optional native Testnet hashes. Critical reports do not automatically confer emergency-pause privileges on viewers/operators. Independent incident investigation remains required.

## M7.5 — Security ledger and operator UI
- Organization-scoped M7 events capture actor, state transition, entity, hash of sensitive incident reason, exact predecessor hash, event hash and timestamp.
- PostgreSQL trigger rejects UPDATE/DELETE of M7 event rows; audit verification rehashes the full returned chain and detects missing/reordered/edited entries. This is application/database tamper evidence, not a blockchain-notarized compliance certificate.
- The native Amadeus governance panel supports policy versions, high-risk threshold controls, emergency pause, two-person resume, human risk hold/clearance, incidents, unsettled transaction recovery, and append-only audit integrity review.
- Existing M5 agent MCP/A2A tools remain read-only. No new LLM/agent action can approve, sign, broadcast, change roles, modify policies or mark transactions paid. Existing M4 release flags are unchanged and disabled by default.

## M7.6 — Tests, migration and backups
- M7 schema is forward-only and idempotent on dedicated non-production V3 PostgreSQL; bootstrap script refuses enabled M4 signing/broadcast flags.
- Unit tests check exact native atomic limits, forbidden policy weakening, maker-checker logic, forged/stale approval seals, pause/flag denial, append-only hash tampering, non-integrated compliance-provider truth and M4 broadcast guard continuity.
- Disposable PostgreSQL security tests exercise real M3 creation, review, maker-checker, M4 preflight; active recipient/invoice flags; stale approval after risk clearance; independent two-person unpause; cross-workspace/role denial; API CSRF and same-origin; policy cap; and immutable event triggers.
- CI provisions PostgreSQL 16, repeats the migration, runs M7 acceptance, backs up all tables with pg_dump, restores into an independent disposable m7restore database, then verifies exact policy version, maker-checker seals, incident/risk history, hash-chain continuity, M3 payments, M6 tables, and no M4 broadcast.
- The M1–M6 tests, frontend build and distinct M3/M4/M5/M6 PostgreSQL CI jobs remain present. Both push and pull-request GitHub workflows must be green for the exact final M7 SHA.

## Explicit no-go and limitations
No real wallet-extension off-chain signing or sign-only Amadeus transaction has been independently witnessed, and no funded two-wallet Testnet transfer is claimed. No dedicated deployed V3 database, third-party KYC/KYB/AML provider evidence, audited regulatory clearance, external notarization or mainnet deployment has been verified. Synthetic CI records must never be presented as live on-chain settlement. All PRs remain draft and unmerged until external acceptance.
