#!/usr/bin/env bash
# Live end-to-end proof of the v2 contract on Studio Next.
# Flow: submit A (good) -> evaluate A -> create task B -> submit B (weak)
# -> evaluate B -> revise B -> evaluate B again -> appeal A -> final reads.
# Each step logs its tx hash + final result. Non-fatal: a step that fails
# (e.g. revise on an unexpectedly passing submission) is recorded and the
# flow continues, because live LLM scores are not deterministic.
set -uo pipefail
cd "$(dirname "$0")"
CONTRACT="0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212"
LOG="/tmp/mv2_e2e.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== E2E START $(date -u +%FT%TZ) ==="

step() {
  local tag="$1" fn="$2" args="$3"
  echo "--- step: $tag ($fn) ---"
  if ./call.sh "$CONTRACT" "$fn" "$args" "$tag" 900; then
    echo "OK $tag"
  else
    echo "STEP-FAILED $tag (continuing)"
  fi
}

step submit_a submit_work '["task-000001", "A complete responsive pricing page: three tiers (Starter $9, Pro $19, Enterprise $49), monthly/yearly toggle with 20% yearly discount, semantic HTML, CSS grid layout, WCAG AA color contrast verified, mobile-first breakpoints at 640px and 1024px, and keyboard-accessible toggle."]'
step evaluate_a evaluate_submission '["sub-000001"]'
echo "--- sub-000001 after evaluate ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000001"]' || true

step create_task_b create_task '["Write a deployment runbook", "Write a step-by-step deployment runbook for the pricing page: prerequisites, build commands, rollback procedure, and monitoring checks.", ""]'
step submit_b submit_work '["task-000002", "runbook ok"]'
step evaluate_b evaluate_submission '["sub-000002"]'
echo "--- sub-000002 after evaluate ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000002"]' || true

step revise_b revise_submission '["sub-000002", "Deployment runbook for the pricing page. Prerequisites: Node 20+, access to the production host, database backup. Build: npm ci && npm run build. Deploy: rsync dist/ to /srv/pricing, reload nginx. Rollback: restore previous dist from /srv/pricing-backup and reload nginx. Monitoring: check /health endpoint, error rate dashboard, and uptime alert for 30 minutes after deploy."]'
echo "--- sub-000002 revisions ---"
node read_view.mjs "$CONTRACT" get_submission_revisions '["sub-000002"]' || true
step evaluate_b2 evaluate_submission '["sub-000002"]'
echo "--- sub-000002 after re-evaluate ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000002"]' || true

step reevaluate_a request_reevaluation '["sub-000001"]'
echo "--- sub-000001 after appeal ---"
node read_view.mjs "$CONTRACT" get_submission '["sub-000001"]' || true

echo "--- freelancer stats ---"
node read_view.mjs "$CONTRACT" get_freelancer_stats '["0x279061b840038E10fA2073Ebe7cE59B07DF646AA"]' || true
echo "--- contract info ---"
node read_view.mjs "$CONTRACT" get_contract_info '[]' || true
echo "=== E2E DONE $(date -u +%FT%TZ) ==="
