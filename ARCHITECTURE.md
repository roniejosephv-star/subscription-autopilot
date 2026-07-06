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
3. **Auditability:** every decision (allow/hold/deny + code) is ledgered; policy hashes and epoch spend roots are event-anchored in `SpendAnchor` on Arc, so the dashboard's story is externally verifiable.

## Payment sequence (happy path)

agent `POST /pay` → SpendGuard fetches URL → seller 402 + PAYMENT-REQUIRED (price from live tier) → SDK selects GatewayWalletBatched option → **hook: policy.evaluate()** → allow → sign EIP-3009 (validBefore ≥ 7d) → retry with payment → seller `settle()` via Gateway → 200 + data → ledger entry + transfer UUID → dashboard.

## Cross-chain extension (diagrammed, not in MVP)

Gateway's crosschain `withdraw()` lets the owner top up the agent's budget from any Gateway-supported chain (CCTP/Bridge Kit rails) — the agent's spending chain stays Arc.
