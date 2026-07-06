/**
 * x402 payment with the Circle DCW wallet as signer (SIGNER_MODE=circle, F8).
 * Re-implements the SDK's GatewayClient.pay() negotiation (wire format read
 * from the shipped implementation) with two changes:
 *   1. signing goes through Circle Wallets (circleSignTypedData) — no raw key
 *   2. the policy check runs AFTER the 402 reveals amount/payTo and BEFORE
 *      any signature exists — the signature itself is policy-gated.
 */
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { circleSignTypedData } from "./circle-wallet.js";

const ARC_TESTNET_NETWORK = "eip155:5042002";

export class PolicyDeniedError extends Error {
  constructor(public code: string, public reason: string) {
    super(`${code}: ${reason}`);
  }
}

export interface DcwPayResult {
  data: unknown;
  amountAtomic: string;
  formattedAmount: string;
  transaction: string;
  status: number;
}

type PolicyGate = (amountAtomic: bigint, payTo: string) => Promise<void>; // throws PolicyDeniedError

function scheme(): BatchEvmScheme {
  const address = process.env.AGENT_WALLET_ADDRESS as `0x${string}`;
  if (!address) throw new Error("AGENT_WALLET_ADDRESS missing");
  return new BatchEvmScheme({
    address,
    signTypedData: (params: unknown) => circleSignTypedData(params),
  } as any);
}

export async function dcwPay(url: string, policyGate: PolicyGate): Promise<DcwPayResult> {
  const initial = await fetch(url);
  if (initial.status !== 402) {
    if (initial.ok) {
      return { data: await initial.json(), amountAtomic: "0", formattedAmount: "0", transaction: "", status: initial.status };
    }
    throw new Error(`Request failed with status ${initial.status}`);
  }

  const prHeader = initial.headers.get("PAYMENT-REQUIRED");
  if (!prHeader) throw new Error("Missing PAYMENT-REQUIRED header in 402 response");
  const paymentRequired = JSON.parse(Buffer.from(prHeader, "base64").toString("utf-8"));

  const option = (paymentRequired.accepts ?? []).find((opt: any) =>
    opt.network === ARC_TESTNET_NETWORK &&
    opt.extra?.name === "GatewayWalletBatched" &&
    opt.extra?.version === "1" &&
    typeof opt.extra?.verifyingContract === "string",
  );
  if (!option) throw new Error(`No Gateway batching option for ${ARC_TESTNET_NETWORK}`);

  const amount = BigInt(option.amount);

  // ── THE CUSTODY BOUNDARY: no policy pass, no signature ────────────────────
  await policyGate(amount, String(option.payTo));

  const payload = await scheme().createPaymentPayload(paymentRequired.x402Version ?? 2, option);
  const paymentHeader = Buffer.from(
    JSON.stringify({ ...payload, resource: paymentRequired.resource, accepted: option }),
  ).toString("base64");

  const paid = await fetch(url, { headers: { "Payment-Signature": paymentHeader } });

  let settle: { transaction?: string } | undefined;
  const respHeader = paid.headers.get("PAYMENT-RESPONSE");
  if (respHeader) settle = JSON.parse(Buffer.from(respHeader, "base64").toString("utf-8"));

  if (!paid.ok) {
    const err = await paid.json().catch(() => ({} as any));
    throw new Error(`Payment failed: ${(err as any).error ?? paid.statusText}`);
  }

  const s = amount.toString().padStart(7, "0");
  return {
    data: await paid.json(),
    amountAtomic: amount.toString(),
    formattedAmount: `${s.slice(0, -6)}.${s.slice(-6)}`,
    transaction: settle?.transaction ?? "",
    status: paid.status,
  };
}
