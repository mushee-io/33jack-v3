# M9 incident, pending-transaction recovery and rollback rehearsal (Testnet only)

## Immediate containment
1. Owner/admin activates M7 emergency pause in the authenticated Amadeus Testnet Governance panel, using a bounded incident reason. This prevents new M3 proposals/approvals and M4 signing reservations, but cannot reverse a transaction already propagated.
2. Record the incident kind and affected Testnet transaction hash through M7, and preserve immutable M4/M6/M7/M9 records. Avoid copying wallet keys, seed phrases, auth cookies, raw signed packets or customer invoice documents into logs.
3. Never retry or rebroadcast a signed packet marked **reserved**, **uncertain**, **pending** or previously submitted. M4 stores exactly one broadcast reservation. If the RPC timed out after forwarding, the packet may already have reached the chain.
4. Read the original reserved M4 hash. Owner manually uses the existing M4 reconciliation route, which re-queries official Testnet transaction and rooted/finality state. If RPC is unavailable, remain pending/uncertain; **do not declare paid**.
5. If M4 indicates finalized successful Coin.transfer, validate exact payer, recipient, AMA amount, entry hash/height, and M6 invoice linkage. If disputed, expired, non-native, duplicate or changed, block any new authorization until investigation.
6. For policy or address compromise, use M7 risk holds and optional beneficiary block; cleared holds and emergency resume must not resurrect stale approval seals. Unpause requires two different owner/admin wallets within one hour.

## Code rollback and database recovery
- Do not merge the stacked milestone PRs during an incident. Revert the isolated preview/development deploy to the prior reviewed commit, keeping V3 and V2 history intact. Do not change main or any mainnet deployment.
- On the disposable CI database, verify migration idempotency and restore to a fresh separate PostgreSQL database with \`pg_dump --format=custom\` and \`pg_restore --exit-on-error\`. Confirm FK integrity, original source SHA-256, human invoice review, M4 one-attempt state, M7/M9 immutable audit history and no unauthorized chain finality.
- For any private deployed Testnet database, first secure the correct verified backup, use a separate restoration target, compare counts/hashes, reconcile migration changes, and require human approval before switching a connection. Never overwrite customer data by applying CI fixtures or automatically rolling back chain transactions.
- Mark independent external security review **NOT SUBMITTED** until a real third-party report is received and any critical findings are addressed.

## Rehearsal acceptance
- CI performs disposable schema migrations twice, a synthetic timeout/uncertain one-attempt execution, a separate backup/restore, immutable audit tampering denial and no autonomous chain submission.
- This is a **rehearsal, not proof of a funded live Amadeus transfer**. Collect real Testnet browser screenshots, redacted wallet and RPC evidence, verified official transaction hash and independent review before describing the system as live-ready.
