"use client";
import { useEffect, useState } from "react";

// Same-origin proxy path (see next.config.mjs). NEXT_PUBLIC_SIGNER_URL remains
// as an override for direct-to-signer setups.
const SIGNER = process.env.NEXT_PUBLIC_SIGNER_URL ?? "/api/signer";
const ANCHOR = "0xfe18f3c42f9318f20cae9cd5b2983e229554e435";
const ARCSCAN = `https://testnet.arcscan.app/address/${ANCHOR}`;

interface Ledger { id: number; ts: string; serviceId: string; sellerId: string; amountAtomic: string; decision: string; code?: string; transaction?: string; reason: string }
interface Approval { id: string; ts: string; serviceId: string; sellerId: string; amountAtomic: string; reason: string }
interface Policy { monthlyBudget: string; perTxMax: string; perServiceCap: string; dailyTxMax: number; approvalThreshold: string; allowlist: string[] }
interface Epoch { epoch: number; ts: string; tx: string; spendRoot: string; totalSpentAtomic: string }
interface Summary { spentThisWindow: string; payments: number; denials: number; holds: number; policy: Policy; lastEpoch?: Epoch | null }
interface Balances { wallet: string; gatewayAvailable: string; gatewayTotal: string }
interface Switch { ts: string; serviceId: string; from: string; to: string; savingsPct: number }

const fmt = (atomic: string) => (Number(atomic) / 1e6).toFixed(6);
const hhmmss = (ts: string) => ts.slice(11, 19);

const mono = "ui-monospace, 'SF Mono', Menlo, monospace";

/** Reconstruct seller switches from the payment ledger: for each service, a
 *  change of sellerId between consecutive settled payments is a re-shop switch;
 *  savings% is the per-call amount delta at that boundary. Real data only. */
function deriveSwitches(ledger: Ledger[]): Switch[] {
  const chrono = [...ledger].reverse().filter((e) => e.decision === "allow" && e.transaction && Number(e.amountAtomic) > 0);
  const last: Record<string, Ledger> = {};
  const out: Switch[] = [];
  for (const e of chrono) {
    const prev = last[e.serviceId];
    if (prev && prev.sellerId !== e.sellerId) {
      const a = Number(prev.amountAtomic), b = Number(e.amountAtomic);
      out.push({ ts: e.ts, serviceId: e.serviceId, from: prev.sellerId, to: e.sellerId, savingsPct: a > 0 ? Math.round(((a - b) / a) * 1000) / 10 : 0 });
    }
    last[e.serviceId] = e;
  }
  return out.reverse(); // newest first
}

