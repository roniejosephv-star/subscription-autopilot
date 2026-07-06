/**
 * On-chain operations from the Circle DCW wallet (SIGNER_MODE=circle).
 * The agent wallet's deposit into Gateway must come FROM the DCW address
 * (Gateway balances belong to the depositor), so we execute the two contract
 * calls the SDK's GatewayClient.deposit() makes — approve + deposit — via
 * Circle's contract-execution API instead of a raw key:
 *   USDC.approve(gatewayWallet, amount)  then  GatewayWallet.deposit(usdc, amount)
 * (Function signatures read from the SDK's shipped implementation.)
 */
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";

let sdk: any = null;
async function dcw() {
  if (!sdk) {
    const { CircleDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");
    sdk = new CircleDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });
  }
  return sdk;
}

const TERMINAL_OK = new Set(["CONFIRMED", "COMPLETE"]);
const TERMINAL_BAD = new Set(["FAILED", "DENIED", "CANCELLED", "STUCK"]);

async function contractCall(contractAddress: string, abiFunctionSignature: string, abiParameters: string[]): Promise<string> {
  const c = await dcw();
  const created = await c.createContractExecutionTransaction({
    walletId: process.env.AGENT_WALLET_ID!,
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = created.data?.id;
  if (!id) throw new Error(`contract execution not created: ${JSON.stringify(created.data ?? created)}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const tx = await c.getTransaction({ id });
    const t = tx.data?.transaction;
    const state = t?.state as string | undefined;
    if (state && TERMINAL_OK.has(state)) return (t?.txHash as string) ?? id;
    if (state && TERMINAL_BAD.has(state)) {
      throw new Error(`DCW tx ${id} ${state}: ${t?.errorReason ?? ""} ${t?.errorDetails ?? ""}`);
    }
  }
  throw new Error(`DCW tx ${id} timed out waiting for confirmation`);
}

/** Deposit decimal USDC from the DCW wallet into its Gateway balance. */
export async function dcwDeposit(amountDecimal: string): Promise<{ approveTx: string; depositTx: string }> {
  const cfg = CHAIN_CONFIGS["arcTestnet"] as { usdc: string; gatewayWallet: string };
  const [i, f = ""] = amountDecimal.split(".");
  const atomic = BigInt(i + f.padEnd(6, "0").slice(0, 6)).toString();

  const approveTx = await contractCall(cfg.usdc, "approve(address,uint256)", [cfg.gatewayWallet, atomic]);
  const depositTx = await contractCall(cfg.gatewayWallet, "deposit(address,uint256)", [cfg.usdc, atomic]);
  return { approveTx, depositTx };
}
