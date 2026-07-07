# Subscription Autopilot: Context for LLM Research

## Project Overview

**Subscription Autopilot** is an autonomous x402 (HTTP 402 Payment Required) payment agent running on Arc Testnet (Ethereum L2). It autonomously:
- Subscribes to recurring services (metered billing via x402)
- Makes nanopayments via USDC through SpendGuard (policy-gated signer)
- Re-shops services at renewal based on price/quality
- Demonstrates policy-enforced spend limits with proof of enforcement against prompt injection

**Day 0 Goal (COMPLETE):** E2E x402 payment flow working in one evening
**Day 1 Goal:** Circle DCW (Developer-Controlled Wallets) integration for keyless signing
**Day 4 Goal:** Arc anchor contract for policy anchoring

---

## Architecture

### Services (Monorepo)

```
subscription-autopilot/
├── packages/
│   ├── sellers/           # 3 mock FX rate services (ports 4001-4003)
│   ├── signer/            # SpendGuard: policy-gated payment authority (port 5001)
│   ├── agent/             # Autonomous spending agent (no exposed port)
│   ├── dashboard/         # Live ledger UI (port 3000, Next.js)
│   └── shared/            # Shared types & utilities
├── scripts/               # Utilities (generate-wallet, etc.)
└── .env                   # Environment config
```

### Data Flow

```
AGENT (autonomous) 
  → requests payment via SIGNER
    → SIGNER runs policy.ts evaluation
      → approve/deny/hold decision
        → if approved, executes x402 via GatewayClient
          → SELLERS receive USDC
            → SIGNER logs to ledger
              → DASHBOARD reads ledger in real-time
```

### Testnet Details
- **Blockchain:** Arc Testnet (eip155:5042002)
- **Token:** USDC (Circle stablecoin)
- **Gateway API:** https://gateway-api-testnet.circle.com
- **Faucet:** https://faucet.circle.com

---

## Environment Variables

### Master .env Template

```ini
# ─────────────────────────────────────────────────────────────────
# CIRCLE (Crypto payments provider)
# ─────────────────────────────────────────────────────────────────
CIRCLE_API_KEY=<YOUR_CIRCLE_API_KEY>
CIRCLE_ENTITY_SECRET=<YOUR_CIRCLE_ENTITY_SECRET>

# ─────────────────────────────────────────────────────────────────
# DAY-0 PATH: Local Signer (Autonomous)
# Fund this address via faucet.circle.com on Arc Testnet
# ─────────────────────────────────────────────────────────────────
SIGNER_MODE=circle                # LIVE default (keyless, Circle DCW). "local" = dev-only fallback.
SIGNER_FALLBACK_PRIVATE_KEY=0xREPLACE_WITH_YOUR_OWN_64_HEX_PRIVATE_KEY   # local mode only; unused in circle

# ─────────────────────────────────────────────────────────────────
# DAY-1 PATH: Circle DCW (Keyless signing)
# Generate via: npm run generate-wallet
# ─────────────────────────────────────────────────────────────────
AGENT_WALLET_ID=<GENERATED_BY_CIRCLE>
AGENT_WALLET_ADDRESS=<GENERATED_BY_CIRCLE>

# ─────────────────────────────────────────────────────────────────
# LLM Planning (Optional: agent can run deterministic without API)
# ─────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=<YOUR_ANTHROPIC_KEY>

# ─────────────────────────────────────────────────────────────────
# SELLERS (Service providers receiving payments)
# Any EVM addresses you control. Generated for demo:
# ─────────────────────────────────────────────────────────────────
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5

# ─────────────────────────────────────────────────────────────────
# NETWORK TOPOLOGY (Local Development)
# ─────────────────────────────────────────────────────────────────
SIGNER_PORT=5001
SIGNER_URL=http://localhost:5001
SELLER_PORT_A=4001
SELLER_PORT_B=4002
SELLER_PORT_C=4003
GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com

# ─────────────────────────────────────────────────────────────────
# POLICY DEFAULTS (SpendGuard: spending limits in decimal USDC)
# ─────────────────────────────────────────────────────────────────
POLICY_MONTHLY_BUDGET=10              # Max $10/month total
POLICY_PER_SERVICE_CAP=3              # Max $3/service/month
POLICY_PER_TX_MAX=0.05                # Max $0.05 per transaction
POLICY_APPROVAL_THRESHOLD=0.02        # Hold for approval if > $0.02
POLICY_DAILY_TX_MAX=500               # Max 500 tx/day (live production value)
APPROVAL_WAIT_MS=60000                # 60s timeout for human approval

# ─────────────────────────────────────────────────────────────────
# AGENT BEHAVIOR (Autonomous metering loop)
# ─────────────────────────────────────────────────────────────────
AGENT_TICK_MS=20000                   # Check every 20s
AGENT_CALLS_PER_TICK=3                # Make 3 calls per tick

# ─────────────────────────────────────────────────────────────────
# ARC ANCHORING (Day 4+: optional policy contract)
# ─────────────────────────────────────────────────────────────────
ANCHOR_CONTRACT_ADDRESS=              # Set after Day 4 contract deploy

# ─────────────────────────────────────────────────────────────────
# DASHBOARD (Next.js public env for client-side signer URL)
# ─────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SIGNER_URL=http://localhost:5001
```

