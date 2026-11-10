# M3 — Native Amadeus Testnet AMA Payment Intents

## Stacked prerequisite and scope
M2 draft PR #4 head f26966e0d2390165010fed05c6f4462da025d24c is the exact green base for the M3 branch feat/ama-v3-m3-payment-intents. The M3 PR targets M2, not main. Prior PRs remain draft/unmerged.

Only Amadeus native Layer-1 Testnet and native 9-decimal AMA are supported. This milestone NEVER signs, broadcasts, executes, or reconciles an on-chain transaction. No wallet private keys, mainnet RPC, Celo, Solana, fiat off-ramp, stablecoin swaps or imaginary FX quote.

## M3 implementation
1. Official native Amadeus SDK call planning: Coin.transfer(recipient, atomicUnits, AMA), unsigned descriptive call parameters only, not serialized signed bytes.
2. Precise BigInt parsing of AMA to 9 decimals. Strict positive-only, non-exponential input, self-transfer acknowledgement and configurable 100 AMA default Testnet cap.
3. Native Base58/48-byte address validation. Payer must equal the currently authenticated Amadeus wallet account; a user-selected unverified wallet address is not sufficient.
4. M2 signed login session with current nonrevoked database cookie, same-origin enforcement, CSRF and scoped organization permissions.
5. Owner/admin allowlist and blocklist of native beneficiary addresses. Updates increment beneficiary version and invalidate previous intent reviews.
6. Versioned PostgreSQL intent schema with workspace, payer, recipient, atomic amount, invoice reference, memo, beneficiary version, nonce, expiry, terms hash, idempotency hash, actor and audit events.
7. Atomic idempotent create. Unique hashed X-Idempotency-Key per workspace+actor; exact retries return existing intent, changed payload under same key returns HTTP 409. Active intent cap of 20 per owner/workspace.
8. Canonical immutable terms hash includes network, payer, recipient, amount units, beneficiary version, nonce and expiry.
9. Valid state sequence: draft → reviewed → awaiting_wallet_signature, with pre-signature cancellation and effective expiry. Direct execution statuses are unsupported in M3. Approvals acknowledge human review only, not wallet signing.
10. UI in AmadeusPaymentPanel integrates native allowlist management, durable intent creation, exact review, staged approval, cancellation, history, and unambiguous unsigned-only labels.
11. Old unauthenticated planning and direct frontend signTransaction/submitAndWait operations retired. GET transaction lookup remains independently labelled unverified.
12. CI unit tests and disposable PostgreSQL 16 integration tests for real transactions, idempotency collisions, stale hashes, allowlist mutations, workspace permissions, expired approvals, CSRF and origin checking.

## API reference
Root: /api/v3/ama?operation=
- POST beneficiary-set; GET beneficiary-list
- POST intent-create with X-Idempotency-Key and M2 session/CSRF
- GET intent-list and intent-get, scoped to workspaceId
- POST intent-review, intent-approve and intent-cancel with exact termsHash and ackExactTerms=true
- HTTP 410 for legacy plan, submit and broadcast operations

## CI and evidence requirements
Run npm run test:amadeus, npm run test:isolation, npm run test:m1, npm run test:m2, npm run test:m3, npm run test:vercel, npm run build; CI also runs npm run test:m3:db against disposable PostgreSQL.

M2's off-chain extension signMessage compatibility has not been witnessed with a real installed wallet. A dedicated V3 database is not deployed, so the deployed authenticated application and two-wallet witness remain NOT VERIFIED. No on-chain transfer hash exists in M3.

Complete the code acceptance only with BOTH GitHub workflows passing at the exact final head commit. Do not merge or deploy mainnet. M4 must revalidate payer, current policy/beneficiary snapshot, exact approval fingerprint and expiry immediately before genuine wallet-owner signature and Testnet broadcast.
