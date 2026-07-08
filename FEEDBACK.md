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
10. **Contract *deployment* lives in a different package than contract *execution* (found Day 4, 2026-07-07):** to make on-chain anchoring keyless we deployed `SpendAnchor` from the DCW wallet. `createContractExecutionTransaction` is on `@circle-fin/developer-controlled-wallets`, but `deployContract` is only on the separate `@circle-fin/smart-contract-platform` client (`initiateSmartContractPlatformClient`). A dev working from the Wallets client alone won't find deploy. Suggest cross-linking the two, or re-exporting deploy from the Wallets client.
11. **`deployContract` rejects an empty `constructorParameters: []` with a generic 400** (`API parameter invalid`, code 2) that names no field. Omitting the field entirely for a no-arg constructor works. Suggest accepting `[]`, or returning the specific offending parameter.
12. **Console deploy pushes an SCA "Console Wallet" as deployer** — but for our EOA-owned contract we needed the deployer to be our existing DCW **EOA** so `owner == msg.sender == agent wallet`. The Console path didn't obviously let us pick the EOA; the API (`walletId`) did. Suggest letting the Console select any dev-controlled wallet as deployer.
13. **Gas Station (SCA-only) and Nanopayments/x402 (EOA-only) are mutually exclusive for one wallet.** Agentic builders will want both gas sponsorship *and* x402 settlement; today that forces two wallets. Worth an explicit docs callout, and ideally a path to sponsor gas for EOA x402 flows.
14. **No single-call DCW-native CCTP helper.** Cross-chain top-ups from a Circle-custodied wallet work by chaining `approve` → `depositForBurn` → IRIS attestation → `receiveMessage` via `createContractExecutionTransaction`, but require a funded DCW wallet per source chain and manual attestation polling. A DCW-native CCTP method (burn+attest+mint) would unlock autonomous cross-chain treasury for agents.

## What worked well
- DCW EOA `signTypedData` signatures are fully ecrecover-compatible with Gateway's x402 settle — the whole custody-separation design works E2E on Arc Testnet (verified 2026-07-06, transfer `9bd6a149-1821-4341-a4aa-712cdc362382`)
- Seller monetization is genuinely 2 lines (`createGatewayMiddleware` + `gateway.require()`); per-request dynamic pricing works by binding `require(price)` at call time
- `CHAIN_CONFIGS` exports killed all address hardcoding
- Arc deposit finality (~0.5s) makes the deposit→pay loop feel instant; contract executions via the Wallets API confirmed in well under a minute

## What could be improved
- **SDK Error Transparency**: When executing raw contract transactions via `createContractExecutionTransaction` or generating signatures via `signTypedData`, failures (e.g., mismatching types or gas limits) return nested and generic error messages. Surfacing the raw EVM revert reason or explicit parameter validation errors would speed up debugging.
- **Gas Duality Complexity**: On Arc, gas is paid in USDC but scaled to 18 decimals, whereas the asset itself uses 6 decimals. Developers must constantly convert between `formatUnits(..., 18)` for gas and `formatUnits(..., 6)` for balances. The SDK should provide built-in scaling helper methods to prevent decimal calculation mismatches.
- **Facilitator Connection Resilience**: Local dev loops are highly dependent on the responsiveness of the Gateway Testnet Facilitator. During periods of testnet congestion, `/pay` requests can time out without clear indication of whether the issue lies on the local side or the remote API.
- **Custody-native parity across products.** The best moments were when a Circle-custodied (DCW) wallet could do the whole job; the rough ones were where a product still assumed a raw key or a specific account type — `GatewayClient.deposit()` (finding 9), Gas Station vs x402 account-type split (13), and CCTP's multi-step manual flow (14). Closing these would let an agent run end-to-end with **zero raw key** across payments, deposits, anchoring, and cross-chain — which is exactly what we had to hand-build.
- **Discoverability of deployment + execution.** Splitting `deployContract` and `createContractExecutionTransaction` across two packages (finding 10) cost real time; the mental model "wallets do execution, a different client does deployment" isn't stated anywhere obvious.
- **Error specificity.** Two 400s named no field (`deployContract` empty array, finding 11; the `signTypedData` EIP712Domain rejection, finding 8). Field-level errors would have saved hours.
- **Docs single-source-of-truth.** Signature-validity numbers disagree across pages (finding 2); x402 hooks live off-site (finding 6); an undocumented header ships in the types (finding 5). One authoritative reference per product would help.

## Recommendations
1. Ship a **DCW-native path for every money movement** (deposit, CCTP burn/mint, contract deploy) so agentic apps can run keyless end-to-end — we proved it's possible but had to assemble it from `createContractExecutionTransaction` primitives (findings 9, 10, 14).
2. Add a **runtime hint when an SCA wallet is used with Nanopayments** (and vice-versa for Gas Station) — the EOA/SCA fork silently fails today (findings 1, 13).
3. Return **field-level validation errors** from `deployContract` and `signTypedData` (findings 8, 11).
4. **Cross-link the Wallets and Smart Contract Platform clients**, and let the Console pick any dev-controlled wallet as contract deployer (findings 10, 12).
5. Provide **minimal single-process reference apps** per product (finding 4) and a **canonical constants/validity reference** (findings 2, 3, 5, 6).

