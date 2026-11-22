#!/usr/bin/env bash
# Live end-to-end proof of the v2 contract on Studio Next (resumed run).
# submit_a already finalized (sub-000001 exists). Remaining flow:
# evaluate A -> create task B -> submit B (weak) -> evaluate B -> revise B
# -> evaluate B again -> appeal A -> final reads.
# After each write, waits on CONTRACT STATE (wait_for.mjs), not tx status.
set -uo pipefail
cd "$(dirname "$0")"
CONTRACT="0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212"
LOG="/tmp/mv2_e2e2.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== E2E2 START $(date -u +%FT%TZ) ==="

# step <tag> <fn> <args> <waitFn> <waitArgs> <waitSubstr> [waitTimeoutSec]
step() {
  local tag="$1" fn="$2" args="$3" wfn="$4" wargs="$5" wsub="$6" wto="${7:-900}"
  echo "--- step: $tag ($fn) ---"
  if ./call.sh "$CONTRACT" "$fn" "$args" "$tag"; then
    echo "BROADCAST-OK $tag"
  else
    echo "BROADCAST-FAILED $tag (continuing)"
    return 0
  fi
  echo "waiting: $wfn $wargs contains [$wsub] (timeout ${wto}s)"
  if node wait_for.mjs "$CONTRACT" "$wfn" "$wargs" "$wsub" "$wto"; then
    echo "OK $tag"
  else
    echo "WAIT-FAILED $tag (continuing)"
  fi
}

step evaluate_a evaluate_submission '["sub-000001"]' get_submission '["sub-000001"]' 'EVALUATED' 1200
echo "--- sub-000001 after evaluate ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000001"]' || true

step create_task_b create_task '["Write a deployment runbook", "Write a step-by-step deployment runbook for the pricing page: prerequisites, build commands, rollback procedure, and monitoring checks.", ""]' get_last_task_id '[]' 'task-000002' 900

step submit_b submit_work '["task-000002", "runbook ok"]' get_last_submission_id '[]' 'sub-000002' 900

step evaluate_b evaluate_submission '["sub-000002"]' get_submission '["sub-000002"]' 'EVALUATED' 1200
echo "--- sub-000002 after evaluate ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000002"]' || true

step revise_b revise_submission '["sub-000002", "Deployment runbook for the pricing page. Prerequisites: Node 20+, access to the production host, database backup. Build: npm ci && npm run build. Deploy: rsync dist/ to /srv/pricing, reload nginx. Rollback: restore previous dist from /srv/pricing-backup and reload nginx. Monitoring: check /health endpoint, error rate dashboard, and uptime alert for 30 minutes after deploy."]' get_submission '["sub-000002"]' 'PENDING' 900
echo "--- sub-000002 revisions ---"
node read_view.mjs "$CONTRACT" get_submission_revisions '["sub-000002"]' || true

step evaluate_b2 evaluate_submission '["sub-000002"]' get_submission '["sub-000002"]' 'EVALUATED' 1200
echo "--- sub-000002 after re-evaluate ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000002"]' || true

step reevaluate_a request_reevaluation '["sub-000001"]' get_submission '["sub-000001"]' 'reevaluation_count":1' 1200
echo "--- sub-000001 after appeal ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000001"]' || true

echo "--- freelancer stats ---"
node read_view.mjs "$CONTRACT" get_freelancer_stats '["0x279061b840038E10fA2073Ebe7cE59B07DF646AA"]' || true
echo "--- contract info ---"
node read_view.mjs "$CONTRACT" get_contract_info '[]' || true
echo "=== E2E2 DONE $(date -u +%FT%TZ) ==="
