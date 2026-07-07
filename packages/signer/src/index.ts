/**
 * SPENDGUARD — the policy-gated payment authority.
 *
 * Custody separation invariant: the agent process holds NO key material and cannot
 * produce a valid payment. It POSTs a payment *request* here; this service runs the
 * policy chain (policy.ts), optionally holds for human approval, and only then
 * executes the x402 payment via Circle's SDK.
 *
 * v1 payment path: GatewayClient (verified SDK surface) with lifecycle hooks as the
 * enforcement point — hooks run in THIS trusted process, not the agent's.
 * v2 upgrade path (F8): SIGNER_MODE=circle signs EIP-712 via Circle Wallets DCW EOA
 * (see circle-wallet.ts + /sign endpoint) so no raw key exists anywhere.
 */
import "./env.js";
import { randomBytes } from "node:crypto";
import express from "express";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { fromAtomic, type PayResult } from "@autopilot/shared";
import { evaluate } from "./policy.js";
import {
  createApproval, decideApproval, getApproval, getPolicy, lastEpoch, logEpoch,
  logLedger, pendingApprovals, recentLedger, setPolicy,
} from "./store.js";
import { anchorPolicyHash, commitEpochOnChain } from "./anchor.js";
import { circleSignTypedData } from "./circle-wallet.js";
import { dcwPay, PolicyDeniedError } from "./dcw-pay.js";
import { dcwDeposit } from "./dcw-chain.js";
import { cctpTopUp } from "./cctp.js";
import { usycInvest, usycRedeem } from "./usyc.js";
import { fxQuote, fxSettle } from "./stablefx.js";

const CIRCLE_MODE = () => process.env.SIGNER_MODE === "circle";

// PORT (injected by Railway/Render) wins; default 5001, NOT 5000 — macOS AirPlay squats on 5000.
const PORT = Number(process.env.PORT ?? process.env.SIGNER_PORT ?? 5001);
const APPROVAL_WAIT_MS = Number(process.env.APPROVAL_WAIT_MS ?? 60_000);

function requireKey(): `0x${string}` {
  const pk = process.env.SIGNER_FALLBACK_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("SIGNER_FALLBACK_PRIVATE_KEY missing (Day-0 path). See .env.example");
  return pk;
}

function newClient(): GatewayClient {
  return new GatewayClient({ chain: "arcTestnet", privateKey: requireKey() });
}

/**
 * Read-only Gateway client for balance/transfer lookups. These reads target an
 * explicit address (AGENT_WALLET_ADDRESS) and never sign, but the SDK constructor
 * still wants a private key. In circle mode there is NO raw key in the stack, so we
 * pass an EPHEMERAL one generated in-process — it holds nothing, is never persisted,
 * and never signs a transaction. Keeps `/balances` working while the deployed stack
 * remains free of any raw private key at rest.
 */
function readClient(): GatewayClient {
  const pk = (process.env.SIGNER_FALLBACK_PRIVATE_KEY as `0x${string}` | undefined)
    ?? (`0x${randomBytes(32).toString("hex")}` as `0x${string}`);
  return new GatewayClient({ chain: "arcTestnet", privateKey: pk });
}

/**
 * The policy gate — shared by both signing modes. Runs the rule chain, parks
 * over-threshold payments in the approval queue, and throws a structured
 * PolicyDeniedError when the payment must not happen. No pass, no signature.
 */
function makePolicyGate(serviceId: string, sellerId: string, reason: string) {
  return async (amountAtomic: bigint, payTo: string): Promise<void> => {
    const verdict = evaluate({ serviceId, sellerId, payTo, amountAtomic });

    if (verdict.decision === "deny") {
      logLedger({ serviceId, sellerId, payTo, amountAtomic: amountAtomic.toString(), decision: "deny", code: verdict.code, reason });
      throw new PolicyDeniedError(verdict.code!, verdict.reason ?? "denied by policy");
    }

    if (verdict.decision === "hold") {
      const holdId = createApproval({ serviceId, sellerId, amountAtomic: amountAtomic.toString(), reason });
      logLedger({ serviceId, sellerId, payTo, amountAtomic: amountAtomic.toString(), decision: "hold", reason });
      const outcome = await waitForApproval(holdId);
      if (outcome !== "approved") {
        const code = outcome === "denied" ? "approval_denied" : "approval_timeout";
        logLedger({ serviceId, sellerId, payTo, amountAtomic: amountAtomic.toString(), decision: "deny", code, reason });
        throw new PolicyDeniedError(code, `human approval ${outcome}`);
      }
    }
  };
}

