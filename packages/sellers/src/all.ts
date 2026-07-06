import { startSeller } from "./server.js";
import { sellerConfigs } from "./pricing.js";

for (const cfg of sellerConfigs()) startSeller(cfg);
