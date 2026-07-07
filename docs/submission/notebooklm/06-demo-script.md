# Demo video script (≤ 3:00)

**0:00–0:30 — The problem.** "Would you give an AI your wallet? Circle's rails now let agents pay autonomously — but nobody deploys one, because capability isn't trust. Meet Subscription Autopilot."

**0:30–1:15 — Beat 1+2: autonomy that pays for itself.** Screen: agent logs — subscribes to cheapest fx-rates seller, meters per-call nanopayments (gasless, live receipts). Cut to: Seller A raises prices 60% → renewal tick → agent re-shops, quotes all three sellers at its real volume, switches, logs rationale. Dashboard savings counter ticks up. "Research, negotiate, execute — per-call USDC nanopayments, batch-settled by Circle Gateway on Arc."

**1:15–2:00 — Beat 3: the trust boundary.** Terminal: `npm run inject` — a poisoned instruction tells the agent to buy an unlimited tier. SpendGuard denies at the policy wall (`per_tx_max_exceeded`), approval card appears, human clicks Deny. "The agent holds no keys. It can want anything — it can only pay what policy allows. And that policy is hash-anchored on Arc."

**2:00–2:40 — How it's built.** Architecture diagram, 20 seconds: agent → SpendGuard (policy + Circle Wallets custody) → x402 sellers → Gateway settlement → SpendAnchor on Arc. Circle products on screen: Nanopayments, Gateway, Wallets, USDC.

**2:40–3:00 — Close.** Month-end dashboard: spend vs budget, savings from switching, denial log, Arc receipts. "Circle's sample shows an agent that can pay. Autopilot pays well — cheaper, safer, gasless. Track 4, Subscription Autopilot."
