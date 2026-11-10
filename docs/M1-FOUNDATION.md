# M1 — Amadeus V3 foundation, isolation and fail-closed baseline

**Milestone ID:** M1 of 10  
**Scope:** Only the `mushee-io/33jack-v3` project.  
**Base branch:** `feat/amadeus-testnet-v3` (existing unmerged migration PR #1).  
**Work branch:** `feat/ama-v3-m1-foundation`.  
**Target:** Native Amadeus Layer-1 Testnet, asset AMA. No mainnet or Celo/EVM endpoints.

## Delivered by this milestone
- Formal README and M1–M10 delivery contract. MIT licence remains in place.
- Native V3 routing whitelist: only `/api/v3/ama` serves payment-related API requests. Imported `/api/v2/*` resources fail closed.
- All old direct app endpoints for AI webhooks, invoice analysis, payment creation/approval/settlement/reconciliation, external payout and legacy settlement network respond HTTP 410.
- Production environment flags such as `NODE_ENV=test` or `JACK_ENABLE_LEGACY_SANDBOX` cannot re-enable old routes.
- Removed legacy cron task and obsolete A2A/MCP/settlement aliases from Vercel rewrite config.
- Native, read-only Amadeus Testnet /api/health with honest, verifiable reachability and no fake settlement count.
- Strict official Testnet RPC host/path guard, explicitly refusing mainnet and third-party RPC URLs.
- Example environment contains only non-secret Amadeus Testnet configuration; direct Solana dependencies removed.
- CI enforces legacy-route denial, config invariants, native transaction constraints, Vercel function limits and frontend build.

## Acceptance checklist
- [x] Separate repository and non-main feature branch selected; original V2 not targeted.
- [x] Existing MIT licence and SDK validated.
- [x] Legacy direct routes and V2 router fail closed even with old feature flags.
- [x] Old schedule/aliases removed; RPC pinned to official Testnet.
- [x] Safe Testnet API health and minimal env docs in place.
- [ ] GitHub CI on M1 commit fully green (fill with verified run link only after CI).
- [ ] Reviewer confirms PR diff and no V2/main mutation.
- [ ] M1 accepted for merge; M2 can then be prepared separately.

## Safety boundary and known limits
M1 does **not** mean live AI-agent payments, authenticated financial data, regulated fiat settlement or a tested wallet-to-wallet transaction. The inherited frontend, old `api/_lib` code and V2 docs remain migration sources only; M2–M8 will replace them. No legacy payments are active through V3 HTTP functions. The current Amadeus UI's signing path needs separate on-chain validation in M4.

## Rollback
1. Leave the M1 draft PR unmerged; `main` remains unchanged.
2. Revert or delete the isolated M1 branch if review fails, without force-pushing migration branch.
3. For preview deployments, roll back to the last accepted preview and disable its integration credentials; never reuse production Celo/Solana secrets.
4. Verify `/api/v3/ama?operation=config` shows Amadeus Testnet before any testnet demonstration.
5. Log exact CI/commit evidence and errors instead of marking the full migration complete.

## Grant alignment
The AMA Foundation evaluates alignment, technical merit, network impact, open-source preference and milestone clarity; M1 supplies the trackable, reproducible baseline for the remaining nine milestones.
