/**
 * Circle Developer-Controlled Wallets signing (SIGNER_MODE=circle — feature F8).
 *
 * Pattern lifted from Circle's arc-fintech sample (Apache-2.0):
 *   circleDeveloperSdk.signTypedData({ walletId, data: JSON.stringify(typedData) })
 * which arc-fintech uses to sign Gateway burn intents with a DCW EOA on ARC-TESTNET.
 *
 * DAY-1 SPIKE (risk table, PRD §13): confirm a DCW-EOA signature is accepted by
 * Gateway's x402 settle (ecrecover). If rejected, stay on SIGNER_MODE=local.
 */
let sdk: any = null;

async function client() {
  if (!sdk) {
    if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
      throw new Error("SIGNER_MODE=circle requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET");
    }
    const { CircleDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");
    sdk = new CircleDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
    });
  }
  return sdk;
}

export async function circleSignTypedData(typedData: unknown): Promise<`0x${string}`> {
  const walletId = process.env.AGENT_WALLET_ID;
  if (!walletId) throw new Error("AGENT_WALLET_ID missing — run `npm run generate-wallet`");
  const c = await client();
  const response = await c.signTypedData({
    walletId,
    data: JSON.stringify(typedData, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  });
  const signature = (response as { data?: { signature?: string } }).data?.signature;
  if (!signature) throw new Error("Circle signTypedData returned no signature");
  return signature as `0x${string}`;
}
