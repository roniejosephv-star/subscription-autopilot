/**
 * Creates the agent's Circle developer-controlled wallet: an EOA on ARC-TESTNET.
 * Adapted from Circle's arc-escrow sample (Apache-2.0) with one critical change:
 * accountType "EOA" instead of "SCA" — Nanopayments/Gateway uses ecrecover and
 * does NOT support smart-contract accounts (EIP-1271).
 * Writes AGENT_WALLET_ID / AGENT_WALLET_ADDRESS into .env.
 */
import { config } from "dotenv";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import fs from "node:fs";
import path from "node:path";

config({ path: [".env"] });

for (const envVar of ["CIRCLE_API_KEY", "CIRCLE_ENTITY_SECRET"]) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar} (see .env.example)`);
    process.exit(1);
  }
}

const sdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

try {
  const walletSet = await sdk.createWalletSet({ name: "Subscription Autopilot Agent" });
  const walletSetId = walletSet.data.walletSet.id;
  console.log(`Created wallet set: ${walletSetId}`);

  const created = await sdk.createWallets({
    accountType: "EOA",              // ← Nanopayments requires an EOA (ecrecover)
    blockchains: ["ARC-TESTNET"],
    walletSetId,
  });

  const [wallet] = created.data.wallets;
  if (!wallet) throw new Error("No wallet was created");
  console.log(`Agent wallet (EOA, ARC-TESTNET): ${wallet.address}  id=${wallet.id}`);

  const envPath = path.resolve(".env");
  let env = fs.readFileSync(envPath, "utf-8");
  env = env.replace(/^AGENT_WALLET_ID=.*$/m, `AGENT_WALLET_ID=${wallet.id}`);
  env = env.replace(/^AGENT_WALLET_ADDRESS=.*$/m, `AGENT_WALLET_ADDRESS=${wallet.address}`);
  fs.writeFileSync(envPath, env);
  console.log("Wrote AGENT_WALLET_ID / AGENT_WALLET_ADDRESS to .env");
  console.log(`Next: fund ${wallet.address} with Arc Testnet USDC → https://faucet.circle.com`);
} catch (error) {
  console.error("Failed to create agent wallet:", error.message ?? error);
  process.exit(1);
}
