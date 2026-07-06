"use client";
import { useEffect, useState } from "react";

const SIGNER = process.env.NEXT_PUBLIC_SIGNER_URL ?? "http://localhost:5001";
// Official Arc Testnet explorer (docs.arc.io → Tools): for 0x tx hashes (anchors).
// Payment receipts are Gateway transfer UUIDs → resolved via the signer instead.
const ARCSCAN_TX = "https://testnet.arcscan.app/tx/";

interface Ledger { id: number; ts: string; serviceId: string; sellerId: string; amountAtomic: string; decision: string; code?: string; transaction?: string; reason: string }
interface Approval { id: string; ts: string; serviceId: string; sellerId: string; amountAtomic: string; reason: string }
interface Summary { spentThisWindow: string; payments: number; denials: number; holds: number; policy: { monthlyBudget: string; approvalThreshold: string } }

const fmt = (atomic: string) => (Number(atomic) / 1e6).toFixed(6);

export default function Page() {
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function refresh() {
    try {
      const [l, a, s] = await Promise.all([
        fetch(`${SIGNER}/ledger`).then((r) => r.json()),
        fetch(`${SIGNER}/approvals`).then((r) => r.json()),
        fetch(`${SIGNER}/summary`).then((r) => r.json()),
      ]);
      setLedger(l); setApprovals(a); setSummary(s);
    } catch { /* signer offline */ }
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 2000); return () => clearInterval(t); }, []);

  async function decide(id: string, decision: "approved" | "denied") {
    await fetch(`${SIGNER}/approvals/${id}/decide`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }),
    });
    refresh();
  }

  const [receiptStatus, setReceiptStatus] = useState<Record<string, string>>({});
  async function checkReceipt(id: string) {
    setReceiptStatus((s) => ({ ...s, [id]: "…" }));
    try {
      const t = await fetch(`${SIGNER}/transfers/${id}`).then((r) => r.json());
      setReceiptStatus((s) => ({ ...s, [id]: t.status ?? "unknown" }));
    } catch {
      setReceiptStatus((s) => ({ ...s, [id]: "lookup failed" }));
    }
  }

  const pct = summary ? Math.min(100, (Number(summary.spentThisWindow) / Number(summary.policy.monthlyBudget)) * 100) : 0;

  return (
    <main>
      {summary && (
        <section style={card}>
          <b>Budget burn-down</b>
          <div style={{ background: "#1c2440", borderRadius: 8, height: 14, marginTop: 8 }}>
            <div style={{ width: `${pct}%`, background: pct > 85 ? "#e5534b" : "#3fb68b", height: "100%", borderRadius: 8, transition: "width .5s" }} />
          </div>
          <small>{summary.spentThisWindow} / {summary.policy.monthlyBudget} USDC · {summary.payments} payments · {summary.denials} denials · {summary.holds} holds</small>
        </section>
      )}

      {approvals.length > 0 && (
        <section style={{ ...card, borderColor: "#e5a53a" }}>
          <b>⏳ Awaiting your approval</b>
          {approvals.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
              <span style={{ flex: 1 }}>{fmt(a.amountAtomic)} USDC → {a.serviceId}@{a.sellerId} — <i>{a.reason}</i></span>
              <button style={btn("#3fb68b")} onClick={() => decide(a.id, "approved")}>Approve</button>
              <button style={btn("#e5534b")} onClick={() => decide(a.id, "denied")}>Deny</button>
            </div>
          ))}
        </section>
      )}

      <section style={card}>
        <b>Live activity</b>
        <table style={{ width: "100%", fontSize: 13, marginTop: 8, borderCollapse: "collapse" }}>
          <thead><tr style={{ opacity: 0.6, textAlign: "left" }}><th>time</th><th>service</th><th>USDC</th><th>decision</th><th>detail</th></tr></thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid #1c2440" }}>
                <td>{e.ts.slice(11, 19)}</td>
                <td>{e.serviceId}@{e.sellerId}</td>
                <td>{fmt(e.amountAtomic)}</td>
                <td style={{ color: e.decision === "allow" ? "#3fb68b" : e.decision === "hold" ? "#e5a53a" : "#e5534b" }}>
                  {e.decision}{e.code ? ` (${e.code})` : ""}
                </td>
                <td>{e.transaction
                  ? e.transaction.startsWith("0x")
                    ? <a style={{ color: "#7aa7ff" }} href={`${ARCSCAN_TX}${e.transaction}`} target="_blank">arcscan</a>
                    : <button style={{ background: "none", border: 0, color: "#7aa7ff", cursor: "pointer", padding: 0 }}
                        onClick={() => checkReceipt(e.transaction!)}>
                        {receiptStatus[e.transaction] ? `gateway: ${receiptStatus[e.transaction]}` : "receipt"}
                      </button>
                  : <span style={{ opacity: 0.7 }}>{e.reason.slice(0, 60)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const card: React.CSSProperties = { background: "#121a33", border: "1px solid #1c2440", borderRadius: 12, padding: 16, marginTop: 16 };
const btn = (bg: string): React.CSSProperties => ({ background: bg, border: 0, borderRadius: 8, color: "#fff", padding: "6px 14px", cursor: "pointer" });
