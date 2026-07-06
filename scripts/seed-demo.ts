/**
 * Demo beat 2 setup: make Seller A's price drift upward so the next renewal
 * triggers a visible re-shop + switch. Run, then restart sellers with the env:
 *   DEMO_PRICE_DRIFT_A=1.6 npm run dev:sellers
 * (Also prints the injection command for demo beat 3.)
 */
console.log(`
Demo script:
  beat 1  npm run dev:agent            # agent subscribes to cheapest seller, meters usage
  beat 2  DEMO_PRICE_DRIFT_A=1.6 npm run dev:sellers   # restart sellers: A raises prices 60%
          → wait for renewal tick: agent re-shops and switches, rationale in logs + history
  beat 3  npm run once -w packages/agent -- --inject   # prompt-injected overspend → SpendGuard denies
  beat 4  open dashboard :3000         # burn-down, savings, approvals, Arc receipts
`);