async function waitForApproval(id: string): Promise<"approved" | "denied" | "timeout"> {
  const deadline = Date.now() + APPROVAL_WAIT_MS;
  while (Date.now() < deadline) {
    const a = getApproval(id);
    if (a && a.status !== "pending") return a.status as "approved" | "denied";
    await new Promise((r) => setTimeout(r, 1000));
  }
  return "timeout";
}

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

/** The core endpoint: execute a policy-governed x402 payment. */
app.post("/pay", async (req, res) => {
  const { url, serviceId, sellerId, reason } = req.body as {
    url?: string; serviceId?: string; sellerId?: string; reason?: string;
  };
  if (!url || !serviceId || !sellerId || !reason) {
    return res.status(400).json({ error: "url, serviceId, sellerId, reason are required" });
  }

  const policyGate = makePolicyGate(serviceId, sellerId, reason);

  try {
    let result: { data: unknown; amountAtomic: string; formattedAmount: string; transaction: string; status: number };

    if (CIRCLE_MODE()) {
      // F8: signature produced by Circle Wallets (DCW EOA) — no key in our stack.
      result = await dcwPay(url, policyGate);
    } else {
      // Day-0 path: local key inside SpendGuard; policy enforced via SDK hook
      // running in THIS trusted process.
      const client = newClient();
      client.onBeforePaymentCreation(async (ctx) => {
        try {
          await policyGate(BigInt(ctx.selectedRequirements.amount), ctx.selectedRequirements.payTo);
        } catch (e) {
          if (e instanceof PolicyDeniedError) return { abort: true as const, reason: e.message };
          throw e;
        }
      });
      const r = await client.pay(url);
      result = {
        data: r.data, amountAtomic: r.amount.toString(),
        formattedAmount: r.formattedAmount, transaction: r.transaction, status: r.status,
      };
    }

    logLedger({
      serviceId, sellerId, payTo: "",
      amountAtomic: result.amountAtomic, decision: "allow",
      transaction: result.transaction, reason,
    });
    const ok: PayResult = {
      ok: true, status: result.status,
      amountAtomic: result.amountAtomic,
      formattedAmount: result.formattedAmount,
      transaction: result.transaction, data: result.data,
    };
    return res.json(ok);
  } catch (err) {
    if (err instanceof PolicyDeniedError) {
      return res.status(402).json({ ok: false, denied: true, code: err.code, reason: err.reason } as PayResult);
    }
    const message = err instanceof Error ? err.message : String(err);
    // Aborted-by-policy surfaces as a pay() error carrying our "code: reason" prefix;
    // classify it so the agent gets a structured denial and can re-plan.
    const KNOWN = [
      "monthly_budget_exceeded", "per_service_cap_exceeded", "per_tx_max_exceeded",
      "daily_velocity_exceeded", "seller_not_allowlisted", "approval_denied", "approval_timeout",
    ] as const;
    const code = KNOWN.find((c) => message.includes(c));
    if (code) {
      return res.status(402).json({ ok: false, denied: true, code, reason: message } satisfies PayResult);
    }
    // Not a policy denial — infrastructure/SDK error (e.g. insufficient Gateway balance).
    return res.status(502).json({ error: message });
  }
});

