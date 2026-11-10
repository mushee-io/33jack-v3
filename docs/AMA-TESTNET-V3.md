# 33JACK V3: Amadeus Testnet Integration

## Canonical network
- Native Amadeus Testnet, NOT an EVM chain.
- RPC: https://testnet-rpc.ama.one/api
- Explorer: https://testnet-ama.ddns.net
- Native token: AMA; 8 decimal places; Base58 account addresses.

## Wallet signature
1. `window.amadeus.requestAccounts()` grants public-address access.
2. Server creates intent with exact **native AMA** amount in atomic units, payer, recipient, token and expiry.
3. MFA-authorized human approves exactly those values.
4. Amadeus Wallet signs `{contract:"Coin", method:"transfer", args:[recipient,amountUnits,"AMA"]}`.
5. Official Amadeus SDK submits the signed, packed transaction to **testnet** only.
6. Reconciliation must compare on-chain signer, contract, recipient, amount, approval time, success and finality. Hash alone is insufficient.

## Safeguards
- No private keys/seed phrases in frontend, API, source or logs.
- Native address case is significant.
- No EVM chain IDs, ERC-20 methods, MetaMask provider, Celo USD stablecoins, or Solana Devnet transfers in active V3.
- The existing database schema stores `chain_id=0` as an internal legacy compatibility sentinel, **not** as an Amadeus chain ID.
- Until the on-chain decoder is independently tested, confirmation returns pending rather than issuing false receipts.
- No live fiat off-ramp, FX, bridge, or x402 facilitator is advertised. x402 paid settlement returns HTTP 501.

## Acceptance requirements
- npm build and tests pass.
- Health uses native testnet only.
- Exact-payment reject tests: invalid Base58, token other than AMA, over-precision, amount ceiling, mismatching payer, expired or changed proposal.
- Wallet signatures and testnet network must be reviewed before real testnet submissions.
- At least one on-chain testnet transfer with independently matched proof is required for 'end-to-end live' status.

Official docs:
https://docs.ama.one/wallet/creating-a-wallet/chrome-extension-wallet/10.-integration-guide
https://github.com/amadeusprotocol/amadeus-typescript-sdk
