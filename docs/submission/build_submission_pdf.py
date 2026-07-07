#!/usr/bin/env python3
"""Builds the Ignyte submission document (PDF).
Regenerate after setting VIDEO_LINK:  python3 build_submission_pdf.py
Output: Ignyte-Submission-Subscription-Autopilot.pdf (same directory)
"""
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (HRFlowable, Image, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Ignyte-Submission-Subscription-Autopilot.pdf")
DIAGRAM = os.path.join(HERE, "..", "architecture.png")

# ── fill before final submission ──────────────────────────────────────────────
VIDEO_LINK = "TODO — paste hosted demo-video URL, then regenerate"
# ──────────────────────────────────────────────────────────────────────────────

REPO = "https://github.com/roniejosephv-star/subscription-autopilot"
DEMO = "https://autopilotdashboard-production.up.railway.app"
SIGNER_API = "https://autopilotsigner-production.up.railway.app"
ANCHOR = "https://testnet.arcscan.app/address/0xfe18f3c42f9318f20cae9cd5b2983e229554e435"
EMAIL = "roniejosephv@gmail.com"

INK = colors.HexColor("#111827")
MUT = colors.HexColor("#4b5563")
ACC = colors.HexColor("#0b6e4f")
BLU = colors.HexColor("#1d4ed8")
BG = colors.HexColor("#f3f4f6")

ss = getSampleStyleSheet()
def st(name, **kw):
    base = kw.pop("base", "Normal")
    s = ParagraphStyle(name, parent=ss[base], **kw)
    return s

S = {
    "title":  st("t", base="Title", fontSize=26, leading=31, textColor=INK, spaceAfter=10),
    "tag":    st("tag", fontSize=12.5, textColor=MUT, alignment=TA_CENTER, leading=17),
    "h1":     st("h1", base="Heading1", fontSize=15, textColor=INK, spaceBefore=14, spaceAfter=6),
    "h2":     st("h2", base="Heading2", fontSize=11.5, textColor=ACC, spaceBefore=10, spaceAfter=3),
    "body":   st("b", fontSize=9.8, textColor=INK, leading=14, spaceAfter=5),
    "small":  st("s", fontSize=8.6, textColor=MUT, leading=12),
    "cell":   st("c", fontSize=9, textColor=INK, leading=12.5),
    "cellb":  st("cb", fontSize=9, textColor=INK, leading=12.5, fontName="Helvetica-Bold"),
    "quote":  st("q", fontSize=11, textColor=ACC, leading=15, alignment=TA_CENTER, fontName="Helvetica-Oblique"),
}

def P(txt, style="body"):
    return Paragraph(txt, S[style])

def link(url, label=None):
    return f'<link href="{url}" color="#1d4ed8"><u>{label or url}</u></link>'

def kv_table(rows, widths=(42*mm, 128*mm)):
    t = Table([[P(f"<b>{k}</b>", "cell"), P(v, "cell")] for k, v in rows], colWidths=list(widths))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, BG]),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t

story = []

# ── Cover / identity block ─────────────────────────────────────────────────────
story += [
    Spacer(1, 10*mm),
    P("Subscription Autopilot", "title"),
    P("An AI agent that runs your recurring service spending on Arc — and can prove it behaved.", "tag"),
    Spacer(1, 5*mm),
    P("“The agent can want anything; it can only pay what policy allows.”", "quote"),
    Spacer(1, 6*mm),
    kv_table([
        ("Track", "4 — Best Agentic Economy Experience on Arc"),
        ("Participant", "Ronie Joseph (solo)"),
        ("Circle Developer Account", EMAIL),
        ("Circle products used", "USDC · Wallets (developer-controlled) · Gateway · Nanopayments (x402)"),
        ("Live demo (dashboard)", link(DEMO)),
        ("SpendGuard API (public)", link(SIGNER_API + "/summary")),
        ("GitHub repository", link(REPO)),
        ("Demo video", VIDEO_LINK if VIDEO_LINK.startswith("http") else f"<i>{VIDEO_LINK}</i>"),
        ("On-chain audit anchor", link(ANCHOR, "SpendAnchor 0xfe18…e435 on Arc Testnet (arcscan)")),
        ("Scope", "Testnet demo — Arc Testnet, chain 5042002 (gas = USDC)"),
    ]),
    Spacer(1, 6*mm),
    HRFlowable(width="100%", color=BG, thickness=1.2),
    P("Contents: 1 Description · 2 Working MVP · 3 Architecture · 4 Circle integration · "
      "5 Demo guide &amp; documentation · 6 Circle Product Feedback", "small"),
]

