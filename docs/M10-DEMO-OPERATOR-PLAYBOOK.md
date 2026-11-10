# 33JACK V3 M10 — Amadeus Testnet operator demo playbook

**Stage:** final M10 stacked draft PR. **Live financial release:** NO-GO. **Network:** native Amadeus L1 Testnet, AMA (9 decimals), official \`https://testnet-rpc.ama.one/api\`. **Custody:** browser wallet owner, not the AI agent or the server.

This playbook prepares a truthful product demonstration; it is NOT evidence that a real funded Testnet transaction, an approved security audit, or a deployed protected Preview exists. Never present screenshots of simulated CI records as genuine blockchain settlement.

## Before a demo: 0.1 security and operator checklist
- Confirm latest commit, GitHub push + draft-PR workflows and all 9 jobs each. Show exact commit SHA, workflow URLs, and whether any tests were skipped.
- Keep all M1–M10 PRs draft/unmerged. Do not alter the original V2 repository or deploy mainnet.
- Use separate non-production V3 PostgreSQL, with a verified backup and no V2/production credentials. No credential is pasted into screenshots, chat, submitted grant material or exported JSON.
- Protect the Vercel Testnet Preview with SSO/access control; independently test an unauthenticated/incognito denial. M10 code does **not** configure or prove access protection.
- Verify official Testnet browser wallet extension capabilities in a real browser. Connection alone is NOT signed authentication; message signing must match the server's M2 BLS login domain.
- Leave \`AMA_M4_ENABLE_BROADCAST=false\`, \`AMA_M4_WALLET_EXTENSION_VERIFIED=false\`, and \`AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED=false\` in every unverified environment. No operator or model may simply set them true to pass a demo.
- Do not share private keys, seed phrases, signed transaction payloads, internal auth session cookies, customer invoice files or raw PostgreSQL backups.

## Demo A: safe read-only financial operations (available without funded transfer)
1. Open the protected Preview **after** it is independently deployed and verified. Show it is labeled **Amadeus L1 Testnet / AMA**, not any other network. Capture the checked commit/deployment URL and screenshot with sensitive data concealed.
2. In Wallet & identity, inspect official extension network and complete M2 off-chain signed login, if compatible. Record the wallet address **only in the operator's private witness log**; redact public proof with a SHA-256 commitment. If unsupported, mark BLOCKED and demonstrate the signed-login boundary.
3. Create a dedicated organization and verify role boundaries. Attempt read access from an uninvited second wallet: expect denied; do not claim this is a production penetration test.
4. In Invoices, upload a permitted text/PDF invoice (<=2 MiB; PDFs <=8 pages), record its SHA-256 source hash, human-verify supplier and invoice. Do not use personal/customer invoices in demo without authorization.
5. In Financial agent, ask for risk context and a native AMA payment proposal. Show it is advisory-only; it neither approves nor signs nor submits.
6. Allowlist a Testnet recipient through owner/admin. Create an exact AMA payment intent (9-decimal atomic amount); show expiry, request idempotency, immutable terms hash, human review/approval and maker–checker controls.
7. In Governance, show manual risk flags, policy version, emergency pause and immutable audit. A genuine emergency pause must prevent signing/broadcast, and a different authorized reviewer is required where policy demands.
8. In Chain evidence, show truthful pending/not-submitted records without invented hashes or labels. If the M4 packet gate is disabled, STOP here and mark the live-transfer demo BLOCKED.
9. Open M9 Acceptance and M10 Demo/Grant. Generate a source-backed readiness result and redacted SHA-256 JSON. Demonstrate that missing source evidence, signed second wallet, external security review and live transfer remain NO-GO.

## Demo B: funded two-wallet native Testnet acceptance (independent operator witness required)
**Do not claim it occurred unless you personally have separate real funded Testnet wallets, valid extension compatibility, explicit authorization and independent chain evidence.** Never bypass M4 broadcast locks based on CI.

1. Obtain two distinct independent native 48-byte public-key Base58 Testnet wallets from the official wallet. Owner controls A; beneficiary controls B. Obtain faucet/Testnet AMA only through official supported channels; do not use real funds.
2. Verify **both** M2 challenge-signatures on the expected same-origin protected site. Check BLS signature domain and Testnet identity explicitly. Store redacted verification timestamps, not signatures/secrets.
3. Create a tiny, human-approved **AMA only** intent A→B with exact atomic amount. Record UUID and terms SHA privately. Verify allowlist, expiry, distinct maker/checker where applicable, M7 policy version/seal and no active risk hold.
4. Confirm the official extension actually supports *sign-only* native Coin.transfer and it returns canonical VecPack without submitting autonomously. A provider that auto-submits during sign-only verification is NOT acceptable.
5. Require separate independently documented operator release approval before any M4 broadcast flags are changed. This M10 milestone does not change them and does not enable public/mainnet operations.
6. After explicit wallet-owner signature, M4 must reserve **one** packet digest and broadcast at most once; a timeout is UNCERTAIN, never permission to send again. A transaction hash is an observation, not settlement.
7. Query \`transaction.get(txHash)\` and \`chain.getStats()\` via the official Amadeus Testnet RPC from a separate read-only verification step. Verify exact hash, signer A, receiver B, native Coin.transfer, asset AMA, exact atomic amount, successful receipt, entry hash/height and explicit or rooted finality.
8. Confirm the M6 human-verified invoice is linked to the original M3 intent and exact M4 verified receipt. No fiat conversion or bank payout is inferred.
9. In M9 acceptance, request owner-only **read-only** witness recheck; capture report SHA and actual chain evidence with independently verifiable timestamps. In M10 JSON, a stored RPC comparison remains a candidate until actual two-wallet ownership, correct extension, deployed DB restore and external security audit are independently documented.
10. If any stage fails, leave NO-GO; activate M7 pause for a financial-control incident and follow \`docs/M9-ROLLBACK-AND-INCIDENT-RUNBOOK.md\`. Do not recycle a reserved transaction.

## Evidence to retain separately (restricted internal operator folder)
- Exact Git commit SHA, push+PR workflow URLs and job results; Vercel deployment ID/protection witness **if actually deployed**.
- Independent screenshots (redacted), BLS compatibility test, source-hashed invoice and exact immutable approval digest.
- Two independent wallet ownership witnesses, original Testnet tx hash, status and chain inclusion/finality proof from official RPC, M4 verified receipt, finality timestamp, M6 reconcile link.
- External security audit reviewer name, dated report, remediation proof, scope, retest and approval; **not submitted as of M10**.
- PostgreSQL backup integrity and separate restore verification in the actual deployed Testnet environment, rather than only CI.

## Stop conditions
Wrong network/RPC; untrusted or ambiguous wallet signature; no second funded wallet; expired/changed recipient/terms; M7 pause/risk; missing M4 original hash; pending/uncertain/disputed execution; inconsistent block metadata; missing external audit; preview not protected. Stop, label the specific gate BLOCKED, and document precisely what proof remains missing.
