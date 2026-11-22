// Build an addTransaction for calling a method on the deployed TaskEvaluator.
// Usage: SENDER=0x... node build_call.mjs <contractAddress> <functionName> <jsonArgsArray>
// Prints a ---TX--- JSON block ({to, data, value}) for sign_broadcast.py.
import { createClient, abi } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { http, encodeFunctionData } from 'viem';

const SENDER = process.env.SENDER;
if (!SENDER) { console.error('SENDER env var required'); process.exit(1); }
const CONSENSUS = studioDevnet.consensusMainContract.address;
const [, , address, functionName, argsJson] = process.argv;
if (!address || !functionName || argsJson === undefined) {
  console.error('usage: SENDER=0x... node build_call.mjs <contract> <function> <jsonArgs>');
  process.exit(1);
}
const callArgs = JSON.parse(argsJson);
const client = createClient({ chain: studioDevnet, transport: http(studioDevnet.rpcUrls.default.http[0]) });

async function main() {
  const fees = await client.estimateTransactionFees({});
  const calldataObj = abi.calldata.makeCalldataObject(functionName, callArgs, undefined);
  const methodCalldata = abi.calldata.encode(calldataObj);
  const serializedData = abi.transactions.serialize([methodCalldata, false]);
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const params = {
    sender: SENDER,
    recipient: address,
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
  console.log(JSON.stringify({ to: CONSENSUS, data, value: fees.feeValue.toString(), validUntil: validUntil.toString(), fn: functionName, args: callArgs }));
}
main().catch(e => { console.error('BUILD FAIL:', e.message); process.exit(1); });
