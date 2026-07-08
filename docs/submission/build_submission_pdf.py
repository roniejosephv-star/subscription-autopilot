#!/usr/bin/env python3
"""Builds the Ignyte submission package.

NOTE: the original generators (design_assets.py, deck.pdf) were intentionally
removed to slim the submission folder, so this script no longer regenerates the
full combined PDF end-to-end. The shipped deliverables it produced still live in
this folder: Ignyte-Submission-Subscription-Autopilot.pdf, one_pager.pdf,
submission_details.pdf, circle_product_feedback.pdf, architecture.png, images/.
Kept for reference / annex regeneration only.

Set VIDEO_LINK below before final submission, then regenerate.
"""
import os
import shutil
import subprocess

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (HRFlowable, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

try:
    import design_assets
except ImportError:
    import sys
    sys.exit("design_assets.py was removed from this folder; the combined-PDF "
             "regeneration step is no longer available. The final deliverables "
             "already exist in docs/submission/ (see the module docstring).")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Ignyte-Submission-Subscription-Autopilot.pdf")

# ── fill before final submission ──────────────────────────────────────────────
VIDEO_LINK = "TODO — paste hosted demo-video URL, then regenerate"
# ──────────────────────────────────────────────────────────────────────────────

REPO = "https://github.com/roniejosephv-star/subscription-autopilot"
DEMO = "https://autopilotdashboard-production.up.railway.app"
SIGNER_API = "https://autopilotsigner-production.up.railway.app"
ANCHOR = "https://testnet.arcscan.app/address/0xf550a882da3c26fbacd1b68aa83867102206b143"
EMAIL = "roniejosephv@gmail.com"

INK = colors.HexColor("#1a1a18"); MUT = colors.HexColor("#4a4a45")
GRN = colors.HexColor("#1f7a5c"); BG = colors.HexColor("#f0efec")

ss = getSampleStyleSheet()
def st(name, **kw):
    base = kw.pop("base", "Normal")
    return ParagraphStyle(name, parent=ss[base], **kw)

S = {
    "h1":   st("h1", base="Heading1", fontSize=15, textColor=INK, spaceBefore=14, spaceAfter=6),
    "h2":   st("h2", base="Heading2", fontSize=11.5, textColor=GRN, spaceBefore=10, spaceAfter=3),
    "body": st("b", fontSize=9.8, textColor=INK, leading=14, spaceAfter=5),
    "small": st("s", fontSize=8.6, textColor=MUT, leading=12),
    "cell": st("c", fontSize=9, textColor=INK, leading=12.5),
}
def P(t, s="body"): return Paragraph(t, S[s])
def link(url, label=None): return f'<link href="{url}" color="#34509b"><u>{label or url}</u></link>'

def kv(rows, widths=(42*mm, 128*mm)):
    t = Table([[P(f"<b>{k}</b>", "cell"), P(v, "cell")] for k, v in rows], colWidths=list(widths))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, BG]),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def build_annex(path):
    story = [
        P("Submission details", "h1"),
        kv([
            ("Track", "4 — Best Agentic Economy Experience on Arc"),
            ("Participant", "Ronie Joseph (solo)"),
            ("Circle Developer Account", EMAIL),
            ("Circle products used", "USDC · Wallets (developer-controlled) · Gateway · Nanopayments (x402) — all live &amp; load-bearing. "
             "CCTP — autonomous cross-chain treasury (code-complete). USYC · StableFX — wired behind flags, testable on enterprise access."),
            ("Live demo (dashboard)", link(DEMO)),
            ("SpendGuard API (public)", link(SIGNER_API + "/summary")),
            ("GitHub repository", link(REPO)),
            ("Demo video", link(VIDEO_LINK) if VIDEO_LINK.startswith("http") else f"<i>{VIDEO_LINK}</i>"),
            ("On-chain audit anchor", link(ANCHOR, "SpendAnchor 0xf550…b143 on Arc Testnet (arcscan)")),
            ("Scope", "Testnet demo — Arc Testnet, chain 5042002 (gas = USDC)"),
        ]),
        P("Working MVP — deployed and verifiable now", "h1"),
        P(f"Frontend + backend live: the owner dashboard at {link(DEMO)} renders the production ledger "
          "(100+ settled nanopayments), budget burn-down, approval queue, policy chain, and the Gateway treasury "
          f"balance; {link(SIGNER_API + '/summary', 'the public signer API')} serves the same data raw. "
          "Four services on Railway (SpendGuard signer, 3 x402 sellers, agent, dashboard), SQLite ledger on a "
          "persistent volume. Custody mode is SIGNER_MODE=circle — EIP-712 via Circle Wallets DCW EOA, verified "
          "against Gateway settlement on Arc Testnet (transfer 9bd6a149-1821-4341-a4aa-712cdc362382, 2026-07-06). "
          "Spend epochs auto-anchor on Arc every 10 minutes — signed keylessly by the DCW wallet (SpendAnchor redeployed under "
          "DCW ownership; no raw private key anywhere in the deployed stack, payments and anchoring alike)."),
        P("Demo guide (the video's four beats, reproducible live)", "h2"),
        kv([
            ("1 · Delegation", "Agent researches quotes, subscribes to the cheapest seller, meters per-call gasless nanopayments."),
            ("2 · Negotiation", "Seller price drift → at renewal the agent re-quotes all sellers at real volume and switches (21.9% cheaper per call)."),
            ("3 · Attack", "Prompt-injected overspend → denied at the per-tx policy wall; a $0.03 premium call is held → human Approve/Deny on the dashboard."),
            ("4 · Proof", "Burn-down, savings, denial log, Gateway receipts — and the epoch chip linking to the SpendAnchor tx on arcscan."),
        ], widths=(30*mm, 140*mm)),
        P("Documentation", "h2"),
        P("README.md — zero-to-running setup and per-product integration notes with file references · ARCHITECTURE.md — "
          "component spec and trust boundaries · PRD.md — product spec, acceptance criteria, risk log · DEPLOYMENT.md — "
          "the exact deployment runbook used · docs/submission/ — this document's sources."),
        P("Judge quick-verify (no setup): open the dashboard; curl " + SIGNER_API + "/summary; click the SpendAnchor link on arcscan.", "small"),

        PageBreak(),
        P("Circle Product Feedback", "h1"),
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
          "path is the single change that would most help agentic use cases — Circle-custodied buyers are exactly who agents need.<br/>"
          "10. <b>Deploy vs execute live in different packages:</b> createContractExecutionTransaction is on @circle-fin/developer-controlled-wallets, "
          "but deployContract is only on @circle-fin/smart-contract-platform — a dev working from the Wallets client won't find deploy. Cross-link them.<br/>"
          "11. <b>deployContract rejects an empty constructorParameters: []</b> with a generic 400 that names no field; omitting it works. Accept [] or name the bad param.<br/>"
          "12. <b>Gas Station (SCA-only) and Nanopayments/x402 (EOA-only) are mutually exclusive for one wallet</b> — agentic builders want both; emit a runtime hint on the mismatch.<br/>"
          "13. <b>No single-call DCW-native CCTP helper:</b> cross-chain top-ups work by chaining approve → depositForBurn → IRIS attestation → receiveMessage "
          "via contract-execution, but need a funded DCW wallet per source chain. A DCW-native CCTP method would unlock autonomous cross-chain treasury for agents."),
        P("Recommendations", "h2"),
        P("Ship a first-class “agent buyer” recipe: DCW EOA wallet + Gateway deposit via contract execution + x402 client with a "
          "policy hook — the five pieces exist today but must be discovered across four doc sites and two SDKs' type definitions. "
          "This project is, in effect, that recipe; we'd be glad if it were useful as a reference."),
        Spacer(1, 6*mm),
        HRFlowable(width="100%", color=BG, thickness=1.2),
        P(f"Subscription Autopilot · Ignyte × Circle × Arc — Stablecoins Commerce Stack Challenge, Track 4 · {EMAIL} · Apache-2.0 "
          "(patterns adapted from Circle's Apache-2.0 samples are credited in-repo)", "small"),
    ]
    SimpleDocTemplate(path, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
                      topMargin=16*mm, bottomMargin=16*mm,
                      title="Subscription Autopilot — Submission details & Circle Product Feedback",
                      author="Ronie Joseph").build(story)


def main():
    one_pager = os.path.join(HERE, "one_pager.pdf")
    deck = os.path.join(HERE, "deck.pdf")
    diagram = os.path.join(HERE, "diagram_1a.pdf")
    annex = os.path.join(HERE, "annex.pdf")

    design_assets.diagram(diagram)
    design_assets.one_pager(one_pager, VIDEO_LINK if VIDEO_LINK.startswith("http") else "in submission form")
    design_assets.deck(deck)
    build_annex(annex)

    # architecture.png for the repo/README (from the designed diagram)
    if shutil.which("pdftoppm"):
        png_root = os.path.join(HERE, "arch_tmp")
        subprocess.run(["pdftoppm", "-png", "-r", "160", "-singlefile", diagram, png_root], check=True)
        shutil.move(png_root + ".png", os.path.join(HERE, "..", "architecture.png"))

    w = PdfWriter()
    for f in (one_pager, deck, annex):
        for page in PdfReader(f).pages:
            w.add_page(page)
    w.add_metadata({"/Title": "Subscription Autopilot — Ignyte Submission (Track 4)", "/Author": "Ronie Joseph"})
    with open(OUT, "wb") as fh:
        w.write(fh)
    print(f"OK → {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main()
