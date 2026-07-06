/**
 * A competing x402 seller — Circle Nanopayments seller quickstart pattern,
 * extended with dynamic pricing (re-resolved per request, so tier changes and
 * demo price-drift take effect live) and settle-side audit hooks.
 */
import express from "express";
import { formatUnits } from "viem";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { currentPriceUsd, priceString, type SellerConfig } from "./pricing.js";

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
  app.get("/quote", (req, res) => {
    const expectedCalls = Number(req.query.expectedCalls ?? 0);
    res.json({
      sellerId: cfg.id,
      name: cfg.name,
      serviceId: "fx-rates",
      priceUsd: currentPriceUsd(cfg, expectedCalls).toFixed(6),
      tier: expectedCalls > 0 ? `volume@${expectedCalls}` : "base",
      url: `http://localhost:${cfg.port}/data`,
    });
  });

  /**
   * Paid endpoint. Price is re-resolved on EVERY request (dynamic pricing):
   * gateway.require(price) is bound at call time, not boot time.
   */
  app.get("/data", (req, res, next) => {
    const expectedCalls = Number(req.query.expectedCalls ?? 0);
    gateway.require(priceString(cfg, expectedCalls))(req, res, next);
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

  app.listen(cfg.port, () => console.log(`[seller ${cfg.id}] ${cfg.name} on :${cfg.port} base=$${cfg.basePriceUsd.toFixed(6)}/call`));
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
