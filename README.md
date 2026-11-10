# 33JACK V3 — Native Amadeus Testnet Financial Agent

**33JACK V3** is an AI-assisted, **human-authorized financial operations workspace built for the native Amadeus Layer-1 Testnet**. Organizations can inspect invoices and payment instructions, apply policy and maker–checker controls, prepare AMA payment intents, and compare receipts with independently retrieved Testnet chain evidence. Private keys remain in the user's wallet. The AI cannot sign, approve or broadcast transfers.

**This is Testnet software, not a live fiat payout service or a mainnet deployment.** A successful automated test is not evidence of a funded two-wallet transfer.

## What the app provides

- **Amadeus Testnet identity:** native account discovery, signed organization login, roles and session protections; official wallet-extension end-to-end compatibility still needs a real witness.
- **AMA payments:** reviewable, bounded native-asset payment intentions and policy-based human authorization; M4 broadcast remains disabled by default.
- **Invoices:** source/provenance checks, risk holds, human verification and reconciliation.
- **Financial AI:** read-only analysis and explanations; no independent spending authority.
- **Governance:** organization policies, maker–checker workflow, emergency pause and append-only audit.
- **Evidence:** Testnet RPC reads and finality matching; synthetic GitHub evidence is explicitly labeled synthetic.

## Entry points

| Path | Function |
| --- | --- |
| `/` | Amadeus-only introduction and scope |
| `/app/amadeus` | Native Amadeus Testnet workspace |
| `/app` and former app URLs | Canonicalized to the native workspace |
| `/api/v3/ama` | Amadeus Testnet API |
| `/api/health` | Testnet-limited health read |

## Development and Milestones

The M1–M10 migration was developed as a stack of milestone branches. See [PR #13](https://github.com/mushee-io/33jack-v3/pull/13) for M10 and [PR #14](https://github.com/mushee-io/33jack-v3/pull/14) for the Amadeus-only public app. The source and automated tests document Testnet capabilities. Deployment and external wallet acceptance are tracked separately.

Node.js 22 recommended:

```bash
npm install --ignore-scripts
npm run test:amadeus
npm run test:isolation
npm run test:m1
npm run test:m8
npm run test:m9
npm run test:m10
npm run test:branding
npm run test:vercel
npm run build
```

## Testnet configuration and security

- **Network:** native Amadeus L1 Testnet, asset AMA.
- **Official RPC target:** `https://testnet-rpc.ama.one/api` (set via `AMA_TESTNET_RPC_URL`).
- **No mainnet deployment**, no server-side wallet custody, and no autonomous AI signing.
- Old V2 payment API routes return HTTP `410 V3_LEGACY_ROUTE_DISABLED`; they are not fallbacks.
- **Pending external witnesses:** official extension/sign-only compatibility, two distinct funded Testnet wallets and a finalized native transfer, protected Preview and isolated live database restore, and independent third-party security review.
- **Reproducibility:** npm lockfile still needs to be committed; dependency audit and reproducible installation must be rechecked before promotion.

## Documentation and license

- [Amadeus protocol architecture](docs/AMADEUS-V3.md)
- [M1–M10 roadmap](docs/ROADMAP-M1-M10.md)
- [M10 Testnet demo instructions](docs/M10-DEMO-OPERATOR-PLAYBOOK.md)
- [AMA Foundation application draft](docs/M10-AMA-FOUNDATION-APPLICATION.md)
- [Security and release gates](docs/M10-SECURITY-AND-RELEASE-GATES.md)
- [MIT License](LICENSE) — Copyright © 2026 Mushee Labs.

Project maintained by **Mushee Labs**. No grant award, production settlement or independent audit approval is implied.
