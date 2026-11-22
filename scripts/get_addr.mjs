import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http } from 'viem';
const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });
const tx = await client.getTransaction({ hash: process.argv[2] });
console.log('to_address:', tx.to_address);
console.log('from_address:', tx.from_address);
console.log('status:', tx.status);
console.log('txExecutionResultName:', tx.txExecutionResultName);
