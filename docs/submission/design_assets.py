#!/usr/bin/env python3
"""Renders the Claude-designed brand assets as vector PDFs (reportlab):
  - diagram_1a.pdf   (1180x1010) -> also exported to ../architecture.png by the build script
  - one_pager.pdf    (US letter)
  - deck.pdf         (9 slides, 960x540)
Faithful to 'Architecture Diagram.dc.html' (option 1a), 'One-Pager.dc.html',
'Submission Deck.dc.html'. Design sizes are halved for the deck (1920x1080 -> 960x540).
"""
import math
import os

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas as _c
from reportlab.platypus import Paragraph

HERE = os.path.dirname(os.path.abspath(__file__))

# palette
PAPER = HexColor("#fdfdfc"); INK = HexColor("#1a1a18"); MUT = HexColor("#4a4a45")
GRAY = HexColor("#6b6a64"); LBRD = HexColor("#d8d6d0"); FAINT = HexColor("#9a9992")
RED = HexColor("#b3372f"); RED_D = HexColor("#cf6a63"); RED_BG = HexColor("#fdf6f5"); RED_TXT = HexColor("#6b3a36"); RED_SOFT = HexColor("#c4756f")
GRN = HexColor("#1f7a5c"); GRN_D = HexColor("#4a9b7f"); GRN_BG = HexColor("#f5faf7")
BLU = HexColor("#34509b"); BLU_BG = HexColor("#f2f5fc")
GLD = HexColor("#9a6b1f"); GLD_BG = HexColor("#fdf8ec")
PUR = HexColor("#6b4fa0"); PUR_BG = HexColor("#f7f4fc")
GWB = HexColor("#4a6db8"); GWB_BG = HexColor("#eef3fb")
ARROW_GRAY = HexColor("#75746e")
DARK = HexColor("#0b1020"); D_TXT = HexColor("#e7ecf5"); D_BLU = HexColor("#7aa7ff")
D_MUT = HexColor("#aab6d4"); D_DIM = HexColor("#566083")

HELV, HELB, HELO = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
MONO, MONB = "Courier", "Courier-Bold"


def para(c, text, x, y_top, w, size=12, color=MUT, font=HELV, leading=None,
         align=0, bold_color=None):
    st = ParagraphStyle("p", fontName=font, fontSize=size, textColor=color,
                        leading=leading or size * 1.45, alignment=align)
    p = Paragraph(text, st)
    _, h = p.wrap(w, 10000)
    p.drawOn(c, x, y_top - h)
    return h


def arrowhead(c, x, y, angle, color, s=7):
    c.saveState(); c.translate(x, y); c.rotate(math.degrees(angle))
    c.setFillColor(color); c.setStrokeColor(color)
    p = c.beginPath(); p.moveTo(0, 0); p.lineTo(-s, s * 0.5); p.lineTo(-s, -s * 0.5); p.close()
    c.drawPath(p, stroke=0, fill=1); c.restoreState()


def line_arrow(c, x1, y1, x2, y2, color, w=1.8, both=False):
    c.setStrokeColor(color); c.setLineWidth(w); c.line(x1, y1, x2, y2)
    ang = math.atan2(y2 - y1, x2 - x1)
    arrowhead(c, x2, y2, ang, color)
    if both:
        arrowhead(c, x1, y1, ang + math.pi, color)


def bez_arrow(c, x1, y1, cx1, cy1, cx2, cy2, x2, y2, color, w=1.8):
    c.setStrokeColor(color); c.setLineWidth(w)
    c.bezier(x1, y1, cx1, cy1, cx2, cy2, x2, y2)
    ang = math.atan2(y2 - cy2, x2 - cx2)
    arrowhead(c, x2, y2, ang, color)


def rrect(c, x, y, w, h, border, bg, dash=None, r=6, lw=1.5):
    c.saveState()
    if dash: c.setDash(dash)
    c.setStrokeColor(border); c.setLineWidth(lw); c.setFillColor(bg)
    c.roundRect(x, y, w, h, r, stroke=1, fill=1)
    c.restoreState()


