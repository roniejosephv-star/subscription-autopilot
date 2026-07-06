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

## What worked well
*(fill during build — e.g., 2-line seller monetization via `gateway.require()`, `CHAIN_CONFIGS` exports, transfer search API)*

## What could be improved
*(fill during build)*

## Recommendations
*(fill during build)*
