# PRD — Subscription Autopilot
### Powered by the SpendGuard policy-gated signer engine

| | |
|---|---|
| **Track** | 4 — Best Agentic Economy Experience on Arc |
| **Prize target** | 1st: 4,000 USDC / 2nd: 2,000 USDC |
| **Author** | Ronie Joseph (roniejosephv@gmail.com) |
| **Version** | 1.0 — 2026-07-06 |
| **Status** | Finalized (Strategy v5) — see `STRATEGY.md` for research trail |
| **Team** | Solo, part-time, 6 build days |
| **Repository** | https://github.com/roniejosephv-star/subscription-autopilot |
| **Demo URL** | https://autopilotdashboard-production.up.railway.app (dashboard) · https://autopilotsigner-production.up.railway.app (SpendGuard API) |
| **Scope note** | Testnet demo only (Arc Testnet, chain ID 5042002) |

---

## 1. Problem

AI agents can now hold wallets and pay for services autonomously — Circle's own sample ("Autonomous payments with AI agents") proves the mechanics. But nobody deploys one, because two things are missing:

1. **An economic reason.** "The agent can pay" is a capability, not a benefit. Recurring digital-service spend (API subscriptions, data feeds, metered compute) is where autonomy pays for itself: prices drift, usage changes, and humans forget to re-shop.
2. **A trust boundary.** No finance owner hands an LLM an unrestricted key. In-process spending limits (`onBeforePaymentCreation` hooks) don't count — the agent's own process can be prompt-injected or buggy.

## 2. Solution

**Subscription Autopilot** is an AI agent that runs your recurring digital-service spending end-to-end:

- **Research** — probes competing x402 sellers' price menus, tracks your real usage from on-chain transfer history
- **Negotiate** — compares dynamic price tiers (volume/loyalty) across sellers at every renewal and routes to the best deal
- **Execute** — pays via gasless x402 nanopayments, batch-settled in USDC on Arc

Every payment is authorized by **SpendGuard**, an out-of-process policy-gated signer: the agent never touches a key; it can only *request* signatures, and policy decides — allow, hold for human approval, or deny with a structured reason. Policy state and spend epochs are anchored on Arc for tamper-evident audit.

**Pitch line:** *Circle's sample shows an agent that can pay. Autopilot is an agent that pays well — cheaper, safer, gasless.*

## 3. Goals / Non-Goals

**Goals**
1. Working E2E demo on Arc Testnet: agent autonomously subscribes, meters, re-shops, renews — with real x402 payments settled through Circle Gateway
2. A save: demonstrate the agent switching sellers at renewal and reducing cost
3. A block: demonstrate a prompt-injected overspend attempt refused at the signer, escalated to human approval
4. Deep, verifiable usage of Nanopayments, USDC-on-Arc, Gateway, and Circle Wallets
5. A Circle Product Feedback section stronger than any competing team's (7 findings pre-logged)

**Non-Goals (explicitly out of scope)**
- Free-form price haggling between agents (we do quote comparison + tier selection; do not overclaim "negotiation" in the video)
- ERC-8004 agent identity / ERC-8183 job escrow (future-work slide only)
- Mainnet readiness, fiat on/off-ramps, production key management
- USYC / StableFX (gated; not requested)

## 4. Track-Fit & Judging Map

| Track goal element | Where Autopilot delivers |
|---|---|
| "research… transactions on behalf of users" | Usage ledger + seller price probing at renewal |
| "negotiate" | Dynamic-pricing sellers + agent tier selection (C-lite) |
| "execute… programmable payment logic" | x402 nanopayments + policy engine + approval queue |
| Example #2: "renewal, budgeting, payment authorization" | The entire product, verbatim |
| Example #6: streaming/usage-based payments | Per-call metered billing on all seller APIs |
| Functional MVP: frontend + backend | Dashboard (Next.js) + 4 services (agent, signer, 3 sellers) |
| Architecture diagram | §6 (recreate as image for submission) |
| Circle products used | Nanopayments, USDC, Gateway, Wallets (+CCTP as diagrammed extension) |

