export const metadata = { title: "Subscription Autopilot — Owner Console" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", margin: 0, background: "#070b17", color: "#e7ecf5", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