---

## Railway Deployment (Current Status — verified live 2026-07-07)

**Public URLs (live):**
- Dashboard: https://autopilotdashboard-production.up.railway.app
- Signer API: https://autopilotsigner-production.up.railway.app

**Live metrics (from /summary):** 407 payments settled · 164 policy denials · 7 holds ·
spent 1.8372/10 USDC · gateway balance 11.0966 USDC · SpendAnchor `0xf550…b143`,
epoch `#1783413489` committed on-chain (Arc). Re-shop executed A → B (20% cheaper/call).

### Services Deployed

| Service | Status | URL | Role |
|---------|--------|-----|------|
| **signer** | ✅ Online | https://autopilotsigner-production.up.railway.app (public) · signer:5001 (internal) | Policy-gated payment authority |
| **dashboard** | ✅ Online | https://autopilotdashboard-production.up.railway.app | Live ledger viewer (populated) |
| **sellers** | ✅ Online | sellers.railway.internal:4001-4003 | Mock FX services |
| **agent** | ✅ Running | — (autonomous, no exposed port) | Metering + re-shop; feeding live ledger |

> **Note:** An earlier revision of this doc described the agent as "crashed" (ECONNREFUSED to
> sellers on Railway). That was resolved by wiring `SELLER_URL_*` to `sellers.railway.internal`
> private DNS. The end-to-end flow is now live on Railway.

### Railway Environment Variables (Per Service)

#### Signer (live = circle mode — no raw private key signs)
```
PORT=5001
SIGNER_MODE=circle
CIRCLE_API_KEY=<your Circle API key>
CIRCLE_ENTITY_SECRET=<your Circle entity secret>
AGENT_WALLET_ID=<your DCW wallet id>
SIGNER_DB=/data/spendguard.db
GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ANCHOR_CONTRACT_ADDRESS=0xf550a882da3c26fbacd1b68aa83867102206b143
# SIGNER_FALLBACK_PRIVATE_KEY = local-dev fallback only; unused in circle mode
```

#### Dashboard
```
SIGNER_INTERNAL_URL=http://signer.railway.internal:5001
```

#### Sellers
```
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5
DEMO_PRICE_DRIFT_A=1.6
DEMO_PRICE_DRIFT_B=0
DEMO_PRICE_DRIFT_C=0
```

#### Agent (Railway internal DNS)
```
SIGNER_URL=http://signer.railway.internal:5001
SELLER_URL_A=http://sellers.railway.internal:4001
SELLER_URL_B=http://sellers.railway.internal:4002
SELLER_URL_C=http://sellers.railway.internal:4003
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5
AGENT_TICK_MS=20000
AGENT_CALLS_PER_TICK=3
```
> Agent holds **zero key material** — it requests payments; only SpendGuard (circle mode) can sign.

---

## Day-0 Kill Criterion (COMPLETE ✅)

**Requirement:** x402 loop must work E2E in one evening

**Verification (scripts/verify-day0.sh):**
1. ✅ Unpaid request returns 402 + PAYMENT-REQUIRED header
2. ✅ Gateway deposit (1 USDC, one-time)
3. ✅ Policy-governed x402 payment via SpendGuard
4. ✅ Agent autonomously metered (73 payments in demo)
5. ✅ Renewal detection working (re-shopped at 18 calls)
6. ✅ Dashboard live ledger rendering

