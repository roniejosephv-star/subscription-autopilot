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
  // Demo price drift, per seller: DEMO_PRICE_DRIFT_A / _B / _C (e.g. 1.6 = +60%).
  // Drift the seller the agent is CURRENTLY subscribed to, so the renewal
  // re-shop has a real reason to switch (demo beat 2).
  const drift = (id: string) => Number(process.env[`DEMO_PRICE_DRIFT_${id}`] ?? 1);
  return [
    {
      id: "A", name: "FXRates Prime", port: Number(process.env.SELLER_PORT_A ?? 4001),
      address: required("SELLER_ADDRESS_A"),
      basePriceUsd: 0.005 * drift("A"),
      volumeTiers: [{ minCallsPerPeriod: 100, discountPct: 10 }],
    },
    {
      id: "B", name: "RateWire", port: Number(process.env.SELLER_PORT_B ?? 4002),
      address: required("SELLER_ADDRESS_B"),
      basePriceUsd: 0.004 * drift("B"),
      volumeTiers: [{ minCallsPerPeriod: 50, discountPct: 15 }, { minCallsPerPeriod: 200, discountPct: 25 }],
    },
    {
      id: "C", name: "SouqFX", port: Number(process.env.SELLER_PORT_C ?? 4003),
      address: required("SELLER_ADDRESS_C"),
      basePriceUsd: 0.006 * drift("C"),
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
