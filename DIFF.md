# Milestone diff — genlayer-freelance-evaluator v1 → v2.0.0

Base: `https://github.com/iuhgftynhgfu/genlayer-freelance-evaluator`
(v1, accepted Projects submission, 260 PTS, 22 Oct 2026, id 89dd787b).
This package is the v2 upgrade prepared for a Milestone submission.

## Summary

| | v1 | v2.0.0 |
|---|---|---|
| Contract version | 1.0.0 | **2.0.0** |
| Write methods | 4 | **6** (+`revise_submission`, +`request_reevaluation`) |
| View methods | 9 | **11** (+`get_submission_revisions`, +`get_freelancer_stats`) |
| Storage maps | 4 | **5** (+`revisions`) |
| Storage counters | 2 | **4** (+`revision_count`, +`reevaluation_count`) |
| Rubric | fixed 40/30/20/10 | **per-task configurable** (JSON weights, sum 100) |
| Validator binds | score only | **score AND criteria-met count (±1)** |
| Submissions | final, no revisions | **revisable** (max 5, history on chain) |
| Appeals | protocol tx appeals only | **one on-chain re-evaluation** per submission |
| Deployed | never deployed | **live on Studio Next (chain 61997)** |
| Tests | 15 direct-mode | **26 stub-based** (all v2 features + v1 regressions) |

## Files changed (vs the v1 repo)

### `contracts/task_evaluator.py` — rewritten, v1 → v2.0.0

The whole file is replaced. What changed, by section:

**Constants (new)**
- `CRITERIA_MET_TOLERANCE = 1` — validator agreement window for the
  criteria-met count.
- `DEFAULT_RUBRIC` / `RUBRIC_KEYS` — the v1 40/30/20/10 weights as the
  default rubric.
- `MAX_REVISION_CONTENT_CHARS = 4000`, `MAX_REVISIONS = 5`,
  `MAX_REEVALUATIONS = 1` — bounds for the new features.
- `CONTRACT_VERSION = "2.0.0"`.

**Storage models**
- `Task` gains `rubric_json: str` ("" = default rubric, else the task's
  validated weights as JSON).
- `Submission` gains `revision_count: u256`, `reevaluation_count: u256`,
  `previous_score: u256`.
- New storage map `revisions: TreeMap[str, DynArray[str]]` — per-submission
  revision history, each entry a JSON snapshot of the superseded version
  (content, source type, status, score, pass/fail, timestamp).
- New counters `revision_count: u256`, `reevaluation_count: u256`.

**Pure helpers (new/changed)**
- `_parse_rubric_weights(rubric_weights)` — NEW. Validates the optional
  rubric JSON: exactly the four keys, integer weights 0–100, sum exactly
  100; "" returns the default rubric. Raises `UserError` otherwise.
- `_met_count(criteria)` — NEW. Counts criteria entries marked met; used
  by the hardened validator.
- `_build_evaluation_prompt(...)` — CHANGED. Takes the task's `rubric`
  dict and renders the rubric section with the task's own weights instead
  of the fixed 40/30/20/10 split.
- `_coerce_score`, `_coerce_bool`, `_normalize_criteria`,
  `_normalize_evaluation`, `_make_id`, `_truncate`,
  `_detect_source_type` — UNCHANGED.

**Contract methods**
- `_get_submission(submission_id)` — NEW internal helper (v1 inlined the
  lookup in each method).
- `_evaluate_with_consensus(title, requirements, content, source_type,
  rubric)` — NEW. The nondet leader/validator block, factored out of
  `evaluate_submission` so `evaluate_submission` and
  `request_reevaluation` run the IDENTICAL hardened validator.
  Validator changes vs v1 (PEV V5 pattern — bind a second decision field):
  after the existing pass/fail-boundary, hard-zero and score-tolerance
  checks, the validator ALSO requires the leader's and its own
  criteria-met counts to agree within `CRITERIA_MET_TOLERANCE` (1). A
  leader can no longer claim a passing score while its own rubric says
  most requirements failed.
- `_apply_evaluation(submission, result, sender_hex)` — NEW. Persists a
  consensus-approved result onto a submission (shared by both
  evaluation entry points).
- `create_task(title, requirements, rubric_weights="")` — CHANGED.
  New optional third parameter; validates and stores the rubric.
  Backwards compatible: calls without it behave exactly as v1.
- `submit_work(task_id, content)` — CHANGED only to initialise the three
  new submission fields (all zero). One-submission-per-freelancer and
  closed-task rules UNCHANGED.
- `revise_submission(submission_id, content)` — NEW write method.
  Freelancer-only, task must be open, submission must be PENDING or
  EVALUATED-and-failed, max 5 revisions. Archives the superseded version
  into `revisions`, clears the verdict, returns the submission to PENDING.
  Closes the v1 roadmap item "Submissions are final once created;
  revisions are not supported yet".
