#!/usr/bin/env bash
# One TaskEvaluator v2 method call: build -> sign -> broadcast.
# Broadcast only — finality is checked separately by waiting on contract
# state (wait_for.mjs), because polling getTransaction status proved
# unreliable in a loop. Usage: ./call.sh <CONTRACT> <FUNCTION> '<jsonArgs>' [tag]
# Prints the tx hash; saves result JSON to /tmp/mv2_<tag>.json.
set -euo pipefail
cd "$(dirname "$0")"
CONTRACT="$1"; FN="$2"; ARGS="$3"; TAG="${4:-call}"
VENV="$HOME/workspace/genlayer/demo-lab/.venv/bin/python"
SENDER=$($VENV -c "import json; print(json.load(open('../.keys/keypair.json'))['address'])")
SENDER="$SENDER" node build_call.mjs "$CONTRACT" "$FN" "$ARGS" > "/tmp/mv2_build_$TAG.log" 2>&1
awk '/---TX---/{flag=1;next}flag' "/tmp/mv2_build_$TAG.log" > "/tmp/mv2_tx_$TAG.json"
$VENV sign_broadcast.py "/tmp/mv2_tx_$TAG.json" "/tmp/mv2_$TAG.json"
HASH=$($VENV -c "import json; print(json.load(open('/tmp/mv2_$TAG.json'))['txHash'])")
echo "HASH $TAG: $HASH"