# ═══════════════════════════ 1 · ARCHITECTURE DIAGRAM (option 1a) ═══════════════════════════
def diagram(path):
    W, H = 1180, 1010
    c = _c.Canvas(path, pagesize=(W, H))
    Y = lambda y: H - y  # design (top-left) -> pdf (bottom-left)
    c.setFillColor(PAPER); c.rect(0, 0, W, H, stroke=0, fill=1)

    # header / footer
    c.setFillColor(INK); c.setFont(HELB, 28)
    c.drawCentredString(W / 2, Y(58), "Subscription Autopilot — Architecture")
    c.setFillColor(GRAY); c.setFont(MONO, 13)
    c.drawCentredString(W / 2, Y(84), "Ignyte × Circle × Arc · Track 4 (Agentic Economy) · Arc Testnet (chain 5042002, gas = USDC)")
    c.setFillColor(FAINT); c.setFont(MONO, 11)
    c.drawCentredString(W / 2, Y(H - 22), "the agent can want anything; it can only pay what policy allows")

    # arrows (under boxes)
    bez_arrow(c, 330, Y(296), 400, Y(350), 440, Y(350), 505, Y(378), RED)
    line_arrow(c, 858, Y(252), 858, Y(366), BLU, both=True)
    line_arrow(c, 168, Y(296), 168, Y(632), ARROW_GRAY, w=1.6)
    bez_arrow(c, 570, Y(556), 540, Y(600), 500, Y(630), 448, Y(662), GRN)
    line_arrow(c, 845, Y(556), 845, Y(632), ARROW_GRAY, w=1.6)
    line_arrow(c, 262, Y(764), 262, Y(832), ARROW_GRAY, w=1.6)

    # UNTRUSTED zone + agent
    rrect(c, 44, Y(296), 430, 180, RED_D, RED_BG, dash=[5, 4], r=8)
    c.setFillColor(RED); c.setFont(MONB, 12); c.drawString(58, Y(136), "UNTRUSTED ZONE")
    c.setFillColor(RED_SOFT); c.setFont(MONO, 12); c.drawString(198, Y(136), "— LLM, injectable, zero key material")
    rrect(c, 66, Y(278), 386, 124, RED, HexColor("#ffffff"))
    c.setFillColor(INK); c.setFont(HELB, 15); c.drawCentredString(259, Y(178), "AUTOPILOT AGENT")
    para(c, "Claude tool-use planner / deterministic loop<br/>subscribe · meter usage · renewal cron<br/>re-shop across sellers · re-plan on denial<br/><b><font color='#b3372f'>no keys · no Circle SDK · no chain RPC</font></b>",
         76, Y(186), 366, size=12, color=MUT, align=1, leading=18.5)

    # DASHBOARD
    rrect(c, 646, Y(214), 424, 64, BLU, BLU_BG)
    c.setFillColor(INK); c.setFont(HELB, 15)
    c.drawCentredString(858, Y(176), "OWNER DASHBOARD  (Next.js)")
    c.setFillColor(MUT); c.setFont(HELV, 12)
    c.drawCentredString(858, Y(196), "burn-down · live feed · approve / deny · savings · Arc receipts")

    # edge labels
    para(c, "/ledger · /approvals · /summary (poll 2s)<br/>human approve / deny", 876, Y(276), 310, size=11.5, color=BLU, font=MONO, leading=18)
    c.setFillColor(PAPER); c.rect(330, Y(348), 330, 40, stroke=0, fill=1)
    para(c, "POST /pay {url, serviceId, reason}<br/>← 200 receipt | 402 {code, reason} | 202 hold", 330, Y(306), 330, size=11.5, color=RED_TXT, font=MONO, align=1, leading=18)
    c.setFillColor(GRAY); c.setFont(MONO, 11.5); c.drawString(182, Y(462), "GET /quote (free probe)")

    # CUSTODY zone + spendguard
    rrect(c, 424, Y(556), 660, 184, GRN_D, GRN_BG, dash=[5, 4], r=8)
    c.setFillColor(GRN); c.setFont(MONB, 12); c.drawString(438, Y(392), "CUSTODY BOUNDARY")
    c.setFillColor(GRN_D); c.setFont(MONO, 12); c.drawString(600, Y(392), "— the only process that can move money")
    rrect(c, 444, Y(538), 620, 128, GRN, HexColor("#ffffff"))
    c.setFillColor(INK); c.setFont(HELB, 15); c.drawCentredString(754, Y(434), "SPENDGUARD  (policy-gated signer)")
    para(c, "policy chain: allowlist → perTx → monthly → perService → velocity → approval threshold<br/>allow → GatewayClient.pay() · hold → human queue · deny → structured code<br/>x402 <b>onBeforePaymentCreation</b> hook = enforcement point · keys: <b>Circle Wallets</b> DCW EOA",
         458, Y(442), 592, size=12, color=MUT, align=1, leading=18.5)

    para(c, "x402 paid request<br/>EIP-3009 auth, policy-approved", 420, Y(586), 240, size=11.5, color=GRN, font=MONO, align=1, leading=18)
    c.setFillColor(GRAY); c.setFont(MONO, 11.5); c.drawString(858, Y(594), "anchorPolicy · commitEpoch")

    # SELLERS
    rrect(c, 64, Y(742), 396, 106, GLD, GLD_BG)
    c.setFillColor(INK); c.setFont(HELB, 15); c.drawCentredString(262, Y(662), "SELLERS ×3  (x402)")
    para(c, "<b>Circle Nanopayments</b> middleware<br/>price re-resolved per request — volume/loyalty tiers<br/>= the agent's negotiation surface",
         76, Y(672), 372, size=12, color=MUT, align=1, leading=18.5)

    # ARC
    rrect(c, 646, Y(742), 400, 106, PUR, PUR_BG)
    c.setFillColor(INK); c.setFont(HELB, 15); c.drawCentredString(846, Y(662), "ARC TESTNET — SpendAnchor.sol")
    para(c, "<font face='Courier' size='11.5'>0xf550…b143</font> · anchorPolicy(hash) · commitEpoch(n, root, spent)<br/>tamper-evident audit of every policy version + spend epoch",
         656, Y(672), 380, size=12, color=MUT, align=1, leading=18.5)

    c.setFillColor(GRAY); c.setFont(MONO, 11.5); c.drawString(276, Y(796), "verify + settle (batched)")

    # GATEWAY
    rrect(c, 100, Y(930), 324, 94, GWB, GWB_BG)
    c.setFillColor(INK); c.setFont(HELB, 15); c.drawCentredString(262, Y(862), "CIRCLE GATEWAY  (testnet)")
    para(c, "batched, gas-free <b>USDC</b> settlement<br/>unified balance · transfer UUID receipts",
         112, Y(872), 300, size=12, color=MUT, align=1, leading=18.5)

    c.save()


