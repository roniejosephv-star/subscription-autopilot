/** Shared types across signer, agent, sellers, dashboard. Amounts are USDC atomic units (6 decimals) as strings. */

export type PolicyDecision = "allow" | "hold" | "deny";

export type DenyCode =
  | "monthly_budget_exceeded"
  | "per_service_cap_exceeded"
  | "per_tx_max_exceeded"
  | "daily_velocity_exceeded"
  | "seller_not_allowlisted"
  | "approval_denied"
  | "approval_timeout";

export interface PolicyConfig {
  monthlyBudget: string;        // decimal USDC, e.g. "10"
  perServiceCap: string;        // decimal USDC per serviceId per month
  perTxMax: string;             // decimal USDC
  approvalThreshold: string;    // decimal USDC — above this, hold for human approval
  dailyTxMax: number;
  allowlist: string[];          // lowercase seller addresses
}

export interface PaymentRequest {
  url: string;
  serviceId: string;            // logical service, e.g. "fx-rates"
  sellerId: string;             // "A" | "B" | "C"
  reason: string;               // agent's stated purpose (audited)
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  code?: DenyCode;
  reason?: string;
  remainingMonthlyAtomic?: string;
}

export interface PayResultOk {
  ok: true;
  status: number;
  amountAtomic: string;
  formattedAmount: string;
  transaction: string;          // Gateway transfer UUID
  data: unknown;
}

export interface PayResultDenied {
  ok: false;
  denied: true;
  code: DenyCode;
  reason: string;
}

export type PayResult = PayResultOk | PayResultDenied;

export interface LedgerEntry {
  id: number;
  ts: string;
  serviceId: string;
  sellerId: string;
  payTo: string;
  amountAtomic: string;
  decision: PolicyDecision;
  code?: string;
  transaction?: string;
  reason: string;
}

export interface Approval {
  id: string;
  ts: string;
  serviceId: string;
  sellerId: string;
  amountAtomic: string;
  reason: string;
  status: "pending" | "approved" | "denied";
}

export interface Quote {
  sellerId: string;
  serviceId: string;
  priceUsd: string;             // decimal per call
  tier: string;
  url: string;
}

export interface SubscriptionRecord {
  serviceId: string;
  sellerId: string;
  url: string;
  priceUsd: string;
  startedAt: string;
  renewsAt: string;             // demo-compressed period
  callsThisPeriod: number;
  spentAtomicThisPeriod: string;
  history: Array<{ ts: string; event: string; detail: string }>;
}

export const USDC_DECIMALS = 6;

export function toAtomic(decimal: string): bigint {
  const [i, f = ""] = decimal.split(".");
  return BigInt(i + f.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS));
}

export function fromAtomic(atomic: bigint | string): string {
  const v = BigInt(atomic);
  const s = v.toString().padStart(USDC_DECIMALS + 1, "0");
  return `${s.slice(0, -USDC_DECIMALS)}.${s.slice(-USDC_DECIMALS)}`.replace(/\.?0+$/, "") || "0";
}
