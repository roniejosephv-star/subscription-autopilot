/**
 * Deploy SpendAnchor FROM the agent's Circle DCW EOA wallet, so the contract's
 * immutable `owner` == the DCW wallet (AGENT_WALLET_ADDRESS). This is what lets
 * the signer commit epochs KEYLESSLY (via Circle contract-execution) — no raw key.
 *
 * Prereq (one-time):  npm install @circle-fin/smart-contract-platform
 * Run:                node --env-file=.env scripts/deploy-anchor-dcw.mjs
 *
 * Needs in .env: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, AGENT_WALLET_ADDRESS
 * On success it prints the new ANCHOR_CONTRACT_ADDRESS and verifies owner().
 */
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

const { CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, AGENT_WALLET_ADDRESS } = process.env;
for (const [k, v] of Object.entries({ CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, AGENT_WALLET_ADDRESS })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

// ── compile SpendAnchor (no-arg constructor → owner = deployer = DCW wallet) ──
const source = fs.readFileSync(path.resolve("contracts/src/SpendAnchor.sol"), "utf-8");
const input = {
  language: "Solidity",
  sources: { "SpendAnchor.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors ?? []).filter((e) => e.severity === "error");
if (errs.length) { console.error(errs.map((e) => e.formattedMessage).join("\n")); process.exit(1); }
const c = out.contracts["SpendAnchor.sol"].SpendAnchor;
const abi = c.abi;
const bytecode = `0x${c.evm.bytecode.object}`;
console.log(`Compiled SpendAnchor (${(bytecode.length - 2) / 2} bytes). Deployer wallet: ${AGENT_WALLET_ADDRESS}`);

// ── deploy via Circle Smart Contract Platform, source = agent DCW EOA ─────────
const scp = initiateSmartContractPlatformClient({ apiKey: CIRCLE_API_KEY, entitySecret: CIRCLE_ENTITY_SECRET });

let deployRes;
try {
  deployRes = await scp.deployContract({
    name: "SpendAnchor",
    description: "Subscription Autopilot audit anchors",
    blockchain: "ARC-TESTNET",
    walletId: AGENT_WALLET_ID,          // ← EOA deployer ⇒ owner = AGENT_WALLET_ADDRESS
    abiJson: JSON.stringify(abi),
    bytecode,
    // constructorParameters omitted — SpendAnchor() takes no args
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
} catch (err) {
  console.error("\ndeployContract failed:");
  console.error("  message:", err?.message, "| code:", err?.code, "| status:", err?.status);
  const data = err?.error?.response?.data;
  if (data) console.error("  circle response:", JSON.stringify(data, null, 2));
  process.exit(1);
}
const contractId = deployRes.data?.contractId ?? deployRes.data?.contractIds?.[0];
const transactionId = deployRes.data?.transactionId;
console.log(`Deploy initiated. contractId=${contractId} transactionId=${transactionId}`);

// ── poll for the deployed address ────────────────────────────────────────────
let address = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const info = await scp.getContract({ id: contractId });
    const ct = info.data?.contract ?? info.data;
    const status = ct?.status ?? ct?.state;
    address = ct?.contractAddress ?? ct?.address ?? null;
    process.stdout.write(`\r  status=${status ?? "?"} address=${address ?? "pending"}   `);
    if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) break;
  } catch { /* keep polling */ }
}
console.log();
if (!address) { console.error("Timed out waiting for contract address. Check console.circle.com → Contracts."); process.exit(1); }
console.log(`\n✅ SpendAnchor deployed: ${address}`);

// ── verify owner() == the DCW wallet (Circle-native read, no gas, no key) ─────
try {
  const ownerAbi = '[{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]';
  const q = await scp.queryContract({ abiFunctionSignature: "owner()", address, blockchain: "ARC-TESTNET", abiJson: ownerAbi });
  const owner = q.data?.outputValues?.[0] ?? "";
  const ok = owner.toLowerCase() === AGENT_WALLET_ADDRESS.toLowerCase();
  console.log(`owner() = ${owner}  ${ok ? "✅ matches DCW wallet" : "❌ MISMATCH — do NOT proceed, the wrong wallet deployed it"}`);
} catch (e) {
  console.log(`(owner() check skipped: ${e.message}). Verify manually: read owner() on arcscan — must equal ${AGENT_WALLET_ADDRESS}.`);
}

console.log(`\nNext: set  ANCHOR_CONTRACT_ADDRESS=${address}  on the Railway signer + local .env, then remove SIGNER_FALLBACK_PRIVATE_KEY and redeploy the signer.`);