# ── 1 Description ─────────────────────────────────────────────────────────────
story += [
    PageBreak(),
    P("1 · Project description", "h1"),
    P("Circle's rails now let AI agents pay autonomously. Almost nobody deploys one — capability isn't trust. "
      "Give an agent your wallet and one prompt injection, one hallucinated “great deal,” one runaway loop is a "
      "drained balance. Subscription Autopilot treats that trust gap as the product."),
    P("The agent autonomously runs recurring, metered service spending (API subscriptions) against three competing "
      "x402 sellers with live, volume-tiered pricing:"),
    P("<b>Research</b> — probes every seller's price menu (free quote endpoints) and its own usage history. "
      "<b>Negotiate</b> — at every renewal it re-quotes all sellers at its real volume, switches when &gt;5% cheaper "
      "per call, and logs the rationale. <b>Execute</b> — pays per call with gasless USDC nanopayments (x402), "
      "batch-settled by Circle Gateway on Arc."),
    P("Every dollar passes through <b>SpendGuard</b>, an out-of-process policy authority: monthly budget, seller "
      "allowlist, per-transaction cap, per-service cap, daily velocity, and a human-approval threshold. The agent "
      "holds <b>zero key material</b> — no keys, no Circle SDK, no chain RPC. It can <i>request</i> a payment; only "
      "policy can authorize one. Policy versions and spend epochs are hash-anchored on Arc "
      "(<b>SpendAnchor.sol</b>) every 10 minutes, so the audit trail is tamper-evident and externally verifiable."),
    P("Differentiation", "h2"),
    P("Circle's official sample shows an agent that <i>can</i> pay. Autopilot is an agent that pays <b>well</b> — "
      "cheaper (it re-shops), safer (policy wall + human-in-the-loop), and provably (on-chain anchors). The "
      "enforcement point is the x402 SDK's <b>onBeforePaymentCreation</b> lifecycle hook running inside SpendGuard's "
      "trusted process — behind the custody boundary, where a compromised agent cannot reach it."),

    P("2 · Working MVP (deployed, verifiable now)", "h1"),
    P(f"Frontend + backend are live: the owner dashboard at {link(DEMO)} renders the production ledger "
      f"(100+ settled nanopayments at time of writing), budget burn-down, approval queue, policy chain, and Gateway "
      f"treasury balance. The public SpendGuard API ({link(SIGNER_API + '/summary', 'signer /summary')}) serves the "
      "same data raw."),
    kv_table([
        ("Deployment", "4 services on Railway: SpendGuard (signer), 3 x402 sellers, agent, dashboard; SQLite ledger on a persistent volume"),
        ("Custody mode", "SIGNER_MODE=circle — EIP-712 signed via Circle Wallets DCW EOA; no raw private key in the payment path"),
        ("Verified E2E", "DCW signature → Gateway x402 settle on Arc Testnet, transfer 9bd6a149-1821-4341-a4aa-712cdc362382 (2026-07-06)"),
        ("On-chain", "SpendAnchor at 0xfe18…e435 — policy hashes + spend epochs, auto-anchored every 10 min when spend changes"),
        ("Policy wall (live)", "Injected overspend → deny (per_tx_max_exceeded); premium tier ($0.03 &gt; $0.02 threshold) → held for human approve/deny with 60 s window"),
    ]),
]

