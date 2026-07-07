/**
 * StableFX cross-currency settlement leg — enterprise-gated, wired behind STABLEFX_ENABLED
 * so it can be tested the moment access is granted (set env + flip the flag, no rebuild).
 *
 * Idea: the sellers are FX-rate services, so a natural extension is settling *cross-currency*
 * subscriptions — the agent quotes in the buyer's currency and settles in the seller's,
 * hedged via StableFX. Requests run through SpendGuard (this process), keeping the FX leg
 * behind the same custody + policy boundary as payments.
 *
 * StableFX is a gated Circle product; its exact endpoints/params are ENV-DRIVEN so nothing
 * is hardcoded/guessed. Until STABLEFX_ENABLED=1 + config is set, calls return a clean
 * "not configured" (architecture-level integration, allowed by the hackathon rules).
 */
const enabled = () => process.env.STABLEFX_ENABLED === "1";

function cfg() {
  return {
    base: process.env.STABLEFX_BASE_URL,        // StableFX API base (from gated docs)
    apiKey: process.env.STABLEFX_API_KEY ?? process.env.CIRCLE_API_KEY,
    quotePath: process.env.STABLEFX_QUOTE_PATH ?? "/v1/fx/quotes",
    settlePath: process.env.STABLEFX_SETTLE_PATH ?? "/v1/fx/settlements",
  };
}
function guard() {
  if (!enabled()) throw new Error("StableFX disabled — set STABLEFX_ENABLED=1 once access is granted");
  if (!cfg().base) throw new Error("StableFX not configured — set STABLEFX_BASE_URL (see developers.circle.com/stablefx)");
}
async function call(path: string, body: unknown) {
  const c = cfg();
  const res = await fetch(`${c.base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`StableFX ${path} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/** Quote converting `amount` of `from` currency into `to`. */
export async function fxQuote(from: string, to: string, amount: string): Promise<unknown> {
  guard();
  return call(cfg().quotePath, { from, to, amount });
}

/** Execute a settlement for a prior quote id. */
export async function fxSettle(quoteId: string): Promise<unknown> {
  guard();
  return call(cfg().settlePath, { quoteId });
}