## 5. Personas & Core User Stories

**P1 — Delegating owner (primary; demo protagonist):** a UAE SME ops lead who delegates API/data-service procurement to the agent with a monthly USDC budget.
- U1: As an owner, I set a monthly budget, per-service caps, and an approval threshold, so the agent operates within rules I control.
- U2: As an owner, I see every payment, hold, and denial live on a dashboard with Arc explorer links.
- U3: As an owner, I approve or deny held payments with one click.
- U4: As an owner, I see month-end savings the agent achieved by re-shopping.

**P2 — The agent (system actor):**
- U5: As the agent, I discover x402 services, subscribe, and pay per-use without gas.
- U6: As the agent, at renewal I compare all sellers' current tiers against usage history and switch if cheaper.
- U7: As the agent, when a signature is denied I receive a structured reason and re-plan instead of crashing.

**P3 — Seller services (system actors):** 3 competing mock providers of the same capability (e.g., FX-rates API) with different dynamic price tiers.

## 6. System Architecture

```
                        ┌────────────────────────────────────────────┐
                        │                DASHBOARD (Next.js)         │
                        │ live feed · burn-down · approvals · savings│
                        └───────▲──────────────────────────▲─────────┘
                                │ REST/SSE                 │ searchTransfers()
                                │                          │
┌──────────────┐  x402Client +  ┌──────────────────────────┴─────────┐
│ AGENT        │  BatchEvmScheme│  SPENDGUARD SIGNER SERVICE         │
│ (Claude API) ├───────────────▶│  1. parse EIP-3009 authorization   │
│ task planner │  signTypedData │  2. policy: budget/allowlist/velo  │
│ subscription │  over HTTP     │  3. allow → sign via Circle Wallets│
│ ledger +     │                │     (DCW EOA signTypedData API)    │
│ renewal cron │                │  4. hold → approval queue          │
└──────┬───────┘                │  5. deny → structured reason       │
       │ HTTP + PAYMENT header  └──────────┬─────────────────────────┘
       ▼                                   │ policyHash + epoch commit
┌─────────────────────────────┐            ▼
│ SELLERS ×3 (Express)        │   ┌──────────────────┐
│ gateway.require(dynamic $)  │   │ ARC TESTNET      │
│ BeforeSettleHook audit      │──▶│ anchor contract  │
└──────────────┬──────────────┘   │ (~30 loc, Foundry)│
               │ settle()         └──────────────────┘
               ▼
┌─────────────────────────────┐
│ CIRCLE GATEWAY (testnet)    │  batch settlement · unified balance
│ gateway-api-testnet.circle.com                                    │
└─────────────────────────────┘
```

**Security invariant (the one-sentence story):** *the agent can want anything; it can only sign what policy allows.* The EIP-3009 signing capability lives exclusively in SpendGuard, which delegates **every signature — payments *and* the on-chain SpendAnchor audit trail** — to a Circle developer-controlled EOA wallet, so no raw private key exists anywhere in the deployed stack. (`SIGNER_MODE=local` is an offline-dev-only fallback that uses a local EOA for payments and skips on-chain anchoring.)

## 7. Feature Spec (prioritized)