/** One-time Gateway deposit (first run). Amount in decimal USDC. */
app.post("/deposit", async (req, res) => {
  const { amount } = req.body as { amount?: string };
  if (!amount) return res.status(400).json({ error: "amount required" });
  try {
    if (CIRCLE_MODE()) {
      const { approveTx, depositTx } = await dcwDeposit(amount);
      return res.json({ depositTxHash: depositTx, approveTxHash: approveTx, amount });
    }
    const result = await newClient().deposit(amount);
    return res.json({ depositTxHash: result.depositTxHash, amount: result.formattedAmount });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Autonomous treasury top-up: pull USDC into Arc from a source chain via CCTP. */
app.post("/treasury/topup", async (req, res) => {
  const { amount } = req.body as { amount?: string };
  if (!amount) return res.status(400).json({ error: "amount required" });
  if (!CIRCLE_MODE()) return res.status(409).json({ error: "CCTP top-up requires SIGNER_MODE=circle" });
  try {
    const result = await cctpTopUp(amount);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** USYC tokenized-yield leg (enterprise-gated; wired behind USYC_ENABLED). */
app.post("/treasury/yield/invest", async (req, res) => {
  const { amount } = req.body as { amount?: string };
  if (!amount) return res.status(400).json({ error: "amount required" });
  try { return res.json(await usycInvest(amount)); }
  catch (err) { return res.status(409).json({ error: err instanceof Error ? err.message : String(err) }); }
});
app.post("/treasury/yield/redeem", async (req, res) => {
  const { amount } = req.body as { amount?: string };
  if (!amount) return res.status(400).json({ error: "amount required" });
  try { return res.json(await usycRedeem(amount)); }
  catch (err) { return res.status(409).json({ error: err instanceof Error ? err.message : String(err) }); }
});

/** StableFX cross-currency settlement (enterprise-gated; wired behind STABLEFX_ENABLED). */
app.post("/fx/quote", async (req, res) => {
  const { from, to, amount } = req.body as { from?: string; to?: string; amount?: string };
  if (!from || !to || !amount) return res.status(400).json({ error: "from, to, amount required" });
  try { return res.json(await fxQuote(from, to, amount)); }
  catch (err) { return res.status(409).json({ error: err instanceof Error ? err.message : String(err) }); }
});
app.post("/fx/settle", async (req, res) => {
  const { quoteId } = req.body as { quoteId?: string };
  if (!quoteId) return res.status(400).json({ error: "quoteId required" });
  try { return res.json(await fxSettle(quoteId)); }
  catch (err) { return res.status(409).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get("/balances", async (_req, res) => {
  try {
    const b = await readClient().getBalances(
      CIRCLE_MODE() ? (process.env.AGENT_WALLET_ADDRESS as `0x${string}`) : undefined,
    );
    res.json({ wallet: b.wallet.formatted, gatewayAvailable: b.gateway.formattedAvailable, gatewayTotal: b.gateway.formattedTotal });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/policies", (_req, res) => res.json(getPolicy()));

app.post("/policies", async (req, res) => {
  setPolicy(req.body);
  const anchorTx = await anchorPolicyHash(JSON.stringify(req.body)).catch(() => null);
  res.json({ ok: true, anchorTx });
});

app.get("/approvals", (_req, res) => res.json(pendingApprovals()));

app.post("/approvals/:id/decide", (req, res) => {
  const { decision } = req.body as { decision?: "approved" | "denied" };
  if (decision !== "approved" && decision !== "denied") return res.status(400).json({ error: "decision must be approved|denied" });
  decideApproval(req.params.id, decision);
  res.json({ ok: true });
});

app.get("/ledger", (_req, res) => res.json(recentLedger()));

/** Gateway transfer status lookup — payment "receipts" are transfer UUIDs, not chain txs. */
app.get("/transfers/:id", async (req, res) => {
  try {
    const t = await readClient().getTransferById(req.params.id);
    res.json(t);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Anchor a spend epoch on Arc (F9): ledger snapshot root + total spent.
 *  Skips (returns null) when nothing was spent since the last committed epoch,
 *  so every anchored epoch marks real ledger movement — no empty commits. */
async function commitEpoch(force = false) {
  const entries = recentLedger(1000);
  const total = entries
    .filter((e) => e.decision === "allow" && e.transaction)
    .reduce((s, e) => s + BigInt(e.amountAtomic), 0n);
  const prev = lastEpoch();
  if (!force && prev && prev.totalSpentAtomic === total.toString()) return null; // nothing new to anchor
  const result = await commitEpochOnChain(JSON.stringify(entries), total);
  if (!result) return null; // ANCHOR_CONTRACT_ADDRESS not configured
  logEpoch({ ...result, totalSpentAtomic: total.toString() });
  return { ...result, totalSpentAtomic: total.toString(), explorer: `https://testnet.arcscan.app/tx/${result.tx}` };
}

app.post("/epochs/commit", async (_req, res) => {
  try {
    const result = await commitEpoch(true);
    if (!result) return res.status(409).json({ error: "ANCHOR_CONTRACT_ADDRESS not configured" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** F9 auto-anchor: commit an epoch on a fixed cadence (default 10 min) so the
 *  on-chain audit trail — and the dashboard's epoch chip — never go stale.
 *  Set EPOCH_COMMIT_INTERVAL_MS=0 to disable and anchor manually only. */
const EPOCH_INTERVAL = Number(process.env.EPOCH_COMMIT_INTERVAL_MS ?? 600_000);
if (EPOCH_INTERVAL > 0) {
  setInterval(async () => {
    try {
      const r = await commitEpoch();
      if (r) console.log(`[spendguard] epoch ${r.epoch} anchored on Arc (${r.totalSpentAtomic} atomic spent) → ${r.explorer}`);
    } catch (err) {
      console.warn(`[spendguard] epoch auto-commit failed (will retry next interval): ${err instanceof Error ? err.message : err}`);
    }
  }, EPOCH_INTERVAL).unref();
}

app.get("/summary", (_req, res) => {
  const entries = recentLedger(1000);
  const spent = entries.filter((e) => e.decision === "allow" && e.transaction).reduce((s, e) => s + BigInt(e.amountAtomic), 0n);
  res.json({
    spentThisWindow: fromAtomic(spent),
    payments: entries.filter((e) => e.decision === "allow" && e.transaction).length,
    denials: entries.filter((e) => e.decision === "deny").length,
    holds: entries.filter((e) => e.decision === "hold").length,
    policy: getPolicy(),
    lastEpoch: lastEpoch(),
  });
});

/**
 * F8 upgrade path — remote BatchEvmSigner endpoint (SIGNER_MODE=circle).
 * The agent-side remote-signer.ts calls this instead of holding any key.
 * DAY-1 SPIKE: verify Gateway accepts the DCW-EOA signature end-to-end.
 */
app.post("/sign", async (req, res) => {
  if (process.env.SIGNER_MODE !== "circle") {
    return res.status(409).json({ error: "SIGNER_MODE is not 'circle' — /sign disabled; use /pay" });
  }
  try {
    // NOTE: policy is enforced here too — parse value/payTo from the EIP-3009 message.
    const { typedData, serviceId, sellerId, reason } = req.body;
    const msg = typedData?.message ?? {};
    const verdict = evaluate({
      serviceId: serviceId ?? "unknown", sellerId: sellerId ?? "unknown",
      payTo: String(msg.to ?? ""), amountAtomic: BigInt(msg.value ?? 0),
    });
    if (verdict.decision !== "allow") {
      return res.status(403).json({ denied: true, code: verdict.code, reason: verdict.reason ?? reason });
    }
    const signature = await circleSignTypedData(typedData);
    return res.json({ signature });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const server = app.listen(PORT, () =>
  console.log(`[spendguard] listening on :${PORT} (mode=${process.env.SIGNER_MODE ?? "local"})`),
);
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[spendguard] port ${PORT} is already in use.\n` +
      `  → another signer instance running? (lsof -i :${PORT})\n` +
      `  → note: macOS AirPlay owns port 5000 — keep SIGNER_PORT=5001`,
    );
    process.exit(1);
  }
  throw err;
});

/** Exit immediately on interrupt so the watcher never has to force-kill. */
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    console.log(`[spendguard] ${sig} — shutting down cleanly`);
    server.close();
    server.closeAllConnections?.();
    process.exit(0);
  });
}
