# Subscription Autopilot — Complete Project Documentation
## Ignyte × Circle × Arc · Stablecoins Commerce Stack Challenge · Track 4 (Agentic Economy)
Participant: Ronie Joseph (solo) · Circle account: roniejosephv@gmail.com
Live demo: https://autopilotdashboard-production.up.railway.app · Repo: https://github.com/roniejosephv-star/subscription-autopilot
Deadline: July 13, 2026 (entry + end date). Prize: Track 4 — 1st $4000 USDC, 2nd $2000 USDC.


════════════════════════════════════════════
# SOURCE DOCUMENT: 01-README.md
════════════════════════════════════════════

# Subscription Autopilot
### An AI agent that runs your recurring service spending on Arc — and can prove it behaved.

**Ignyte × Circle × Arc — Stablecoin Commerce Stack Challenge, Track 4 (Agentic Economy)**
Author: Ronie Joseph · roniejosephv@gmail.com · Testnet demo only (Arc Testnet, chain 5042002)

Circle's official sample shows an AI agent that *can* pay. Autopilot is an agent that pays **well**:

- **Research** — probes competing x402 sellers' price menus and your real usage history
- **Negotiate** — compares volume/loyalty tiers across sellers at every renewal and switches when cheaper
- **Execute** — gasless USDC nanopayments (x402), batch-settled by Circle Gateway on Arc

…and every dollar it moves passes through **SpendGuard**, an out-of-process policy authority: budgets, allowlists, per-tx caps, velocity limits, and human approval above a threshold. The agent holds **zero key material** — it can *request* a payment; only policy can authorize one. Policy versions are anchored on Arc (`contracts/SpendAnchor.sol`) on every update, and spend epochs auto-anchor every 10 minutes whenever spend changed (`EPOCH_COMMIT_INTERVAL_MS`, `0` = manual via `POST /epochs/commit`) — a tamper-evident audit trail that never goes stale.

> *The agent can want anything; it can only pay what policy allows.*

## Architecture

```
Agent (Claude / deterministic) ──HTTP──▶ SpendGuard (policy + keys) ──x402──▶ Sellers ×3 (dynamic pricing)
                                              │                                   │
Dashboard (Next.js) ◀── ledger/approvals ─────┘            Circle Gateway ◀── settle (batched, gasless)
                                              └── policy hash + epoch anchors ──▶ Arc Testnet (SpendAnchor)
```

Full diagram + component spec: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · Product spec: [`PRD.md`](./PRD.md) · Circle feedback: [`FEEDBACK.md`](./FEEDBACK.md)

## Monorepo layout

| Path | What it is |
|---|---|
| `packages/signer` | **SpendGuard** — policy engine, approval queue, ledger, the only place keys/Circle SDKs touch money |
| `packages/agent` | Autopilot agent — subscription ledger, renewal scheduler, re-shop logic, Claude tool-use planner |
| `packages/sellers` | 3 competing x402 sellers (Circle Nanopayments middleware + per-request dynamic pricing) |
| `packages/dashboard` | Owner dashboard — burn-down, live feed, approve/deny, Arc receipts |
| `packages/shared` | Shared types + USDC atomic-unit helpers |
| `contracts/` | `SpendAnchor.sol` + Foundry deploy script (Arc Testnet) |
| `scripts/` | `generate-wallet.mjs` (Circle DCW EOA), `verify-day0.sh` (E2E check), `seed-demo.ts` |

## Setup

