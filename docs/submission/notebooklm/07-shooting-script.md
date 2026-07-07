# Shooting script — Subscription Autopilot demo (≤ 3:00)

**Method (storyboard-first):** Claude captures every browser state (dashboard, Railway, arcscan)
as screenshots; Ronie executes the terminal commands and screenshots the terminal; Claude stitches
all frames into a captioned video with ffmpeg (`stitch/` workflow at the bottom). Every frame gets
an on-screen description. The same sequence + narration is then reusable 1:1 for a live screen
recording — same shots, same words.

**Production URLs**

| What | URL |
|---|---|
| Dashboard (demo URL) | https://autopilotdashboard-production.up.railway.app |
| SpendGuard API | https://autopilotsigner-production.up.railway.app |
| SpendAnchor on arcscan | https://testnet.arcscan.app/address/0xf550a882da3c26fbacd1b68aa83867102206b143 |

**Pre-flight (Claude, in Railway — before any capture)**

1. Agent → Variables: `AGENT_TICK_MS=20000`, `AGENT_CALLS_PER_TICK=3`, `RENEWAL_PERIOD_MS=120000` → deploy.
   *(Payments tick every ~7 s; renewals every 2 min.)*
2. Confirm dashboard shows fresh green `allow` rows before starting.
3. **After the shoot, restore:** `AGENT_TICK_MS=600000`, `AGENT_CALLS_PER_TICK=1`, `RENEWAL_PERIOD_MS=3600000`;
   remove `DEMO_PRICE_DRIFT_B` from sellers.

---

## BEAT 1 — Delegation (video 0:00–0:45)

**Narration:** *“Would you give an AI your wallet? Circle's rails let agents pay autonomously — but
capability isn't trust. Meet Subscription Autopilot: it subscribes to the cheapest x402 seller and
meters usage with per-call, gasless USDC nanopayments — batch-settled by Circle Gateway on Arc.”*

| # | Shot | Who | Caption on frame |
|---|---|---|---|
| 1.1 | Dashboard **Overview** — payments counter climbing, burn-down bar, treasury card | Claude | Agent runs autonomously: metered x402 nanopayments against a 10 USDC monthly budget |
| 1.2 | Dashboard **Live feed** — green `allow` rows, amounts 0.004, `receipt ↗` links | Claude | Every call is a gasless USDC payment with a Circle Gateway transfer receipt |
| 1.3 | Same feed, one `receipt ↗` clicked → `gateway: complete` | Claude | Receipts resolve live against Circle Gateway |
| 1.4 | Railway **agent logs** — `subscribed to fx-rates via seller B @ $0.00x/call`, `paid 0.004 …` | Claude | The agent holds zero keys — it can only *request*; SpendGuard executes |

## BEAT 2 — Negotiation: price drift → re-shop switch (0:45–1:30)