export default function Page() {
  const [view, setView] = useState<"overview" | "feed" | "policy">("overview");
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [online, setOnline] = useState(true);
  const [receiptStatus, setReceiptStatus] = useState<Record<string, string>>({});

  async function refresh(): Promise<boolean> {
    try {
      const responses = await Promise.all([
        fetch(`${SIGNER}/ledger`), fetch(`${SIGNER}/approvals`), fetch(`${SIGNER}/summary`),
      ]);
      if (responses.some((r) => !r.ok)) throw new Error("signer unavailable");
      const [l, a, s] = await Promise.all(responses.map((r) => r.json()));
      setLedger(l); setApprovals(a); setSummary(s); setOnline(true);
      return true;
    } catch {
      setOnline(false); // keep last-known data on screen
      return false;
    }
  }

  // Poll with backoff: 2s while healthy, 10s while the signer is unreachable.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const ok = await refresh();
      if (!stop) timer = setTimeout(tick, ok ? 2000 : 10000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  // Treasury polls slowly (it reaches Circle's API); tolerate failure silently.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const b = await fetch(`${SIGNER}/balances`).then((r) => (r.ok ? r.json() : null));
        if (!stop && b && !b.error) setBalances(b);
      } catch { /* keep last known */ }
      if (!stop) timer = setTimeout(tick, 15000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  async function decide(id: string, decision: "approved" | "denied") {
    await fetch(`${SIGNER}/approvals/${id}/decide`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }),
    });
    refresh();
  }

  async function checkReceipt(id: string) {
    setReceiptStatus((s) => ({ ...s, [id]: "…" }));
    try {
      const t = await fetch(`${SIGNER}/transfers/${id}`).then((r) => r.json());
      setReceiptStatus((s) => ({ ...s, [id]: t.status ?? "unknown" }));
    } catch {
      setReceiptStatus((s) => ({ ...s, [id]: "lookup failed" }));
    }
  }

  const policy = summary?.policy;
  const spent = summary ? Number(summary.spentThisWindow) : 0;
  const budget = policy ? Number(policy.monthlyBudget) : 0;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const barColor = pct > 85 ? "#e5534b" : "#3fb68b";
  const statusColor = online ? "#3fb68b" : "#e5534b";
  const statusText = online ? "SpendGuard online" : "SpendGuard unreachable";

  const switches = deriveSwitches(ledger);
  const lastSwitch = switches[0];
  const settled = ledger.filter((e) => e.decision === "allow" && e.transaction && Number(e.amountAtomic) > 0);
  const current = settled[0]; // newest settled payment = live subscription

  const nav = [
    { key: "overview" as const, glyph: "◈", label: "Overview", file: "overview.live" },
    { key: "feed" as const, glyph: "▤", label: "Live feed", file: "ledger.live" },
    { key: "policy" as const, glyph: "⛨", label: "Policy", file: "policy.chain" },
  ];
  const activeFile = nav.find((n) => n.key === view)!.file;

  const policyRules = policy ? [
    { n: "1", name: "allowlist", value: `${policy.allowlist.length} sellers`, action: "deny", color: "#e5534b" },
    { n: "2", name: "perTxMax", value: `${policy.perTxMax} USDC`, action: "deny", color: "#e5534b" },
    { n: "3", name: "monthlyBudget", value: `${policy.monthlyBudget} USDC`, action: "deny", color: "#e5534b" },
    { n: "4", name: "perServiceCap", value: `${policy.perServiceCap} USDC`, action: "deny", color: "#e5534b" },
    { n: "5", name: "dailyTxMax", value: `${policy.dailyTxMax} tx`, action: "deny", color: "#e5534b" },
    { n: "6", name: "approvalThreshold", value: `${policy.approvalThreshold} USDC`, action: "hold", color: "#e5a53a" },
  ] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontSize: 13 }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .nav-item:hover { background: #121a33 !important; }
        .feed-row:hover { background: #121a33; }
        a { color: #7aa7ff; } a:hover { color: #a3c2ff; }
      `}</style>

      {/* ===== Title bar ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, height: 44, padding: "0 16px", background: "#0b1020", borderBottom: "1px solid #1c2440", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#3fb68b", display: "inline-block" }} />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Subscription Autopilot</span>
          <span style={{ opacity: 0.45, fontSize: 12 }}>Owner Console</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ font: `11.5px ${mono}`, color: "#8f9bb8", background: "#121a33", border: "1px solid #1c2440", borderRadius: 6, padding: "4px 10px" }}>
          Arc Testnet · chain 5042002 · gas = USDC
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#121a33", border: "1px solid #1c2440", borderRadius: 6, padding: "4px 10px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, animation: "pulse 2s infinite" }} />
          <span style={{ font: `11.5px ${mono}`, color: statusColor }}>{statusText}</span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* ===== Sidebar ===== */}
        <div style={{ width: 208, background: "#0b1020", borderRight: "1px solid #1c2440", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <div style={{ font: `700 10.5px ${mono}`, color: "#566083", letterSpacing: "0.08em", padding: "4px 10px 8px" }}>WORKSPACE</div>
          {nav.map((n) => (
            <div key={n.key} className="nav-item" onClick={() => setView(n.key)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, cursor: "pointer", background: view === n.key ? "#121a33" : "transparent", color: view === n.key ? "#e7ecf5" : "#8f9bb8" }}>
              <span style={{ font: `12px ${mono}`, opacity: 0.7 }}>{n.glyph}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{n.label}</span>
              {n.key === "overview" && approvals.length > 0 && (
                <span style={{ background: "#e5a53a", color: "#070b17", font: `700 10.5px ${mono}`, borderRadius: 9, padding: "2px 7px" }}>{approvals.length}</span>
              )}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ borderTop: "1px solid #1c2440", padding: "10px 10px 4px", font: `11px ${mono}`, color: "#566083", lineHeight: 1.8 }}>
            agent: zero key material<br />custody: SpendGuard<br />poll: {online ? "2s" : "10s (retrying)"}
          </div>
        </div>

        {/* ===== Main area ===== */}
        <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Tab strip */}
            <div style={{ display: "flex", alignItems: "stretch", height: 36, background: "#0b1020", borderBottom: "1px solid #1c2440", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: "#070b17", borderRight: "1px solid #1c2440", borderTop: "2px solid #3fb68b" }}>
                <span style={{ font: `12px ${mono}`, color: "#e7ecf5" }}>{activeFile}</span>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", padding: "0 14px", font: `11px ${mono}`, color: "#566083" }}>read-only · live</div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

              {/* ===== OVERVIEW ===== */}
              {view === "overview" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <div style={statCard}>
                      <div style={statLabel}>SPENT / WINDOW</div>
                      <div style={{ ...statValue }}>{summary ? summary.spentThisWindow : "—"}</div>
                      <div style={statSub}>of {policy ? policy.monthlyBudget : "—"} USDC budget</div>
                    </div>
                    <div style={statCard}>
                      <div style={statLabel}>PAYMENTS</div>
                      <div style={{ ...statValue, color: "#3fb68b" }}>{summary ? summary.payments : "—"}</div>
                      <div style={statSub}>x402, gas-free</div>
                    </div>
                    <div style={statCard}>
                      <div style={statLabel}>RE-SHOP SAVINGS</div>
                      <div style={{ ...statValue, color: "#7aa7ff" }}>{lastSwitch ? `${lastSwitch.savingsPct}%` : "—"}</div>
                      <div style={statSub}>{lastSwitch ? `last switch, ${lastSwitch.from} → ${lastSwitch.to}` : "no switches yet"}</div>
                    </div>
                    <div style={statCard}>
                      <div style={statLabel}>BLOCKED</div>
                      <div style={{ ...statValue, color: "#e5534b" }}>
                        {summary ? summary.denials : "—"}{summary && summary.holds > 0 && <span style={{ fontSize: 14, color: "#e5a53a" }}> + {summary.holds} hold</span>}
                      </div>
                      <div style={statSub}>denials by policy</div>
                    </div>
                  </div>

                  <div style={{ ...panel, marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                      <b style={{ fontSize: 13 }}>Budget burn-down</b>
                      <span style={{ font: `11.5px ${mono}`, color: "#8f9bb8" }}>{summary ? summary.spentThisWindow : "—"} / {policy ? policy.monthlyBudget : "—"} USDC · resets monthly</span>
                    </div>
                    <div style={{ background: "#1c2440", borderRadius: 8, height: 14, marginTop: 10 }}>
                      <div style={{ width: `${pct}%`, background: barColor, height: "100%", borderRadius: 8, transition: "width .5s" }} />
                    </div>
                  </div>

                  <div style={{ ...panel, marginTop: 12 }}>
                    <b style={{ fontSize: 13 }}>Subscription{current ? ` — ${current.serviceId}` : ""}</b>
                    <div style={{ font: `12px ${mono}`, color: "#8f9bb8", marginTop: 10, lineHeight: 2 }}>
                      {current ? (
                        <>
                          <span style={{ color: "#3fb68b" }}>●</span> seller {current.sellerId} · ${fmt(current.amountAtomic)}/call · last paid {hhmmss(current.ts)}<br />
                          {switches.slice(0, 3).map((s) => (
                            <span key={s.ts + s.to}>
                              <span style={{ color: "#566083" }}>└</span> {hhmmss(s.ts)} switched {s.from} → {s.to} — {s.savingsPct}% cheaper per call<br />
                            </span>
                          ))}
                          {switches.length === 0 && <><span style={{ color: "#566083" }}>└</span> no re-shop switches this window yet<br /></>}
                        </>
                      ) : <span>no settled payments yet — waiting for the agent</span>}
                    </div>
                  </div>
                </>
              )}

              {/* ===== LIVE FEED ===== */}
              {view === "feed" && (
                <div style={{ ...panel, padding: 0, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 130px 110px 220px 1fr", gap: "0 16px", padding: "8px 14px", borderBottom: "1px solid #1c2440", font: `700 10.5px ${mono}`, color: "#566083", letterSpacing: "0.08em" }}>
                    <span>TIME</span><span>SERVICE</span><span>USDC</span><span>DECISION</span><span>DETAIL</span>
                  </div>
                  {ledger.map((e) => (
                    <div key={e.id} className="feed-row" style={{ display: "grid", gridTemplateColumns: "90px 130px 110px 220px 1fr", gap: "0 16px", padding: "7px 14px", borderBottom: "1px solid #131b38", font: `12px ${mono}`, alignItems: "center" }}>
                      <span style={{ color: "#566083" }}>{hhmmss(e.ts)}</span>
                      <span>{e.serviceId}@{e.sellerId}</span>
                      <span>{fmt(e.amountAtomic)}</span>
                      <span style={{ color: e.decision === "allow" ? "#3fb68b" : e.decision === "hold" ? "#e5a53a" : "#e5534b" }}>
                        {e.decision}{e.code ? ` (${e.code})` : ""}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.transaction
                          ? e.transaction.startsWith("0x")
                            ? <a href={`https://testnet.arcscan.app/tx/${e.transaction}`} target="_blank">arcscan ↗</a>
                            : <button style={{ background: "none", border: 0, color: "#7aa7ff", cursor: "pointer", padding: 0, font: "inherit" }} onClick={() => checkReceipt(e.transaction!)}>
                                {receiptStatus[e.transaction] ? `gateway: ${receiptStatus[e.transaction]}` : "receipt ↗"}
                              </button>
                          : <span style={{ color: "#8f9bb8" }}>{e.reason?.slice(0, 60)}</span>}
                      </span>
                    </div>
                  ))}
                  {ledger.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", color: "#566083", font: `12px ${mono}` }}>no activity yet</div>}
                </div>
              )}

              {/* ===== POLICY ===== */}
              {view === "policy" && (
                <div style={panel}>
                  <b style={{ fontSize: 13 }}>Policy chain</b> <span style={{ fontSize: 11.5, color: "#566083" }}>— evaluated in SpendGuard&apos;s process, before any signature exists</span>
                  {policyRules.map((r) => (
                    <div key={r.n} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px", marginTop: 8, background: "#0b1226", border: "1px solid #1c2440", borderRadius: 8 }}>
                      <span style={{ font: `700 11px ${mono}`, color: "#566083", width: 18 }}>{r.n}</span>
                      <span style={{ font: `12.5px ${mono}`, flex: 1 }}>{r.name}</span>
                      <span style={{ font: `12.5px ${mono}`, color: "#7aa7ff" }}>{r.value}</span>
                      <span style={{ font: `11px ${mono}`, color: r.color, width: 60, textAlign: "right" }}>{r.action}</span>
                    </div>
                  ))}
                  {!policy && <div style={{ padding: "20px 0", color: "#566083", font: `12px ${mono}` }}>policy unavailable — signer offline</div>}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1c2440", font: `12px ${mono}`, color: "#8f9bb8", lineHeight: 2 }}>
                    policy hash anchored on Arc → <a href={ARCSCAN} target="_blank">SpendAnchor 0xfe18…e435</a><br />
                    spend epochs: commitEpoch(n, root, spent) · tamper-evident audit
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ===== Right panel: approvals queue ===== */}
          <div style={{ width: 300, borderLeft: "1px solid #1c2440", background: "#0b1020", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #1c2440", display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 12.5 }}>Approval queue</b>
              {approvals.length > 0 && (
                <span style={{ background: "#e5a53a", color: "#070b17", font: `700 10.5px ${mono}`, borderRadius: 9, padding: "2px 7px" }}>{approvals.length}</span>
              )}
            </div>
            <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
              {approvals.map((a) => (
                <div key={a.id} style={{ background: "#0f1730", border: "1px solid #e5a53a", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ font: `600 15px ${mono}` }}>{fmt(a.amountAtomic)} USDC</div>
                  <div style={{ font: `12px ${mono}`, color: "#8f9bb8", marginTop: 4 }}>→ {a.serviceId}@{a.sellerId}</div>
                  <div style={{ fontSize: 12, color: "#c9d2e5", fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>&quot;{a.reason}&quot;</div>
                  {policy && <div style={{ font: `11px ${mono}`, color: "#e5a53a", marginTop: 8 }}>held: exceeds approval threshold {policy.approvalThreshold}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button style={btn("#3fb68b")} onClick={() => decide(a.id, "approved")}>Approve</button>
                    <button style={btn("#e5534b")} onClick={() => decide(a.id, "denied")}>Deny</button>
                  </div>
                </div>
              ))}
              {approvals.length === 0 && (
                <div style={{ textAlign: "center", color: "#566083", font: `12px ${mono}`, padding: "30px 0" }}>queue empty<br />nothing needs you</div>
              )}
              <div style={{ background: "#0f1730", border: "1px solid #1c2440", borderRadius: 10, padding: 12, marginTop: 4 }}>
                <div style={{ font: `700 10.5px ${mono}`, color: "#566083", letterSpacing: "0.08em" }}>TREASURY</div>
                <div style={{ font: `600 15px ${mono}`, marginTop: 8 }}>{balances ? `${balances.gatewayAvailable} USDC` : "—"}</div>
                <div style={{ font: `11.5px ${mono}`, color: "#8f9bb8", marginTop: 2 }}>Gateway unified balance</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Status bar ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, height: 26, padding: "0 14px", background: "#0b1020", borderTop: "1px solid #1c2440", font: `11px ${mono}`, color: "#566083", flexShrink: 0 }}>
        <span style={{ color: statusColor }}>● {statusText}</span>
        <span>SpendAnchor <a href={ARCSCAN} target="_blank" style={{ color: "#566083", textDecoration: "underline" }}>0xfe18…e435</a></span>
        {summary?.lastEpoch && (
          <span>epoch #{summary.lastEpoch.epoch} committed <a href={`https://testnet.arcscan.app/tx/${summary.lastEpoch.tx}`} target="_blank" style={{ color: "#566083", textDecoration: "underline" }}>↗</a></span>
        )}
        {summary && <span>{summary.payments} payments settled</span>}
        <div style={{ flex: 1 }} />
        <span>agent: zero key material</span>
        <span>keys: policy-gated via SpendGuard</span>
      </div>
    </div>
  );
}

const panel: React.CSSProperties = { background: "#0f1730", border: "1px solid #1c2440", borderRadius: 10, padding: 16 };
const statCard: React.CSSProperties = { ...panel, padding: 14 };
const statLabel: React.CSSProperties = { font: `11px ${mono}`, color: "#8f9bb8", letterSpacing: "0.05em" };
const statValue: React.CSSProperties = { font: `600 22px ${mono}`, marginTop: 6 };
const statSub: React.CSSProperties = { fontSize: 11.5, color: "#566083", marginTop: 2 };
const btn = (color: string): React.CSSProperties => ({
  flex: 1,
  background: color,
  color: "#070b17",
  border: 0,
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: mono,
  fontSize: 12
});

