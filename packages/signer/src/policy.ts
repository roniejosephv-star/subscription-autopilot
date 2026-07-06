import { toAtomic, type PolicyEvaluation } from "@autopilot/shared";
import { getPolicy, spentThisMonthAtomic, txCountToday } from "./store.js";

export interface PolicyContext {
  serviceId: string;
  sellerId: string;
  payTo: string;        // authorization recipient — checked against allowlist
  amountAtomic: bigint;
}

/**
 * The rule chain. Order matters: hard denies first, hold last.
 * This runs OUT OF the agent's process — the agent cannot bypass or patch it.
 */
export function evaluate(ctx: PolicyContext): PolicyEvaluation {
  const p = getPolicy();

  if (p.allowlist.length > 0 && !p.allowlist.includes(ctx.payTo.toLowerCase())) {
    return { decision: "deny", code: "seller_not_allowlisted", reason: `Recipient ${ctx.payTo} is not an allowlisted seller` };
  }

  if (ctx.amountAtomic > toAtomic(p.perTxMax)) {
    return { decision: "deny", code: "per_tx_max_exceeded", reason: `Amount exceeds per-transaction max of ${p.perTxMax} USDC` };
  }

  const monthly = spentThisMonthAtomic();
  const budget = toAtomic(p.monthlyBudget);
  if (monthly + ctx.amountAtomic > budget) {
    return {
      decision: "deny", code: "monthly_budget_exceeded",
      reason: `Monthly budget ${p.monthlyBudget} USDC would be exceeded`,
      remainingMonthlyAtomic: (budget - monthly).toString(),
    };
  }

  const serviceSpent = spentThisMonthAtomic(ctx.serviceId);
  if (serviceSpent + ctx.amountAtomic > toAtomic(p.perServiceCap)) {
    return { decision: "deny", code: "per_service_cap_exceeded", reason: `Per-service cap ${p.perServiceCap} USDC reached for ${ctx.serviceId}` };
  }

  if (txCountToday() + 1 > p.dailyTxMax) {
    return { decision: "deny", code: "daily_velocity_exceeded", reason: `Daily transaction cap ${p.dailyTxMax} reached` };
  }

  if (ctx.amountAtomic > toAtomic(p.approvalThreshold)) {
    return { decision: "hold", reason: `Amount exceeds approval threshold ${p.approvalThreshold} USDC — human approval required` };
  }

  return { decision: "allow", remainingMonthlyAtomic: (budget - monthly - ctx.amountAtomic).toString() };
}
