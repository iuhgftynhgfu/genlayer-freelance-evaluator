// Build the addTransaction calldata that deploys task_evaluator.py (v2) to Studio Next.
// Usage: SENDER=0x... node build_deploy.mjs
// Prints a ---TX--- JSON block ({to, data, value}) for sign_broadcast.py.
import { createClient, abi } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http, encodeFunctionData, zeroAddress } from 'viem';
import fs from 'fs';

const SENDER = process.env.SENDER;
if (!SENDER) { console.error('SENDER env var required'); process.exit(1); }
const CONSENSUS = studioDevnet.consensusMainContract.address;
const CODE = fs.readFileSync(new URL('../contracts/task_evaluator.py', import.meta.url), 'utf8');

const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });

async function main() {
  const fees = await client.estimateTransactionFees({});
  console.log('feeValue (GEN):', (Number(fees.feeValue) / 1e18).toFixed(6));
  // Deploy: __init__ takes no args
  const calldataObj = abi.calldata.makeCalldataObject(undefined, [], undefined);
  const constructorCalldata = abi.calldata.encode(calldataObj);
  const serializedData = abi.transactions.serialize([CODE, constructorCalldata, false]);
  console.log('serialized deploy data len:', serializedData.length);
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const params = {
    sender: SENDER,
    recipient: zeroAddress,
    numOfInitialValidators: BigInt(studioDevnet.defaultNumberOfInitialValidators),
    maxRotations: BigInt(studioDevnet.defaultConsensusMaxRotations),
    validUntil,
    saltNonce: 0n,
    userValue: 0n,
    feesDistribution: fees.distribution,
    txCalldata: serializedData,
    messageAllocations: fees.messageAllocations ?? [],
  };
  const data = encodeFunctionData({
    abi: studioDevnet.consensusMainContract.abi,
    functionName: 'addTransaction',
    args: [params],
  });
  console.log('---TX---');
  console.log(JSON.stringify({ to: CONSENSUS, data, value: fees.feeValue.toString(), validUntil: validUntil.toString() }));
}
main().catch(e => { console.error('BUILD FAIL:', e.message); process.exit(1); });
