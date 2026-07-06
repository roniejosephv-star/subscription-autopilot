/**
 * DAY-1 SPIKE, part 1 (local, no Gateway needed):
 * Sign a dummy EIP-3009 TransferWithAuthorization with the Circle DCW EOA and
 * recover the signer address. If recovered === AGENT_WALLET_ADDRESS, the
 * signature is standard secp256k1 — Gateway's ecrecover will accept it.
 *
 * Run:  node --env-file=.env scripts/spike-dcw-sign.mjs
 */
import { CircleDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { recoverTypedDataAddress } from "viem";

const { CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, AGENT_WALLET_ADDRESS } = process.env;
for (const [k, v] of Object.entries({ CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, AGENT_WALLET_ADDRESS })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

const sdk = new CircleDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
});

// EIP-712 domain/types exactly as Gateway batching uses them
// (name/version from SDK constants; verifyingContract = GatewayWallet on Arc Testnet)
const typedData = {
  domain: {
    name: "GatewayWalletBatched",
    version: "1",
    chainId: 5042002,
    verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: AGENT_WALLET_ADDRESS,
    to: "0x000000000000000000000000000000000000dEaD",
    value: "1000", // 0.001 USDC — dummy, never submitted anywhere
    validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 8 * 24 * 3600),
    nonce: "0x" + "11".repeat(32),
  },
};

console.log("Requesting EIP-712 signature from Circle Wallets (DCW EOA)…");
const response = await sdk.signTypedData({ walletId: AGENT_WALLET_ID, data: JSON.stringify(typedData) });
const signature = response?.data?.signature;
if (!signature) { console.error("No signature returned:", JSON.stringify(response?.data ?? response)); process.exit(1); }
console.log("Signature:", signature);

const recovered = await recoverTypedDataAddress({
  domain: typedData.domain,
  types: { TransferWithAuthorization: typedData.types.TransferWithAuthorization },
  primaryType: "TransferWithAuthorization",
  message: {
    ...typedData.message,
    value: BigInt(typedData.message.value),
    validAfter: BigInt(typedData.message.validAfter),
    validBefore: BigInt(typedData.message.validBefore),
  },
  signature,
});

console.log("Recovered:", recovered);
console.log("Expected :", AGENT_WALLET_ADDRESS);

if (recovered.toLowerCase() === AGENT_WALLET_ADDRESS.toLowerCase()) {
  console.log("\n✅ SPIKE PART 1 PASSED — DCW signature is ecrecover-compatible. Gateway will accept it.");
} else {
  console.log("\n❌ SPIKE FAILED — recovered address mismatch. Stay on SIGNER_MODE=local; investigate (does the wallet API wrap/prefix EIP-712 payloads?).");
  process.exit(1);
}
