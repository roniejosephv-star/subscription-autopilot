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
