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
│ AGENT :loop  │──────────────▶│  SPENDGUARD (:5001)                 │
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
2. **SpendGuard ↔ chain:** policy is evaluated before any signature exists. In `SIGNER_MODE=circle` the private key doesn't exist in our stack at all — Circle Wallets holds it; SpendGuard holds only the *decision* to sign. This covers **both** payment signatures **and** the on-chain anchor transactions (both go through Circle contract-execution — no raw key).
3. **Auditability:** every decision (allow/hold/deny + code) is ledgered; policy hashes are anchored in `SpendAnchor` on Arc on every update, and SpendGuard auto-commits a spend epoch every 10 minutes when spend changed (`EPOCH_COMMIT_INTERVAL_MS`; skip-if-unchanged so every anchored epoch marks real movement) — the anchor transactions are signed by the Circle DCW wallet, not a raw key (verified live: epoch tx [`0xdceaf6e6…`](https://testnet.arcscan.app/tx/0xdceaf6e6bbab8d00d8162829e9de8d66e72e45e4faec81e4891b7a2d81fc32a8), From = DCW wallet `0x7dbffb7d…`). The dashboard's story is externally verifiable and cannot silently go stale.

## Payment sequence (happy path)

agent `POST /pay` → SpendGuard fetches URL → seller 402 + PAYMENT-REQUIRED (price from live tier) → SDK selects GatewayWalletBatched option → **hook: policy.evaluate()** → allow → sign EIP-3009 (validBefore ≥ 7d) → retry with payment → seller `settle()` via Gateway → 200 + data → ledger entry + transfer UUID → dashboard.

## Autonomous cross-chain treasury (CCTP) — built

When the agent's Arc Gateway balance drops below a floor, it refills itself instead of stalling:

```
agent tick → treasury.ts: gateway available < TREASURY_MIN_USDC?
   └─ yes → POST /treasury/topup → SpendGuard (cctp.ts, DCW contract-execution):
        source chain: USDC.approve → TokenMessenger.depositForBurn(→ Arc domain)
        Circle IRIS attestation
        Arc: MessageTransmitter.receiveMessage → USDC minted to agent → /deposit into Gateway
```

The decision + orchestration run in the agent loop (keyless); the burn/mint execute inside SpendGuard
via Circle DCW contract-execution — no raw key, same custody boundary as payments and anchoring. This
adds **CCTP** to the stack and makes treasury management part of the autonomous economy ("keep yourself
funded"). Live execution needs a funded DCW wallet on the source chain plus the CCTP v2 testnet
addresses/domain for that chain (env in `.env.example`); until configured it is a code-complete,
architecture-level integration.

## Tokenized-treasury & FX extensions (enterprise-gated — wired behind flags, testable on access grant)

These are **code-complete and endpoint-wired**, gated off by a feature flag. The moment Circle grants
access, set the env values from the gated docs and flip the flag — no rebuild, testable then and there.

- **USYC (tokenized yield)** — `signer/src/usyc.ts`, flag `USYC_ENABLED`. Idle budget between renewals earns
  nothing; the agent parks a reserve in **USYC** and redeems ahead of the next renewal — autonomous cash
  management with a yield leg. Endpoints `POST /treasury/yield/invest` · `/redeem`, executed from the DCW
  wallet via contract-execution (no raw key). Contract address + ABI signatures are env-driven so the exact
  gated ABI drops in without code changes. Until enabled, endpoints return a clean "not configured".
- **StableFX (cross-currency settlement)** — `signer/src/stablefx.ts`, flag `STABLEFX_ENABLED`. The sellers
  are FX-rate services, so the agent quotes in the buyer's currency and settles in the seller's, hedged via
  **StableFX**. Endpoints `POST /fx/quote` · `/fx/settle`, behind SpendGuard's custody + policy boundary.
  Base URL / paths are env-driven. Until enabled, endpoints return a clean "not configured".

Both are presented as architecture-level integrations (permitted by the hackathon's conceptual-integration
allowance) but are one env-flip from a live test.