**P0 — must ship (Days 0–4)**
| ID | Feature | Acceptance criteria |
|---|---|---|
| F1 | x402 payment loop | Buyer pays seller on Arc Testnet; 402 → sign → 200; transfer visible via `getTransferById` |
| F2 | Remote policy-gated signer | `BatchEvmSigner.signTypedData` served over HTTP; parses to/value/validBefore/nonce; enforces policy before signing |
| F3 | Policy engine | Monthly budget, per-service cap, per-tx max, daily velocity, allowlist; SQLite; structured deny `{code, reason, remaining}` |
| F4 | Approval queue | Payment > threshold → held; dashboard approve/deny; approve completes the pending agent request |
| F5 | Agent loop | Claude tool-use loop: subscribe, meter usage, scheduled renewal (demo-compressed), re-plan on deny |
| F6 | Re-shop at renewal | Agent probes all 3 sellers' current 402 offers, compares against usage, switches when cheaper; logs decision rationale |
| F7 | Dashboard | Live spend feed (`searchTransfers` polling), budget burn-down, approval cards, savings counter, arcscan links |
| F8 | Circle Wallets signing | SpendGuard signs via `circleDeveloperSdk.signTypedData({walletId})` on a DCW EOA (ARC-TESTNET); verified against Gateway settle Day 1; fallback local key |

**P1 — should ship (Day 4–5)**
| ID | Feature | Acceptance criteria |
|---|---|---|
| F9 | Arc anchor contract | `policyHash` on change + epoch spend-commitment; dashboard links to txs |
| F10 | Seller audit hooks | `BeforeSettleHook`/`AfterSettleHook` logging both sides of every payment |
| F11 | Prompt-injection demo path | Scripted injected instruction → deny → approval card → human deny; reproducible |

**P2 — stretch (Day 5, only if ahead)**
| ID | Feature |
|---|---|
| F12 | Compliance-check policy step (arc-fintech `lib/compliance` pattern) |
| F13 | Crosschain budget top-up via Gateway `withdraw()` to Base Sepolia (20-min demo bonus; also justifies CCTP/Bridge Kit checkbox as architecture extension) |

## 8. Repository Structure (monorepo — create as `subscription-autopilot`)

```
subscription-autopilot/
├── README.md                  ← setup + Circle integration docs (§9/§10 of this PRD seed it)
├── PRD.md                     ← this document
├── ARCHITECTURE.md            ← diagram (export §6 as image too: docs/architecture.png)
├── FEEDBACK.md                ← "Circle Product Feedback" (running log; 7 items pre-seeded)
├── .env.example               ← every env var documented, no secrets
├── package.json               ← npm workspaces root
├── packages/
│   ├── shared/                ← types: PolicyDecision, SubscriptionRecord, DenyCode
│   ├── signer/                ← SPENDGUARD (Express)
│   │   ├── src/index.ts       ← HTTP API: POST /sign, GET/POST /policies, /approvals
│   │   ├── src/policy.ts      ← rule chain: budget → allowlist → per-tx → velocity
│   │   ├── src/circle-wallet.ts ← DCW client + signTypedData (arc-fintech pattern)
│   │   ├── src/eip3009.ts     ← parse TransferWithAuthorization from typed data
│   │   ├── src/store.ts       ← SQLite (better-sqlite3): policies, ledger, approvals
│   │   └── src/anchor.ts      ← Arc anchoring via viem
│   ├── agent/                 ← AUTOPILOT AGENT (Node + Claude API)
│   │   ├── src/index.ts       ← task loop entry
│   │   ├── src/remote-signer.ts ← BatchEvmSigner impl → calls signer /sign
│   │   ├── src/x402.ts        ← x402Client + BatchEvmScheme(remoteSigner)
│   │   ├── src/subscriptions.ts ← ledger + renewal scheduler (demo-compressed)
│   │   ├── src/reshop.ts      ← probe sellers' 402 offers, compare, decide
│   │   └── src/tools.ts       ← Claude tool definitions (subscribe/pay/cancel/report)
│   ├── sellers/               ← 3 competing providers (one Express app, 3 configs)
│   │   ├── src/server.ts      ← createGatewayMiddleware + dynamic gateway.require()
│   │   ├── src/pricing.ts     ← per-seller tier logic (volume/loyalty discounts)
│   │   └── src/hooks.ts       ← BeforeSettleHook / AfterSettleHook audit log
│   └── dashboard/             ← Next.js (component shell lifted from arc-fintech)
│       ├── app/page.tsx       ← feed, burn-down, savings
│       ├── app/approvals/     ← approval cards (approve/deny → signer API)
│       └── lib/transfers.ts   ← searchTransfers() polling
├── contracts/
│   ├── src/SpendAnchor.sol    ← ~30 loc: policyHash + epoch commitments (events)
│   └── script/Deploy.s.sol    ← Foundry deploy to Arc Testnet
├── scripts/
│   ├── generate-wallet.mjs    ← adapted from arc-escrow (79 loc): DCW walletSet + ARC-TESTNET EOA
│   ├── verify-day0.sh         ← quickstart E2E check (kill criterion)
│   └── seed-demo.ts           ← subscriptions + price-drift scenario for the video
└── docs/
    ├── architecture.png
    └── demo-script.md         ← the 4-beat video script
```

