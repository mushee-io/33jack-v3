# 33JACK V3 — Native Amadeus Testnet architecture

33JACK V3 is a **wallet-owned financial agent built for native Amadeus Layer-1 Testnet**. The native asset is AMA (9 decimal places). The read-only Testnet RPC target is `https://testnet-rpc.ama.one/api`, configured through `AMA_TESTNET_RPC_URL`. Native account keys use the official Amadeus protocol account format, not Ethereum wallet APIs.

## Active product and backend

- `/` describes the Amadeus financial agent and current Testnet limitations.
- `/app/amadeus` is the native 33JACK V3 workspace, with identity, overview, payment intent review, receipts, AI financial analysis, invoices and governance.
- `/api/v3/ama` is the only enabled native financial API; `/api/health` is restricted to Testnet health reporting.
- Legacy V2 financial endpoints respond with HTTP 410; historic code cannot execute settlement through these routes.
- The SDK dependency is `@amadeus-protocol/sdk`. No server or AI agent is permitted to hold private keys, approve a payment or sign native transfer packets.

## Acceptance boundary

M1–M10 implementation and synthetic CI evidence are present in stacked draft PRs. Internal tests **do not** replace the external witness for extension sign-only compatibility, two funded native wallets, a real finalized Testnet transfer, protected Preview and isolated PostgreSQL restore, or an independent security audit. Broadcasting and any mainnet release remain restricted.

## Development

Use Node.js 22. `npm install --ignore-scripts`, `npm run test:amadeus`, `npm run test:branding`, and `npm run build`. See [operator playbook](M10-DEMO-OPERATOR-PLAYBOOK.md), [network safety controls](M10-SECURITY-AND-RELEASE-GATES.md) and [project roadmap](ROADMAP-M1-M10.md). The source is [MIT licensed](../LICENSE).

Official protocol references: [Amadeus node documentation](https://github.com/amadeusprotocol/node/blob/main/DOCS.md), [wallet extension integration](https://docs.ama.one/wallet/creating-a-wallet/chrome-extension-wallet/10.-integration-guide), and [AMA Foundation program](https://amafoundation.net/grants).
