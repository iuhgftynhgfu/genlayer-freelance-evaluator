import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http } from 'viem';
const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });
const tx = await client.getTransaction({ hash: process.argv[2] });
for (const k of ['hash','status','txExecutionResult','txExecutionResultName','type']) console.log(k, ':', tx[k]);
console.log('leaderError:', JSON.stringify(tx.consensus_data?.leader_receipt?.error ?? tx.leader_error ?? null));
console.log('result:', JSON.stringify(tx.result ?? tx.consensus_data?.result ?? null)?.slice(0, 300));
