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
