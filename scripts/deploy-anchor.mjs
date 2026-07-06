/**
 * Compile + deploy contracts/src/SpendAnchor.sol to Arc Testnet — no Foundry needed.
 * Gas is paid in USDC (Arc's native token) by SIGNER_FALLBACK_PRIVATE_KEY's wallet.
 * Writes ANCHOR_CONTRACT_ADDRESS into .env on success.
 *
 * Run:  node --env-file=.env scripts/deploy-anchor.mjs
 */
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.SIGNER_FALLBACK_PRIVATE_KEY;
if (!pk) { console.error("SIGNER_FALLBACK_PRIVATE_KEY missing"); process.exit(1); }

const { CHAIN_CONFIGS } = await import("@circle-fin/x402-batching/client");
const rpcUrl = CHAIN_CONFIGS.arcTestnet.rpcUrl;

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

// ── compile ────────────────────────────────────────────────────────────────
const source = fs.readFileSync(path.resolve("contracts/src/SpendAnchor.sol"), "utf-8");
const input = {
  language: "Solidity",
  sources: { "SpendAnchor.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) { console.error(errors.map((e) => e.formattedMessage).join("\n")); process.exit(1); }
const contract = output.contracts["SpendAnchor.sol"].SpendAnchor;
const abi = contract.abi;
const bytecode = `0x${contract.evm.bytecode.object}`;
console.log(`Compiled SpendAnchor (${(bytecode.length - 2) / 2} bytes)`);

// ── deploy ─────────────────────────────────────────────────────────────────
const account = privateKeyToAccount(pk);
const wallet = createWalletClient({ account, chain: arcTestnet, transport: http() });
const pub = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });

console.log(`Deploying from ${account.address}…`);
const hash = await wallet.deployContract({ abi, bytecode });
const receipt = await pub.waitForTransactionReceipt({ hash });
const address = receipt.contractAddress;
console.log(`SpendAnchor deployed: ${address}`);
console.log(`Deploy tx: ${hash}`);

// ── persist ────────────────────────────────────────────────────────────────
const envPath = path.resolve(".env");
let env = fs.readFileSync(envPath, "utf-8");
env = env.replace(/^ANCHOR_CONTRACT_ADDRESS=.*$/m, `ANCHOR_CONTRACT_ADDRESS=${address}`);
fs.writeFileSync(envPath, env);
console.log("Wrote ANCHOR_CONTRACT_ADDRESS to .env");

// ── smoke test: anchor a policy hash right now ────────────────────────────
const { keccak256, toHex } = await import("viem");
const testHash = keccak256(toHex(`deploy-smoke-test-${Date.now()}`));
const anchorTx = await wallet.writeContract({ address, abi, functionName: "anchorPolicy", args: [testHash] });
await pub.waitForTransactionReceipt({ hash: anchorTx });
console.log(`Smoke test anchorPolicy tx: ${anchorTx}`);
console.log("\n✅ DONE — restart the signer so it picks up ANCHOR_CONTRACT_ADDRESS.");
