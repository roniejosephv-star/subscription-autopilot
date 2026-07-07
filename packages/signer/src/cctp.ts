/**
 * CCTP cross-chain USDC top-up — executed from Circle DCW wallets (no raw key).
 *
 * WHY: the agent's spend lives in its Arc Gateway balance. When that runs low, the
 * agent shouldn't stall waiting for a human refill — it tops itself up by moving USDC
 * from a source testnet into Arc via Circle's Cross-Chain Transfer Protocol (CCTP).
 * This makes treasury management part of the autonomous loop ("research, negotiate,
 * execute" + "keep yourself funded"), and routes USDC across chains with Circle infra.
 *
 * FLOW (CCTP burn-and-mint), every on-chain call a DCW contract-execution:
 *   1. source chain: USDC.approve(TokenMessenger, amount)
 *   2. source chain: TokenMessenger.depositForBurn(amount, ARC_DOMAIN, mintRecipient, USDC)
 *   3. Circle attestation service (IRIS) signs the burn message
 *   4. Arc: MessageTransmitter.receiveMessage(message, attestation)  → USDC minted to the agent
 *   5. agent deposits the newly-minted USDC into its Gateway balance (existing /deposit path)
 *
 * STATUS: agent decision + orchestration is live (treasury.ts drives this on a low-balance
 * trigger). Live cross-chain execution requires (a) a funded DCW wallet on the SOURCE chain
 * (CCTP_SOURCE_WALLET_ID) and (b) confirming the CCTP v2 testnet contract addresses + domain
 * ids for your source chain against https://developers.circle.com/cctp — set them via env
 * below. Until then this is a code-complete, architecture-level integration (permitted by the
 * hackathon rules for gated/complex integrations).
 */
import { contractCall } from "./dcw-chain.js";

const IRIS = process.env.CCTP_IRIS_URL ?? "https://iris-api-sandbox.circle.com";
const ARC_DESTINATION_DOMAIN = process.env.CCTP_ARC_DOMAIN;          // Arc's CCTP domain id (see Circle docs)

// Per-source-chain CCTP config (set for whichever testnet holds the agent's spare USDC).
function sourceConfig() {
  return {
    walletId: process.env.CCTP_SOURCE_WALLET_ID,                     // DCW wallet on the source chain (funded)
    usdc: process.env.CCTP_SOURCE_USDC,                              // USDC token on source
    tokenMessenger: process.env.CCTP_SOURCE_TOKEN_MESSENGER,         // CCTP TokenMessenger on source
  };
}
// Arc-side receiver.
function arcConfig() {
  return {
    walletId: process.env.AGENT_WALLET_ID,                          // agent wallet on Arc
    messageTransmitter: process.env.CCTP_ARC_MESSAGE_TRANSMITTER,    // CCTP MessageTransmitter on Arc
  };
}

function toAtomic(amountDecimal: string): string {
  const [i, f = ""] = amountDecimal.split(".");
  return BigInt(i + f.padEnd(6, "0").slice(0, 6)).toString();
}
function addressToBytes32(addr: string): string {
  return "0x" + "0".repeat(24) + addr.replace(/^0x/, "").toLowerCase();
}

export interface CctpTopUpResult { burnTx: string; mintTx?: string; status: string; }

/** Pull `amountDecimal` USDC from the configured source chain into Arc via CCTP. */
export async function cctpTopUp(amountDecimal: string): Promise<CctpTopUpResult> {
  const src = sourceConfig();
  const arc = arcConfig();
  const missing = Object.entries({ ...src, ...arc, ARC_DESTINATION_DOMAIN })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`CCTP not configured — set env: ${missing.join(", ")} (see developers.circle.com/cctp)`);
  }
  const amount = toAtomic(amountDecimal);
  const mintRecipient = addressToBytes32(process.env.AGENT_WALLET_ADDRESS!);

  // 1) approve + 2) burn on the source chain (from the source-chain DCW wallet)
  await contractCall(src.usdc!, "approve(address,uint256)", [src.tokenMessenger!, amount], src.walletId!);
  const burnTx = await contractCall(
    src.tokenMessenger!,
    "depositForBurn(uint256,uint32,bytes32,address)",
    [amount, ARC_DESTINATION_DOMAIN!, mintRecipient, src.usdc!],
    src.walletId!,
  );

  // 3) fetch the Circle attestation for this burn (IRIS)
  const attestation = await fetchAttestation(burnTx);
  if (!attestation) return { burnTx, status: "burned; attestation pending (mint later)" };

  // 4) mint on Arc via MessageTransmitter.receiveMessage(message, attestation)
  const mintTx = await contractCall(
    arc.messageTransmitter!,
    "receiveMessage(bytes,bytes)",
    [attestation.message, attestation.attestation],
    arc.walletId!,
  );
  return { burnTx, mintTx, status: "minted on Arc" };
}

/** Poll Circle's IRIS attestation service for the burn message + signature. */
async function fetchAttestation(burnTxHash: string): Promise<{ message: string; attestation: string } | null> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await fetch(`${IRIS}/v1/messages/${burnTxHash}`);
      if (!res.ok) continue;
      const body = await res.json() as { messages?: Array<{ message: string; attestation: string; status?: string }> };
      const m = body.messages?.[0];
      if (m && m.attestation && m.attestation !== "PENDING") return { message: m.message, attestation: m.attestation };
    } catch { /* keep polling */ }
  }
  return null;
}
