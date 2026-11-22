// One-shot view read. Usage: node read_view.mjs <contract> <function> <jsonArgs>
import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http } from 'viem';
const [, , addr, fn, argsJson] = process.argv;
const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });
const r = await client.readContract({ address: addr, functionName: fn, args: JSON.parse(argsJson || '[]') });
console.log(JSON.stringify(r, null, 2));
