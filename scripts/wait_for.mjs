// Poll a TaskEvaluator view until it returns the expected value (or any non-empty value).
// Usage: node wait_for.mjs <contract> <function> <jsonArgs> <expectedSubstring|-> [timeoutSec]
// Use "-" as expected to accept any non-empty result. Exits 0 on match, 1 on timeout.
import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http } from 'viem';

const [, , addr, fn, argsJson, expected, timeoutSec] = process.argv;
const args = JSON.parse(argsJson || '[]');
const timeout = (parseInt(timeoutSec || '300', 10)) * 1000;
const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });
const start = Date.now();
for (;;) {
  try {
    const r = await client.readContract({ address: addr, functionName: fn, args });
    const s = typeof r === 'string' ? r : JSON.stringify(r);
    if (s && (expected === '-' || s.includes(expected))) {
      console.log(`MATCH ${fn} =>`, s.slice(0, 600));
      process.exit(0);
    }
  } catch (e) { /* keep polling */ }
  if (Date.now() - start > timeout) {
    console.log(`TIMEOUT waiting for ${fn} to include ${JSON.stringify(expected)}`);
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 5000));
}
