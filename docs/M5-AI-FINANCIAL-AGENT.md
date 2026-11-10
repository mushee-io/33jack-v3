# 33JACK V3 M5 — Native Amadeus Testnet AI Financial Agent

Stacked M4 base: draft PR #6 at SHA 6bcd7beec712ccd212c5845dfffb117d8b20681d, both M4 GitHub CI runs green.
M5 head branch: feat/ama-v3-m5-ai-agent, targeting M4. No merge or mainnet deployment.

## Architecture and security contract
Authenticated native wallet (M2) -> organization permission checks -> bounded deterministic AMA read-only tools -> optional explanation -> human-owned M3 proposal entry, approval and M4 signing. The financial agent NEVER signs, approves, creates an intent, broadcasts, or changes beneficiary policy. Wallet custody and M4 broadcast guards are untouched.

## M5 workstreams
1. Identity and authorization: every agent API checks active hashed M2 wallet session, same-origin host, organization membership, CSRF for POST and JSON input. Each tool verifies exact organizational access. No arbitrary-wallet read or cross-tenant query.
2. Fixed read-only tools:
   - ama.wallet.balance: official Testnet SDK for only the authenticated wallet; unavailable RPC never implies a zero balance.
   - ama.beneficiaries.list: existing organization allowlist with current blocked state.
   - ama.invoices.list, ama.invoices.get: user-entered UNVERIFIED invoice reference records.
   - ama.intents.list, ama.intents.get: read M3 immutable native AMA payment intent state, terms hash and human review.
   - ama.executions.status: read a reserved M4 transaction and already stored receipt, no submission or fresh chain mutation.
   - ama.risk.summary: evidence-based deterministic risk flags; pending/disputed chain claims and unverified invoices never become settled status.
3. Safe natural language: strict grammar for "Prepare payment of 0.01 AMA to [native address] for invoice INV-123". Base58 native 48-byte public key, 9-decimal BigInt AMA amount, max Testnet transfer limit and existing recipient policy validated. Returns advisory structured terms, not a database payment intent or signed transaction.
4. Invoice context: human operator enters metadata reference, issuer, declared amount and denomination (AMA, GBP, USD, EUR), optional native recipient. Records are hard-coded source_type=manual_unverified and verification_status=unverified. The system cannot claim actual invoice document review, ownership or bank/fiat conversion until future M6.
5. Prompt safety: prohibit role spoofing, override instructions, dangerous transaction requests and unsupported commands; input cannot change policy. Invoice and chain fields are never instructions. The model cannot select privileged tools.
6. Optional AI explanation: Groq requires GROQ_API_KEY, AMA_M5_ALLOW_REMOTE_AI=true and explicit request opt-in; only sanitized codes, severity, counts, and network label are sent. No raw prompt, wallet addresses, private keys, invoice documents, transactions or tool authorities are transmitted. Failure falls back to truthful deterministic mode.
7. MCP/A2A: agent-mcp implements authenticated MCP-shaped JSON-RPC initialize, tools/list and tools/call for exactly eight read-only tools, with scoped workspace ID and no writes. agent-a2a offers an authenticated A2A-shaped user-message envelope for analysis, not a public remote MCP server or external agent federation; interoperability beyond the scoped adapter is NOT claimed.
8. Audit and limits: PostgreSQL stores organization-scoped invoice metadata, event name, actor and SHA-256 hash of the input. The actual user request is not stored in M5 audit. Transactional per-wallet/workspace rate limits with advisory lock.
9. UI: AmadeusAgentPanel is inside native AmadeusWorkspace, requires M2 authentication, allows risk/read-only tool requests, optional sanitized model explanation, natural-language human-only proposals and manually entered unverified invoice references. All answers clearly mark no transfer or approval.
10. Unit and disposable PostgreSQL CI: test native AMA proposals, policy bypass and prompt injection attempts, unknown tool and mutation method rejection, balance outage, tenant boundary, invoice false verified/paid claims, CSRF and origin, M3 unchanged intent count after agent query, M4 execution unchanged, rate limits, MCP/A2A and model payload privacy.

## API reference (all under /api/v3/ama?operation=)
- GET agent-tools: fixed permission-annotated tool catalog.
- GET agent-invoice-list: organization manual invoice records.
- POST agent-invoice-record: explicitly human-only manual unverified invoice reference creation (not a model tool).
- POST agent-tool: one authorized read-only tool.
- POST agent-query: constrained proposal and deterministic risk assessment with optional sanitized Groq explanation.
- POST agent-mcp: authenticated read-only JSON-RPC-shaped tool list/call and initialize.
- POST agent-a2a: authenticated user message and read-only answer.

## CI and known blockers
Run npm run test:m5, npm run test:m5:db, all M1-M4 checks and build. M5 database CI uses disposable PostgreSQL 16 and only mock data; no real wallet, chain payment or AI inference is fabricated.
M2 installed wallet off-chain signature compatibility and M4 real funded two-wallet settlement remain outstanding; dedicated V3 production/Testnet database configuration is NOT verified. All previous PRs remain draft/unmerged. No mainnet deployment or financial automation enabled.
