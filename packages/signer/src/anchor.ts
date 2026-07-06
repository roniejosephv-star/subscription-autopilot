/**
 * Anchors policy hashes and spend epochs on Arc Testnet (feature F9, Day 4).
 * No-ops gracefully until ANCHOR_CONTRACT_ADDRESS is set (contract deploys Day 4).
 * Uses CHAIN_CONFIGS from the Circle SDK — no hardcoded addresses/RPC.
 */
import { createWalletClient, http, keccak256, toHex, defineChain, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";

const ANCHOR_ABI = [
  { type: "function", name: "anchorPolicy", stateMutability: "nonpayable", inputs: [{ name: "policyHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "commitEpoch", stateMutability: "nonpayable", inputs: [{ name: "epoch", type: "uint256" }, { name: "spendRoot", type: "bytes32" }, { name: "totalSpentAtomic", type: "uint256" }], outputs: [] },
] as const;

function arcTestnetChain() {
  const cfg = CHAIN_CONFIGS["arcTestnet"] as { rpcUrl?: string };
  return defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, // gas is 18-decimal USDC on Arc
    rpcUrls: { default: { http: [cfg.rpcUrl ?? ""] } },
  });
}

export async function anchorPolicyHash(policyJson: string): Promise<string | null> {
  const address = process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}` | undefined;
  const pk = process.env.SIGNER_FALLBACK_PRIVATE_KEY as `0x${string}` | undefined;
  if (!address || !pk) return null;
  const client = createWalletClient({
    account: privateKeyToAccount(pk),
    chain: arcTestnetChain(),
    transport: http(),
  }).extend(publicActions);
  const hash = keccak256(toHex(policyJson));
  const tx = await client.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchorPolicy", args: [hash] });
  return tx;
}
