import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';

console.log('Generating 3 seller addresses...\n');

for (let i = 0; i < 3; i++) {
  const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
  const account = privateKeyToAccount(privateKey);
  console.log(`Seller ${String.fromCharCode(65 + i)} (${['A', 'B', 'C'][i]}):`);
  console.log(`  Private Key: ${privateKey}`);
  console.log(`  Address:     ${account.address}\n`);
}