**Mapping note for the local Cowork folder (`IgniteChalange/`):** `STRATEGY.md` (research trail), `PRD.md` (this file), and `Support Directories/` (read-only reference samples — NOT committed to the repo; they're Circle's code, pattern-borrow only with license headers respected: all Apache-2.0).

## 9. Setup Documentation (seed for repo README — verified against docs, execution pending Day 0)

**Prerequisites:** Node v22+, Foundry (contracts only), a Circle Developer account (console.circle.com/signup), Anthropic API key.

```bash
# 1. Clone + install
git clone https://github.com/roniejosephv-star/subscription-autopilot.git && cd subscription-autopilot
npm install                                # workspaces: signer, agent, sellers, dashboard, shared

# 2. Environment
cp .env.example .env
# CIRCLE_API_KEY=            ← console.circle.com (Wallets API key)
# CIRCLE_ENTITY_SECRET=      ← register per Circle docs (dev-controlled wallets)
# ANTHROPIC_API_KEY=
# SIGNER_FALLBACK_PRIVATE_KEY=   ← optional; only if DCW signing unavailable
# SELLER_ADDRESS_A / _B / _C=    ← any EVM addresses (receive side)

# 3. Create the agent's Circle wallet (DCW EOA on ARC-TESTNET)
npm run generate-wallet        # writes WALLET_ID + address into .env

# 4. Fund the agent wallet — https://faucet.circle.com → Arc Testnet USDC
#    (USDC is Arc's gas token: one faucet covers gas + spend)

# 5. Run everything
npm run dev:sellers            # :4001 :4002 :4003 — competing x402 APIs
npm run dev:signer             # :5001 — SpendGuard policy + signing
npm run dev:agent              # agent loop (deposits to Gateway on first run)
npm run dev:dashboard          # :3000

# 6. Verify E2E (also the Day 0 kill-criterion script)
./scripts/verify-day0.sh       # unpaid curl → 402; agent pay → 200; transfer id printed
```

## 10. Circle Tools Integration (how each is used — documentation seed)

**Nanopayments / x402 (`@circle-fin/x402-batching` v3.2.0)** — core rail.
- *Sellers:* `createGatewayMiddleware({ sellerAddress, facilitatorUrl: "https://gateway-api-testnet.circle.com" })`; routes priced per-call via `gateway.require(price)`; dynamic tiers via per-request price resolution; audit via `BeforeSettleHook`/`AfterSettleHook`.
- *Agent:* `x402Client` + `BatchEvmScheme(remoteSigner)` — NOT the turnkey `GatewayClient`, because our signer must live out-of-process (this is the architectural core; document prominently).
- *Config from code, not hardcoding:* `CHAIN_CONFIGS["arcTestnet"]` → USDC `0x3600…0000`, GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, domain 26.
- *Receipts:* `pay()` returns transfer UUID → `getTransferById`; dashboard feed via `searchTransfers({from: agentAddress})`.
- *Gotcha handled:* EIP-3009 `validBefore` set ≥ 7 days (docs conflict 3d vs 7d — see FEEDBACK.md).

