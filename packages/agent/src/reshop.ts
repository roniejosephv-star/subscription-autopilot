/**
 * Re-shop at renewal — research + negotiate (C-lite).
 * Probes every seller's free /quote with the subscription's actual usage,
 * picks the cheapest qualifying tier, and returns a decision with rationale.
 */
import type { Quote, SubscriptionRecord } from "@autopilot/shared";

// Deployed: SELLER_URL_<ID> points at the sellers service (private network).
const SELLERS = [
  { id: "A", base: process.env.SELLER_URL_A ?? `http://localhost:${process.env.SELLER_PORT_A ?? 4001}` },
  { id: "B", base: process.env.SELLER_URL_B ?? `http://localhost:${process.env.SELLER_PORT_B ?? 4002}` },
  { id: "C", base: process.env.SELLER_URL_C ?? `http://localhost:${process.env.SELLER_PORT_C ?? 4003}` },
];

export async function getQuotes(expectedCalls: number): Promise<Quote[]> {
  const quotes = await Promise.all(
    SELLERS.map(async (s) => {
      const res = await fetch(`${s.base}/quote?expectedCalls=${expectedCalls}`);
      if (!res.ok) return null;
      return (await res.json()) as Quote;
    }),
  );
  return quotes.filter((q): q is Quote => q !== null);
}

export interface ReshopDecision {
  switch: boolean;
  from: string;
  to: Quote;
  savingsPctPerCall: number;
  rationale: string;
}

export async function reshop(sub: SubscriptionRecord): Promise<ReshopDecision> {
  const expectedCalls = Math.max(sub.callsThisPeriod, 1);
  const quotes = await getQuotes(expectedCalls);
  if (quotes.length === 0) throw new Error("no sellers reachable");

  const current = quotes.find((q) => q.sellerId === sub.sellerId);
  const best = quotes.reduce((a, b) => (Number(a.priceUsd) <= Number(b.priceUsd) ? a : b));
  const currentPrice = Number(current?.priceUsd ?? sub.priceUsd);
  const savingsPct = ((currentPrice - Number(best.priceUsd)) / currentPrice) * 100;

  // Switching threshold: >5% per-call savings (avoid churn on noise)
  const shouldSwitch = best.sellerId !== sub.sellerId && savingsPct > 5;
  return {
    switch: shouldSwitch,
    from: sub.sellerId,
    to: shouldSwitch ? best : (current ?? best),
    savingsPctPerCall: Math.round(savingsPct * 10) / 10,
    rationale: shouldSwitch
      ? `Seller ${sub.sellerId} now $${currentPrice.toFixed(6)}/call vs ${best.sellerId} at $${best.priceUsd}/call for ~${expectedCalls} calls (tier ${best.tier}) → switch, ${savingsPct.toFixed(1)}% cheaper per call`
      : `Seller ${sub.sellerId} still competitive at ~${expectedCalls} calls/period → stay`,
  };
}
