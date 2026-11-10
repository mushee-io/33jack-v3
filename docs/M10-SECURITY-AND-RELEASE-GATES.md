# M10 — independent security and release gate register

**Current release status: NO-GO for public funds/mainnet.** This register does not claim any real security auditor was engaged.

## Gate matrix
| Gate | Internal CI evidence | External status | Release condition |
| --- | --- | --- | --- |
| M1 official native Testnet RPC only | Exact config and network isolation tests | Confirm operator-hosted RPC/proxy | Reject custom, production and mainnet |
| M2 signed Testnet login | BLS challenge/signature negative-path fixtures | Real official extension capability **NOT WITNESSED** | Browser signMessage and revoke/replay checks |
| M3 AMA atomic amount/terms | 9-decimal, exact approval and replay tests | Operator Testnet acceptance needed | Human review and immutable terms |
| M4 signed transaction + one attempt | Canonical packet BLS/VecPack tests and PostgreSQL one-attempt lock | Real two-wallet funded on-chain receipt **NOT WITNESSED** | Independent transaction, finality and matching source |
| M5 autonomous-agent permissions | Read-only MCP/A2A and prompt-injection tests | Model provider/security review pending | No AI signing, approval, arbitrary broadcast |
| M6 provenance and accounting | PDF/text source limits, immutable provenance, synthetic native receipt matching | Real supplier/payment witness not provided | No fake FX, bank payouts or settlement |
| M7 governance | Maker-checker, policy pause and hash-linked audit tests | External review pending | Fails closed when flagged, paused, expired |
| M8 UX and accessibility | Semantic controls, responsive and reduced-motion tests | Human browser audit not supplied | No fake balances, no unverified finalized |
| M9 independent verification | M9 read-only official RPC logic, synthetic-only CI, SHA provenance, separate DB restore | Independent reviewer **NOT SUBMITTED** | Real official RPC, operator ownership and audit |
| M10 grant packet | SHA-256 verifiable redacted source-backed snapshot | Foundation application **NOT SUBMITTED** | Honest disclosed scope, accurate dates and evidence |

## Vulnerabilities and third-party review
- Earlier M9 CI discovered **one critical, three high and one moderate** npm dependency advisories through outdated PDF.js and transitive \`tar\`/\`canvas\` dependencies.
- M9 upgraded \`pdfjs-dist\` to 6.5.x and repaired safe Node PDF extraction/cleanup. The passing M9 audit then reported **zero critical, zero high and one moderate**; M10 reruns the same fail-closed audit. The moderate advisory still requires review.
- A dependency audit does not establish independent code, contract, privacy or financial security audit. No external auditor, report, sign-off, production penetration test or real wallets have been supplied.
- M10 does not automatically enable broadcasting based on passing CI; M4 lock flags continue false by default.

## Security acceptance evidence
- M2 identity: origin-bound BLS challenge, unique nonce, expiry, CSRF cookie and multi-tenant roles.
- M3 human intent: exact native AMA decimal amount, recipient allowlist, expiry, immutable approval terms and idempotency hash.
- M4 transaction: canonical native signed packet, BLS domain, exact native Coin.transfer, reserved digest, at-most-once submit and independent finality; ambiguous submit outcome remains uncertain without automatic retry.
- M5 read-only finance AI, bounded inputs, scoped permissions, prompt-injection and remote AI opt-in off.
- M6 document content types/byte caps, source SHA-256, explicit human review, append-only accounting reconciliation.
- M7 policy version, risk holds, emergency pause, distinct high-risk maker/checker, tamper-evident audit chain.
- M9 acceptance: live RPC is separate from synthetic fixtures; insert-only hashed report chain.
- M10: source-backed redacted evidence export; no raw wallet addresses, transaction hashes, invoice content or private credentials; restored disposable DB matches manifest digest.

## Open external evidence (do not mark automatically complete)
1. Operator-signed real official extension BLS signMessage and sign-only Coin.transfer compatibility report.
2. Independent two-wallet funded native Testnet transaction and exact rooted/finalized chain proof.
3. Protected Testnet-only Preview with confirmed unauthorized access denial and committed deployed code SHA.
4. Isolated deployed V3 PostgreSQL backup/restore drill with independent witness.
5. Third-party security audit and remediation/retest; budget and provider to be determined.
6. Document any remaining dependency moderate advisory and reproduce dependency tree with committed lockfile.
7. Applicable organizational/compliance provider checks if expanding beyond native Testnet proof; KYC/KYB/AML and fiat payouts are not implemented.

**No real mainnet, cash, fiat payout, verified user traction, official grant acceptance or independent security signoff may be inferred from M1–M10 code CI.**
