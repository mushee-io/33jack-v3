# 33JACK V3 — Amadeus Testnet

**Status: ten-milestone native Amadeus migration; M1 foundation is being implemented on an isolated branch.** This is a separate GitHub repository from 33JACK V2, which remains the historical Celo application.

33JACK V3 aims to deliver an AI-assisted cross-border finance operator with **Amadeus-native** transaction preparation, strict user approval, on-chain evidence and eventually agent-driven financial workflows. The current M1 deliverable is a safe Testnet-only repository baseline, **not** a live cross-border payout service.

## Current working entrypoints

- Amadeus wallet workspace: `/app/amadeus` (wallet and payment integration is still under testing)
- Native Testnet API: `/api/v3/ama`
- Testnet-only health: `/api/health`
- MIT license: [LICENSE](LICENSE)
- M1 definition and acceptance evidence: [docs/M1-FOUNDATION.md](docs/M1-FOUNDATION.md)
- All ten stacked milestones: [docs/ROADMAP-M1-M10.md](docs/ROADMAP-M1-M10.md)
- Native integration notes: [docs/AMADEUS-V3.md](docs/AMADEUS-V3.md)

## Safety contract

- Network is native Amadeus **Testnet**, not Celo/EVM, Solana, or Amadeus Mainnet.
- Old external-payment, payout, settlement, invoice, and webhook endpoints fail closed with `410 V3_LEGACY_ROUTE_DISABLED`.
- Legacy webhooks and scheduled V2 payment jobs are not active.
- API health does not announce verified settlements or fabricated activity.
- No bot, server or agent may sign/custody the customer's funds. The user must control wallet authorization.
- This repository is a migration workstream; do not merge to `main`, deploy to public production or announce readiness until milestone acceptance and security review.

## Development & verification

Use Node.js 22. With dependencies installed, run:

```bash
npm run test:amadeus
npm run test:isolation
npm run test:m1
npm run test:vercel
npm run build
```

Passing unit/CI checks does **not** demonstrate a funded, on-chain Testnet transaction. That is a separate acceptance deliverable in M4 and M9. Later milestones will replace imported frontend and backend references to legacy rails; their existence in old, unreachable modules does not mean they are available.

**Source repository:** `mushee-io/33jack-v3`. **Preserved original:** `mushee-io/33jack-v2`.


## M2 wallet identity (draft)

See [M2 engineering and security acceptance notes](docs/M2-WALLET-IDENTITY.md). Native Testnet wallet login uses a server-verified signature and PostgreSQL state. Extension off-chain signing compatibility and real two-wallet acceptance remain unverified; this is not a production login deployment.


## M3 — Native AMA Testnet payment intents (draft)
See [Detailed M3 engineering and acceptance notes](docs/M3-PAYMENT-INTENTS.md).

Native AMA payment intentions are authenticated, workspace-scoped, beneficiary-allowlisted,
idempotent, capped, time-bound and stored in PostgreSQL. A human review is bound to an
immutable terms fingerprint. M3 does not sign, broadcast or settle a payment.
The old unauthenticated planning and direct-sign/submit UI have been retired.

Validation: npm run test:m3 and, with a disposable PostgreSQL DB, npm run test:m3:db.


## M4 — Native Amadeus Testnet signing and chain verification (draft)
See [M4 implementation, safety gates and remaining live-wallet acceptance](docs/M4-EXECUTION-RECEIPTS.md).
The server cryptographically verifies native Testnet signed packets, reserves one
non-retryable broadcast attempt, and checks finality through the official Testnet SDK.
Broadcast is disabled by default pending real wallet compatibility and two-wallet witness.
Unit tests and mocked PostgreSQL CI do not establish a real on-chain transfer.


## M5 — Native Amadeus Testnet AI Financial Agent (draft)
[Detailed M5 architecture, read-only financial tools, MCP/A2A constraints and acceptance](docs/M5-AI-FINANCIAL-AGENT.md).

