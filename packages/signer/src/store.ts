import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Approval, LedgerEntry, PolicyConfig } from "@autopilot/shared";

const db = new Database(process.env.SIGNER_DB ?? "spendguard.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  serviceId TEXT NOT NULL, sellerId TEXT NOT NULL, payTo TEXT NOT NULL,
  amountAtomic TEXT NOT NULL, decision TEXT NOT NULL, code TEXT, transaction_id TEXT, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  serviceId TEXT NOT NULL, sellerId TEXT NOT NULL,
  amountAtomic TEXT NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS epochs (
  epoch INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  tx TEXT NOT NULL, spendRoot TEXT NOT NULL, totalSpentAtomic TEXT NOT NULL
);
`);

export interface EpochRecord { epoch: number; ts: string; tx: string; spendRoot: string; totalSpentAtomic: string }

export function logEpoch(e: Omit<EpochRecord, "ts">): void {
  db.prepare("INSERT OR REPLACE INTO epochs (epoch, tx, spendRoot, totalSpentAtomic) VALUES (?, ?, ?, ?)").run(
    e.epoch, e.tx, e.spendRoot, e.totalSpentAtomic,
  );
}

export function lastEpoch(): EpochRecord | null {
  return (db.prepare("SELECT * FROM epochs ORDER BY epoch DESC LIMIT 1").get() as EpochRecord | undefined) ?? null;
}

export function defaultPolicy(): PolicyConfig {
  return {
    monthlyBudget: process.env.POLICY_MONTHLY_BUDGET ?? "10",
    perServiceCap: process.env.POLICY_PER_SERVICE_CAP ?? "3",
    perTxMax: process.env.POLICY_PER_TX_MAX ?? "0.05",
    approvalThreshold: process.env.POLICY_APPROVAL_THRESHOLD ?? "0.02",
    dailyTxMax: Number(process.env.POLICY_DAILY_TX_MAX ?? 200),
    allowlist: [process.env.SELLER_ADDRESS_A, process.env.SELLER_ADDRESS_B, process.env.SELLER_ADDRESS_C]
      .filter(Boolean)
      .map((a) => (a as string).toLowerCase()),
  };
}

export function getPolicy(): PolicyConfig {
  const row = db.prepare("SELECT json FROM policy WHERE id = 1").get() as { json: string } | undefined;
  if (!row) {
    const p = defaultPolicy();
    db.prepare("INSERT INTO policy (id, json) VALUES (1, ?)").run(JSON.stringify(p));
    return p;
  }
  return JSON.parse(row.json);
}

export function setPolicy(p: PolicyConfig): void {
  db.prepare("INSERT INTO policy (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(
    JSON.stringify(p),
  );
}

export function spentThisMonthAtomic(serviceId?: string): bigint {
  const base =
    "SELECT COALESCE(SUM(CAST(amountAtomic AS INTEGER)), 0) AS total FROM ledger WHERE decision = 'allow' AND transaction_id IS NOT NULL AND ts >= date('now','start of month')";
  const row = serviceId
    ? (db.prepare(base + " AND serviceId = ?").get(serviceId) as { total: number })
    : (db.prepare(base).get() as { total: number });
  return BigInt(row.total);
}

export function txCountToday(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM ledger WHERE ts >= date('now') AND decision = 'allow'")
    .get() as { n: number };
  return row.n;
}

export function logLedger(e: Omit<LedgerEntry, "id" | "ts">): void {
  db.prepare(
    "INSERT INTO ledger (serviceId, sellerId, payTo, amountAtomic, decision, code, transaction_id, reason) VALUES (?,?,?,?,?,?,?,?)",
  ).run(e.serviceId, e.sellerId, e.payTo, e.amountAtomic, e.decision, e.code ?? null, e.transaction ?? null, e.reason);
}

export function recentLedger(limit = 100): LedgerEntry[] {
  return db
    .prepare(
      "SELECT id, ts, serviceId, sellerId, payTo, amountAtomic, decision, code, transaction_id AS 'transaction', reason FROM ledger ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as LedgerEntry[];
}

export function createApproval(a: Omit<Approval, "id" | "ts" | "status">): string {
  const id = randomUUID();
  db.prepare("INSERT INTO approvals (id, serviceId, sellerId, amountAtomic, reason) VALUES (?,?,?,?,?)").run(
    id, a.serviceId, a.sellerId, a.amountAtomic, a.reason,
  );
  return id;
}

export function getApproval(id: string): Approval | undefined {
  return db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Approval | undefined;
}

export function decideApproval(id: string, status: "approved" | "denied"): void {
  db.prepare("UPDATE approvals SET status = ? WHERE id = ? AND status = 'pending'").run(status, id);
}

export function pendingApprovals(): Approval[] {
  return db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY ts DESC").all() as Approval[];
}
