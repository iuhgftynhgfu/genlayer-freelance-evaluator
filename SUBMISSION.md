# Milestone submission — GenLayer Freelance Evaluator v2.0.0

Ready-to-paste text for the GenLayer Builder portal (Milestones).
Approved project this builds on: **genlayer-freelance-evaluator**
(Projects, 260 PTS, accepted 22 Oct 2026, id 89dd787b).

---

## Title

GenLayer Freelance Evaluator v2 — revisions, appeals, configurable rubrics, hardened validator + first live deployment

## Description

v2.0.0 is a major upgrade of the accepted Freelance Evaluator project
(260 PTS, Oct 2026), closing both open items from the v1 roadmap and
shipping the project's FIRST live deployment — v1 was never deployed.

**What is new in v2 (all in `contracts/task_evaluator.py`, diffable
against v1 — see DIFF.md):**

1. **Revisions** — `revise_submission`: a freelancer can fix a failed (or
   still pending) submission instead of losing the task forever. The
   superseded content and score are preserved in an on-chain revision
   history (`get_submission_revisions`), so the audit trail stays
   complete. Max 5 revisions per submission.
2. **Appeals** — `request_reevaluation`: each submission gets ONE
   re-evaluation through full consensus (client or freelancer may
   trigger it); the previous score is stored next to the new one
   (`previous_score`). Appeals are no longer left to protocol-level
   transaction appeals alone.
3. **Configurable rubric** — `create_task` accepts optional per-task
   rubric weights (coverage / correctness / completeness / clarity,
   summing to 100, validated on chain). The evaluation prompt grades
   with the task's own weights instead of the fixed 40/30/20/10 split.
4. **Hardened validator (PEV V5 pattern)** — the validator still
   independently re-runs the whole LLM evaluation, but consensus now
   binds TWO decision fields instead of one: the score (pass/fail
   boundary + ±10 tolerance + hard-zero rule, as in v1) AND the
   criteria-met count (leader and validator must agree within ±1). A
   leader can no longer claim a passing score while its own rubric says
   most requirements failed.
5. **Freelancer reputation scorecard** — `get_freelancer_stats`:
   totals, pass rate, average/best score, revision count per freelancer.

**Metrics**

- Contract: 6 write methods (was 4), 11 view methods (was 9), version
  2.0.0, deployed and verified live on Studio Next.
- Tests: 26 stub-based tests, **26 passed** — every v2 feature plus v1
  regression coverage (threshold reject/accept, one-submission rule,
  URL fetch).
- Live on-chain demo (Studio Next, chain 61997): full flow executed
  end-to-end — task with a custom 50/25/15/10 rubric, submission,
  consensus evaluation (100/100 pass), a failed submission (1/100)
  revised and re-evaluated to a 70/100 pass, and an appeal
  re-evaluation (100 → 94, previous score kept). See ONCHAIN_PROOF.md
  for every tx hash (10 txs, all FINISHED_WITH_RETURN).

**Why this matters:** v1 graded once and the verdict was final — a
freelancer who failed by a few points had no path back, and a client
who distrusted a verdict had no in-contract appeal. v2 turns the
evaluator into a complete freelance workflow (submit → grade → revise
→ re-grade → appeal) while making the consensus itself stricter, and it
proves all of it on a live testnet deployment.

## Evidence links

- GitHub repo (v2 code): https://github.com/iuhgftynhgfu/genlayer-freelance-evaluator
  (v2 files: `contracts/task_evaluator.py`, `tests/test_task_evaluator_v2.py`,
  `tests/genlayer_stub.py`, `DIFF.md`, `SUBMISSION.md`, `ONCHAIN_PROOF.md`,
  `scripts/`)
- Deployed contract (Studio Next, chain 61997):
  https://explorer-studio-dev.genlayer.com/address/0x40c416d29c7Bb1E5Ec3c79d520F17277aD70E212
- Deploy tx:
  https://explorer-studio-dev.genlayer.com/tx/0x3be46c874a072a65cefb70c45b212b7bd35d7bd6f6b03d8c4f9d96668729df15
- Live demo txs: see ONCHAIN_PROOF.md in the repo (create_task with
  custom rubric, submit_work, evaluate_submission, revise_submission,
  request_reevaluation — all FINISHED_WITH_RETURN).
- Approved v1 project: genlayer-freelance-evaluator (Projects, 260 PTS,
  22 Oct 2026, id 89dd787b) — link in Project Explorer.

## How to verify (reproduce in under 5 minutes)

```bash
git clone https://github.com/iuhgftynhgfu/genlayer-freelance-evaluator.git
cd genlayer-freelance-evaluator
pip install pytest
python3 -m pytest tests/test_task_evaluator_v2.py -q   # 26 passed
```

Then read the live contract on Studio Next (RPC
`https://studio-next.genlayer.com/api`, address above):
`get_contract_info` returns `version: "2.0.0"`;
`get_freelancer_stats` and `get_submission_revisions` show the live
demo data.