**Circle Wallets (developer-controlled, `@circle-fin/developer-controlled-wallets`)** — key custody.
- `createWallets({ accountType: "EOA", blockchains: ["ARC-TESTNET"] })` (Nanopayments requires EOA — ecrecover, no EIP-1271).
- SpendGuard signs via `circleDeveloperSdk.signTypedData({ walletId, data })` — pattern from Circle's arc-fintech sample (Gateway burn intents). The agent process has zero key material.

**Circle Gateway** — settlement + balance backend: agent deposit → Gateway balance; batched settle of x402 authorizations; `getBalances()` for the dashboard treasury card.

**USDC on Arc** — settlement asset AND gas (native token, 18-decimal gas / 6-decimal ERC-20 nuance documented); anchor-contract txs paid in USDC.

**CCTP / Bridge Kit** — architecture extension (diagrammed, P2 stretch F13): cross-chain budget top-up via Gateway crosschain `withdraw()`.

## 11. Delivery Plan (unchanged from Strategy v5)

Day 0: verify-day0 E2E or reconvene on Track 2 · Day 1: signer service + DCW signing verification + 1 seller · Day 2: policy engine + 3 competing sellers w/ dynamic tiers · Day 3: approval queue + agent loop + renewal/re-shop · Day 4: dashboard + anchor contract · Day 5: docs, diagram, FEEDBACK.md, stretch · Day 6: deploy, video, submit mid-day.

## 12. Circle Product Feedback (pre-seeded — expand during build)

1. Nanopayments is EOA-only (ecrecover); SCA/EIP-1271 unsupported — document more prominently
2. Signature validity contradiction: seller quickstart says ≥7 days, SDK error table says ≥3 days (`GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS` is unexported/undocumented)
3. USDC-as-gas on Arc simplifies faucet story — praise; but decimal duality (18 gas / 6 ERC-20) deserves a callout box
4. arc-escrow sample requires 5 external services to boot — samples need lighter reference paths
5. `X-ARC-PRIVATE-MAINNET-ENABLED` header exists in shipped types but not docs
6. x402 lifecycle-hook docs live on x402.org, not developers.circle.com — discoverability gap
7. arc-fintech ships broken npm script (`spend:gateway:arc` → missing file)

## 13. Risks & Mitigations

| Risk | L×I | Mitigation |
|---|---|---|
| DCW `signTypedData` signature rejected by Gateway settle (untested combo) | M×M | Day 1 spike; fallback `SIGNER_FALLBACK_PRIVATE_KEY` (local EOA) — F8 degrades, F2–F7 unaffected |
| Quickstart doesn't run E2E (nothing executed yet — sandbox blocked npm/GitHub) | L×H | Day 0 kill criterion: one evening or reconvene on Track 2 |
| Renewal timing awkward in a 3-min video | M×L | Demo-compressed cron (minutes) + `seed-demo.ts` price-drift scenario |
| Approval-hold UX: agent request hangs while human decides | M×M | Async: signer returns `202 {holdId}`; agent polls; UI shows "awaiting approval" |
| Scope creep (ERC-8004/8183, Telegram, full negotiation) | H×M | Non-goals section; P2 gated on "only if ahead" |

## 14. Submission Checklist (from the brief, mapped)

- [ ] Title + short description → §2 one-liner
- [ ] Track: 4 — Agentic Economy
- [ ] Circle Developer Account email → **create Day 0**
- [ ] Products used: USDC ✓ Wallets ✓ Gateway ✓ Nanopayments ✓ (CCTP/Bridge Kit: architecture extension — only tick if F13 ships)
- [ ] Functional MVP (frontend + backend) → F1–F8
- [x] Architecture diagram → docs/architecture.png
- [ ] Video + presentation → docs/demo-script.md (4-beat arc)
- [x] GitHub repo w/ setup + Circle integration docs → §9 + §10 seed the README
- [x] Demo URL → Railway (all four services): https://autopilotdashboard-production.up.railway.app
- [x] "Circle Product Feedback" section → FEEDBACK.md (§12 seed)
