/**
 * USYC tokenized-yield leg — enterprise-gated, wired behind USYC_ENABLED so it can be
 * tested the moment Circle grants access (no rebuild: set env + flip the flag).
 *
 * Idea: idle treasury sitting in USDC earns nothing. The agent parks a reserve in USYC
 * (tokenized money-market yield) and redeems it back to USDC ahead of the next renewal —
 * autonomous cash management with a yield leg. Executed from the agent DCW wallet via
 * contract-execution (no raw key), same custody boundary as payments/anchoring.
 *
 * Contract address + function signatures are ENV-DRIVEN so the exact (gated) USYC ABI is
 * supplied from Circle's docs — nothing on-chain is guessed here. Until USYC_ENABLED=1 and
 * the addresses are set, the endpoints return a clean "not configured" (architecture-level).
 */
import { contractCall } from "./dcw-chain.js";

const enabled = () => process.env.USYC_ENABLED === "1";

function cfg() {
  return {
    walletId: process.env.AGENT_WALLET_ID,
    usyc: process.env.USYC_CONTRACT,                       // USYC token / vault contract on Arc
    usdc: process.env.USYC_USDC ?? process.env.CCTP_SOURCE_USDC, // USDC used to subscribe
    investFn: process.env.USYC_INVEST_FN ?? "deposit(uint256)",  // fill from USYC docs
    redeemFn: process.env.USYC_REDEEM_FN ?? "redeem(uint256)",
  };
}
function toAtomic(amountDecimal: string, decimals = 6): string {
  const [i, f = ""] = amountDecimal.split(".");
  return BigInt(i + f.padEnd(decimals, "0").slice(0, decimals)).toString();
}
function guard(need: string[]) {
  if (!enabled()) throw new Error("USYC disabled — set USYC_ENABLED=1 once access is granted");
  const c = cfg() as Record<string, string | undefined>;
  const missing = need.filter((k) => !c[k]);
  if (missing.length) throw new Error(`USYC not configured — set env: ${missing.map((k) => `USYC_${k.toUpperCase()}`).join(", ")}`);
}

/** Park `amountUSDC` of idle treasury into USYC (approve → subscribe). */
export async function usycInvest(amountUSDC: string): Promise<{ approveTx: string; investTx: string }> {
  guard(["usyc", "usdc"]);
  const c = cfg();
  const amt = toAtomic(amountUSDC);
  const approveTx = await contractCall(c.usdc!, "approve(address,uint256)", [c.usyc!, amt], c.walletId!);
  const investTx = await contractCall(c.usyc!, c.investFn!, [amt], c.walletId!);
  return { approveTx, investTx };
}

/** Redeem `amountRaw` USYC back to USDC ahead of a renewal (raw token units). */
export async function usycRedeem(amountRaw: string): Promise<{ redeemTx: string }> {
  guard(["usyc"]);
  const c = cfg();
  const redeemTx = await contractCall(c.usyc!, c.redeemFn!, [amountRaw], c.walletId!);
  return { redeemTx };
}