# ═══════════════════════════ 2 · ONE-PAGER (letter) ═══════════════════════════
def one_pager(path, video_link):
    W, H = letter
    M = 43  # 0.6in
    cw = W - 2 * M
    c = _c.Canvas(path, pagesize=letter)
    c.setFillColor(HexColor("#ffffff")); c.rect(0, 0, W, H, stroke=0, fill=1)
    y = H - M

    c.setFillColor(INK); c.setFont(HELB, 27); c.drawString(M, y - 22, "Subscription Autopilot"); y -= 30
    y -= para(c, "An AI agent that runs your recurring service spending on Arc — and can prove it behaved.", M, y, cw, size=15, color=MUT) + 4
    y -= para(c, "Ignyte × Circle × Arc · Track 4 (Agentic Economy) · Ronie Joseph · roniejosephv@gmail.com · Arc Testnet, chain 5042002, gas = USDC",
              M, y, cw, size=10, color=GRAY, font=MONO) + 8
    c.setStrokeColor(LBRD); c.setLineWidth(1); c.line(M, y, W - M, y); y -= 10

    y -= para(c, "Circle's official sample shows an agent that <i>can</i> pay. Autopilot is an agent that pays <b>well</b> — and every dollar it moves passes through an out-of-process policy authority. <b><font color='#1f7a5c'>The agent can want anything; it can only pay what policy allows.</font></b>",
              M, y, cw, size=12, color=INK, leading=17) + 10

    def h2(t):
        nonlocal y
        c.setFillColor(INK); c.setFont(HELB, 13); c.drawString(M, y - 11, t); y -= 18

    # WHAT IT DOES — three cards
    h2("WHAT IT DOES")
    card_w = (cw - 20) / 3
    cards = [("RESEARCH", BLU, "Probes competing x402 sellers' live price menus (free quotes) against real usage history."),
             ("NEGOTIATE", GLD, "Compares volume/loyalty tiers across sellers at every renewal — switched at 21.9% cheaper per call in the demo."),
             ("EXECUTE", GRN, "Gasless USDC nanopayments per call (x402), batch-settled by Circle Gateway on Arc.")]
    ch = 86
    for i, (t, col, body) in enumerate(cards):
        x = M + i * (card_w + 10)
        rrect(c, x, y - ch, card_w, ch, LBRD, HexColor("#ffffff"), r=6, lw=1)
        c.setStrokeColor(col); c.setLineWidth(3); c.line(x + 3, y - 1.5, x + card_w - 3, y - 1.5)
        c.setFillColor(col); c.setFont(MONB, 10.5); c.drawString(x + 11, y - 20, t)
        para(c, body, x + 11, y - 26, card_w - 22, size=10.5, color=MUT, leading=14.5)
    y -= ch + 14

    # CUSTODY BOUNDARY — two dashed cards
    h2("THE CUSTODY BOUNDARY")
    lw_, rw_ = cw * 0.425, cw * 0.575 - 10
    ch = 92
    rrect(c, M, y - ch, lw_, ch, RED_D, RED_BG, dash=[4, 3], r=6)
    c.setFillColor(RED); c.setFont(MONB, 10.5); c.drawString(M + 11, y - 20, "UNTRUSTED — THE AGENT")
    para(c, "LLM, injectable. No keys, no Circle SDK, no chain RPC — only <font face='Courier'>POST /pay</font> with a stated reason. A compromised agent can <i>ask</i>; it cannot <i>take</i>.",
         M + 11, y - 26, lw_ - 22, size=10.5, color=MUT, leading=14.5)
    x2 = M + lw_ + 10
    rrect(c, x2, y - ch, rw_, ch, GRN_D, GRN_BG, dash=[4, 3], r=6)
    c.setFillColor(GRN); c.setFont(MONB, 10.5); c.drawString(x2 + 11, y - 20, "CUSTODY — SPENDGUARD")
    c.setFillColor(INK); c.setFont(MONO, 10.5)
    c.drawString(x2 + 11, y - 40, "allowlist → perTx → monthly → perService")
    c.drawString(x2 + 11, y - 55, "→ velocity → threshold")
    c.setFont(MONB, 9.5)
    c.setFillColor(GRN); c.drawString(x2 + 11, y - 76, "allow → pay")
    c.setFillColor(GLD); c.drawString(x2 + 98, y - 76, "· hold → human")
    c.setFillColor(RED); c.drawString(x2 + 198, y - 76, "· deny → code")
    y -= ch + 6
    y -= para(c, "Policy versions and spend epochs are auto-anchored on Arc every 10 minutes (<font face='Courier'>SpendAnchor.sol</font>), so every decision is externally verifiable — a tamper-evident audit of the agent's behavior.",
              M, y, cw, size=10.5, color=MUT, leading=14) + 8

    # CIRCLE STACK table
    h2("CIRCLE STACK — REAL, LOAD-BEARING INTEGRATIONS")
    rows = [("Nanopayments / x402", "Core rail — per-request dynamic pricing; policy enforced in the <font face='Courier'>onBeforePaymentCreation</font> hook, inside SpendGuard's trusted process."),
            ("Circle Wallets (DCW)", "Key custody — EIP-712 signing on a developer-controlled EOA; no raw private key exists anywhere in the stack — payments <i>and</i> on-chain anchoring alike."),
            ("Circle Gateway", "Settlement + treasury — gas-free EIP-3009 authorizations, batch-settled onchain, transfer UUID receipts."),
            ("USDC on Arc", "Settlement asset <i>and</i> gas token — audit-anchor transactions are themselves paid in USDC."),
            ("CCTP · USYC · StableFX", "Autonomous cross-chain treasury (CCTP, built) + tokenized-yield and FX legs (USYC / StableFX) wired behind flags, testable on access.")]
    for name, role in rows:
        c.setFillColor(INK); c.setFont(HELB, 10.5); c.drawString(M, y - 10, name)
        h = para(c, role, M + 132, y, cw - 132, size=10.5, color=MUT, leading=13.5)
        y -= max(h, 14) + 3
        c.setStrokeColor(HexColor("#eceae5")); c.setLineWidth(0.7); c.line(M, y + 2, W - M, y + 2)
    y -= 8

    # VERIFIED
    h2("VERIFIED ON ARC TESTNET — LIVE DEPLOYMENT")
    y -= para(c, "<font color='#1f7a5c'><b>✓</b></font> Full E2E loop (Day-0 gate, <font face='Courier'>verify-day0.sh</font>)&nbsp;&nbsp; <font color='#1f7a5c'><b>✓</b></font> Keyless payments + on-chain anchoring verified (DCW-signed)&nbsp;&nbsp; <font color='#1f7a5c'><b>✓</b></font> All four demo beats live in production — metering, 21.9% switch, injection denied, human hold/release&nbsp;&nbsp; <font color='#1f7a5c'><b>✓</b></font> SpendAnchor live: <font face='Courier' size='9.5'>0xf550a882da3c26fbacd1b68aa83867102206b143</font>",
              M, y, cw, size=10.5, color=INK, leading=16) + 8

    c.setStrokeColor(LBRD); c.line(M, y, W - M, y); y -= 10
    para(c, "<font color='#34509b'><u>autopilotdashboard-production.up.railway.app</u></font> (live demo) · github.com/roniejosephv-star/subscription-autopilot · Apache-2.0 · testnet only",
         M, y, cw, size=9, color=GRAY, font=MONO, leading=13)
    c.save()