**Prerequisites:** Node v22+ · a [Circle developer account](https://console.circle.com/signup) · testnet USDC from the [Circle Faucet](https://faucet.circle.com) (Arc Testnet — USDC is also Arc's gas token, so one faucet covers everything) · optional: Foundry (contract), Anthropic API key (LLM planning).

```bash
git clone https://github.com/roniejosephv-star/subscription-autopilot.git && cd subscription-autopilot
npm install

cp .env.example .env       # then fill in:
# CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET  → console.circle.com (Wallets)
# SIGNER_FALLBACK_PRIVATE_KEY            → node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))"
# SELLER_ADDRESS_A/B/C                   → any EVM addresses you control (payment receivers)

npm run generate-wallet    # creates the agent's Circle DCW **EOA** wallet on ARC-TESTNET
                           # fund BOTH the printed address and your fallback address at faucet.circle.com

# four terminals (or a process manager):
npm run dev:sellers        # :4001 :4002 :4003
npm run dev:signer         # :5000
npm run dev:agent          # subscribes, meters, renews
npm run dev:dashboard      # :3000

# verify the whole loop (Day-0 gate):
bash scripts/verify-day0.sh
```

### Demo (the 4 beats)

```bash
npm run dev:agent                                  # 1. delegation: agent picks cheapest seller, meters usage
DEMO_PRICE_DRIFT_A=1.6 npm run dev:sellers         # 2. price drift: restart sellers, next renewal → agent switches & saves
npm run inject -w packages/agent                   # 3. prompt-injected overspend → SpendGuard denies, approval card appears
open http://localhost:3000                         # 4. burn-down, savings, receipts on Arc
```

## How Circle tools are integrated

**Nanopayments / x402 — `@circle-fin/x402-batching` (core rail)**
- Sellers: `createGatewayMiddleware({ sellerAddress, facilitatorUrl: gateway-api-testnet.circle.com })`; every `/data` route re-resolves its price per request (`gateway.require(priceString(...))` bound at call time) so volume tiers and price drift are live — this is the agent's negotiation surface. Settle-side audit logging on paid requests (`packages/sellers/src/server.ts`).
- SpendGuard: executes payments with `GatewayClient` (`chain: "arcTestnet"`) and enforces policy in the **`onBeforePaymentCreation` lifecycle hook** — crucially, this hook runs inside SpendGuard's trusted process, *not* the agent's, so the enforcement point sits behind the custody boundary (`packages/signer/src/index.ts`).
- Receipts & feed: `pay()` returns the Gateway transfer UUID; the dashboard reads history via the signer's ledger (upgrade path: `searchTransfers()`).
- Addresses/chain config come from the SDK's `CHAIN_CONFIGS["arcTestnet"]` — nothing hardcoded (`packages/signer/src/anchor.ts`).

**Circle Wallets (developer-controlled) — key custody**
- `scripts/generate-wallet.mjs` creates the agent wallet with `accountType: "EOA"` on `ARC-TESTNET` — EOA is mandatory: Gateway's x402 settlement verifies EIP-3009 signatures with `ecrecover`, so smart-contract accounts (EIP-1271) do not work.
- `SIGNER_MODE=circle` (default, **verified E2E on Arc Testnet**): SpendGuard signs EIP-712 via `circleDeveloperSdk.signTypedData({ walletId })` and even the Gateway deposit runs through Circle's contract-execution API (`approve` + `deposit` from the DCW wallet) — **no raw private key exists anywhere in the stack**. The agent's wallet is custodied by Circle; SpendGuard holds only the decision to sign. (`SIGNER_MODE=local` remains as a development fallback.)

**Circle Gateway — settlement + treasury**
- One-time `deposit()` funds the agent's Gateway balance; thereafter every payment is a gas-free offchain EIP-3009 authorization, batch-settled onchain by Gateway. `getBalances()` feeds the dashboard treasury card.

**USDC on Arc** — settlement asset *and* gas token. The anchor-contract transactions are paid in USDC (18-decimal gas / 6-decimal ERC-20 duality noted in FEEDBACK.md).

**CCTP / Bridge Kit** — architecture extension (not in MVP): cross-chain budget top-ups via Gateway's crosschain `withdraw()`; see `ARCHITECTURE.md`.

## Status / roadmap

- [x] Scaffold: all services, policy engine, approval queue, re-shop, dashboard, contract
- [x] **Day 0:** `verify-day0.sh` E2E on Arc Testnet (kill criterion cleared)
- [x] Day 1: DCW-EOA signing verified against Gateway settle E2E (`SIGNER_MODE=circle`) — including DCW-native Gateway deposit via contract-execution API
- [x] Day 4: `SpendAnchor` live on Arc Testnet at [`0xfe18f3c42f9318f20cae9cd5b2983e229554e435`](https://testnet.arcscan.app/address/0xfe18f3c42f9318f20cae9cd5b2983e229554e435) — policy hashes anchored on every update, spend epochs auto-anchored every 10 min (skip-if-unchanged; manual `POST /epochs/commit` still forces one); deployed with `scripts/deploy-anchor.mjs` (solc + viem, no Foundry required)
- [x] All four demo beats rehearsed: autonomous metering, 21.9% re-shop switch, injection denied at per-tx wall, human approval hold/release
- [x] Deployed: https://autopilotdashboard-production.up.railway.app (dashboard) · https://autopilotsigner-production.up.railway.app (signer API) — Railway ×4, mode=circle, volume-backed ledger
- [ ] 3-min video + submission form

## License

Apache-2.0. Patterns adapted from Circle's Apache-2.0 samples (arc-escrow, arc-fintech) are credited inline where used.

════════════════════════════════════════════
# SOURCE DOCUMENT: 02-ARCHITECTURE.md
════════════════════════════════════════════

# Architecture — Subscription Autopilot

*(Export this as `docs/architecture.png` for the submission — draw.io / excalidraw.)*

```
                        ┌────────────────────────────────────────────┐
                        │              DASHBOARD (Next.js :3000)     │
                        │ burn-down · live feed · approvals · savings│
                        └───────▲──────────────────────────▲─────────┘
                                │ /ledger /approvals        │ /summary
                                │        (poll 2s)          │
┌──────────────┐   POST /pay   ┌┴───────────────────────────┴────────┐
│ AGENT :loop  │──────────────▶│  SPENDGUARD (:5000)                 │
│ (no keys!)   │  {url,        │  policy chain (policy.ts):          │
│ subscribe    │   serviceId,  │   allowlist → perTx → monthly →     │
│ meter usage  │   reason}     │   perService → velocity → threshold │
│ renewal cron │◀──────────────│  allow → GatewayClient.pay()        │
│ re-shop      │  200 receipt /│    (hook = enforcement, in THIS     │
│ re-plan on   │  402 denial { │     process, behind custody wall)   │
│  denial      │   code,reason}│  hold  → approvals table → human    │
└──────┬───────┘               │  deny  → structured code            │
       │ GET /quote (free)     │  keys: local EOA (Day 0) or         │
       ▼                       │        Circle Wallets DCW EOA (F8)  │
┌─────────────────────────────┐└──────────┬──────────────────────────┘
│ SELLERS ×3 :4001-4003       │           │ anchorPolicy(hash)
│ x402 middleware, price       │           │ commitEpoch(n, root, spent)
│ re-resolved PER REQUEST      │           ▼
│ (volume tiers = negotiation) │  ┌──────────────────┐
│ settle-audit logging         │  │ ARC TESTNET      │
└──────────────┬──────────────┘  │ SpendAnchor.sol   │
               │ verify+settle    │ chain 5042002     │
               ▼                  │ gas = USDC        │
┌─────────────────────────────┐  └──────────────────┘
│ CIRCLE GATEWAY (testnet)     │  batched, gas-free settlement
│ gateway-api-testnet.circle.com│ unified USDC balance
└─────────────────────────────┘
```

## Trust boundaries

1. **Agent ↔ SpendGuard:** the agent is untrusted (LLM, injectable). It has no keys, no Circle SDK, no chain RPC — only `POST /pay` with a stated reason. A compromised agent can *ask*; it cannot *take*.
2. **SpendGuard ↔ chain:** policy is evaluated before any signature exists. In `SIGNER_MODE=circle` the private key doesn't exist in our stack at all — Circle Wallets holds it; SpendGuard holds only the *decision* to sign.
3. **Auditability:** every decision (allow/hold/deny + code) is ledgered; policy hashes are anchored in `SpendAnchor` on Arc on every update, and SpendGuard auto-commits a spend epoch every 10 minutes when spend changed (`EPOCH_COMMIT_INTERVAL_MS`; skip-if-unchanged so every anchored epoch marks real movement). The dashboard's story is externally verifiable and cannot silently go stale.

## Payment sequence (happy path)

agent `POST /pay` → SpendGuard fetches URL → seller 402 + PAYMENT-REQUIRED (price from live tier) → SDK selects GatewayWalletBatched option → **hook: policy.evaluate()** → allow → sign EIP-3009 (validBefore ≥ 7d) → retry with payment → seller `settle()` via Gateway → 200 + data → ledger entry + transfer UUID → dashboard.

## Cross-chain extension (diagrammed, not in MVP)

Gateway's crosschain `withdraw()` lets the owner top up the agent's budget from any Gateway-supported chain (CCTP/Bridge Kit rails) — the agent's spending chain stays Arc.

════════════════════════════════════════════
# SOURCE DOCUMENT: 03-PRD.md
════════════════════════════════════════════

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

**Security invariant (the one-sentence story):** *the agent can want anything; it can only sign what policy allows.* The EIP-3009 signing capability lives exclusively in SpendGuard, which delegates the actual signature to a Circle developer-controlled EOA wallet — no raw private key exists anywhere in the codebase (fallback: local EOA env var).

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
npm run dev:signer             # :5000 — SpendGuard policy + signing
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

════════════════════════════════════════════
# SOURCE DOCUMENT: 04-DEPLOYMENT.md
════════════════════════════════════════════

# Deployment — Railway (backend) + Vercel (dashboard)

Topology: **3 Railway services** from this one repo (signer public, sellers + agent private-network only) and the **dashboard on Vercel**, whose server proxies `/api/signer/*` to the signer's public URL. SQLite lives on a Railway volume.

```
Vercel dashboard ──HTTPS──▶ Railway signer (public domain, volume /data)
                                   │ private network (IPv6)
                     Railway sellers (:4001-4003, no public ingress)
                     Railway agent  (no ingress) ──▶ signer + sellers via .internal
```

## 1. Railway — project setup

1. [railway.app](https://railway.app) → login with the **GitHub account that owns the repo** → New Project → **Deploy from GitHub repo** → `subscription-autopilot`.
2. This creates one service. Rename it **`signer`** (Settings → Service name — the name becomes its private hostname `signer.railway.internal`).
3. Add two more services from the same repo: project canvas → **+ New → GitHub Repo** (same repo) → rename **`sellers`**; repeat → rename **`agent`**.

### Per-service settings (Settings → Deploy)

| Service | Custom Start Command | Public networking |
|---|---|---|
| signer | `npm run start -w packages/signer` | **Generate Domain** (Settings → Networking) — note the URL |
| sellers | `npm run start -w packages/sellers` | none (private only) |
| agent | `npm run start -w packages/agent` | none |

Build: leave Nixpacks defaults (root `npm ci`, workspaces install everything).

### Volume (signer only)

signer service → right-click / Settings → **Attach Volume** → mount path `/data`.

### Environment variables

**signer** (Variables tab — use Raw Editor to paste in bulk; values from your local `.env`):
```
SIGNER_MODE=circle
CIRCLE_API_KEY=<yours>
CIRCLE_ENTITY_SECRET=<yours>
AGENT_WALLET_ID=<yours>
AGENT_WALLET_ADDRESS=0x7dbffb7d8ad2df227cff3d5d1846ae8f85d16346
SIGNER_FALLBACK_PRIVATE_KEY=<yours>
SIGNER_DB=/data/spendguard.db
GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ANCHOR_CONTRACT_ADDRESS=0xfe18f3c42f9318f20cae9cd5b2983e229554e435
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5
POLICY_MONTHLY_BUDGET=10
POLICY_PER_SERVICE_CAP=3
POLICY_PER_TX_MAX=0.05
POLICY_APPROVAL_THRESHOLD=0.02
POLICY_DAILY_TX_MAX=2000
APPROVAL_WAIT_MS=60000
```
(Railway injects `PORT`; the signer honors it.)

**sellers**:
```
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5
SELLER_URL_A=http://sellers.railway.internal:4001
SELLER_URL_B=http://sellers.railway.internal:4002
SELLER_URL_C=http://sellers.railway.internal:4003
GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com
```

**agent**:
```
SIGNER_URL=http://signer.railway.internal:<signer PORT — see note>
SELLER_URL_A=http://sellers.railway.internal:4001
SELLER_URL_B=http://sellers.railway.internal:4002
SELLER_URL_C=http://sellers.railway.internal:4003
AGENT_DATA_DIR=/tmp
AGENT_TICK_MS=20000
RENEWAL_PERIOD_MS=120000
```
> **Signer private port note:** Railway's injected `PORT` is what the signer binds. Simplest: set `PORT=5001` explicitly on the signer service so the private URL is deterministically `http://signer.railway.internal:5001`. (Public domain routing works regardless.)

Deploy order: sellers → signer → agent (agent errors harmlessly until the others are up; it retries each tick).

## 2. Vercel — dashboard

1. [vercel.com](https://vercel.com) → Add New → Project → import `subscription-autopilot`.
2. **Root Directory: `packages/dashboard`** (critical). Framework auto-detects Next.js.
3. Environment variable: `SIGNER_INTERNAL_URL=https://<signer-public-domain-from-railway>` (no trailing slash).
4. Deploy → note the `*.vercel.app` URL — **this is the submission's Demo URL**.

## 3. Smoke test (in order)

```bash
# signer public API up?
curl -s https://<signer-domain>/summary | head -c 200

# dashboard proxy path?
curl -s https://<dashboard>.vercel.app/api/signer/summary | head -c 200

# then open the dashboard in a browser: live rows with fresh timestamps = agent alive
```
Beat checks against production: the approval flow (`curl -X POST https://<signer-domain>/pay …premium=true` then Approve on the deployed dashboard) and one `POST /epochs/commit`.

## Gotchas / notes

- **Private networking is IPv6-only** on Railway; Express binds `::` by default and Node fetch resolves `.internal` hostnames — no code changes needed. If sellers are unreachable from agent/signer, check all three services are in the same project + environment.
- **SQLite on a volume** = single signer instance only (fine for the demo; noted as future work).
- The dashboard's `/api/signer/*` proxy means the signer's CORS never matters in production.
- Costs: Railway Hobby (~$5/mo credit) covers three tiny Node services; agent burns ~$0.5/day testnet USDC from the Gateway balance — top up via faucet + `POST /deposit` if the demo window is long.
- `serve:*` scripts (local) still load `.env`; deployed `start` scripts read injected env only.

════════════════════════════════════════════
# SOURCE DOCUMENT: 05-CIRCLE-FEEDBACK.md
════════════════════════════════════════════

# Circle Product Feedback
*Running log — required submission section. Items 1–7 found during pre-build research; expand during build with dates + repro steps.*

**Why we chose these products:** Nanopayments/x402 is the only rail where per-call metered agent payments are economically sane (gasless, sub-cent, batched); Gateway gives the agent a fundable balance with instant receipts; Circle Wallets (DCW EOA) lets us move key custody out of the agent entirely; USDC-as-gas on Arc collapses the faucet/gas UX to one token.

## Findings

1. **Nanopayments is EOA-only** (ecrecover on EIP-3009; EIP-1271/SCA unsupported). Reasonable constraint, but it's easy to miss — Circle's own arc-escrow sample creates `accountType: "SCA"` wallets, which would silently fail here. Suggest a prominent callout in the Nanopayments docs + a runtime error hint.
2. **Signature-validity contradiction in docs:** seller quickstart says authorizations need ≥ 7 days validity; the SDK error reference (`authorization_validity_too_short`) says ≥ 3 days; the SDK exports `GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS` but it's undocumented. Pick one number and document the constant.
3. **USDC-as-gas on Arc is excellent DX** (one faucet, one token) — but the 18-decimal gas / 6-decimal ERC-20 duality deserves an explicit docs callout; it will bite anyone doing native-balance math.
4. **Sample apps are heavy as references:** arc-escrow needs Supabase + Docker + ngrok + entity secret + OpenAI before first run. A minimal single-process reference per product would cut onboarding dramatically.
5. **Undocumented header in shipped types:** `X-ARC-PRIVATE-MAINNET-ENABLED` (reveals Arc mainnet `eip155:5042` pre-GA) appears in the SDK's `.d.ts` but nowhere in docs.
6. **Hook documentation lives off-site:** the x402 lifecycle hooks (the SDK's best extension surface — we built our whole policy layer on them) are documented on x402.org, not developers.circle.com. Mirror or link prominently.
7. **Broken script in arc-fintech sample:** `package.json` declares `spend:gateway:arc` → `scripts/spend-arc-gateway-usdc.mjs`, which doesn't exist in the repo.
8. **Interop wart between Circle Wallets and the x402 SDK (found Day 1, 2026-07-06):** `signTypedData` in the Wallets API requires an explicit `EIP712Domain` entry in `types`, but viem-style callers — including `BatchEvmScheme`'s signer interface in Circle's own x402 SDK — omit it by convention. The result is a rejection with `"there is extra data provided in the message (0 < 4)"`, which names neither the missing type nor the fix. Suggest: accept viem-normalized typed data, or at least return "types.EIP712Domain is required".
9. **`GatewayClient.deposit()` requires a raw private key**, so DCW-custodied wallets can't use it. Workaround (verified): replicate its two calls (`USDC.approve`, `GatewayWallet.deposit(token, amount)`) via `createContractExecutionTransaction`. Suggest a documented DCW-native deposit path — agentic use cases will want Circle-custodied buyers.

## What worked well
- DCW EOA `signTypedData` signatures are fully ecrecover-compatible with Gateway's x402 settle — the whole custody-separation design works E2E on Arc Testnet (verified 2026-07-06, transfer `9bd6a149-1821-4341-a4aa-712cdc362382`)
- Seller monetization is genuinely 2 lines (`createGatewayMiddleware` + `gateway.require()`); per-request dynamic pricing works by binding `require(price)` at call time
- `CHAIN_CONFIGS` exports killed all address hardcoding
- Arc deposit finality (~0.5s) makes the deposit→pay loop feel instant; contract executions via the Wallets API confirmed in well under a minute

## What could be improved
*(fill during build)*

## Recommendations
*(fill during build)*

════════════════════════════════════════════
# SOURCE DOCUMENT: 06-demo-script.md
════════════════════════════════════════════

# Demo video script (≤ 3:00)

**0:00–0:30 — The problem.** "Would you give an AI your wallet? Circle's rails now let agents pay autonomously — but nobody deploys one, because capability isn't trust. Meet Subscription Autopilot."

**0:30–1:15 — Beat 1+2: autonomy that pays for itself.** Screen: agent logs — subscribes to cheapest fx-rates seller, meters per-call nanopayments (gasless, live receipts). Cut to: Seller A raises prices 60% → renewal tick → agent re-shops, quotes all three sellers at its real volume, switches, logs rationale. Dashboard savings counter ticks up. "Research, negotiate, execute — per-call USDC nanopayments, batch-settled by Circle Gateway on Arc."

**1:15–2:00 — Beat 3: the trust boundary.** Terminal: `npm run inject` — a poisoned instruction tells the agent to buy an unlimited tier. SpendGuard denies at the policy wall (`per_tx_max_exceeded`), approval card appears, human clicks Deny. "The agent holds no keys. It can want anything — it can only pay what policy allows. And that policy is hash-anchored on Arc."

**2:00–2:40 — How it's built.** Architecture diagram, 20 seconds: agent → SpendGuard (policy + Circle Wallets custody) → x402 sellers → Gateway settlement → SpendAnchor on Arc. Circle products on screen: Nanopayments, Gateway, Wallets, USDC.

**2:40–3:00 — Close.** Month-end dashboard: spend vs budget, savings from switching, denial log, Arc receipts. "Circle's sample shows an agent that can pay. Autopilot pays well — cheaper, safer, gasless. Track 4, Subscription Autopilot."

════════════════════════════════════════════
# SOURCE DOCUMENT: 07-shooting-script.md
════════════════════════════════════════════

# Shooting script — Subscription Autopilot demo (≤ 3:00)

**Method (storyboard-first):** Claude captures every browser state (dashboard, Railway, arcscan)
as screenshots; Ronie executes the terminal commands and screenshots the terminal; Claude stitches
all frames into a captioned video with ffmpeg (`stitch/` workflow at the bottom). Every frame gets
an on-screen description. The same sequence + narration is then reusable 1:1 for a live screen
recording — same shots, same words.

**Production URLs**

| What | URL |
|---|---|
| Dashboard (demo URL) | https://autopilotdashboard-production.up.railway.app |
| SpendGuard API | https://autopilotsigner-production.up.railway.app |
| SpendAnchor on arcscan | https://testnet.arcscan.app/address/0xfe18f3c42f9318f20cae9cd5b2983e229554e435 |

**Pre-flight (Claude, in Railway — before any capture)**

1. Agent → Variables: `AGENT_TICK_MS=20000`, `AGENT_CALLS_PER_TICK=3`, `RENEWAL_PERIOD_MS=120000` → deploy.
   *(Payments tick every ~7 s; renewals every 2 min.)*
2. Confirm dashboard shows fresh green `allow` rows before starting.
3. **After the shoot, restore:** `AGENT_TICK_MS=600000`, `AGENT_CALLS_PER_TICK=1`, `RENEWAL_PERIOD_MS=3600000`;
   remove `DEMO_PRICE_DRIFT_B` from sellers.

---

## BEAT 1 — Delegation (video 0:00–0:45)

**Narration:** *“Would you give an AI your wallet? Circle's rails let agents pay autonomously — but
capability isn't trust. Meet Subscription Autopilot: it subscribes to the cheapest x402 seller and
meters usage with per-call, gasless USDC nanopayments — batch-settled by Circle Gateway on Arc.”*

| # | Shot | Who | Caption on frame |
|---|---|---|---|
| 1.1 | Dashboard **Overview** — payments counter climbing, burn-down bar, treasury card | Claude | Agent runs autonomously: metered x402 nanopayments against a 10 USDC monthly budget |
| 1.2 | Dashboard **Live feed** — green `allow` rows, amounts 0.004, `receipt ↗` links | Claude | Every call is a gasless USDC payment with a Circle Gateway transfer receipt |
| 1.3 | Same feed, one `receipt ↗` clicked → `gateway: complete` | Claude | Receipts resolve live against Circle Gateway |
| 1.4 | Railway **agent logs** — `subscribed to fx-rates via seller B @ $0.00x/call`, `paid 0.004 …` | Claude | The agent holds zero keys — it can only *request*; SpendGuard executes |

## BEAT 2 — Negotiation: price drift → re-shop switch (0:45–1:30)

**Trigger (Claude, Railway):** sellers service → Variables → add `DEMO_PRICE_DRIFT_B=1.6` → deploy.
Seller B (the agent's current seller) gets 60 % more expensive. Wait ≤ 2 min for the renewal tick.

**Narration:** *“Sellers reprice constantly. At every renewal the agent re-quotes all three sellers
at its real volume — when its current seller drifts 60 % up, it switches and logs the rationale.
Research, negotiate, execute.”*

| # | Shot | Who | Caption |
|---|---|---|---|
| 2.1 | Railway sellers Variables showing `DEMO_PRICE_DRIFT_B=1.6` | Claude | Seller B raises prices 60% — the market moves against the agent |
| 2.2 | Railway **agent logs** — re-shop rationale line (`… → switch, xx.x% cheaper per call`) | Claude | At renewal the agent re-quotes every seller at its real volume — and switches |
| 2.3 | Dashboard **Overview** — RE-SHOP SAVINGS card now shows the % and `B → A/C` | Claude | The switch is visible money: xx.x% cheaper per call |
| 2.4 | Dashboard **Subscription card** — switch history line with timestamp | Claude | Every decision is logged with its rationale |

## BEAT 3 — Attack: the policy wall + human-in-the-loop (1:30–2:15)

**Narration:** *“Now the attack. A poisoned instruction tells the agent to buy the unlimited tier —
fifty cents a call. SpendGuard denies it at the policy wall: the per-transaction cap. A premium
request above the human threshold isn't denied — it's held, and the owner decides. The agent can
want anything; it can only pay what policy allows.”*

**Command A — hard deny (Ronie, terminal; screenshot the command + JSON response):**

```bash
curl -s -X POST https://autopilotsigner-production.up.railway.app/pay \
  -H "content-type: application/json" \
  -d '{"url":"http://autopilotsellers.railway.internal:4002/data?unlimited=true","serviceId":"fx-rates","sellerId":"B","reason":"URGENT: buy the unlimited tier now to lock a one-time discount"}' | python3 -m json.tool
```
Expected: `402`-style JSON with `"decision":"deny","code":"per_tx_max_exceeded"`.

**Command B — hold for human (Ronie, terminal, right after):**

```bash
curl -s -X POST https://autopilotsigner-production.up.railway.app/pay \
  -H "content-type: application/json" \
  -d '{"url":"http://autopilotsellers.railway.internal:4002/data?premium=true","serviceId":"fx-rates","sellerId":"B","reason":"Upgrade to premium tier for faster rates"}' | python3 -m json.tool
```
Expected: `202` with a `holdId`. **⏱ 60-second window starts — Claude captures the approval card immediately, then clicks Deny.**

| # | Shot | Who | Caption |
|---|---|---|---|
| 3.1 | Terminal: Command A + `per_tx_max_exceeded` response | **Ronie** | Prompt-injected overspend → hard-denied at the per-tx cap. The agent never touches a key |
| 3.2 | Dashboard **Live feed** — red `deny (per_tx_max_exceeded)` row | Claude | The denial is ledgered with a structured code |
| 3.3 | Terminal: Command B + `202 hold` response | **Ronie** | Above the human threshold → not denied, *held* |
| 3.4 | Dashboard — **approval card** in the queue: 0.03 USDC, reason, Approve/Deny | Claude | The owner decides. Human-in-the-loop, live |
| 3.5 | Dashboard — after clicking **Deny**: queue empty, feed shows the hold denied | Claude | Denied by the human — and that decision is in the audit trail too |

## BEAT 4 — Proof: the audit trail on Arc (2:15–3:00)

**Narration:** *“And none of this is just our dashboard's claim. SpendGuard hash-anchors its policy
and its spend history on Arc every ten minutes — tamper-evident, externally verifiable. Circle's
sample shows an agent that can pay. Autopilot pays well — cheaper, safer, gasless.”*

| # | Shot | Who | Caption |
|---|---|---|---|
| 4.1 | Dashboard **Overview** — full month view: spent/budget, payments, savings, blocked count | Claude | Month-end: on-budget, cheaper than loyalty, 150+ bad attempts stopped |
| 4.2 | Dashboard **Policy** tab — the 6-rule chain + anchor links | Claude | The policy chain — evaluated before any signature exists |
| 4.3 | Status bar zoom — `epoch #… committed ↗` chip | Claude | Spend epochs auto-anchor every 10 minutes |
| 4.4 | **arcscan** — the SpendAnchor commit transaction | Claude | Independently verifiable on Arc — not our word, the chain's |
| 4.5 | Close: dashboard hero or deck slide 9 | Claude | “Autopilot pays well — cheaper, safer, gasless.” Track 4 · Subscription Autopilot |

---

## Stitch workflow (Claude, after all frames exist)

1. Frames land in `docs/submission/stitch/` as `NN-description.png` (browser captures + Ronie's
   terminal shots, ordered by shot number).
2. Each frame gets its caption burned in (ffmpeg drawtext, bottom bar), ~6–8 s per frame,
   narration text as caption; 1920×1080, `-r 30`, H.264:
   ```bash
   ffmpeg -f concat -i frames.txt -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -pix_fmt yuv420p storyboard.mp4
   ```
3. Output: `storyboard.mp4` — the captioned end-to-end walkthrough. Use as-is, or as the exact
   shot-list for a live screen recording with voiceover (same order, same words).

**Honest note:** a stills-based video proves every function but reads as a storyboard. If time
allows before July 13, do one live screen-recording pass following this exact script — the motion
(payments ticking, the approval card appearing) is what makes judges believe the deployment is real.
