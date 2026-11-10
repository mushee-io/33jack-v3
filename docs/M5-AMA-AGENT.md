# 33JACK V3 M5 — Amadeus Testnet Financial Agent (Read-Only + Human-Reviewed Proposals)

Base: M4 draft PR #6 exact SHA 6bcd7beec712ccd212c5845dfffb117d8b20681d, both GitHub CI workflows green.
Head: feat/ama-v3-m5-ai-financial-agent; stacked against M4 branch, NOT main.
Network: independent Amadeus Layer-1 Testnet, native AMA only. MIT licensed; original V2 unchanged.

## Purpose and architecture
33JACK M5 is an AI-assisted financial intelligence layer. A signed-in, organization-authorized person can ask about Testnet balance, read native payment intents and receipt states, inspect beneficiary allowlists, record unverified invoice notes, see deterministic risk flags and receive strictly structured candidate AMA transfer suggestions. The user must independently create a payment intent in M3. M3 human review and M4 wallet signature are never available as an agent tool.

### Core and tool permissions
- Agent endpoints run ONLY under /api/v3/ama?operation=agent-* through the existing consolidated native Testnet handler. Historical /api/agent and /api/analyze remain HTTP 410, with no Celo or Solana reconnect.
- M2 session-cookie verification, expiration, matching Origin and CSRF are mandatory. Every request requires an authorized workspace UUID, and the payer identity comes from the authenticated server session.
- Immutable allowed tool set: wallet.balance, beneficiaries.list, invoices.list, payments.list, transactions.list, risk.assess. No arbitrary tool names, unknown arguments, transaction execution, signature, fiat payout or auto approval.
- Read-only balance comes from official Amadeus Testnet RPC for the SESSION ADDRESS ONLY; unavailable RPC is reported as unverified, never fabricated.
- Beneficiary read and risk assessments use M3 native AMA allowlist and version. Native payment intents and history come from durable M3 PostgreSQL state. Transaction history is scoped by workspace and joins M4 evidence. Only finalized, independently verified receipts are labelled verified.
- Invoice notes are explicitly human-entered, unverified and not OCR. The notes are hashed and stored in workspace-scoped PostgreSQL for later M6 migration; external instructions inside their text are NEVER prompts or payment commands. Sensitive raw invoice text is excluded from API reads and model calls.
- Roles: owner/admin/operator can analyze and suggest; viewer/approver may use authorized read-only tools but cannot create agent-proposed payment tasks.
- Deterministic policy flags include missing/blocked/changed beneficiaries, invoice amount/recipient mismatch, embedded malicious document instructions, repeated payment intent, unresolved transaction, large proposed AMA amount and unverified balance.
- Only strict whole-message natural-language transfer patterns are interpreted. Example: Prepare 0.5 AMA to [native Amadeus Base58 address] for invoice INV-001. Unsupported tokens, Celo, fiat and trailing instructions fail closed.
- Agent tasks persisted in ama_v3_agent_tasks with hashed idempotency and organization-scoped access; attempts are limited to 30 analyses per hour, and 100 tool reads per hour. No prompt text is retained as a task field.

### Optional external model — explanation only
The default M5 behavior is deterministic financial policy analysis, not a live LLM. An optional external Groq explanation may be enabled only by deliberately setting AMA_M5_ENABLE_EXTERNAL_AI=true and a server-side GROQ_API_KEY. Only risk categories, risk codes, the amount and Testnet marker are transmitted to that provider; no raw invoice notes, wallet keys, addresses, account or tenant IDs. The model has NO tools, no authorization, no transaction capabilities. Model suggestions cannot alter risk policy, approval, signing or status. Output is marked non-authoritative, with deterministic fallback if absent or erroneous. Do NOT claim a model was used when not configured.

### MCP and A2A compatibility boundaries
- Authenticated M5 agent-mcp endpoint offers a restricted JSON-RPC 2.0 subset: initialize, tools/list, tools/call for read-only operations. It requires an M2 browser session, workspace and CSRF. Unsupported tools, unknown arguments and workspace mismatch are rejected.
- Authenticated agent-a2a endpoint accepts a narrow message/send text-task subset and returns a completed analysis artifact without payment authority.
- These session-scoped subsets do NOT establish official standards-conformant standalone MCP or A2A service interoperability. External peer authentication, streaming, formal protocol conformance and independent audit are future work.

### APIs
- GET agent-tools, agent-tasks (workspaceId)
- POST agent-invoice-note (human-entered unverified note)
- POST agent-read (fixed tool name, workspaceId, only allowed arguments)
- POST agent-analyze (X-Idempotency-Key, workspaceId, message)
- POST agent-mcp (restricted JSON-RPC 2.0)
- POST agent-a2a (restricted message/send)
No API in the M5 namespace can create M3 payment intents, approve them, sign native BLS transactions, broadcast AMA transactions or manipulate M4 execution locks.

### Frontend
AmadeusAgentPanel is integrated in the Amadeus Testnet workspace. Organization selector, read-only native data, manual invoice-note entry, task history, model-use transparency and deterministic risk explanation are available. A suggested transfer can only COPY user-visible fields to the M3 form for independent human review. Copying never creates an intent, approves it, signs or broadcasts.

### CI and acceptance
- test:m5: native parser, injection and untrusted document guards, policy rules, tool allowlist, unsupported network rejects, no-model behavior, no-sign/static guards.
- test:m5:db: disposable PostgreSQL 16, real tenant isolation/RBAC, hashed idempotency, documented invoice-note provenance, blocked prompt injection, inherited native data, authenticated HTTP API, CSRF/Origin, restricted MCP and A2A, zero created intents or executions.
- Existing M1–M4 CI, M3/M4 disposable database suites, frontend production build and Vercel function-budget check must remain green at final exact M5 head SHA.
- Browser sign-in and real official Amadeus wallet extension acceptance still unresolved from M2. M4 real two-wallet funded Testnet transfer and independent chain evidence remain unwitnessed. No mainnet deployment authorized; broadcast locks remain false.
- No real invoice OCR or compliance provider is claimed; these belong to M6/M7. No real model call is claimed without its provider and separate consent.

M5 code/CI completion is distinct from end-to-end public deployment and actual Testnet money movement. All PRs remain draft and unmerged.
