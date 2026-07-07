/**
 * The agent's ONLY route to money. No keys, no SDK, no chain access here —
 * just HTTP requests to SpendGuard, which may say no.
 */
import type { PayResult } from "@autopilot/shared";

const SIGNER_URL = process.env.SIGNER_URL ?? "http://localhost:5000";

export async function pay(url: string, serviceId: string, sellerId: string, reason: string): Promise<PayResult> {
  const res = await fetch(`${SIGNER_URL}/pay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, serviceId, sellerId, reason }),
  });
  const body = await res.json();
  if (res.ok) return body as PayResult;
  if (res.status === 402) return body as PayResult; // structured policy denial → agent re-plans
  throw new Error(`signer error ${res.status}: ${JSON.stringify(body)}`);
}

export async function deposit(amount: string): Promise<void> {
  const res = await fetch(`${SIGNER_URL}/deposit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error(`deposit failed: ${await res.text()}`);
}

export async function balances(): Promise<{ wallet: string; gatewayAvailable: string }> {
  const res = await fetch(`${SIGNER_URL}/balances`);
  if (!res.ok) throw new Error(`balances failed: ${await res.text()}`);
  return res.json();
}

/** Ask SpendGuard to top up the Arc treasury from a source chain via CCTP. */
export async function topUp(amount: string): Promise<{ burnTx?: string; mintTx?: string; status?: string }> {
  const res = await fetch(`${SIGNER_URL}/treasury/topup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error(`topup failed ${res.status}: ${await res.text()}`);
  return res.json();
}
