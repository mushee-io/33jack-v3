# 33JACK V3 — Amadeus Testnet migration

This branch begins the complete Celo-to-Amadeus migration. V2 is unchanged. V3 targets the **independent Amadeus Layer-1 Testnet**, not an EVM chain. Network RPC: `https://testnet-rpc.ama.one/api`. Native asset: AMA, 9 decimals. Native accounts are 48-byte BLS12-381 public keys represented in Base58; do not use MetaMask or Ethereum's `eth_sendTransaction`.

## Implemented on the V3 migration branch
- MIT LICENSE and official `@amadeus-protocol/sdk` dependency.
- Native testnet adapter for network health, Base58 account validation, precise AMA atomic-unit conversion, balance lookup, unsigned Coin.transfer plan and transaction lookup.
- New wallet-connected Amadeus workspace: testnet confirmation, independent exact review, extension signing, testnet submission and manual receipt inspection.
- Legacy payment routes, Solana settlement/payout HTTP endpoints, and old webhook handlers are hard-disabled in non-test V3 deployments; V3 routes are testnet-only.
- Consolidated `/api/v3/ama` handler routed to the existing Vercel serverless entrypoint. The obsolete Celo config endpoint is removed from the consolidated router.

## Configuration
```env
AMA_TESTNET_RPC_URL=https://testnet-rpc.ama.one/api
AMA_TESTNET_MAX_TRANSFER=100
```

## Security and delivery limitations
- No private keys or seed phrases are stored by 33JACK. The extension performs the signature. Wallet users must manually select Testnet. Signing alone does not mean a transaction settled.
- **This is migration groundwork, not a completed multi-rail cross-border system.** The imported app still contains legacy Solana/Celo implementation files and demo workflows. They require removal or native rewiring and must not be represented as live AMA functionality.
- Automated AML/KYC, conversion to fiat, local bank payouts, native stablecoins, cross-chain bridges and full server-side reconciled agent-payment approval are *not yet provided* by this stage.
- Never use mainnet keys or run the test suite against mainnet. Do not enable formerly mainnet financial routes while migration is incomplete.

References: [Amadeus node network endpoints](https://github.com/amadeusprotocol/node/blob/main/DOCS.md), [official wallet integration](https://docs.ama.one/wallet/creating-a-wallet/chrome-extension-wallet/10.-integration-guide), [SDK](https://github.com/amadeusprotocol/amadeus-typescript-sdk).
