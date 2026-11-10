# 33JACK V3 — Amadeus Testnet AI Payment Agent

**33JACK V3** is the Amadeus-native evolution of the 33JACK invoice-to-payment agent. It is an independent copy of the former Celo implementation; the Celo V2 repository is untouched.

## Network boundary

- **ONLY** native **Amadeus Testnet**, with official RPC `https://testnet-rpc.ama.one/api`.
- Native AMA (8 decimals), Base58 addresses, **Coin.transfer**. Not Ethereum/EVM: there is no chain ID 42220, no MetaMask `eth_sendTransaction`, no ERC-20 contract and no EVM-compatible token transfer.
- Amadeus Wallet Extension does the signing via `window.amadeus.requestAccounts()` and `window.amadeus.signTransaction()`. Wallet seed/private keys are never sent to 33JACK.
- The official `@amadeus-protocol/sdk` submits **signed, packed** transactions to the testnet RPC only.
- Explorer: `https://testnet-ama.ddns.net`.

## Workflow

Invoice ingestion and AI risk screening → deterministic policy checks → payment intent locked to a payer, recipient, amount and token → owner/MFA approval → **Amadeus Wallet** signature → native AMA testnet submission → reconciliation.

The existing agent tools, MCP/A2A entry points, invoice processing, review flows and optional messaging channels are retained where independent of the original chain.

**Current testnet safety state:** signing/submission code is prepared, but the independent transaction decoding and exact receipt verification are still gated. A submitted tx hash is **not** a settled receipt. The reconciliation function fails closed until the on-chain signer, receiver, amount, contract and success can all be matched. No testnet payment or RPC success is claimed by this document. The fiat payout and bridging features are not live on AMA; Wise sandbox and non-chain invoice handling remain separate.

Old EVM-paid x402 settlement is disabled. The previous Solana/legacy settlement endpoint is retired. No user funds should be moved through simulated or unverified paths.

## Run

```sh
npm install
npm run dev
npm run test:ama
npm run test:vercel
npm run build
```

Set the environment variables in `.env.example`, especially a **new separate** `DATABASE_URL` for V3. Never point V3 at the V2 production payments database.

## Useful API routes

- `GET /api/v3/ama?operation=config` — native testnet network configuration
- `GET /api/v3/ama?operation=health` — testnet RPC check
- `GET /api/v3/ama?operation=balance&address=...` — native AMA account balance
- `GET /api/v3/agent?operation=tools` — payment-intent tools
- `POST /api/v3/operator?operation=propose` — owner-scoped proposal
- `POST /api/v3/operator?operation=approve` — exact-terms owner approval
- `POST /api/v3/operator?operation=confirm` — fail-closed on-chain verification
- `/app/ama` — native testnet wallet workspace

Never display any fabricated successful transaction. The previous EVM/mainnet endpoint `/api/v2/*` returns 410.

## Early Builders programme proposal

33JACK is an AI cross-border payment operator. It first demonstrates **native AMA testnet economic activity** with approval, attestable on-chain receipts and reconciliation. Off-ramp/fiat payout and cross-chain integration require separate providers; neither is represented as live until demonstrated.

1. **Weeks 1–2:** migrate all blockchain types, interfaces, frontend and tests to native Amadeus testnet; wallet signing and SDK smoke tests.
2. **Weeks 3–4:** working guarded agent invoice-to-AMA proposal and deterministic spending policy.
3. **Weeks 5–6:** successful end-to-end native AMA testnet transfer and independently verified exact receipt.
4. **Weeks 7–8:** independent testing, operational monitoring, demonstrable user experience and open-source documentation.

### References
- https://github.com/amadeusprotocol/amadeus-typescript-sdk
- https://docs.ama.one/wallet/creating-a-wallet/chrome-extension-wallet/10.-integration-guide
- https://amafoundation.net/grants

This repository is intentionally **testnet-only**. The Celo V2 history exists only in Git history, not as a supported payment rail.
