"""Shared helpers for the direct-mode tests of the TaskEvaluator contract."""

import json
from pathlib import Path

import pytest

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "task_evaluator.py"

#: A rubric answer the mocked evaluator model returns for passing work.
PASSING_EVALUATION = {
    "score": 86,
    "summary": "The submission covers every requirement with clear technical detail.",
    "criteria": [
        {"requirement": "Responsive layout", "met": True, "note": "Uses CSS grid."},
        {"requirement": "Unit tests", "met": True, "note": "Test suite included."},
        {"requirement": "Documentation", "met": False, "note": "README is missing."},
    ],
}

#: A rubric answer the mocked evaluator model returns for failing work.
FAILING_EVALUATION = {
    "score": 32,
    "summary": "The submission does not address the core requirements.",
    "criteria": [
        {"requirement": "Responsive layout", "met": False, "note": "Not implemented."},
        {"requirement": "Unit tests", "met": False, "note": "No tests provided."},
    ],
}


def deploy_evaluator(direct_deploy):
    """Deploy the TaskEvaluator contract for direct-mode testing."""
    return direct_deploy(str(CONTRACT_PATH))


def to_hex(address) -> str:
    """Return the checksummed hex representation of an address.

    Direct mode hands out raw bytes until the contract runtime is loaded, so
    the address is rebuilt through the SDK type when needed.
    """
    if hasattr(address, "as_hex"):
        return address.as_hex

    from genlayer.py.types import Address

    return Address(address).as_hex


def mock_evaluation(direct_vm, evaluation, pattern=r".*"):
    """Register an LLM mock that returns the given evaluation payload."""
    direct_vm.mock_llm(pattern, json.dumps(evaluation))


@pytest.fixture
def passing_evaluation():
    return dict(PASSING_EVALUATION)


@pytest.fixture
def failing_evaluation():
    return dict(FAILING_EVALUATION)
