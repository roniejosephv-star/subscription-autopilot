export const metadata = { title: "Subscription Autopilot — Owner Dashboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui", margin: 0, background: "#0b1020", color: "#e7ecf5" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Subscription Autopilot <span style={{ opacity: 0.5, fontSize: 14 }}>guarded by SpendGuard · Arc Testnet</span></h1>
          {children}
        </div>
      </body>
    </html>
  );
}
