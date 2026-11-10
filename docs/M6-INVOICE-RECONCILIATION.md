# 33JACK V3 — M6 Native Amadeus Testnet Invoice Intelligence

## Stacked prerequisites
M5 draft PR #8 is verified at exact commit aac86e90b10d6a0e2b906f82b3c341ffe8c12aaa. GitHub push CI 42793663547 and PR CI 42793670971 each passed 4 jobs. M6 branch feat/ama-v3-m6-invoice-reconciliation is based on that commit, and targets M5, not main.

## Scope and source truth
This module operates **only** on independent Amadeus L1 Testnet metadata, M3 payment intents and M4 independently verified native AMA receipts. It never authorizes a payment, changes beneficiary policy, signs, submits, retries a transaction, or converts AMA into fiat. M4 broadcast flags remain disabled and M5 agent tools remain read-only.

### 1. Secure PDF/image/text ingestion
- JSON-uploaded PDF, PNG, JPEG, WebP, TXT sources use exact file extension, MIME and magic signature matching, 2 MiB limit and SHA-256 digest for original user bytes.
- PDF extraction uses pdfjs-dist with bounded 1–8 pages and controlled preview length; extracted text is unverified and must be reviewed. Invalid/encrypted PDFs fail closed.
- No image OCR is implemented or claimed. Image-only source metadata is explicitly marked image_requires_manual_review.
- PostgreSQL retains document filename, size, hash, source type, extraction state and limited extracted text preview, **not** binary document bytes. The operator must retain the original outside the database to independently compare its SHA-256.
- Duplicate upload SHA-256 per workspace is denied. The same source cannot be silently used for multiple invoices.

### 2. Supplier and invoice verification
- Suppliers are organization-scoped, deduplicated by case-insensitive name, and created as unverified. Only owner/admin can record supplier manual review. Native payout addresses must be currently allowlisted in M3.
- Invoice source, supplier, reference, amount, currency and unit kind are persisted with separate verification status. Duplicate references (case-insensitive) and reused source documents are rejected. No AI extraction is trusted as an invoice fact.
- Human invoice verification requires explicit source review acknowledgment and an exact matching original SHA-256; the supplier must already be human-reviewed. Human verification does not establish independent supplier identity, document authenticity, payment or fiat payout.
- Native AMA stores 9-decimal atomic units; fiat GBP, USD and EUR store 2-decimal minor units. Fiat amounts are never assumed convertible to AMA. No exchange quote or bank payout is provided.

### 3. Chain-backed matching
- Human selects a separately human-approved M3 AMA intent and acknowledges exact invoice reference, supplier native address, amount and network. Each M3 intent links once, and database invoice locks plus cumulative amount checks prevent overassignment.
- M6 derives reconciliation solely from **previously persisted, independently finalized M4 chain receipts**. It checks hash, confirmed successful execution, native Coin.transfer action, signer, recipient, asset, exact atomic units and finalized block evidence.
- States: unverified, unmatched, pending, partial, settled, failed, disputed and not_applicable (fiat).
- Partial settlement counts only confirmed finalized native transfers and does not mark the whole invoice paid. Pending, uncertain, failed and disputed evidence is never reported as settlement.
- M6 reconciliation is read-only; use the separate M4 chain-reconcile endpoint first to update evidence when necessary.

### 4. API and operator UI
M6 routes under the existing authenticated /api/v3/ama endpoint:
- POST invoice-ingest, invoice-supplier-create, invoice-supplier-review, invoice-create, invoice-verify and invoice-link.
- GET invoice-documents, invoice-suppliers, invoice-list, invoice-get, invoice-reconcile and invoice-export.
- Mutations require M2 wallet session, exact organization permission, same-origin request and CSRF. GETs are read-only. Separate existing M5 agent MCP/A2A tools receive NO write authority.
- The new AmadeusInvoicesPanel supports uploading sources, viewing provenance and extracted PDF text, supplier setup, manual verification, M3 linkage, live stored-evidence status views and CSV export.
- Accounting CSV quotes/escapes spreadsheet formula prefixes, preserves original fiat denominations, and includes only M4 verified Testnet hashes with explicit false fiat/FX claims.

### 5. Migration, tests and real-world blockers
- npm run migrate:m6 provisions forward-only, idempotent M6 tables using the same PostgreSQL schema as the API. Append-only audit events are protected against UPDATE/DELETE via a database trigger.
- npm run test:m6 tests actual PDF extraction with a pdf-lib-generated fixture, source signature limits, payment evidence, accounting states and CSV formula injection.
- npm run test:m6:db runs real disposable PostgreSQL transactions with mock/synthetic M4 receipt rows, tenant isolation, role/CSRF, duplicate protections, unverified source guards, partial/final status and audit immutability.
- The dedicated CI job uses pg_dump + pg_restore into a fresh m6restore database, then npm run test:m6:restore asserts SHA-256 provenance, invoice identities, payment links, receipt fields, foreign keys, and immutable audit event history.
- M1–M5 earlier unit/build plus M3/M4/M5 PostgreSQL jobs remain unchanged. Both final exact-SHA workflows must be green before claiming code acceptance.

**Not yet witnessed:** official native Amadeus wallet extension signed login, a funded Testnet two-wallet transfer, deployed private V3 database, real supplier identity review, image OCR, FX service, banking/fiat payout or mainnet. Passing CI only establishes implementation/testing against non-production source and synthetic chain fixtures. All PRs remain draft/unmerged.
