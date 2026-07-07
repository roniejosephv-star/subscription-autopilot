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
