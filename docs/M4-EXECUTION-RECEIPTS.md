# 33JACK V3 M4 — Native Amadeus Testnet Execution and Verified Settlement

Stacked base: M3 PR #5 exact SHA 97c82ada5e11edbc80209e6bc5b9cbd201ef0db2 with two green workflows.
Head: feat/ama-v3-m4-execution-receipts. All earlier milestone PRs remain draft/unmerged; main untouched.

## Security-first architecture
- Native Amadeus Layer-1 Testnet only, official pinned RPC; no mainnet, Celo/EVM/Solana, fiat payout, bridge, or agent-signed wallet transfers.
- User wallet produces the signed native transaction. No seed phrase/private key custody, no server-side signature creation.
- Server decodes canonical native VecPack and verifies SHA-256 tx hash, 48-byte signer public key, BLS12-381 signature with official Testnet TX DST (AMADEUS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_TX_TESTNET_), exact wallet payer, Coin.transfer contract, native Base58 recipient bytes, atomic unit amount, and AMA symbol.
- Current M2 auth session, CSRF, organization role, exact M3 reviewed terms fingerprint, expiry, and current beneficiary version are checked prior to any broadcast reservation.
- Durable PostgreSQL execution row has unique intent ID and transaction hash, packet digest, exactly one recorded broadcast attempt, and append-only payment events.
- A one-attempt RPC submit happens ONLY after a successful atomic pre-broadcast reservation. A duplicate request returns the original hash; an uncertain RPC timeout NEVER causes a re-broadcast.
- Manual execution-status and execution-reconcile endpoints recover without sending another transaction; no cron and no automatic retries.
- Independent verification uses the official Testnet SDK transaction.get and chain.getStats to match observed signer, hash, action, recipient, exact units and successful execution receipt. Confirmation is not finality; finalized requires rooted height or explicit finality metadata.
- Inconsistent chain result is disputed; failed receipt is failed; unknown or unavailable evidence remains not verified.
- Successful finalized receipts contain the exact Testnet hash, signer, recipient, atomic AMA amount, inclusion height and entry hash, finality, success and verified timestamp.

## V3 APIs
POST /api/v3/ama?operation=execution-preflight — verify signed packet, no broadcast.
POST /api/v3/ama?operation=execution-submit — verify signed packet, atomic reservation, guarded one-attempt Testnet RPC submit.
GET /api/v3/ama?operation=execution-status — read workspace-scoped durable attempt.
POST /api/v3/ama?operation=execution-reconcile — independently query and record receipt.

## Strict broadcast release flags
All flags default to false; the public app must not enable them without independently witnessed acceptance:
AMA_M4_ENABLE_BROADCAST=true
AMA_M4_WALLET_EXTENSION_VERIFIED=true
AMA_M4_TWO_WALLET_ACCEPTANCE_VERIFIED=true
These are operational locks, NOT proof by themselves. The native wallet extension's actual Testnet sign-only capabilities and signed byte format have not yet been witnessed; UI refuses to sign if it cannot verify them.

## Testing
npm run test:m4 — cryptographic native BLS Testnet packet fixtures (not real transactions), wrong signer/DST/amount/recipient, canonical encoding, beneficiary/expiry and receipt semantics.
npm run test:m4:db — disposable PostgreSQL 16 authenticates requests against seeded M2 session, uses real DB transactions and mock Testnet RPC only to exercise one-attempt idempotency, timeout uncertainty, stale policy, cross-tenant denial and finality. No funded Testnet transfer is claimed.
CI carries forward M1–M3 tests, frontend build, API syntax and serverless-budget checks and adds a distinct M4 disposable database job.

## Outstanding external acceptance
- Official installed Amadeus Testnet Wallet must demonstrate compatible network inspection, sign-only no-broadcast behaviour, exact Testnet DST and output encoding. Current M2 login signMessage contract is also not independently witnessed.
- V3 dedicated PostgreSQL deployment and two controlled, funded Testnet wallets must be witnessed.
- Execute a real, small-value wallet-owned Testnet transfer, verify unique hash, exact sender/receiver/amount, successful receipt, rooted/finalized status and explorer evidence.
- Independent security audit/review required before real users; no mainnet or automatic transfers authorized.

Official SDK references:
https://github.com/amadeusprotocol/amadeus-typescript-sdk/blob/main/src/signing.ts
https://github.com/amadeusprotocol/amadeus-typescript-sdk/blob/main/src/api/transaction.ts
https://github.com/amadeusprotocol/amadeus-typescript-sdk/blob/main/src/types.ts
