"""Sign + broadcast a GenLayer tx with the milestone-v2 fresh keypair.

Reads a ---TX--- JSON file ({"to","data","value"}), signs with the key in
../.keys/keypair.json (a fresh keypair generated for this milestone, never
the user's wallet), and broadcasts a LEGACY tx (no "type" field, gasPrice 0)
to Studio Next (chain 61997). The GenLayer node rejects 2-param
eth_estimateGas, so estimation uses the 1-param form and the limit is
estimate x 1.2.

Usage: ../../demo-lab/.venv/bin/python sign_broadcast.py <txfile> [outfile]
"""
import json
import sys
from pathlib import Path

from eth_account import Account
from web3 import Web3

TXFILE = sys.argv[1]
OUTFILE = sys.argv[2] if len(sys.argv) > 2 else "/tmp/milestone_v2_broadcast_result.json"
RPC = "https://studio-next.genlayer.com/api"
CHAIN_ID = 61997

keys = json.loads((Path(__file__).resolve().parent.parent / ".keys" / "keypair.json").read_text())
acct = Account.from_key(keys["key"])
sender = acct.address
print("sender:", sender)

txj = json.load(open(TXFILE))
w3 = Web3(Web3.HTTPProvider(RPC))
nonce = w3.eth.get_transaction_count(sender, "latest")
print("nonce:", nonce)
txobj = {"to": txj["to"], "from": sender, "data": txj["data"], "value": int(txj["value"])}
est = w3.manager.request_blocking("eth_estimateGas", [txobj])
est = int(est, 16) if isinstance(est, str) else int(est)
print("gas estimate:", est)
gas = int(est * 1.2)
print("gas limit (x1.2):", gas)
tx = {
    "to": txj["to"],
    "data": txj["data"],
    "value": int(txj["value"]),
    "gas": gas,
    "gasPrice": 0,
    "nonce": nonce,
    "chainId": CHAIN_ID,
}
signed = acct.sign_transaction(tx)
txhash = w3.eth.send_raw_transaction(signed.raw_transaction)
print("TX HASH:", txhash.hex())
json.dump({"txHash": txhash.hex(), "nonce": nonce, "gas": gas}, open(OUTFILE, "w"), indent=2)
print("wrote", OUTFILE)
