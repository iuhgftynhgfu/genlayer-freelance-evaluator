# On-chain proof — Freelance Evaluator v2.0.0 (Studio Next, chain 61997)

Live demo executed 2026-11-21 22:45–23:03 UTC. Every transaction below
reports `status 7, FINISHED_WITH_RETURN, leaderError: null`
(verified via `scripts/tx_status.mjs`).

- **Contract:** `0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212`
  — https://explorer-studio-dev.genlayer.com/address/0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212
- **py-genlayer version (Depends):** `1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
- **Deployer / demo actor:** fresh keypair
  `0x279061b840038E10fA2073Ebe7cE59B07DF646AA` (generated for this
  milestone, never the user's wallet), funded with 100 test GEN from the
  Studio faucet (`sim_fundAccount`).
  Funding tx:
  `0xeed46e11395903eb7d96da78d68bc5d9f6673d09664a15f12f50ae1abf5e148d`
- **RPC:** https://studio-next.genlayer.com/api
- No real wallet and no real money were used anywhere in this demo.

## Transactions

| # | Step | Tx hash |
|---|---|---|
| 1 | Deploy v2.0.0 | `0x3be46c874a072a65cefb70c45b212b7bd35d7bd6f6b03d8c4f9d96668729df15` |
| 2 | `create_task` task-000001 (custom rubric 50/25/15/10) | `0x5032ec41136269c4e66c5e8396da1fe0adf04f973f0ac58d742dfa4423425f57` |
| 3 | `submit_work` sub-000001 (pricing page) | `0x90e17d4e6693e3a273914c8ae03d513f9ee86cc081eb5e012bf10a8870d74999` |
| 4 | `evaluate_submission` sub-000001 → **100/100 PASS** (4/4 criteria) | `0x81811f134e3090d5aab7f5acd8ab1e34e6e5b4ffcf018612ade71d7120029d8e` |
| 5 | `create_task` task-000002 (runbook, default rubric) | `0x832ad6edaba0f2aac7fc583c76416b5240d9a727f47fbb094030d412925d98b4` |
| 6 | `submit_work` sub-000002 ("runbook ok") | `0x0ff9d8e8c647412d39ed0b8bf4f370eaf0ac312e73af6ecdbfed9d02da666686` |
| 7 | `evaluate_submission` sub-000002 → **1/100 FAIL** (0/5 criteria) | `0xa77f85bdb153b16121d11d5f9ecab4e597f4b179411f6996221461d471006dc3` |
| 8 | `revise_submission` sub-000002 (full runbook) → PENDING, revision 1 archived | `0xd8df81d081ce17381d3b607c75af6be2aed8aaa1f3207015f589209c1e6a494c` |
| 9 | `evaluate_submission` sub-000002 → **70/100 PASS** (6/8 criteria) | `0x9f78b49349975e1c9c9e978ed209485cbd624a422f4aaee816e846bd351c46cc` |
| 10 | `request_reevaluation` sub-000001 → **94/100**, previous_score 100 kept | `0x46a580b5ff43b8b22795ccbc3853da68f5ae27391a79e29362071c6a82b254ca` |

Explorer links: `https://explorer-studio-dev.genlayer.com/tx/<hash>`.

## What the demo proves (read back live from the contract)

- **Custom rubric:** `get_task("task-000001")` returns
  `rubric_weights: {coverage 50, correctness 25, completeness 15, clarity 10}`.
- **Full evaluation:** sub-000001 scored 100/100 with 4/4 criteria met
  through live LLM consensus (leader + independent validators).
- **Fail → revise → pass:** sub-000002 scored 1/100, was revised with a
  real runbook, and re-scored 70/100 — the exact workflow v1 could not
  do (submissions were final).
- **Revision history:** `get_submission_revisions("sub-000002")`
  returns the archived first version (`"runbook ok"`, score 1, failed).
- **Appeal:** sub-000001 was re-evaluated 100 → 94 with
  `previous_score: 100`, `reevaluation_count: 1`.
- **Scorecard:** `get_freelancer_stats` for the demo actor returns
  2 submissions, 2 evaluated, 2 passed, pass rate 100%, average 82,
  best 94, total revisions 1.
- **Contract info:** `get_contract_info` returns `version: "2.0.0"`,
  `task_count: 2`, `submission_count: 2`, `revision_count: 1`,
  `reevaluation_count: 1`, `criteria_met_tolerance: 1`.

## Reproduce

```bash
cd scripts
node read_view.mjs 0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212 get_contract_info '[]'
node read_view.mjs 0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212 get_submission '["sub-000002"]'
node read_view.mjs 0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212 get_submission_revisions '["sub-000002"]'
node read_view.mjs 0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212 get_freelancer_stats '["0x279061b840038E10fA2073Ebe7cE59B07DF646AA"]'
```

## Deploy gotchas (same as Demo Lab, confirmed again)

- Txs go to the consensus contract (`0xb7278A61…`) via `addTransaction`,
  NOT directly to the contract.
- GenLayer node rejects 2-param `eth_estimateGas` (use 1-param);
  gas price 0, legacy tx with no `type` field.
- The deployed address is the `to_address` of the deploy tx
  (`client.getTransaction`); it is NOT in the eth receipt.
- Polling `getTransaction` status in a bash loop proved unreliable
  (the loop never saw the final status even though direct checks did);
  the E2E driver waits on **contract state** instead (`wait_for.mjs`
  on view reads) — robust and fast.
