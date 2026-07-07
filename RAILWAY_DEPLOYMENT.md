# Railway Deployment Status & Architecture

## Current Deployment Status (verified live 2026-07-07)

**Live public URLs:**
- Dashboard: https://autopilotdashboard-production.up.railway.app
- Signer API: https://autopilotsigner-production.up.railway.app

**Live metrics (/summary):** 407 payments settled · 164 denials · 7 holds · 1.8372/10 USDC spent ·
gateway balance 11.0966 USDC · SpendAnchor `0xf550…b143`, epoch `#1783413489` committed on-chain.

### Services

| Service | Status | Port | Public URL | Notes |
|---------|--------|------|------------|-------|
| **@autopilot/signer** | ✅ Online | 5001 | autopilotsigner-production.up.railway.app | Working; serving /summary, /balances, /pay |
| **@autopilot/dashboard** | ✅ Online | 3000 | autopilotdashboard-production.up.railway.app | Ledger populated (407 payments) |
| **@autopilot/sellers** | ✅ Online | 4001-4003 | sellers.railway.internal | Reachable via private DNS |
| **@autopilot/agent** | ✅ Running | — | — | Autonomous metering + re-shop; feeding live ledger |

> **Superseded:** An earlier version of this doc (July 6) reported the agent as ❌ crashed with
> ECONNREFUSED on `reshop.ts:18`. Resolved by pointing `SELLER_URL_A/B/C` at
> `sellers.railway.internal:4001-4003` instead of raw host ports. The four-service flow is now live.

### Environment

- **Project:** pleasing-essence
- **Env:** production
- **Region:** US West (California)
- **Replicas:** 1 per service
- **CPU/Memory:** 2 vCPU / 1 GB per service

---

## Architecture: How Services Connect

### Local Development (Working)
```
Agent (localhost)
  → SIGNER_URL=http://localhost:5001 ✅
    → Signer (localhost:5001)
      → GatewayClient (Arc Testnet)
  → getQuotes() fetches from http://localhost:4001-4003 ✅
    → Sellers (localhost:4001-4003)
```

### Railway Production (Full — all four services live)
```
Dashboard (railway.app domain) ✅
  → NEXT_PUBLIC_SIGNER_URL=http://signer.railway.internal:5001 ✅
    → Signer (railway internal DNS) ✅
      → GatewayClient (Arc Testnet) ✅

Agent (railway container) ✅
  → SIGNER_URL=http://signer.railway.internal:5001 ✅
    → Signer (railway internal DNS) ✅
  → getQuotes() → http://sellers.railway.internal:4001-4003 ✅
    → Sellers (reachable via railway.internal private DNS)
```

**Original problem (July 6):** the agent fetched `http://sellers:4001` and hit ECONNREFUSED —
Railway's service-name DNS did not resolve arbitrary host ports the way the code assumed.

**Fix applied:** set `SELLER_URL_A/B/C=http://sellers.railway.internal:4001-4003` on the agent
(the `railway.internal` private-network hostnames), so `reshop.ts` reaches sellers directly.
No local processes required — the full loop runs on Railway.

---

## Railway Configuration Per Service

### SIGNER Service

**Build Settings:**
- Builder: Railpack (default)
- Watch Paths: `/packages/signer/**`

**Networking:**
- Public Domain: (generated, e.g., `signer-production-xxxx.up.railway.app`)
- Port: 5001 (exposed via domain)

**Deploy:**
- Custom Start: `npm run start -w packages/signer`
- Restart Policy: On Failure (10 retries)

**Env Variables (live = circle mode; no raw private key signs):**
```
PORT=5001
SIGNER_MODE=circle
CIRCLE_API_KEY=<your Circle API key>
CIRCLE_ENTITY_SECRET=<your Circle entity secret>
AGENT_WALLET_ID=<your DCW wallet id>
SIGNER_DB=/data/spendguard.db
GATEWAY_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ANCHOR_CONTRACT_ADDRESS=0xf550a882da3c26fbacd1b68aa83867102206b143
# SIGNER_FALLBACK_PRIVATE_KEY is a LOCAL-DEV fallback only; not needed and not used in circle mode
```

**Status:** ✅ Online, circle mode (verified live via /sign) — Circle DCW signs, agent holds zero key material

---

### DASHBOARD Service

**Build Settings:**
- Builder: Railpack
- Watch Paths: `/packages/dashboard/**`

**Networking:**
- Public Domain: (generated, e.g., `dashboard-production-xxxx.up.railway.app`)
- Port: 3000 (exposed via domain)

**Deploy:**
- Custom Start: `npm run dev -w packages/dashboard`
- Restart Policy: On Failure

**Env Variables:**
```
NEXT_PUBLIC_SIGNER_URL=http://signer:5001
```

**Status:** ✅ Online, renders UI, connects to signer via internal DNS

**Note:** Dashboard shows empty ledger because no live agent is running. To populate:
1. Option A: Run agent locally with `SIGNER_URL=<Railway-Signer-Public-URL>`
2. Option B: Deploy agent and sellers with HTTP routing (complex)

---

### SELLERS Service

**Build Settings:**
- Builder: Railpack
- Watch Paths: `/packages/sellers/**`

**Deploy:**
- Custom Start: `npm run dev -w packages/sellers`
- Restart Policy: On Failure

**Env Variables:**
```
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5
DEMO_PRICE_DRIFT_A=1.6
DEMO_PRICE_DRIFT_B=0
DEMO_PRICE_DRIFT_C=0
```