The organization-authenticated Amadeus agent offers read-only native balance,
allowlist, manual unverified invoice references, M3 intents, M4 execution status,
risk scoring and natural-language human-only payment proposals.
No agent tool may create, approve, sign or broadcast payments. Optional sanitized
Groq explanations are OFF by default; the MCP/A2A-shaped adapters are
authenticated local APIs, not claimed public interoperable networks.

Validation: npm run test:m5, and npm run test:m5:db with disposable PostgreSQL.


## M6 — Invoice intelligence and independent Testnet reconciliation (draft)

See [M6 comprehensive engineering, security and acceptance notes](docs/M6-INVOICE-RECONCILIATION.md). Native AMA-only human-authorized invoice review, SHA-256 document intake, duplicate control, organization-scoped PostgreSQL, read-only M4 finalized receipt accounting and formula-safe CSV are available as draft code. Image OCR and verified fiat FX/bank settlement are NOT claimed. M4 broadcast flags and M5 AI permissions are unchanged.


## M7 — Native AMA Testnet security and governance (draft)
[Full M7 financial controls, security audit, rollback and provider boundary specification](docs/M7-GOVERNANCE-SECURITY.md).

M7 adds versioned organization payment policies, per-payment and daily native AMA limits,
high-risk maker-checker separation, immutable M3 approval-policy seals, M4 execution gates,
owner/admin emergency pause, two-person resume, manual suspicious-invoice/recipient holds,
incident records and hash-linked append-only security events. Existing M5 read-only agent
permissions and M4 broadcast locks remain unchanged. KYC/KYB/AML integrations are NOT present.


## M8 — Native Amadeus Testnet user experience and receipt truth (draft)
[M8 detailed UX, authentication, native chain evidence, acceptance and no-go boundaries](docs/M8-TESTNET-EXPERIENCE.md).

The default V3 /app/amadeus route now renders a dedicated responsive Testnet-only workspace, with accessible navigation across identity, organization overview, payments, receipts, AI, invoices and governance. Receipt finality is shown only with previously persisted independently verified M4 evidence. Every prior M4 broadcast lock, M5 read-only agent constraint, M6 invoice-audit safeguard and M7 maker-checker/emergency control remains intact.

Validation: npm run test:m8, npm run test:m8:db, then npm run test:m8:restore in independent disposable PostgreSQL.


## M9 — End-to-end Amadeus Testnet acceptance and security readiness (draft)
[Detailed M9 acceptance, real-vs-synthetic evidence controls and NO-GO matrix](docs/M9-END-TO-END-ACCEPTANCE.md) · [Rollback, pending-transaction recovery and restore rehearsal](docs/M9-ROLLBACK-AND-INCIDENT-RUNBOOK.md).

M9 adds an owner/admin-only read-only witness of previously reserved native Testnet
Coin.transfer transactions against official Amadeus RPC, and an append-only,
hash-linked acceptance evidence ledger. Disposable CI performs integrated M2–M8
security/finance workflows with synthetic-only transfer evidence and an
independent PostgreSQL restore. Neither passing CI nor a fixture is a funded
two-wallet chain witness. Third-party security review remains NOT SUBMITTED;
mainnet and default M4 broadcast remain NO-GO.


## M10 — Final Amadeus Testnet demo and grant-readiness (stacked draft)
- [Native Testnet demo operator playbook](docs/M10-DEMO-OPERATOR-PLAYBOOK.md)
- [AMA Foundation Early Builders application draft](docs/M10-AMA-FOUNDATION-APPLICATION.md)
- [Protected Preview preparation, not a deployment](docs/M10-TESTNET-DEPLOYMENT-PREPARATION.md)
- [Security status and external release blockers](docs/M10-SECURITY-AND-RELEASE-GATES.md)
- [SHA-256 evidence export format](docs/M10-REDUCTED-EVIDENCE-FORMAT.md)

M10 adds an owner/admin-only read-only grant snapshot in Overview. The
manifest never includes raw wallet addresses, transaction hashes, invoices
or signing keys. CI repeats synthetic M9 acceptance and verifies an independent
PostgreSQL restore. Passing CI is NOT a funded Testnet transfer, external
security approval, Vercel protection witness, AMA grant award or mainnet GO.
All stacked PRs remain draft/unmerged; M4 broadcasting remains disabled by default.
