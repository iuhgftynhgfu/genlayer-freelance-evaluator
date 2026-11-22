import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http } from 'viem';
const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });
const tx = await client.getTransaction({ hash: process.argv[2] });
console.log(JSON.stringify(tx, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2).slice(0, 4000));
