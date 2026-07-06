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
