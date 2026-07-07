/**
 * Autonomous treasury manager.
 * The agent watches its Arc Gateway USDC balance and, when it falls below a floor,
 * pulls USDC cross-chain via Circle CCTP so it can keep paying without a human refill.
 * Decision + trigger live here (the agent holds no keys); the cross-chain burn/mint
 * runs inside SpendGuard via POST /treasury/topup (custody boundary preserved).
 *
 * Opt-in via TREASURY_AUTOPILOT=1. Tunables:
 *   TREASURY_MIN_USDC     top up when gateway available < this (default 2)
 *   TREASURY_TOPUP_USDC   amount to pull per top-up (default "5")
 *   TREASURY_COOLDOWN_MS  min gap between top-ups (default 600000 = 10 min)
 */
import { balances, topUp } from "./signer-client.js";

const ENABLED = !!process.env.TREASURY_AUTOPILOT;
const MIN = Number(process.env.TREASURY_MIN_USDC ?? 2);
const TOPUP = process.env.TREASURY_TOPUP_USDC ?? "5";
const COOLDOWN_MS = Number(process.env.TREASURY_COOLDOWN_MS ?? 600_000);
let lastTopUpAt = 0;

export async function maybeTopUp(): Promise<void> {
  if (!ENABLED) return;
  if (Date.now() - lastTopUpAt < COOLDOWN_MS) return;

  let available: number;
  try {
    available = Number((await balances()).gatewayAvailable);
  } catch {
    return; // balances unavailable this tick — try again next tick
  }
  if (!Number.isFinite(available) || available >= MIN) return;

  console.log(`[agent] treasury low: ${available} < ${MIN} USDC — requesting CCTP top-up of ${TOPUP}…`);
  lastTopUpAt = Date.now();
  try {
    const r = await topUp(TOPUP);
    console.log(`[agent] CCTP top-up: status=${r.status ?? "initiated"} burnTx=${r.burnTx ?? "-"} mintTx=${r.mintTx ?? "-"}`);
  } catch (e) {
    console.warn(`[agent] top-up deferred (retry after cooldown): ${(e as Error).message}`);
  }
}
