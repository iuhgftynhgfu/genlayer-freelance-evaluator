"""Direct-mode tests for the TaskEvaluator intelligent contract.

Direct mode runs the contract in-process, so the tests are fast and do not
need a GenLayer Studio instance. The LLM is mocked, which keeps the suite
deterministic while still exercising the real contract code paths.
"""

import json

from tests.direct.conftest import (
    deploy_evaluator,
    failing_evaluation,
    mock_evaluation,
    passing_evaluation,
    to_hex,
)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


def test_create_task_stores_the_brief(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )

    assert task_id == "task-000001"

    task = contract.get_task(task_id)
    assert task["title"] == "Build a landing page"
    assert task["client"] == to_hex(direct_alice)
    assert task["is_open"] is True
    assert task["submission_count"] == 0


def test_create_task_rejects_empty_requirements(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Requirements is too short"):
        contract.create_task("Build a landing page", "   ")


def test_contract_info_reports_the_rubric(direct_vm, direct_deploy):
    contract = deploy_evaluator(direct_deploy)

    info = contract.get_contract_info()
    assert info["pass_threshold"] == 70
    assert info["score_tolerance"] == 10
    assert info["task_count"] == 0
    assert info["submission_count"] == 0


def test_recent_tasks_are_returned_newest_first(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    contract.create_task("First task", "Deliver the first deliverable as described.")
    contract.create_task("Second task", "Deliver the second deliverable as described.")

    recent = contract.get_recent_tasks(10)
    assert [task["task_id"] for task in recent] == ["task-000002", "task-000001"]


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


def test_submit_work_registers_a_submission(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Write a technical article",
        "Write a 1500 word article about zero-knowledge proofs with references.",
    )
    submission_id = contract.submit_work(
        task_id,
        "Here is my complete article about zero-knowledge proofs with references.",
    )

    assert submission_id == "sub-000001"

    submission = contract.get_submission(submission_id)
    assert submission["task_id"] == task_id
    assert submission["freelancer"] == to_hex(direct_alice)
    assert submission["status"] == "PENDING"
    assert submission["source_type"] == "text"
    assert submission["score"] == 0
    assert submission["passed"] is False

    assert contract.get_task(task_id)["submission_count"] == 1


def test_submit_work_detects_urls(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Publish a repository",
        "Publish the source code of the project in a public GitHub repository.",
    )
    submission_id = contract.submit_work(
        task_id,
        "https://github.com/example/project-with-the-deliverable",
    )

    submission = contract.get_submission(submission_id)
    assert submission["source_type"] == "url"


def test_freelancer_cannot_submit_twice(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    contract.submit_work(task_id, "A first, perfectly valid deliverable.")

    with direct_vm.expect_revert("already submitted work"):
        contract.submit_work(task_id, "A second deliverable that should be rejected.")


def test_closed_task_rejects_new_submissions(direct_vm, direct_deploy, direct_alice):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    contract.set_task_open(task_id, False)

    with direct_vm.expect_revert("closed"):
        contract.submit_work(task_id, "A deliverable that arrives too late.")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def test_evaluate_submission_stores_score_and_verdict(
    direct_vm, direct_deploy, direct_alice, passing_evaluation
):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    submission_id = contract.submit_work(
        task_id,
        "A complete, responsive landing page built with semantic HTML and CSS grid.",
    )

    mock_evaluation(direct_vm, passing_evaluation)
    result = contract.evaluate_submission(submission_id)

    assert result["status"] == "EVALUATED"
    assert result["score"] == 86
    assert result["passed"] is True
    assert result["summary"].startswith("The submission covers")
    assert len(result["criteria"]) == 3
    assert result["criteria"][0]["requirement"] == "Responsive layout"
    assert result["criteria"][0]["met"] is True
    assert result["criteria"][2]["met"] is False

    stored = contract.get_submission(submission_id)
    assert stored["score"] == 86
    assert stored["passed"] is True
    assert stored["evaluated_by"] == to_hex(direct_alice)


def test_low_score_fails_the_submission(
    direct_vm, direct_deploy, direct_alice, failing_evaluation
):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    submission_id = contract.submit_work(task_id, "A very thin deliverable.")

    mock_evaluation(direct_vm, failing_evaluation)
    result = contract.evaluate_submission(submission_id)

    assert result["score"] == 32
    assert result["passed"] is False
    assert result["status"] == "EVALUATED"


def test_submission_cannot_be_evaluated_twice(
    direct_vm, direct_deploy, direct_alice, passing_evaluation
):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    submission_id = contract.submit_work(task_id, "A complete and valid deliverable.")

    mock_evaluation(direct_vm, passing_evaluation)
    contract.evaluate_submission(submission_id)

    with direct_vm.expect_revert("already been evaluated"):
        contract.evaluate_submission(submission_id)


def test_only_client_or_freelancer_can_evaluate(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_evaluator(direct_deploy)

    direct_vm.sender = direct_alice
    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    submission_id = contract.submit_work(task_id, "A complete and valid deliverable.")

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the task client"):
        contract.evaluate_submission(submission_id)


def test_url_submission_is_fetched_before_grading(
    direct_vm, direct_deploy, direct_alice, passing_evaluation
):
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Publish a repository",
        "Publish the source code of the project in a public GitHub repository.",
    )
    submission_id = contract.submit_work(
        task_id, "https://github.com/example/project-with-the-deliverable"
    )

    direct_vm.mock_web(
        r".*github\.com/example/project-with-the-deliverable.*",
        {
            "status": 200,
            "body": "# Project\nA complete repository with tests and documentation.",
        },
    )
    mock_evaluation(direct_vm, passing_evaluation)

    result = contract.evaluate_submission(submission_id)
    assert result["score"] == 86
    assert result["passed"] is True


def test_validator_rejects_scores_that_cross_the_pass_threshold(
    direct_vm, direct_deploy, direct_alice
):
    """A validator that scores below the threshold must disagree."""
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    submission_id = contract.submit_work(task_id, "A complete and valid deliverable.")

    mock_evaluation(
        direct_vm,
        {"score": 82, "summary": "Good work overall.", "criteria": []},
        pattern=r".*",
    )
    contract.evaluate_submission(submission_id)

    # The validator now sees a much lower score: it must not agree.
    direct_vm.clear_mocks()
    mock_evaluation(
        direct_vm,
        {"score": 58, "summary": "Several requirements are missing.", "criteria": []},
        pattern=r".*",
    )
    assert direct_vm.run_validator() is False


def test_validator_accepts_scores_within_tolerance(
    direct_vm, direct_deploy, direct_alice
):
    """Small score differences stay inside the consensus tolerance."""
    contract = deploy_evaluator(direct_deploy)
    direct_vm.sender = direct_alice

    task_id = contract.create_task(
        "Build a landing page",
        "Deliver a responsive landing page with semantic HTML and CSS grid layout.",
    )
    submission_id = contract.submit_work(task_id, "A complete and valid deliverable.")

    mock_evaluation(
        direct_vm,
        {"score": 82, "summary": "Good work overall.", "criteria": []},
        pattern=r".*",
    )
    contract.evaluate_submission(submission_id)

    direct_vm.clear_mocks()
    mock_evaluation(
        direct_vm,
        {"score": 78, "summary": "Solid work with minor gaps.", "criteria": []},
        pattern=r".*",
    )
    assert direct_vm.run_validator() is True
