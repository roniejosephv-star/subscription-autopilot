/**
 * Deterministic env bootstrap — import this FIRST.
 * `tsx watch --env-file` has a startup race where the first spawn can run
 * before env values are applied (symptom: port fell back to 5000, which
 * macOS AirPlay owns → EADDRINUSE crash loop). Loading dotenv in-process
 * removes the dependency on CLI flag timing. Existing env vars win.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "../../.env") }); // repo root (workspace cwd)
config({ path: path.resolve(process.cwd(), ".env") });       // local override if any
