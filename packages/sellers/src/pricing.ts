/**
 * Dynamic pricing per seller — the "negotiate" surface (C-lite).
 * Each seller offers tiers; current price can drift (seed-demo raises Seller A)
 * so the agent's re-shop-at-renewal has something real to react to.
 */
export interface SellerConfig {
  id: "A" | "B" | "C";
  name: string;
  port: number;
  address: string;
  basePriceUsd: number;       // per call
  volumeTiers: Array<{ minCallsPerPeriod: number; discountPct: number }>;
}

export function sellerConfigs(): SellerConfig[] {
  const drift = Number(process.env.DEMO_PRICE_DRIFT_A ?? 1); // seed-demo sets 1.6 → Seller A +60%
  return [
    {
      id: "A", name: "FXRates Prime", port: Number(process.env.SELLER_PORT_A ?? 4001),
      address: required("SELLER_ADDRESS_A"),
      basePriceUsd: 0.005 * drift,
      volumeTiers: [{ minCallsPerPeriod: 100, discountPct: 10 }],
    },
    {
      id: "B", name: "RateWire", port: Number(process.env.SELLER_PORT_B ?? 4002),
      address: required("SELLER_ADDRESS_B"),
      basePriceUsd: 0.004,
      volumeTiers: [{ minCallsPerPeriod: 50, discountPct: 15 }, { minCallsPerPeriod: 200, discountPct: 25 }],
    },
    {
      id: "C", name: "SouqFX", port: Number(process.env.SELLER_PORT_C ?? 4003),
      address: required("SELLER_ADDRESS_C"),
      basePriceUsd: 0.006,
      volumeTiers: [{ minCallsPerPeriod: 20, discountPct: 30 }],
    },
  ];
}

export function currentPriceUsd(cfg: SellerConfig, expectedCalls = 0): number {
  const tier = [...cfg.volumeTiers].reverse().find((t) => expectedCalls >= t.minCallsPerPeriod);
  const price = cfg.basePriceUsd * (1 - (tier?.discountPct ?? 0) / 100);
  return Math.max(price, 0.000001);
}

export function priceString(cfg: SellerConfig, expectedCalls = 0): string {
  return `$${currentPriceUsd(cfg, expectedCalls).toFixed(6)}`;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} — see .env.example`);
  return v;
}
