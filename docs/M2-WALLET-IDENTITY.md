# M2 — Native Amadeus Testnet Wallet, Identity, Sessions, Organization Permissions

Parent M1: draft PR #2 at exact SHA fd0bec1120808322e2cd1fac5bfe7167645043bd (two passing CI runs).
Head: feat/ama-v3-m2-wallet-identity; target: feat/ama-v3-m1-foundation. The previous PRs remain unmerged.
Network: native Amadeus Layer-1 Testnet only; no mainnet, EVM, Solana, Celo or stored wallet private keys.

## Engineering implementation
- Native 48-byte BLS public key / Base58 address validation and explicit official Testnet wallet network checks. Unknown network fails closed.
- Wallet connect/disconnect, account-change and network-change signals, and connected-vs-authenticated state.
- POST auth-challenge: a rate-limited, three-minute nonce bound to origin, account, network and expiry; non-transaction login challenge.
- POST auth-verify: native BLS12-381 off-chain signature verification with a 33JACK-specific DST; challenge cannot be reused.
- Hashed 30-minute HttpOnly SameSite Strict session, session expiry and revocation, rotating CSRF token and same-origin enforcement.
- PostgreSQL-backed challenges, sessions, workspaces, memberships and recipient-bound expiring invitation tokens. No in-memory auth fallback.
- Owner, admin, operator, approver and viewer permission matrix, scoped workspace membership checks, invitations, role updates and removal.
- Amadeus Testnet identity UI included in the existing native workspace, with graceful refusal for unsupported wallet capabilities.
- Automated negative tests for invalid signer, tampered message, incompatible DST, wrong network, invalid address, cookie, CSRF, origin and role permissions.

## Setup / run
Use a dedicated least-privileged PostgreSQL DATABASE_URL for V3. Schema tables are created idempotently on first identity request.
If DATABASE_URL is absent identity APIs return 503; no fake login is offered.
Run npm run test:m1, npm run test:m2, npm run test:amadeus, npm run test:isolation, npm run test:vercel and npm run build.
Verify CI against the exact final M2 commit before acceptance.

## External wallet compatibility blocker
The SDK documents BLS12-381 signing, but currently reviewed public Amadeus extension references do not conclusively establish an arbitrary off-chain signMessage API, its signature encoding or domain (DST) contract.
The UI checks for signMessage AND the wallet's getNetwork/getCurrentNetwork, and denies authentication if either is unavailable or the signature cannot be verified by the server.
Signing an on-chain transaction is NEVER a fallback for logging in.
This means wallet authentication code is implemented and cryptographically unit tested, but live extension compatibility is not yet demonstrated.

## Acceptance gates
- Separate stacked branch and draft pull request from verified M1.
- Exact-SHA CI with M1 and M2 gates passed.
- Test against dedicated PostgreSQL and two separately controlled real Testnet extension wallets.
- Verify extension signature compatibility, account/network switching, timeout, invite redemption and cross-tenant access denial.
- Independent security review before customer-facing authentication.
- No financial transaction or mainnet deployment is authorized as part of M2.

M2 does not claim live signed wallet login, live payments, or a verified two-wallet witness until those external tests have actually been performed.
