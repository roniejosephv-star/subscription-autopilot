/**
 * Anchors policy hashes and spend epochs on Arc Testnet (feature F9, Day 4).
 *
 * Signing goes through the Circle DCW wallet via contract-execution
 * (`dcw-chain.ts#contractCall`) — **no raw private key**. The same custody
 * boundary that signs payments also signs the on-chain audit trail.
 *
 * No-ops gracefully when:
 *   - ANCHOR_CONTRACT_ADDRESS is unset (contract not deployed), or
 *   - SIGNER_MODE=local (offline dev fallback does not anchor on-chain).
 */
import { keccak256, toHex } from "viem";
import { contractCall } from "./dcw-chain.js";

const CIRCLE_MODE = () => process.env.SIGNER_MODE === "circle";

/** The anchor contract, or null when anchoring is disabled (unset addr / local mode). */
function anchorAddress(): `0x${string}` | null {
  const address = process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}` | undefined;
  if (!address || !CIRCLE_MODE()) return null;
  return address;
}

export async function anchorPolicyHash(policyJson: string): Promise<string | null> {
  const address = anchorAddress();
  if (!address) return null;
  const hash = keccak256(toHex(policyJson));
  return contractCall(address, "anchorPolicy(bytes32)", [hash]);
}

/** Commit a spend epoch: root = hash of the ledger snapshot, plus total spent. */
export async function commitEpochOnChain(
  ledgerSnapshotJson: string,
  totalSpentAtomic: bigint,
): Promise<{ tx: string; epoch: number; spendRoot: string } | null> {
  const address = anchorAddress();
  if (!address) return null;
  const epoch = Math.floor(Date.now() / 1000);
  const spendRoot = keccak256(toHex(ledgerSnapshotJson));
  const tx = await contractCall(
    address,
    "commitEpoch(uint256,bytes32,uint256)",
    [String(epoch), spendRoot, totalSpentAtomic.toString()],
  );
  return { tx, epoch, spendRoot };
}