# ═══════════════════════════ 3 · DECK (9 slides, 960×540) ═══════════════════════════
def deck(path):
    W, H = 960, 540
    P = 50  # 100/2
    c = _c.Canvas(path, pagesize=(W, H))

    def bg(col):
        c.setFillColor(col); c.rect(0, 0, W, H, stroke=0, fill=1)

    def h2(t, y=None, color=INK, size=32):
        c.setFillColor(color); c.setFont(HELB, size); c.drawString(P, y or H - P - 30, t)

    def footer_row(items, y=40, color=D_DIM):
        c.setFillColor(color); c.setFont(MONO, 12)
        x = P
        for it in items:
            c.drawString(x, y, it); x += c.stringWidth(it, MONO, 12) + 40

    # ── 1 · TITLE
    bg(DARK)
    c.setFillColor(D_BLU); c.setFont(MONO, 13); c.drawString(P, H - 120, "Ignyte × Circle × Arc · Track 4 — Agentic Economy")
    c.setFillColor(D_TXT); c.setFont(HELB, 55); c.drawString(P, H - 190, "Subscription Autopilot")
    para(c, "An AI agent that runs your recurring service spending on Arc — and can prove it behaved.",
         P, H - 215, 650, size=20, color=D_MUT, leading=28)
    footer_row(["Ronie Joseph", "Arc Testnet · chain 5042002 · gas = USDC"])
    c.showPage()

    # ── 2 · PROBLEM
    bg(PAPER)
    h2("Agents can pay — owners can't trust them yet")
    para(c, "Capability isn't trust. An LLM with keys in its own process is one bad input away from being someone else's wallet.",
         P, H - 100, 700, size=16, color=GRAY, leading=23)
    rows = [("prompt_injection", RED, "one poisoned instruction and the agent overspends on command"),
            ("price_drift", GLD, "sellers reprice constantly — a loyal agent silently wastes money"),
            ("no_audit_trail", PUR, "without externally verifiable records, “the agent behaved” is just a claim")]
    y = H - 190
    for label, col, txt in rows:
        rrect(c, P, y - 62, W - 2 * P, 62, LBRD, HexColor("#ffffff"), r=8, lw=1)
        c.setFillColor(col); c.setFont(MONB, 14); c.drawString(P + 22, y - 37, label)
        c.setFillColor(MUT); c.setFont(HELV, 15); c.drawString(P + 240, y - 37, txt)
        y -= 76
    c.showPage()

    # ── 3 · THE LOOP
    bg(PAPER)
    h2("Autopilot researches, negotiates, and executes every renewal")
    cw3 = (W - 2 * P - 32) / 3
    cards = [("01 · RESEARCH", BLU, "Probes competing x402 sellers' live price menus — free <font face='Courier'>GET /quote</font> — against your real usage history.", None),
             ("02 · NEGOTIATE", GLD, "Compares volume and loyalty tiers across sellers at every renewal — and switches when cheaper.", "−21.9%"),
             ("03 · EXECUTE", GRN, "Gasless USDC nanopayments per call (x402), batch-settled onchain by Circle Gateway on Arc.", None)]
    top, chh = H - 130, 300
    for i, (t, col, body, big) in enumerate(cards):
        x = P + i * (cw3 + 16)
        rrect(c, x, top - chh, cw3, chh, LBRD, HexColor("#ffffff"), r=8, lw=1)
        c.setStrokeColor(col); c.setLineWidth(4); c.line(x + 4, top - 2, x + cw3 - 4, top - 2)
        c.setFillColor(col); c.setFont(MONB, 12); c.drawString(x + 20, top - 34, t)
        para(c, body, x + 20, top - 46, cw3 - 40, size=15, color=MUT, leading=22)
        if big:
            c.setFillColor(col); c.setFont(MONB, 24); c.drawString(x + 20, top - 200, big)
            c.setFillColor(GRAY); c.setFont(HELV, 12); c.drawString(x + 118, top - 200, "per call, last switch")
    c.showPage()

    # ── 4 · CUSTODY
    bg(PAPER)
    h2("The agent holds zero keys; policy holds the wallet")
    lw4 = (W - 2 * P) * 0.42; rw4 = (W - 2 * P) * 0.58 - 20
    top, chh = H - 120, 210
    rrect(c, P, top - chh, lw4, chh, RED_D, RED_BG, dash=[6, 4], r=10, lw=2)
    c.setFillColor(RED); c.setFont(MONB, 12); c.drawString(P + 20, top - 32, "UNTRUSTED — THE AGENT")
    para(c, "LLM, injectable. No keys, no Circle SDK, no chain RPC. It can only ask: <font face='Courier'>POST /pay</font> with a stated reason.",
         P + 20, top - 48, lw4 - 40, size=15, color=MUT, leading=23)
    x2 = P + lw4 + 20
    rrect(c, x2, top - chh, rw4, chh, GRN_D, GRN_BG, dash=[6, 4], r=10, lw=2)
    c.setFillColor(GRN); c.setFont(MONB, 12); c.drawString(x2 + 20, top - 32, "CUSTODY — SPENDGUARD")
    c.setFillColor(INK); c.setFont(MONO, 14)
    c.drawString(x2 + 20, top - 64, "allowlist → perTx → monthly →")
    c.drawString(x2 + 20, top - 86, "perService → velocity → threshold")
    c.setFont(MONB, 13)
    c.setFillColor(GRN); c.drawString(x2 + 20, top - 122, "allow → pay")
    c.setFillColor(GLD); c.drawString(x2 + 135, top - 122, "hold → human")
    c.setFillColor(RED); c.drawString(x2 + 265, top - 122, "deny → code")
    c.setFillColor(INK); c.setFont(HELB, 22)
    c.drawCentredString(W / 2, 60, "“The agent can want anything; it can only pay what policy allows.”")
    c.showPage()

    # ── 5 · ARCHITECTURE (simplified, scaled from 1720×700 → 860×350)
    bg(PAPER)
    h2("Every payment crosses one guarded path")
    ox, oy = P, 60  # drawing area origin (bottom)
    s = 0.5
    def bx(x, y_design, w, h, border, fill, title, sub, dash=None, zone=None, zcol=None):
        X, Yd = ox + x * s, oy + (700 - y_design) * s  # design y from top of 700-high area
        Wd, Hd = w * s, h * s
        rrect(c, X, Yd - Hd, Wd, Hd, border, fill, dash=dash, r=6, lw=1.6)
        if zone:
            c.setFillColor(zcol); c.setFont(MONB, 8); c.drawString(X + 8, Yd - 14, zone)
        c.setFillColor(INK); c.setFont(HELB, 13); c.drawCentredString(X + Wd / 2, Yd - Hd / 2 + 2 - (6 if zone else 0), title)
        c.setFillColor(MUT); c.setFont(HELV, 9.5); c.drawCentredString(X + Wd / 2, Yd - Hd / 2 - 12 - (6 if zone else 0), sub)
    def ar(x1, y1, x2, y2, col, both=False, wd=1.8):
        line_arrow(c, ox + x1 * s, oy + (700 - y1) * s, ox + x2 * s, oy + (700 - y2) * s, col, w=wd, both=both)
    ar(442, 360, 590, 360, RED); ar(855, 172, 855, 274, BLU, both=True)
    ar(1122, 360, 1268, 360, GRN); ar(855, 452, 855, 552, ARROW_GRAY, wd=1.5); ar(1428, 428, 1428, 552, ARROW_GRAY, wd=1.5)
    bx(40, 268, 400, 160, RED_D, RED_BG, "AUTOPILOT AGENT", "plans & requests — holds no keys", dash=[5, 3], zone="UNTRUSTED — LLM, INJECTABLE", zcol=RED)
    bx(596, 280, 520, 148, GRN_D, GRN_BG, "SPENDGUARD", "policy-gated signer — the only thing that can pay", dash=[5, 3], zone="CUSTODY BOUNDARY", zcol=GRN)
    bx(656, 60, 400, 100, BLU, BLU_BG, "OWNER DASHBOARD", "human oversight — approve / deny")
    bx(1274, 308, 320, 100, GLD, GLD_BG, "SELLERS ×3", "dynamic pricing = negotiation surface")
    bx(656, 558, 400, 100, PUR, PUR_BG, "ARC TESTNET", "SpendAnchor.sol — tamper-evident audit")
    bx(1258, 558, 350, 100, GWB, GWB_BG, "CIRCLE GATEWAY", "gas-free USDC settlement, batched")
    for lx, ly, txt, col in [(430, 330, "POST /pay (reason)", RED_TXT), (872, 208, "approvals · ledger", BLU),
                             (1130, 330, "x402 USDC", GRN), (872, 495, "anchor policy + epochs", GRAY),
                             (1444, 480, "batch settle", GRAY)]:
        c.setFillColor(col); c.setFont(MONO, 9); c.drawString(ox + lx * s, oy + (700 - ly) * s, txt)
    c.showPage()

    # ── 6 · CIRCLE STACK
    bg(PAPER)
    h2("Four core Circle products, each load-bearing")
    cards = [("Nanopayments / x402", "Core rail. Seller middleware re-resolves price per request; the <font face='Courier'>onBeforePaymentCreation</font> hook runs inside SpendGuard's trusted process — enforcement behind the custody wall."),
             ("Circle Wallets (DCW)", "Key custody. EIP-712 signing via <font face='Courier'>signTypedData</font> on a developer-controlled EOA — no raw private key anywhere in the stack: payments <i>and</i> on-chain anchoring alike."),
             ("Circle Gateway", "Settlement + treasury. One deposit funds the agent; every payment after is a gas-free EIP-3009 authorization, batch-settled onchain with transfer UUID receipts."),
             ("USDC on Arc", "Settlement asset <i>and</i> gas token — the SpendAnchor audit transactions themselves are paid in USDC on Arc Testnet.")]
    cw6 = (W - 2 * P - 16) / 2; chh = 165
    for i, (t, body) in enumerate(cards):
        x = P + (i % 2) * (cw6 + 16); yy = H - 110 - (i // 2) * (chh + 14)
        rrect(c, x, yy - chh, cw6, chh, LBRD, HexColor("#ffffff"), r=8, lw=1)
        c.setFillColor(INK); c.setFont(HELB, 17); c.drawString(x + 22, yy - 32, t)
        para(c, body, x + 22, yy - 44, cw6 - 44, size=13.5, color=MUT, leading=20)
    para(c, "<b>+ CCTP</b> — autonomous cross-chain treasury top-ups (built). <b>USYC + StableFX</b> — tokenized-yield &amp; cross-currency FX legs, wired behind feature flags and testable the moment enterprise access is granted.",
         P, H - 110 - 2 * (chh + 14) - 6, W - 2 * P, size=13, color=MUT, leading=19)
    c.showPage()

    # ── 7 · DEMO BEATS
    bg(PAPER)
    h2("The demo lands in four beats")
    beats = [("1", BLU, "Delegation", "agent subscribes to the cheapest seller, meters gasless per-call payments"),
             ("2", GLD, "Negotiation", "seller raises prices 60% → next renewal re-shops and switches, 21.9% cheaper"),
             ("3", RED, "Attack", "prompt-injected overspend → denied at the policy wall (per_tx_max_exceeded), human clicks Deny"),
             ("4", PUR, "Proof", "month-end burn-down, savings from switching, denial log, receipts anchored on Arc")]
    y = H - 120
    for n, col, name, txt in beats:
        rrect(c, P, y - 66, W - 2 * P, 66, LBRD, HexColor("#ffffff"), r=8, lw=1)
        c.setFillColor(col); c.setFont(MONB, 22); c.drawString(P + 24, y - 43, n)
        c.setFillColor(INK); c.setFont(HELB, 16); c.drawString(P + 70, y - 41, name)
        para(c, txt, P + 240, y - 18, W - 2 * P - 264, size=13.5, color=MUT, leading=18)
        y -= 80
    c.showPage()

    # ── 8 · VERIFIED
    bg(PAPER)
    h2("Verified end-to-end on Arc Testnet")
    checks = ["Full E2E loop cleared Day 0 — verify-day0.sh",
              "Keyless: DCW signs payments AND on-chain anchors — no raw key in the deployed stack",
              "All four demo beats live in production: metering, 21.9% switch, injection denied, human hold/release",
              "SpendAnchor DCW-owned — epochs auto-anchored every 10 min, signed keylessly (verified on-chain)"]
    y = H - 125
    for t in checks:
        c.setFillColor(GRN); c.setFont(MONB, 16); c.drawString(P, y, "✓")
        c.setFillColor(INK); c.setFont(HELV, 16); c.drawString(P + 34, y, t)
        y -= 42
    rrect(c, P, y - 88, 620, 74, PUR, PUR_BG, r=8, lw=1.5)
    c.setFillColor(PUR); c.setFont(MONO, 11); c.drawString(P + 22, y - 40, "SPENDANCHOR.SOL · ARC TESTNET")
    c.setFillColor(INK); c.setFont(MONB, 15.5); c.drawString(P + 22, y - 66, "0xf550a882da3c26fbacd1b68aa83867102206b143")
    c.showPage()

    # ── 9 · CLOSE
    bg(DARK)
    c.setFillColor(D_BLU); c.setFont(MONO, 15); c.drawString(P, H - 140, "Circle's sample shows an agent that can pay.")
    c.setFillColor(D_TXT); c.setFont(HELB, 48)
    c.drawString(P, H - 215, "Autopilot pays well —")
    c.drawString(P, H - 272, "cheaper, safer, gasless.")
    footer_row(["Subscription Autopilot · Track 4", "github.com/roniejosephv-star/subscription-autopilot"])
    c.showPage()
    c.save()


if __name__ == "__main__":
    diagram(os.path.join(HERE, "diagram_1a.pdf"))
    one_pager(os.path.join(HERE, "one_pager.pdf"), "see submission form")
    deck(os.path.join(HERE, "deck.pdf"))
    print("OK: diagram_1a.pdf, one_pager.pdf, deck.pdf")
