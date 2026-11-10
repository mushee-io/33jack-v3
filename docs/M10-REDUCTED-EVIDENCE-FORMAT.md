# M10 deterministic redacted evidence manifest — format and verifier

The authenticated Testnet Overview offers a **read-only** source-backed M10 grant-evidence export for organization **owner/admin** roles. All responses have \`Cache-Control: no-store\` and origin-bound M2 cookie validation. Endpoint \`GET /api/v3/ama?operation=demo-grant-export&workspaceId=<UUID>\` never accepts an arbitrary RPC, wallet address, signed packet, manual approval or claimed audit result.

## Contents
- \`schema: 33jack-v3-amadeus-testnet-grant-evidence-v1\`, network \`amadeus-testnet\`, asset \`AMA\`.
- \`provenance\`: \`authenticated_owner_admin_readonly_organization\` for runtime evidence or \`synthetic_ci_disposable_database\` for Actions.
- \`organizationCommitment\`: SHA-256 of the string \`m10-workspace:<workspace_uuid>\`; it is not a secret key and must not be presented as anonymity against informed observers.
- M9 **bounded latest-50** record classification, append-only evidence hash per record, M9 hash-chain verification status/head; M7 hash-chain head and status; human-reviewed M6 invoice **count only**, open manual risk hold count.
- \`claims\`: explicitly false for funded two-wallet verification, extension compatibility, protected Vercel Preview, deployed production database restore and mainnet operations; external review \`not_submitted\`.
- \`release.decision\`: **NO_GO_FOR_PUBLIC_FUNDS_AND_MAINNET**, no automatic broadcast, mainnet deploy or live funding claim.
- \`buildCommit\`: exact 40-character Git SHA only for the source-pinned CI synthetic artifact; authenticated live source snapshots have \`null\` until an independently verified deployment witness is supplied.
- \`blockers\`: specific outstanding external evidence. \`generatedAt\` is metadata, not part of the digest.

## Deterministic verification
Construct the object in source property order without the \`digest\`, \`digestAlgorithm\` or \`generatedAt\` properties. Compute UTF-8 SHA-256 of \`JSON.stringify(body)\`. Recompute with \`verifyM10GrantSnapshot(snapshot)\` in \`api/_lib/v3-demo-core.js\`. Any substantive mutation breaks the digest. This hash chain and digest **do not** provide cryptographic signatures or an external independent auditor's certification. The maximum-50 snapshot is a bounded sample, not a complete financial record export.

## CI-only witness
M10 GitHub Actions creates \`m10-artifacts/m10-grant-evidence.json\` and \`m10-artifacts/m10-sha256.txt\` from a disposable PostgreSQL database after M9/M10 synthetic fixture tests. Artifact records GitHub run ID and commit SHA but says \`CIStatusAtGeneration: running_not_yet_final\`; only the GitHub completed workflow itself can validate the final result. Restore into a separate PostgreSQL database and compare the **source-backed runtime digest** to its prior marker. CI fixture evidence never becomes a live transfer, banking volume, wallet funding or external security audit.

## Disallowed contents
Plain wallet addresses, customer names, private keys, seed phrases, invoices, raw transactions, transaction hashes, bearer tokens, signed BLS payloads, live session cookies, DB credentials, app OAuth secrets, fabricated on-chain transaction timestamps or unverifiable adoption statistics. Store private source evidence in an access-controlled separate operator file if a real witness is performed.

## Operator actions before sending to AMA Foundation
1. Review the material against \`docs/M10-AMA-FOUNDATION-APPLICATION.md\`; verify the latest official application questions yourself.
2. Confirm all GitHub M10 final SHA tests green and both workflow run IDs.
3. Attach *redacted* M10 manifest, M9 append-only audit head, source documentation and honest blockers only.
4. Include real official Testnet transaction link only after verifying it independently; do not paste a CI fixture hash.
5. Do not claim third-party security approval, KYC, customer transfers or deployed service if they have not occurred.
