"""Stub-based tests for the freelance-evaluator v2 contract.

Runs the real contract code in-process with a mocked LLM (genlayer_stub),
so the suite needs no Studio instance and finishes in under a second.
Covers every v2 feature plus the v1 behaviours that must not regress.

Run:  python3 -m pytest tests/test_task_evaluator_v2.py -v
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import genlayer_stub

genlayer_stub.install()

from contracts.task_evaluator import TaskEvaluator  # noqa: E402

ALICE = "0x1111111111111111111111111111111111111111"
BOB = "0x2222222222222222222222222222222222222222"

PASSING_EVALUATION = {
    "score": 86,
    "summary": "The submission covers every requirement with clear technical detail.",
    "criteria": [
        {"requirement": "Responsive layout", "met": True, "note": "Uses CSS grid."},
        {"requirement": "Unit tests", "met": True, "note": "Test suite included."},
        {"requirement": "Documentation", "met": False, "note": "README is missing."},
    ],
}

FAILING_EVALUATION = {
    "score": 32,
    "summary": "The submission does not address the core requirements.",
    "criteria": [
        {"requirement": "Responsive layout", "met": False, "note": "Not implemented."},
        {"requirement": "Unit tests", "met": False, "note": "No tests provided."},
    ],
}


@pytest.fixture
def contract():
    genlayer_stub.reset()
    genlayer_stub.set_sender(ALICE)
    return TaskEvaluator()


def make_task(contract, rubric=""):
    return contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
        rubric,
    )


def make_submission(contract, task_id, content="A complete, responsive landing page."):
    return contract.submit_work(task_id, content)


def evaluate(contract, submission_id, evaluation):
    """Queue leader + validator LLM answers and evaluate."""
    genlayer_stub.queue_responses([dict(evaluation), dict(evaluation)])
    return contract.evaluate_submission(submission_id)


# ---------------------------------------------------------------------------
# v1 regression: the accepted behaviour must still work
# ---------------------------------------------------------------------------


def test_v1_create_submit_evaluate_flow(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    result = evaluate(contract, submission_id, PASSING_EVALUATION)
    assert result["status"] == "EVALUATED"
    assert result["score"] == 86
    assert result["passed"] is True
    assert len(result["criteria"]) == 3
    assert result["revision_count"] == 0
    assert result["reevaluation_count"] == 0


def test_v1_freelancer_cannot_submit_twice(contract):
    task_id = make_task(contract)
    make_submission(contract, task_id)
    with pytest.raises(Exception, match="already submitted work"):
        make_submission(contract, task_id, "A second deliverable.")


def test_v1_low_score_fails(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    result = evaluate(contract, submission_id, FAILING_EVALUATION)
    assert result["score"] == 32
    assert result["passed"] is False


def test_v1_validator_rejects_scores_crossing_threshold(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, PASSING_EVALUATION)
    # Validator now sees a failing score: it must disagree.
    genlayer_stub.queue_responses([dict(FAILING_EVALUATION)])
    assert genlayer_stub.run_validator() is False


def test_v1_validator_accepts_scores_within_tolerance(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, PASSING_EVALUATION)
    near = dict(PASSING_EVALUATION)
    near["score"] = 78
    genlayer_stub.queue_responses([near])
    assert genlayer_stub.run_validator() is True


# ---------------------------------------------------------------------------
# v2: configurable rubric
# ---------------------------------------------------------------------------


def test_default_rubric_is_v1_weights(contract):
    task_id = make_task(contract)
    task = contract.get_task(task_id)
    assert task["rubric_weights"] == {
        "coverage": 40,
        "correctness": 30,
        "completeness": 20,
        "clarity": 10,
    }


def test_custom_rubric_is_stored_and_used_in_prompt(contract):
    rubric = json.dumps(
        {"coverage": 50, "correctness": 25, "completeness": 15, "clarity": 10}
    )
    task_id = make_task(contract, rubric)
    task = contract.get_task(task_id)
    assert task["rubric_weights"]["coverage"] == 50

    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, PASSING_EVALUATION)
    prompt = genlayer_stub.PROMPTS[0]
    assert "Requirement coverage (0-50)" in prompt
    assert "Correctness and technical quality (0-25)" in prompt
    assert "Completeness and depth (0-15)" in prompt


def test_rubric_weights_must_sum_to_100(contract):
    bad = json.dumps(
        {"coverage": 50, "correctness": 50, "completeness": 50, "clarity": 10}
    )
    with pytest.raises(Exception, match="must sum to 100"):
        make_task(contract, bad)


def test_rubric_weights_need_all_four_keys(contract):
    bad = json.dumps({"coverage": 60, "correctness": 40})
    with pytest.raises(Exception, match="exactly coverage"):
        make_task(contract, bad)


def test_rubric_weights_must_be_valid_json(contract):
    with pytest.raises(Exception, match="valid JSON"):
        make_task(contract, "{not json")


# ---------------------------------------------------------------------------
# v2: revisions
# ---------------------------------------------------------------------------


def test_revise_pending_submission(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id, "First draft of the page.")
    result = contract.revise_submission(
        submission_id, "Revised draft with all sections completed."
    )
    assert result["status"] == "PENDING"
    assert result["content"] == "Revised draft with all sections completed."
    assert result["revision_count"] == 1
    assert contract.get_contract_info()["revision_count"] == 1

    history = contract.get_submission_revisions(submission_id)
    assert len(history) == 1
    assert history[0]["content"] == "First draft of the page."
    assert history[0]["status"] == "PENDING"


def test_revise_failed_submission_then_reevaluate(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id, "A very thin deliverable.")
    evaluate(contract, submission_id, FAILING_EVALUATION)

    revised = contract.revise_submission(
        submission_id, "A complete, responsive landing page with tests and docs."
    )
    assert revised["status"] == "PENDING"
    assert revised["score"] == 0
    assert revised["passed"] is False
    assert revised["revision_count"] == 1

    history = contract.get_submission_revisions(submission_id)
    assert len(history) == 1
    assert history[0]["score"] == 32
    assert history[0]["passed"] is False

    result = evaluate(contract, submission_id, PASSING_EVALUATION)
    assert result["score"] == 86
    assert result["passed"] is True
    assert result["revision_count"] == 1


def test_revise_passing_submission_rejected(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, PASSING_EVALUATION)
    with pytest.raises(Exception, match="passing submission cannot be revised"):
        contract.revise_submission(submission_id, "Trying to change a pass.")


def test_only_freelancer_can_revise(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    genlayer_stub.set_sender(BOB)
    with pytest.raises(Exception, match="Only the submission's freelancer"):
        contract.revise_submission(submission_id, "Someone else's edit.")


def test_revise_closed_task_rejected(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    contract.set_task_open(task_id, False)
    with pytest.raises(Exception, match="closed"):
        contract.revise_submission(submission_id, "Too late to revise.")


def test_revision_cap_enforced(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id, "Draft version zero.")
    for i in range(5):
        contract.revise_submission(submission_id, "Draft version %d." % (i + 1))
    with pytest.raises(Exception, match="Maximum number of revisions"):
        contract.revise_submission(submission_id, "One revision too many.")


# ---------------------------------------------------------------------------
# v2: appeals / re-evaluation
# ---------------------------------------------------------------------------


def test_reevaluation_keeps_previous_score(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, FAILING_EVALUATION)

    genlayer_stub.queue_responses([dict(PASSING_EVALUATION), dict(PASSING_EVALUATION)])
    result = contract.request_reevaluation(submission_id)
    assert result["score"] == 86
    assert result["passed"] is True
    assert result["previous_score"] == 32
    assert result["reevaluation_count"] == 1
    assert contract.get_contract_info()["reevaluation_count"] == 1


def test_reevaluation_only_once(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, FAILING_EVALUATION)
    genlayer_stub.queue_responses([dict(PASSING_EVALUATION), dict(PASSING_EVALUATION)])
    contract.request_reevaluation(submission_id)
    with pytest.raises(Exception, match="Maximum number of re-evaluations"):
        contract.request_reevaluation(submission_id)


def test_reevaluation_requires_evaluation(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    with pytest.raises(Exception, match="Only an evaluated submission"):
        contract.request_reevaluation(submission_id)


def test_reevaluation_only_client_or_freelancer(contract):
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    evaluate(contract, submission_id, FAILING_EVALUATION)
    genlayer_stub.set_sender(BOB)
    with pytest.raises(Exception, match="Only the task client"):
        contract.request_reevaluation(submission_id)


# ---------------------------------------------------------------------------
# v2: hardened validator — criteria-met count is bound to the score
# ---------------------------------------------------------------------------


def test_validator_rejects_mismatched_criteria_met_count(contract):
    """Leader score 82 with 3/3 met vs validator score 78 with 0/3 met:
    scores agree and both pass, but the rubric disagrees — must reject."""
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    leader = {
        "score": 82,
        "summary": "Good work overall.",
        "criteria": [
            {"requirement": "A", "met": True, "note": ""},
            {"requirement": "B", "met": True, "note": ""},
            {"requirement": "C", "met": True, "note": ""},
        ],
    }
    evaluate(contract, submission_id, leader)

    validator_view = {
        "score": 78,
        "summary": "Solid work with minor gaps.",
        "criteria": [
            {"requirement": "A", "met": False, "note": ""},
            {"requirement": "B", "met": False, "note": ""},
            {"requirement": "C", "met": False, "note": ""},
        ],
    }
    genlayer_stub.queue_responses([validator_view])
    assert genlayer_stub.run_validator() is False


def test_validator_accepts_met_count_within_one(contract):
    """Same scores, met counts 3 vs 2: inside the +/-1 tolerance — accept."""
    task_id = make_task(contract)
    submission_id = make_submission(contract, task_id)
    leader = {
        "score": 82,
        "summary": "Good work overall.",
        "criteria": [
            {"requirement": "A", "met": True, "note": ""},
            {"requirement": "B", "met": True, "note": ""},
            {"requirement": "C", "met": True, "note": ""},
        ],
    }
    evaluate(contract, submission_id, leader)

    validator_view = {
        "score": 78,
        "summary": "Solid work with minor gaps.",
        "criteria": [
            {"requirement": "A", "met": True, "note": ""},
            {"requirement": "B", "met": True, "note": ""},
            {"requirement": "C", "met": False, "note": ""},
        ],
    }
    genlayer_stub.queue_responses([validator_view])
    assert genlayer_stub.run_validator() is True


# ---------------------------------------------------------------------------
# v2: freelancer stats + contract info
# ---------------------------------------------------------------------------


def test_freelancer_stats_aggregate(contract):
    task1 = make_task(contract)
    task2 = contract.create_task(
        "Write documentation",
        "Write clear user documentation for the landing page project.",
    )
    sub1 = make_submission(contract, task1)
    sub2 = make_submission(contract, task2)
    evaluate(contract, sub1, PASSING_EVALUATION)
    evaluate(contract, sub2, FAILING_EVALUATION)
    contract.revise_submission(sub2, "Rewritten documentation, much better now.")

    stats = contract.get_freelancer_stats(ALICE)
    assert stats["total_submissions"] == 2
    assert stats["evaluated_submissions"] == 1  # sub2 went back to PENDING
    assert stats["passed_submissions"] == 1
    assert stats["pass_rate_percent"] == 100
    assert stats["average_score"] == 86
    assert stats["best_score"] == 86
    assert stats["total_revisions"] == 1


def test_freelancer_stats_empty_for_unknown_address(contract):
    stats = contract.get_freelancer_stats(BOB)
    assert stats["total_submissions"] == 0
    assert stats["pass_rate_percent"] == 0
    assert stats["average_score"] == 0


def test_contract_info_reports_v2(contract):
    info = contract.get_contract_info()
    assert info["version"] == "2.0.0"
    assert info["pass_threshold"] == 70
    assert info["score_tolerance"] == 10
    assert info["criteria_met_tolerance"] == 1
    assert info["max_revisions"] == 5
    assert info["max_reevaluations"] == 1
    assert info["revision_count"] == 0
    assert info["reevaluation_count"] == 0


def test_url_submission_still_fetched_before_grading(contract):
    task_id = contract.create_task(
        "Publish a repository",
        "Publish the source code of the project in a public GitHub repository.",
    )
    submission_id = contract.submit_work(
        task_id, "https://github.com/example/project-with-the-deliverable"
    )
    genlayer_stub.mock_web(
        "github.com/example/project-with-the-deliverable",
        "# Project\nA complete repository with tests and documentation.",
    )
    result = evaluate(contract, submission_id, PASSING_EVALUATION)
    assert result["score"] == 86
    assert result["passed"] is True
