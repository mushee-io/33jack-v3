# M10 — protected Amadeus L1 Testnet Preview deployment preparation (NOT a deployment)

## Current state
Source configuration is prepared for a **private Testnet-only Preview**. M10 does **not** call Vercel deploy, merge a branch, make a domain public, or prove that Preview SSO/access controls are enabled. Any deployed Testnet system needs independent operator inspection.

## Immutable boundaries
- Testnet network ID \`amadeus-testnet\`; native asset \`AMA\`; 9 decimals; sole permitted RPC \`https://testnet-rpc.ama.one/api\`.
- Never select \`mainnet-rpc.ama.one\`, arbitrary custom RPCs, Celo/EVM, Solana, Stellar, legacy V2 payment endpoints, or live financial provider credentials.
- All \`AMA_M4_*\` broadcast/extension/two-wallet flags remain **false** until separately witnessed, authorized external acceptance. M10 cannot authorize these values.
- \`AMA_M5_ALLOW_REMOTE_AI=false\` for offline/reproducible acceptance; AI cannot receive custody/signing rights.
- Use dedicated V3 non-production PostgreSQL. Document backup/recovery windows and separate restore. **Never** use imported V2 production database or replace existing customer storage.
- Include no API keys, DB URLs, cookies or invoice contents in VITE_ environment variables, build logs or screenshots.
- Remain on M10 draft branch. Main and M1–M9 stacked PRs remain unchanged/unmerged.

## Operator-controlled Preview checklist (manual, not executed here)
1. Verify branch \`feat/ama-v3-m10-final-testnet-demo-grants\` and the exact commit plus **both** push/PR all-green status. Save the build commit and GitHub Actions runs.
2. Confirm MIT LICENSE and precise \`package.json\` dependency versions. Review \`npm audit --omit=dev\` output. M9 fixed a critical vulnerability in older PDF.js. Do not treat absent critical findings as an independent third-party audit.
3. In the authorized Vercel project, confirm **Preview only** is selected, not Production, and ensure SSO/Deployment Protection is configured. Explicitly test private URL from an incognito/unauthorized browser and record blocked HTTP/access screenshot.
4. Configure official Testnet RPC via scoped preview environment. Point \`DATABASE_URL\` to an isolated V3 non-production database. Use secure environment storage; no credentials in commits. Do not point to M9/M10 disposable CI fixtures as if they were a real workload.
5. Before any deploy, run \`npm run m10:preflight\`, \`npm run test:m10\`, \`npm run test:m9\`, all predecessor suites and \`npm run build\`. For an exact CI witness see dedicated M10 disposable PostgreSQL restore job.
6. After an approved Preview deployment, independently verify labels, signed-login behavior, organization RBAC, invoice safety, AI read-only behavior, M7 pause, M9 acceptance NO-GO and M10 redacted export. Check source SHA of the deployed code.
7. Collect real extension and two-wallet funded Testnet evidence separately, **only** after independent operator authorization and adherence to M4 broadcast release gates. Unavailable extension capability is a stop condition, never a reason to fake a hash.
8. Request external review with package/code SHA, threat model, roles, DB restore evidence, transaction-replay checks and no-go controls. Do not mark the third-party audit approved based on internal CI.
9. Record independent manual approval before any change to broadcast flags. No Vercel production deployment and no mainnet operations are covered by M10.
10. If any check fails, leave Preview unpublished/not promoted, retain existing safe state, use M7 emergency pause for incident and follow \`docs/M9-ROLLBACK-AND-INCIDENT-RUNBOOK.md\`.

## Verified vs unverified statement
- **Verified by exact SHA CI once green:** source-level Testnet boundaries, unit/integration security checks, CI disposable PostgreSQL backup/restore, generated redacted manifest and frontend build.
- **Not verified automatically:** real SSO protection, private preview runtime secrets, browser extension API compatibility, two funded Testnet wallets, real chain finality, operator-owned deployed database restoration or external security audit.
- Reproducibility: the M10 manifest has a deterministic SHA-256 digest over canonical JSON and is pinned to the exact Git commit. A committed npm lockfile is still absent, so dependency installation is not yet byte-for-byte reproducible. Do not make stronger claims.