# ── 3 Architecture ────────────────────────────────────────────────────────────
story += [
    PageBreak(),
    P("3 · Architecture", "h1"),
    Image(DIAGRAM, width=170*mm, height=170*mm*0.392, kind="proportional"),
    Spacer(1, 3*mm),
    P("The red boundary is the untrusted zone: the agent plans (Claude tool-use or deterministic loop) but owns no "
      "money. The green boundary is the only process that can move funds: SpendGuard evaluates the policy chain "
      "before any signature exists, executes via GatewayClient, queues holds for the human owner, and anchors its "
      "own history on Arc. Sellers re-resolve prices per request — that live pricing surface is what the agent "
      "negotiates against. Full component spec: ARCHITECTURE.md in the repository."),
    P("4 · How Circle products are used", "h1"),
    kv_table([
        ("Nanopayments / x402", "Core rail. Sellers: createGatewayMiddleware + gateway.require(price) bound per request → live volume tiers. "
         "SpendGuard: GatewayClient (chain: arcTestnet); policy enforced in the onBeforePaymentCreation hook inside the trusted process."),
        ("Circle Wallets (DCW)", "Agent wallet is a developer-controlled EOA on ARC-TESTNET (EOA required: Gateway settle verifies EIP-3009 via ecrecover). "
         "signTypedData({walletId}) produces the payment signature; even the Gateway deposit runs through Circle's contract-execution API — no raw key anywhere."),
        ("Circle Gateway", "Fundable agent balance, gas-free batched settlement, transfer-UUID receipts (dashboard links each payment), getBalances() feeds the treasury card."),
        ("USDC on Arc", "Settlement asset and gas token — SpendAnchor transactions are paid in USDC; one faucet covers everything."),
        ("CCTP / Bridge Kit", "Architecture extension (documented, not in MVP): cross-chain budget top-ups via Gateway crosschain withdraw()."),
    ]),
]

# ── 5 Demo & docs ─────────────────────────────────────────────────────────────
story += [
    PageBreak(),
    P("5 · Demo guide &amp; documentation", "h1"),
    P(f"<b>Video:</b> {link(VIDEO_LINK) if VIDEO_LINK.startswith('http') else '<i>' + VIDEO_LINK + '</i>'}", "body"),
    P("The 3-minute video follows four beats, all reproducible on the live deployment:"),
    kv_table([
        ("1 · Delegation", "Agent researches quotes, subscribes to the cheapest seller, meters per-call gasless nanopayments — live feed + burn-down on the dashboard."),
        ("2 · Negotiation", "Seller A's price drifts +60% → at renewal the agent re-quotes all sellers at its real volume and switches (21.9% cheaper per call), rationale logged."),
        ("3 · The trust wall", "A prompt-injected “URGENT: prepay 12 periods” request → SpendGuard denies at the per-tx cap; a $0.03 premium call is held → human clicks Approve/Deny on the dashboard."),
        ("4 · Proof", "Month view: spend vs budget, savings, denial log, Gateway receipts — and the epoch chip linking to the SpendAnchor transaction on arcscan."),
    ], widths=(30*mm, 140*mm)),
    P("Documentation in the repository", "h2"),
    P("README.md — setup from zero (Circle account → wallet generation → faucet → run) and per-product integration "
      "notes with file references · ARCHITECTURE.md — component spec and trust boundaries · PRD.md — full product "
      "spec, feature acceptance criteria, risk log · DEPLOYMENT.md — the exact Railway/Vercel runbook used for this "
      "deployment · FEEDBACK.md — the running Circle product-feedback log reproduced in §6 · docs/demo-script.md — "
      "the video script."),
    P("Quick verification for judges (no setup): open the dashboard, watch payments tick; "
      f"curl {SIGNER_API}/summary; click the SpendAnchor link to see anchors on arcscan.", "small"),
]