**Trigger (Claude, Railway):** sellers service → Variables → add `DEMO_PRICE_DRIFT_B=1.6` → deploy.
Seller B (the agent's current seller) gets 60 % more expensive. Wait ≤ 2 min for the renewal tick.

**Narration:** *“Sellers reprice constantly. At every renewal the agent re-quotes all three sellers
at its real volume — when its current seller drifts 60 % up, it switches and logs the rationale.
Research, negotiate, execute.”*

| # | Shot | Who | Caption |
|---|---|---|---|
| 2.1 | Railway sellers Variables showing `DEMO_PRICE_DRIFT_B=1.6` | Claude | Seller B raises prices 60% — the market moves against the agent |
| 2.2 | Railway **agent logs** — re-shop rationale line (`… → switch, xx.x% cheaper per call`) | Claude | At renewal the agent re-quotes every seller at its real volume — and switches |
| 2.3 | Dashboard **Overview** — RE-SHOP SAVINGS card now shows the % and `B → A/C` | Claude | The switch is visible money: xx.x% cheaper per call |
| 2.4 | Dashboard **Subscription card** — switch history line with timestamp | Claude | Every decision is logged with its rationale |

## BEAT 3 — Attack: the policy wall + human-in-the-loop (1:30–2:15)

**Narration:** *“Now the attack. A poisoned instruction tells the agent to buy the unlimited tier —
fifty cents a call. SpendGuard denies it at the policy wall: the per-transaction cap. A premium
request above the human threshold isn't denied — it's held, and the owner decides. The agent can
want anything; it can only pay what policy allows.”*

**Command A — hard deny (Ronie, terminal; screenshot the command + JSON response):**

```bash
curl -s -X POST https://autopilotsigner-production.up.railway.app/pay \
  -H "content-type: application/json" \
  -d '{"url":"http://autopilotsellers.railway.internal:4002/data?unlimited=true","serviceId":"fx-rates","sellerId":"B","reason":"URGENT: buy the unlimited tier now to lock a one-time discount"}' | python3 -m json.tool
```
Expected: `402`-style JSON with `"decision":"deny","code":"per_tx_max_exceeded"`.

**Command B — hold for human (Ronie, terminal, right after):**

```bash
curl -s -X POST https://autopilotsigner-production.up.railway.app/pay \
  -H "content-type: application/json" \
  -d '{"url":"http://autopilotsellers.railway.internal:4002/data?premium=true","serviceId":"fx-rates","sellerId":"B","reason":"Upgrade to premium tier for faster rates"}' | python3 -m json.tool
```
Expected: `202` with a `holdId`. **⏱ 60-second window starts — Claude captures the approval card immediately, then clicks Deny.**

| # | Shot | Who | Caption |
|---|---|---|---|
| 3.1 | Terminal: Command A + `per_tx_max_exceeded` response | **Ronie** | Prompt-injected overspend → hard-denied at the per-tx cap. The agent never touches a key |
| 3.2 | Dashboard **Live feed** — red `deny (per_tx_max_exceeded)` row | Claude | The denial is ledgered with a structured code |
| 3.3 | Terminal: Command B + `202 hold` response | **Ronie** | Above the human threshold → not denied, *held* |
| 3.4 | Dashboard — **approval card** in the queue: 0.03 USDC, reason, Approve/Deny | Claude | The owner decides. Human-in-the-loop, live |
| 3.5 | Dashboard — after clicking **Deny**: queue empty, feed shows the hold denied | Claude | Denied by the human — and that decision is in the audit trail too |

## BEAT 4 — Proof: the audit trail on Arc (2:15–3:00)

**Narration:** *“And none of this is just our dashboard's claim. SpendGuard hash-anchors its policy
and its spend history on Arc every ten minutes — tamper-evident, externally verifiable. Circle's
sample shows an agent that can pay. Autopilot pays well — cheaper, safer, gasless.”*

| # | Shot | Who | Caption |
|---|---|---|---|
| 4.1 | Dashboard **Overview** — full month view: spent/budget, payments, savings, blocked count | Claude | Month-end: on-budget, cheaper than loyalty, 150+ bad attempts stopped |
| 4.2 | Dashboard **Policy** tab — the 6-rule chain + anchor links | Claude | The policy chain — evaluated before any signature exists |
| 4.3 | Status bar zoom — `epoch #… committed ↗` chip | Claude | Spend epochs auto-anchor every 10 minutes |
| 4.4 | **arcscan** — the SpendAnchor commit transaction | Claude | Independently verifiable on Arc — not our word, the chain's |
| 4.5 | Close: dashboard hero or deck slide 9 | Claude | “Autopilot pays well — cheaper, safer, gasless.” Track 4 · Subscription Autopilot |

---

## Stitch workflow (Claude, after all frames exist)

1. Frames land in `docs/submission/stitch/` as `NN-description.png` (browser captures + Ronie's
   terminal shots, ordered by shot number).
2. Each frame gets its caption burned in (ffmpeg drawtext, bottom bar), ~6–8 s per frame,
   narration text as caption; 1920×1080, `-r 30`, H.264:
   ```bash
   ffmpeg -f concat -i frames.txt -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -pix_fmt yuv420p storyboard.mp4
   ```
3. Output: `storyboard.mp4` — the captioned end-to-end walkthrough. Use as-is, or as the exact
   shot-list for a live screen recording with voiceover (same order, same words).

**Honest note:** a stills-based video proves every function but reads as a storyboard. If time
allows before July 13, do one live screen-recording pass following this exact script — the motion
(payments ticking, the approval card appearing) is what makes judges believe the deployment is real.
