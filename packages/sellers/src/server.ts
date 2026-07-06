/**
 * A competing x402 seller — Circle Nanopayments seller quickstart pattern,
 * extended with dynamic pricing (re-resolved per request, so tier changes and
 * demo price-drift take effect live) and settle-side audit hooks.
 */
import express from "express";
import type { Server } from "node:http";
import { formatUnits } from "viem";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { currentPriceUsd, priceString, type SellerConfig } from "./pricing.js";

const servers: Server[] = [];

/** Close all listeners immediately on interrupt so tsx never has to force-kill. */
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    console.log(`[sellers] ${sig} — shutting down cleanly`);
    for (const s of servers) s.close();
    for (const s of servers) s.closeAllConnections?.();
    process.exit(0);
  });
}

type PaidRequest = express.Request & {
  payment?: { verified: boolean; payer: string; amount: string; network: string; transaction?: string };
};

export function startSeller(cfg: SellerConfig): void {
  const app = express();

  const gateway = createGatewayMiddleware({
    sellerAddress: cfg.address,
    facilitatorUrl: process.env.GATEWAY_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com",
    description: `${cfg.name} — FX rates, pay-per-call`,
  });

  /** Free quote endpoint — the agent's research/negotiation surface. */
  // Self base URL for the paid endpoint we advertise in quotes.
  // Locally: localhost. Deployed: SELLER_URL_<ID> (e.g. http://sellers.railway.internal:4001)
  const selfBase = process.env[`SELLER_URL_${cfg.id}`] ?? `http://localhost:${cfg.port}`;
  app.get("/quote", (req, res) => {
    const expectedCalls = Number(req.query.expectedCalls ?? 0);
    res.json({
      sellerId: cfg.id,
      name: cfg.name,
      serviceId: "fx-rates",
      priceUsd: currentPriceUsd(cfg, expectedCalls).toFixed(6),
      tier: expectedCalls > 0 ? `volume@${expectedCalls}` : "base",
      url: `${selfBase}/data`,
    });
  });

  /**
   * Paid endpoint. Price is re-resolved on EVERY request (dynamic pricing):
   * gateway.require(price) is bound at call time, not boot time.
   * Special tiers for the demo's policy beats:
   *   ?unlimited=true → $0.50/call  (exceeds per-tx max → SpendGuard hard-denies; beat 3)
   *   ?premium=true   → $0.03/call  (exceeds approval threshold → hold for human; beat 4)
   */
  app.get("/data", (req, res, next) => {
    const expectedCalls = Number(req.query.expectedCalls ?? 0);
    const price =
      req.query.unlimited === "true" ? "$0.500000" :
      req.query.premium === "true" ? "$0.030000" :
      priceString(cfg, expectedCalls);
    gateway.require(price)(req, res, next);
  }, auditHook(cfg), (req: PaidRequest, res) => {
    const { payer, amount, network } = req.payment!;
    console.log(`[seller ${cfg.id}] paid ${formatUnits(BigInt(amount), 6)} USDC by ${payer} on ${network}`);
    res.json({
      sellerId: cfg.id,
      pair: "EUR/AED",
      rate: (3.9 + Math.random() * 0.05).toFixed(4),
      asOf: new Date().toISOString(),
      paid_by: payer,
    });
  });

  const server = app.listen(cfg.port, () =>
    console.log(`[seller ${cfg.id}] ${cfg.name} on :${cfg.port} base=$${cfg.basePriceUsd.toFixed(6)}/call`),
  );
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[seller ${cfg.id}] port ${cfg.port} in use — orphaned instance? (lsof -ti :${cfg.port} | xargs kill)`);
      process.exit(1);
    }
    throw err;
  });
  servers.push(server);
}

/** Settle-side audit log (F10). Runs after middleware verified+settled. */
function auditHook(cfg: SellerConfig) {
  return (req: PaidRequest, _res: express.Response, next: express.NextFunction) => {
    if (req.payment) {
      console.log(`[audit ${cfg.id}]`, JSON.stringify({
        ts: new Date().toISOString(), payer: req.payment.payer,
        amountAtomic: req.payment.amount, tx: req.payment.transaction ?? null,
      }));
    }
    next();
  };
}