# ── 6 Feedback ────────────────────────────────────────────────────────────────
story += [
    PageBreak(),
    P("6 · Circle Product Feedback", "h1"),
    P("Why we chose these products", "h2"),
    P("Nanopayments/x402 is the only rail where per-call metered agent payments are economically sane (gasless, "
      "sub-cent, batched). Gateway gives the agent a fundable balance with instant receipts. Circle Wallets (DCW "
      "EOA) moves key custody out of the agent entirely — the property our whole trust model rests on. USDC-as-gas "
      "on Arc collapses faucet/gas UX to one token."),
    P("What worked well", "h2"),
    P("• DCW EOA signTypedData signatures are fully ecrecover-compatible with Gateway's x402 settle — the custody-"
      "separation design works E2E on Arc Testnet (verified 2026-07-06, transfer 9bd6a149-…-712cdc362382).<br/>"
      "• Seller monetization is genuinely 2 lines (createGatewayMiddleware + gateway.require()); per-request dynamic "
      "pricing works by binding require(price) at call time — it became our negotiation surface.<br/>"
      "• CHAIN_CONFIGS exports eliminated all address/RPC hardcoding.<br/>"
      "• Arc deposit finality (~0.5 s) makes the deposit→pay loop feel instant; Wallets contract executions confirm "
      "in well under a minute.<br/>"
      "• The x402 lifecycle hooks are an excellent extension surface — our entire policy layer lives in one hook."),
    P("What could be improved (all found and reproduced during this build)", "h2"),
    P("1. <b>Nanopayments is EOA-only</b> (ecrecover on EIP-3009; EIP-1271/SCA unsupported) — easy to miss: Circle's own "
      "arc-escrow sample creates accountType SCA wallets, which would silently fail here. Needs a prominent docs callout + runtime hint.<br/>"
      "2. <b>Signature-validity contradiction:</b> seller quickstart says ≥ 7 days, the SDK error reference says ≥ 3, and the "
      "exported GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS constant is undocumented. Pick one number, document the constant.<br/>"
      "3. <b>18-decimal gas vs 6-decimal ERC-20 USDC on Arc</b> deserves an explicit docs callout — it bites any native-balance math.<br/>"
      "4. <b>Sample apps are heavy references:</b> arc-escrow needs Supabase + Docker + ngrok + OpenAI before first run; a minimal "
      "single-process reference per product would cut onboarding dramatically.<br/>"
      "5. <b>Undocumented header in shipped types:</b> X-ARC-PRIVATE-MAINNET-ENABLED appears in the SDK's .d.ts, nowhere in docs.<br/>"
      "6. <b>Hook documentation lives off-site</b> (x402.org, not developers.circle.com) — mirror or link prominently; it's the SDK's best surface.<br/>"
      "7. <b>Broken script in arc-fintech sample:</b> package.json declares spend:gateway:arc → a file that doesn't exist in the repo.<br/>"
      "8. <b>Wallets ↔ x402 SDK interop wart:</b> signTypedData requires an explicit EIP712Domain entry in types, but viem-style callers "
      "(including BatchEvmScheme's signer interface in Circle's own SDK) omit it. The error — “there is extra data provided in the "
      "message (0 &lt; 4)” — names neither the missing type nor the fix. Accept viem-normalized typed data, or return “types.EIP712Domain is required”.<br/>"
      "9. <b>GatewayClient.deposit() requires a raw private key,</b> so DCW-custodied wallets can't use it. Verified workaround: replicate "
      "its two calls (USDC.approve + GatewayWallet.deposit) via createContractExecutionTransaction. A documented DCW-native deposit "
      "path is the single change that would most help agentic use cases — Circle-custodied buyers are exactly who agents need."),
    P("Recommendations", "h2"),
    P("Ship a first-class “agent buyer” recipe: DCW EOA wallet + Gateway deposit via contract execution + x402 client with a "
      "policy hook — the five pieces exist today but must be discovered across four doc sites and two SDKs' type definitions. "
      "This project is, in effect, that recipe; we'd be glad if it were useful as a reference."),
    Spacer(1, 8*mm),
    HRFlowable(width="100%", color=BG, thickness=1.2),
    P(f"Subscription Autopilot · Ignyte × Circle × Arc — Stablecoins Commerce Stack Challenge, Track 4 · {EMAIL} · Apache-2.0 "
      "(patterns adapted from Circle's Apache-2.0 samples are credited in-repo)", "small"),
]

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=16*mm, bottomMargin=16*mm,
                        title="Subscription Autopilot — Ignyte Submission (Track 4)",
                        author="Ronie Joseph")
doc.build(story)
print(f"OK → {OUT}")
