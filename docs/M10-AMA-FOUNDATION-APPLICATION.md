# AMA Foundation Early Builders — 33JACK V3 application draft

**Program:** AMA Foundation / Amadeus Early Builders. Official information: https://amafoundation.net/grants and https://ama-early-builders.vercel.app/ (accessed 2026-11-10). Official website states **rolling applications**, **8-week accelerator**, **weekly AI-agent + human review**, ecosystem awards as a **program pool**. No grant amount, review outcome, ranking or funding is guaranteed for 33JACK.

## Application short answer
**Project title:** 33JACK V3 — Human-Authorized Financial Agent on Amadeus

**One-line pitch:** A native Amadeus Layer-1 financial-operations agent that helps organizations review invoices, explain risk, propose exact AMA payments, and reconcile *independently verified* Testnet settlement—without granting AI custody or unilateral transaction authority.

**Problem:** Financial teams face fragmented invoice intake, beneficiary verification, payment approvals and transaction reconciliation. Traditional finance tools often lack independently verifiable settlement evidence. Blindly empowering AI agents with private keys can create unacceptable fraud and operational risk.

**Solution:** 33JACK V3 joins signed native wallet identity, scoped financial AI, source-provenance invoices, immutable payment terms, human maker–checker approvals, and official Amadeus Testnet chain verification. A user wallet owns each native Coin.transfer. The server and AI never hold keys or approve payments autonomously. The system fails closed when on-chain or security evidence is missing.

**Why Amadeus:** This V3 uses **native AMA** and the official Testnet RPC, not a Celo/EVM token wrapper. Native BLS wallet identity, canonical signed packet verification, native Coin.transfer and independent Testnet observation offer a protocol-focused financial agent demonstration.

## Technical implementation — existing stacked drafts, not merged/public live
| Capability | Existing milestone | Code/evidence position |
| --- | --- | --- |
| Isolated native Amadeus Testnet adapter and safety defaults | M1 | Completed in stacked draft; main unchanged |
| Native wallet, BLS challenge sign-in, organization roles | M2 | Implemented; official extension compatibility not yet witnessed in a real browser |
| 9-decimal AMA payment intents and immutable approval terms | M3 | Database and API tests; no autonomous transfer |
| Guarded signed packet, one broadcast reservation, official Testnet finality logic | M4 | CI packet fixtures; **real funded transfer not witnessed** |
| Organization-scoped read-only AI, MCP/A2A advisory tools | M5 | No sign, approve or broadcast privileges |
| Invoices, human source/supplier review, matching and reconciliation | M6 | Source-provenance and synthetic CI acceptance; no fiat bank payout |
| Maker–checker, emergency pause, policy/risk and hash-linked audit | M7 | PostgreSQL acceptance; KYC/KYB/AML providers not integrated |
| Responsive native Testnet UX, true receipt states | M8 | UI security and accessibility tests |
| Independent Testnet proof-witness reader and security gates | M9 | CI + synthetic-only evidence; no external audit |
| Read-only operator demo, grant snapshot/export, NO-GO release controls | M10 | To be verified by exact SHA CI and reviewer |

**Architecture:** React/Vite frontend; Node/Vercel API endpoints; separate PostgreSQL org/approval/invoice/audit stores; \`@amadeus-protocol/sdk\` configured to **https://testnet-rpc.ama.one/api**. Wallet-owner BLS signatures, distinct maker–checker policy and official Testnet receipt verification. MIT license. See repository: https://github.com/mushee-io/33jack-v3 (draft M1–M10 branches).

**Current status:** Internally testable with disposable CI fixtures, **not** a publicly launched or independently audited live financial product. M4 network broadcasting remains disabled by default. No audited live two-wallet Testnet settlement is claimed.

## Proposed eight-week accelerator plan (ours, not an AMA Foundation schedule requirement)
| Week | Focus | Publicly checkable deliverable |
| --- | --- | --- |
| 1 | Native SDK and Testnet isolation | Code, branch/CI provenance and Testnet-only config |
| 2 | Identity and organization separation | Signed message verification and RBAC negative-path results |
| 3 | Invoice plus AMA intent UX | Source/beneficiary validation and exact atomic-unit approval tests |
| 4 | Wallet sign-only capability witness | Extension-compatibility report, no automated custodial workarounds |
| 5 | Full agent-invoice approval flow | Human-only authorization, read-only AI/MCP/A2A test matrix |
| 6 | Independent funded Testnet receipt | If feasible: two-wallet transaction with official RPC finality; otherwise transparently blocked |
| 7 | Security and privacy hardening | Independent review request, fixes, risk/pause and restore evidence |
| 8 | Demo, public docs and evaluation | Redacted grant packet, video walkthrough if actually recorded, live blockers and next-step roadmap |

## Grant-fit and request
**Track to discuss:** Early Builders (Financial Agent Grants overlap). The Foundation website separately lists Financial Agent Grants and its Early Builders accelerator; eligibility and award allocation must be confirmed with the Foundation.

**Funding request:** **To be agreed after discussion with the Foundation**. Do not state a particular AMA or fiat sum as awarded.

**Use of grant/support if selected:** Independent wallet compatibility testing; third-party contract/backend security review; additional native Testnet integration; privacy-preserving organization data handling; wallet-owner UX; docs, developer onboarding and funded Testnet demo verification. Any spending plan requires explicit budget approval.

**Measures of progress:** Source-pinned passing CI, working protected Testnet demo, real two-wallet wallet-owner flow, exact finalized Testnet evidence, source-verified invoice reconciliation, independently reviewed security report, documented zero autonomous AI signing, and verified isolated DB restore. CI fixture hashes are not user adoption or transfer-volume metrics.

## Current exclusions and known risks
- **Not yet independently evidenced:** official wallet sign-only/message-sign capability, two funded native Testnet wallets, real transaction-finality witness, protected Vercel deployment, external security audit, deployed DB backup/restore.
- No KYC/KYB/AML provider integration, no bank payouts or credible FX conversions, no active stablecoin/fiat rail.
- M1–M10 remain separate stacked **draft PRs**; no mainline merge or mainnet deployment. Current code/instructions are not a production license to move real money.
- A remaining moderate dependency advisory must be reviewed; a fully committed npm lockfile is still outstanding.
- The AMA Foundation's ecosystem award figures describe the program, **not an allocation to our project**.

## Missing application-specific fields — supply factually, never invent
- Applicant's authorized legal entity name, registration jurisdiction and contact email.
- Team members and publicly verifiable GitHub credentials.
- Founding commitment, requested mentorship, intended funded Testnet dates.
- Any actually published demo URL, recorded footage or real transaction explorer link.
- A requested budget with line items and external review quotation.
- Accurate engagement/traction metrics, if any. State none/unmeasured if unavailable.

**Recommended evidence attachments:** Source-linked M10 README and operator playbook, CI SHA + redacted grant manifest, M9 PostgreSQL restore witness, grant pitch, and future independent Testnet wallet/finality + external security-audit reports when actually collected.

## Application Q&A
**Does the agent transfer money on its own?** No. It can describe authorized business records and suggest a proposed native AMA amount. Human roles approve immutable terms; only the connected owner wallet may sign; M4 broadcasting remains locked without external release evidence.

**Is the product deployed on the Amadeus mainnet?** No. M10 is Testnet-only and maintains NO-GO for public funds/mainnet.

**Have funds already settled on Testnet?** No real funded two-wallet transfer has been independently witnessed or claimed here. Synthetic tests prove code safeguards only.

**Is the platform audited?** Not externally. CI includes adversarial, authorization and PostgreSQL recovery tests, but third-party review is still required.
