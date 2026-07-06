#!/usr/bin/env bash
# Day-0 kill criterion (PRD §13): the x402 loop must work E2E in one evening.
# Prereqs: `npm install` done, .env filled (SIGNER_FALLBACK_PRIVATE_KEY funded via
# faucet.circle.com on Arc Testnet), sellers + signer running in other terminals:
#   npm run dev:sellers   &   npm run dev:signer
set -euo pipefail

SELLER_URL="http://localhost:${SELLER_PORT_A:-4001}/data"
SIGNER_URL="${SIGNER_URL:-http://localhost:5000}"

echo "1/3 unpaid request must return 402 with PAYMENT-REQUIRED header…"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SELLER_URL")
if [ "$STATUS" != "402" ]; then echo "FAIL: expected 402, got $STATUS"; exit 1; fi
curl -sI "$SELLER_URL" | grep -qi "PAYMENT-REQUIRED" || { echo "FAIL: no PAYMENT-REQUIRED header"; exit 1; }
echo "   OK"

echo "2/3 Gateway deposit (1 USDC, one-time — skip with SKIP_DEPOSIT=1)…"
if [ -z "${SKIP_DEPOSIT:-}" ]; then
  curl -sf -X POST "$SIGNER_URL/deposit" -H 'content-type: application/json' -d '{"amount":"1"}' && echo "   OK"
else
  echo "   skipped"
fi

echo "3/3 policy-governed x402 payment via SpendGuard…"
npm run pay:test
echo ""
echo "ALL CHECKS PASSED — Day 0 kill criterion cleared. Proceed with Day 1."