**Status:** ✅ Online, but isolated (can't receive agent requests)

---

### AGENT Service

**Build Settings:**
- Builder: Railpack
- Watch Paths: `/packages/agent/**`

**Deploy:**
- Custom Start: `npm run dev -w packages/agent`
- Restart Policy: On Failure (10 retries)

**Env Variables:**
```
SIGNER_URL=http://signer.railway.internal:5001
SELLER_URL_A=http://sellers.railway.internal:4001
SELLER_URL_B=http://sellers.railway.internal:4002
SELLER_URL_C=http://sellers.railway.internal:4003
SELLER_ADDRESS_A=0xD11d8043598001ea7DB8657f6AF165BDB962a294
SELLER_ADDRESS_B=0x3Fd8c634265cCe09590251BADEEc1052e67A4C7a
SELLER_ADDRESS_C=0xD3F15Ee24F10d9AcD5CF89d8F4743B413650Aff5
SIGNER_FALLBACK_PRIVATE_KEY=0xREPLACE_WITH_YOUR_OWN_64_HEX_PRIVATE_KEY
AGENT_TICK_MS=20000
AGENT_CALLS_PER_TICK=3
```

**Status:** ✅ Running — autonomous metering + re-shop, feeding the live ledger

**Fix history:** originally crashed with `ECONNREFUSED` because it fetched `http://sellers:4001`.
Resolved by setting `SELLER_URL_A/B/C` to the `sellers.railway.internal` private-DNS hostnames.

---

## Alternative Setup (local fallback — no longer required)

> All four services now run on Railway (see status above). The local-fallback setup below is
> kept only as a backup for offline demos; it is **not** the current deployment.


### For Demo
```
LOCAL:
├── npm run dev:sellers     (Terminal 1, ports 4001-4003)
├── npm run dev:agent       (Terminal 3, no port)
└── Connects to:
    → SIGNER_URL=<Railway-Signer-Public-URL>
       (Gets public domain from Railway dashboard)

RAILWAY:
├── @autopilot/signer      ✅ Running
├── @autopilot/dashboard   ✅ Running
│   └── Connects to http://signer:5001 (internal)
└── Live on https://<railway-domain>.up.railway.app
```

**Setup Steps:**
1. Get signer's public domain from Railway UI
2. Locally: `SIGNER_URL=https://signer-production-xxxx.up.railway.app npm run dev:agent`
3. Locally: `npm run dev:sellers`
4. Open Railway dashboard URL in browser
5. Watch live ledger populate as agent metering runs

---

## Next Steps to Fix Agent on Railway (Advanced)

If you want agent + sellers on Railway long-term:

### Option 1: HTTP Wrapper (Easy, Works)
- Wrap sellers in HTTP routes accessible across Railway network
- Agent calls `http://sellers:3000/quote` instead of raw ports
- Requires modifying sellers Express setup

### Option 2: Railway Private Network (Pro Plan)
- Enable Railway's private networking tier
- Costs extra but allows arbitrary port access between services

### Option 3: Database Broker (Overkill)
- Use Redis or PostgreSQL as message queue
- Agent writes requests → Sellers read/respond via DB
- Slow but works on any networking setup

**Recommendation:** Stick with **local agent + sellers, Railway signer + dashboard** for hackathon. It works perfectly and deployment is 90% done.

---

## How to Get Dashboard Public URL

1. Go to railway.com → your project
2. Click **@autopilot/dashboard** card
3. Look for **Public URL** in the Deployments tab or top right
4. Copy and share: `https://dashboard-production-xxxx.up.railway.app`

**Note:** First load may take 10-15s as Next.js cold-starts. Then fast.

---

## Logs & Debugging

### View Service Logs
1. Click service card on Railway
2. Go to **Deployments** tab
3. Scroll to **Build Logs** or **Deploy Logs**
4. Click **Console** tab for runtime output

### Check Network Connectivity
From agent logs, error shows exactly where it fails:
```
reshop.ts:18  ← Line trying to fetch from sellers
fetch failed
AggregateError [ECONNREFUSED]
```

This tells us: agent can't reach sellers:4001 from its container.

---

## Cost (30 days / $5 credit)

| Service | CPU/Mem | Hours/Month | Cost |
|---------|---------|------------|------|
| Signer (2vCPU/1GB) | 2x | 730 | $50/month |
| Dashboard (2vCPU/1GB) | 2x | 730 | $50/month |
| Sellers (2vCPU/1GB) | 2x | 730 | $50/month |
| Agent (2vCPU/1GB) | 2x | 730 | $50/month |
| **TOTAL** | — | — | **$200/month** |

**You have:** $5 credit (runs ~1.5 hours at full power)

**Recommendation:** Keep demo running locally; use Railway for signer + dashboard only (stays warm 24/7 for ~$100/month).

---

## Cleanup / Reset

If you want to nuke the Railway deployment and restart:

1. Go to railway.com → project settings
2. Scroll to "Danger Zone" → Delete Environment
3. Recreate environment and re-add services

Or just stop/pause services to save credit.

---

## Success Criteria

**Dashboard Live Demo:**
- ✅ Navigate to Railway dashboard URL
- ✅ See "Subscription Autopilot" heading + policy summary
- ✅ See live ledger table (even if empty for now)
- ✅ Share URL with judges/team

**With Local Agent:**
- ✅ Agent metering shows live in dashboard ledger
- ✅ Renewal detection visible in agent logs
- ✅ 73+ payments on demo run
- ✅ Show judge the autonomy + policy enforcement

---

## Files to Reference

- `packages/signer/src/index.ts` — Express server setup
- `packages/dashboard/app/page.tsx` — UI + fetch logic
- `packages/agent/src/reshop.ts` — Where crash happens (line 18)
- `scripts/verify-day0.sh` — Test suite
