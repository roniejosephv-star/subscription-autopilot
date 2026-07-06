/**
 * Subscription ledger + renewal scheduler.
 * Periods are demo-compressed: RENEWAL_PERIOD_MS (default 2 min) = one "month".
 */
import fs from "node:fs";
import path from "node:path";
import type { SubscriptionRecord } from "@autopilot/shared";

const DATA_DIR = process.env.AGENT_DATA_DIR ?? path.resolve(process.cwd(), "../../data");
const FILE = path.join(DATA_DIR, "subscriptions.json");
export const RENEWAL_PERIOD_MS = Number(process.env.RENEWAL_PERIOD_MS ?? 2 * 60 * 1000);

export function load(): SubscriptionRecord[] {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

export function save(subs: SubscriptionRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(subs, null, 2));
}

export function upsert(sub: SubscriptionRecord): void {
  const subs = load().filter((s) => s.serviceId !== sub.serviceId);
  subs.push(sub);
  save(subs);
}

export function due(now = Date.now()): SubscriptionRecord[] {
  return load().filter((s) => new Date(s.renewsAt).getTime() <= now);
}

export function newSubscription(serviceId: string, sellerId: string, url: string, priceUsd: string): SubscriptionRecord {
  const now = new Date();
  return {
    serviceId, sellerId, url, priceUsd,
    startedAt: now.toISOString(),
    renewsAt: new Date(now.getTime() + RENEWAL_PERIOD_MS).toISOString(),
    callsThisPeriod: 0,
    spentAtomicThisPeriod: "0",
    history: [{ ts: now.toISOString(), event: "subscribed", detail: `${sellerId} @ $${priceUsd}/call` }],
  };
}

export function recordCall(serviceId: string, amountAtomic: string): void {
  const subs = load();
  const sub = subs.find((s) => s.serviceId === serviceId);
  if (!sub) return;
  sub.callsThisPeriod += 1;
  sub.spentAtomicThisPeriod = (BigInt(sub.spentAtomicThisPeriod) + BigInt(amountAtomic)).toString();
  save(subs);
}

export function rollPeriod(sub: SubscriptionRecord, event: string, detail: string): SubscriptionRecord {
  const now = new Date();
  sub.renewsAt = new Date(now.getTime() + RENEWAL_PERIOD_MS).toISOString();
  sub.callsThisPeriod = 0;
  sub.spentAtomicThisPeriod = "0";
  sub.history.push({ ts: now.toISOString(), event, detail });
  return sub;
}