- `request_reevaluation(submission_id)` — NEW write method. One appeal
  per submission (client or freelancer only, evaluated submissions only).
  Re-runs the full consensus evaluation, preserves the old score in
  `previous_score`.
- `set_task_open` — UNCHANGED.
- `get_contract_info()` — CHANGED. Reports `version: "2.0.0"` plus
  `criteria_met_tolerance`, `max_revisions`, `max_reevaluations`,
  `revision_count`, `reevaluation_count`.
- `_task_to_dict` — CHANGED. Now includes `rubric_weights` (resolved
  dict, defaults when unset).
- `_submission_to_dict` — CHANGED. Now includes `revision_count`,
  `reevaluation_count`, `previous_score`.
- `get_submission_revisions(submission_id)` — NEW view. Revision history,
  oldest first.
- `get_freelancer_stats(freelancer)` — NEW view. Reputation scorecard:
  total / evaluated / passed submissions, pass rate %, average score,
  best score, total revisions.
- `get_task`, `get_tasks`, `get_recent_tasks`, `get_submission`,
  `get_task_submissions`, `get_freelancer_submissions`,
  `get_last_task_id`, `get_last_submission_id` — UNCHANGED behaviour
  (returned dicts gain the new fields listed above).

### `tests/` — new stub-based suite (v2 additions)

- `tests/genlayer_stub.py` — NEW. Stdlib-only stub of the `genlayer`
  package (modelled on the PEV-Project stub): scripted `exec_prompt`
  responses, scripted `web.render`, mutable sender, `run_nondet` with
  re-runnable validator. Lets the whole contract run in plain Python.
- `tests/test_task_evaluator_v2.py` — NEW. 26 tests, **26 passed**
  (`pytest tests/test_task_evaluator_v2.py -q`, 0.09s):
  - 5 v1 regressions (create/submit/evaluate flow, one-submission rule,
    low-score fail, validator threshold reject/accept).
  - 5 configurable-rubric tests (default weights, custom weights stored
    AND present in the LLM prompt, sum-100 / four-keys / valid-JSON
    validation).
  - 6 revision tests (revise pending, revise failed then re-evaluate to
    pass, revise passing rejected, non-freelancer rejected, closed task
    rejected, 5-revision cap).
  - 4 re-evaluation tests (previous score preserved, one-appeal cap,
    unevaluated rejected, stranger rejected).
  - 2 hardened-validator tests (met-count mismatch 3-vs-0 rejected even
    with agreeing scores; 3-vs-2 accepted).
  - 3 stats/info tests (freelancer scorecard aggregation, empty
    freelancer, `get_contract_info` v2.0.0).
  - 1 URL-fetch test (v1 behaviour preserved).

  The v1 `tests/direct/` suite (15 tests, `genlayer-test` direct mode)
  is NOT removed; the v2 stub suite is additive. Note: two v1 direct
  tests assert the old "already been evaluated" behaviour, which is
  unchanged in v2.

### `scripts/` — NEW (deploy + live-call tooling)

- `scripts/build_deploy.mjs`, `scripts/build_call.mjs`,
  `scripts/sign_broadcast.py`, `scripts/call.sh`,
  `scripts/tx_status.mjs`, `scripts/get_tx.mjs`,
  `scripts/get_addr.mjs`, `scripts/read_view.mjs`,
  `scripts/wait_for.mjs` — deploy and call the contract on Studio Next
  (chain 61997) through the consensus contract via `addTransaction`
  (legacy tx, gasPrice 0, 1-param `eth_estimateGas`). Same proven
  pattern as the Demo Lab deployment.

### `README.md` — update notes (to apply on upload)

- Version 1.0.0 → 2.0.0; "Deployed contract address" table filled with
  the Studio Next v2 address (see ONCHAIN_PROOF below); new API rows for
  `revise_submission`, `request_reevaluation`,
  `get_submission_revisions`, `get_freelancer_stats`; rubric section
  documents per-task weights; roadmap items for revisions and
  configurable rubric marked DONE; test count 15 → 26 (+15 direct-mode
  v1 tests retained).

## Before / after (behaviour)

| Scenario | v1 | v2.0.0 |
|---|---|---|
| Freelancer fails 32/100 | Stuck forever; new account or nothing | `revise_submission` → fix → re-evaluate |
| Client disagrees with a verdict | Protocol tx appeal only | `request_reevaluation` (1x, both scores on chain) |
| Task needs coverage-heavy grading | Fixed 40/30/20/10 for everyone | `create_task(..., '{"coverage": 50, ...}')` |
| Leader claims 82 with 0/3 criteria met | Validators accept (score-only check) | Validators REJECT (met-count bound) |
| Hiring: is this freelancer reliable? | Read every submission manually | `get_freelancer_stats` scorecard |
| What did the submission look like before? | Lost (content overwritten nowhere — it couldn't change) | `get_submission_revisions` history |

## On-chain proof (Studio Next, chain 61997)

See `ONCHAIN_PROOF.md` in this package for the full transcript with tx
hashes and explorer links.