---

## Pending Work

### Day 1 (Circle DCW Integration) — COMPLETE ✅ (live on Railway, verified via /sign)
- [x] Get Circle API credentials (CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET)
- [x] Run `npm run generate-wallet` to create AGENT_WALLET_ID
- [x] Switch SIGNER_MODE=circle (live default; local remains a dev-only fallback)
- [x] Verify EIP-712 signature acceptance by Gateway
- [x] Deploy updated signer to Railway

### Day 2-3 (Polish)
- [x] Fix agent/sellers crash on Railway (resolved via railway.internal private DNS)
- [ ] Add healthchecks to Railway services
- [ ] Configure agent to run as Railway cron job or scheduled task
- [ ] Add dashboard error boundaries

### Day 4+ (Arc Anchoring)
- [ ] Deploy policy anchor contract to Arc
- [ ] Set ANCHOR_CONTRACT_ADDRESS
- [ ] Integrate contract verification into SpendGuard
- [ ] Record policy hash on-chain for audit

### Video/Demo
- [ ] Record full flow: agent subscribing → metering → renewal → policy block
- [ ] Publish to YouTube/demo site

---

## Known Issues

| Issue | Status | Fix |
|-------|--------|-----|
| Agent crashes on Railway (ECONNREFUSED to sellers) | ✅ Resolved | Wired agent to `sellers.railway.internal:4001-4003` private DNS; E2E now live on Railway (407 payments) |
| tsx process exits with force kill on Ctrl+C | Fixed | Added SIGINT handler in agent/src/index.ts |
| Dashboard CORS errors (port mismatch) | Fixed | Updated .env NEXT_PUBLIC_SIGNER_URL to 5001 |
| Circle wallet.ts import error | Fixed | Lazy-load CircleDeveloperControlledWalletsClient |
| Node 26 better-sqlite3 incompatibility | Fixed | Downgraded to Node 22 LTS |

---

## Key Files for Research

```
subscription-autopilot/
├── packages/agent/src/
│   ├── index.ts              # Main loop: subscribe → meter → renew
│   ├── reshop.ts             # Renewal logic: re-shop or stay
│   ├── signer-client.ts      # Pay via SpendGuard
│   └── policy.ts             # (TODO) Policy evaluation
├── packages/signer/src/
│   ├── index.ts              # Express server + SpendGuard logic
│   ├── circle-wallet.ts      # Day 1: Circle DCW signing
│   ├── store.ts              # Ledger & approval storage
│   └── policy.ts             # Policy evaluation & enforcement
├── packages/sellers/src/
│   └── all.ts                # 3 FX rate services
├── packages/dashboard/
│   ├── app/page.tsx          # Live ledger UI
│   └── lib/api.ts            # Fetch from signer
├── scripts/
│   └── verify-day0.sh        # Day 0 test suite
└── PRD.md                     # Full product requirements
```

---

## How to Use This Context

**For Research Agent (Notebook LLM):**
1. Understand the x402 payment flow and policy enforcement model
2. Research Circle DCW integration requirements (Day 1)
3. Identify missing environment variables or configuration
4. Suggest fixes for Railway service isolation (agent crash)
5. Plan Day 1-4 milestones with specific tasks

**For Development:**
1. Copy the .env template above and fill in your values
2. Run `npm install` → `npm run dev:sellers`, `dev:signer`, `dev:agent`
3. For Railway: add environment variables per table above, update start commands
4. Check verify-day0.sh for validation steps

---

## Quick Start (Local Dev)

```bash
# Setup
npm install
cp .env.example .env
# Edit .env with values above

# Terminal 1: Sellers
DEMO_PRICE_DRIFT_A=1.6 npm run dev:sellers

# Terminal 2: Signer
SIGNER_PORT=5001 npm run dev:signer

# Terminal 3: Agent
npm run dev:agent

# Terminal 4: Dashboard
npm run dev:dashboard
# Open http://localhost:3000
```

**Verify:**
```bash
scripts/verify-day0.sh
```

---

## Contact / Support

- **Hackathon:** IgniteChallenge
- **Dev:** Arjun (arjun.shine.1994@gmail.com)
- **Network:** Arc Testnet (eip155:5042002)
- **Framework:** Node.js (v22 LTS), Next.js, Express, Viem
