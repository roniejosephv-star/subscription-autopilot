/** Deterministic env bootstrap — see packages/signer/src/env.ts for why. */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env") });
