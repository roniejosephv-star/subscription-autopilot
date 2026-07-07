# Submission — Circle Products Used & Product Feedback
*Paste-ready for the Track 4 form. Full running feedback log: `FEEDBACK.md`.*

**Project:** Subscription Autopilot — an AI agent that runs your recurring service spending on Arc and can *prove* it behaved.
**Track:** 4 — Best Agentic Economy Experience on Arc
**Circle Developer Account email:** roniejosephv@gmail.com
**Live demo:** https://autopilotdashboard-production.up.railway.app · **Signer API:** https://autopilotsigner-production.up.railway.app
**Repo:** https://github.com/roniejosephv-star/subscription-autopilot

---

## Circle products used on Arc

| Product | Used | How it's used | Status |
|---|---|---|---|
| **USDC** | ✅ | Settlement asset for every metered payment; also Arc's gas token (one faucet covers gas + spend). | Live |
| **Circle Wallets** | ✅ | Agent's key custody. DCW **EOA** signs x402 (EIP-3009), the Gateway deposit, and the on-chain audit anchors — all via Circle contract-execution. **No raw private key anywhere in the deployed stack.** | Live |
| **Gateway** | ✅ | Fundable agent balance + batched, gas-free x402 settlement; treasury card reads `getBalances()`. | Live |
| **Nanopayments (x402)** | ✅ | Core rail — per-call sub-cent metered billing via `@circle-fin/x402-batching`; policy enforced in the `onBeforePaymentCreation` hook inside SpendGuard. | Live |
| **CCTP / Bridge Kit** | ✅ | Autonomous cross-chain treasury: when the Arc Gateway balance runs low the agent pulls USDC from a source chain (approve → `depositForBurn` → IRIS attestation → `receiveMessage`), all via DCW contract-execution. | Code-complete; agent orchestration live, execution one funded source-wallet away |
| **USYC** | ✅ | Idle-treasury yield leg — agent parks a reserve in USYC between renewals and redeems ahead of the next one. Wired behind `USYC_ENABLED` with live endpoints. | Architecture-level; wired, testable on access grant |
| **StableFX** | ✅ | Cross-currency settlement — sellers are FX-rate services, so the agent quotes in the buyer's currency and settles in the seller's. Wired behind `STABLEFX_ENABLED` with live endpoints. | Architecture-level; wired, testable on access grant |

**Honest labeling:** USDC, Wallets, Gateway, and Nanopayments are live and used deeply. CCTP is code-complete (the agent's decision + orchestration run live; cross-chain execution needs a funded source-chain wallet + the CCTP v2 addresses). USYC and StableFX are enterprise-gated: they are **integrated at the code layer behind a feature flag** and become testable the moment access is granted — presented as architecture-level pending that grant, per the hackathon's conceptual-integration allowance.

---

## Circle Product Feedback

**Why we chose these products.** Nanopayments/x402 is the only rail where per-call metered agent payments are economically sane — gasless, sub-cent, batched. Gateway gives the agent a fundable balance with instant (~0.5s) receipts. Circle Wallets (DCW EOA) let us move key custody entirely out of the agent, which is the whole security thesis. USDC-as-gas on Arc collapses the faucet/gas UX to one token. CCTP extends the same USDC rail across chains for autonomous treasury, and USYC/StableFX add a yield leg and cross-currency settlement that fit an agent managing real recurring spend.

**What worked well.**
- DCW EOA `signTypedData` signatures are fully `ecrecover`-compatible with Gateway's x402 settle — the custody-separation design worked E2E on Arc Testnet.
- We took it further this build: **on-chain anchoring is now keyless too** — `SpendAnchor` was redeployed *from the DCW wallet* via the Smart Contract Platform `deployContract`, so its `owner` is the Circle-custodied wallet and epochs are committed via contract-execution with no raw key.
- Seller monetization is genuinely ~2 lines (`createGatewayMiddleware` + `gateway.require()`), with per-request dynamic pricing by binding `require(price)` at call time.
- `CHAIN_CONFIGS` exports killed all address hardcoding; Arc's fast finality makes the deposit→pay loop feel instant.

**What could be improved.**
- **Custody-native parity.** Some paths still assume a raw key or a specific account type: `GatewayClient.deposit()` needs a raw key; Gas Station is SCA-only while Nanopayments is EOA-only (mutually exclusive for one wallet); CCTP has no DCW-native single-call helper. Closing these lets an agent run keyless end-to-end — which we had to hand-build.
- **Discoverability.** `deployContract` lives on a *different* client/package (`@circle-fin/smart-contract-platform`) than `createContractExecutionTransaction` (`@circle-fin/developer-controlled-wallets`); that split cost real time.
- **Error specificity.** `deployContract` rejected an empty `constructorParameters: []` with a generic 400 naming no field (omitting it worked); the Wallets `signTypedData` EIP712Domain rejection is similarly opaque.
- **Docs single-source.** Signature-validity numbers disagree across pages; x402 lifecycle hooks are documented off-site (x402.org); an undocumented header ships in the SDK types.

**Recommendations.**
1. Ship a **DCW-native path for every money movement** (deposit, CCTP burn/mint, contract deploy) so agentic apps run keyless end-to-end.
2. Emit a **runtime hint on the EOA/SCA mismatch** for Nanopayments and Gas Station (today it silently fails).
3. Return **field-level validation errors** from `deployContract` and `signTypedData`.
4. **Cross-link** the Wallets and Smart Contract Platform clients; let the Console pick any dev-controlled wallet as contract deployer.
5. Provide **minimal single-process reference apps** and a **canonical constants/validity reference** per product.
