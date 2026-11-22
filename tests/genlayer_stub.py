"""Stdlib-only stub of the `genlayer` package for local testing of the
freelance-evaluator v2 contract.

Injects a fake `genlayer` module into sys.modules so
contracts/task_evaluator.py can be imported and exercised in plain local
Python, without the GenLayer SDK, runtime, or any LLM call.

What the stub provides:
- gl.Contract: base class whose instances get plain-dict/list storage
  mirroring the contract's TreeMap / DynArray / counter fields.
- TreeMap / DynArray: dict / list stand-ins with get_or_insert_default.
- Address / u256 / u64: value types with .as_hex and int behaviour.
- allow_storage: no-op decorator for the @dataclass storage models.
- gl.public.write / gl.public.view: no-op decorators.
- gl.message.sender_address: mutable — set with set_sender().
- gl.vm.UserError / gl.vm.Return: exception type / leader-result wrapper.
- gl.nondet.exec_prompt: scripted — returns queued responses in order and
  records every prompt issued, so tests can assert on prompt content.
- gl.nondet.web.render: scripted by URL substring via mock_web().
- gl.vm.run_nondet(leader_fn, validator_fn): runs the leader, wraps its
  result in a Return, runs the validator against it. True -> leader's dict
  is returned; False -> raises UserError (no consensus, no state change).
  The last leader result + validator are kept so tests can re-run the
  validator with a different mocked LLM answer (run_validator()).

Usage (must run BEFORE importing the contract):
    import genlayer_stub
    genlayer_stub.install()
    genlayer_stub.set_sender("0x1111...")
    genlayer_stub.queue_responses([leader_response, validator_response])
    from contracts.task_evaluator import TaskEvaluator

The stub is test tooling only. It is NOT part of the deployed contract.
"""

import sys
import types

RESPONSES = []
PROMPTS = []
WEB_MOCKS = {}  # url substring -> body
LAST = {"leader": None, "validator": None}
_SENDER = {"address": None}


def queue_responses(responses):
    """Queue scripted exec_prompt responses, served in order."""
    RESPONSES.extend(responses)


def mock_web(url_substring, body):
    """Serve `body` for any web.render URL containing the substring."""
    WEB_MOCKS[url_substring] = body


def set_sender(address):
    """Set the address gl.message.sender_address returns."""
    _SENDER["address"] = address if isinstance(address, Address) else Address(address)


def get_sender():
    return _SENDER["address"]


def reset():
    """Clear queued responses, prompts, web mocks and last-run state."""
    RESPONSES.clear()
    PROMPTS.clear()
    WEB_MOCKS.clear()
    LAST["leader"] = None
    LAST["validator"] = None


class UserError(Exception):
    """Stand-in for gl.vm.UserError."""


class Return:
    """Stand-in for gl.vm.Return: carries the leader result in .calldata."""

    def __init__(self, calldata):
        self.calldata = calldata


class Address:
    """Stand-in for the SDK Address type (hex string backed)."""

    def __init__(self, value):
        if isinstance(value, Address):
            self._hex = value._hex
        elif isinstance(value, bytes):
            self._hex = "0x" + value.hex()
        else:
            text = str(value).strip().lower()
            self._hex = text if text.startswith("0x") else "0x" + text

    @property
    def as_hex(self):
        return self._hex

    def __eq__(self, other):
        if isinstance(other, Address):
            return self._hex == other._hex
        if isinstance(other, str):
            return self._hex == other.strip().lower()
        return NotImplemented

    def __ne__(self, other):
        result = self.__eq__(other)
        return result if result is NotImplemented else not result

    def __hash__(self):
        return hash(self._hex)

    def __repr__(self):
        return "Address(" + self._hex + ")"


class u256(int):
    """Stand-in for the SDK u256 type."""

    def __new__(cls, value=0):
        return super().__new__(cls, int(value))


class u64(int):
    """Stand-in for the SDK u64 type."""

    def __new__(cls, value=0):
        return super().__new__(cls, int(value))


class DynArray(list):
    """Stand-in for the SDK DynArray type."""

    def __class_getitem__(cls, item):
        return cls


class TreeMap(dict):
    """Stand-in for the SDK TreeMap type."""

    def __class_getitem__(cls, item):
        return cls

    def get_or_insert_default(self, key):
        if key not in self:
            self[key] = DynArray()
        return self[key]


def allow_storage(cls):
    """No-op stand-in for the @allow_storage decorator."""
    return cls


class Contract:
    """Stand-in for gl.Contract: plain-dict storage for local tests."""

    def __new__(cls, *args, **kwargs):
        inst = super().__new__(cls)
        inst.tasks = TreeMap()
        inst.submissions = TreeMap()
        inst.revisions = TreeMap()
        inst.task_submission_ids = TreeMap()
        inst.freelancer_submission_ids = TreeMap()
        inst.task_count = 0
        inst.submission_count = 0
        inst.revision_count = 0
        inst.reevaluation_count = 0
        return inst


def _identity_decorator(fn):
    return fn


def _exec_prompt(prompt, response_format=None):
    PROMPTS.append(prompt)
    if not RESPONSES:
        raise RuntimeError("genlayer_stub: no scripted exec_prompt response left")
    return RESPONSES.pop(0)


def _web_render(url, mode="text"):
    for substring, body in WEB_MOCKS.items():
        if substring in url:
            return body
    raise RuntimeError("genlayer_stub: no web mock for " + url)


def _run_nondet(leader_fn, validator_fn):
    leader_result = leader_fn()
    LAST["leader"] = leader_result
    LAST["validator"] = validator_fn
    verdict = validator_fn(Return(leader_result))
    if verdict is True:
        return leader_result
    raise UserError("validator rejected leader result (no consensus)")


def run_validator():
    """Re-run the last stored validator against the last leader result.

    Lets tests change the mocked LLM answer after a successful evaluation
    and check whether the validator would still agree — the same shape as
    the v1 direct-mode tests' direct_vm.run_validator().
    """
    if LAST["validator"] is None:
        raise RuntimeError("genlayer_stub: no validator recorded yet")
    return LAST["validator"](Return(LAST["leader"]))


class _Message:
    """gl.message with a mutable sender_address."""

    @property
    def sender_address(self):
        if _SENDER["address"] is None:
            raise RuntimeError("genlayer_stub: set_sender() not called")
        return _SENDER["address"]


public = types.SimpleNamespace(write=_identity_decorator, view=_identity_decorator)
vm = types.SimpleNamespace(
    UserError=UserError, Return=Return, run_nondet=_run_nondet
)
web = types.SimpleNamespace(render=_web_render)
nondet = types.SimpleNamespace(exec_prompt=_exec_prompt, web=web)
gl = types.SimpleNamespace(
    Contract=Contract, public=public, vm=vm, nondet=nondet, message=_Message()
)

__all__ = ["gl", "TreeMap", "DynArray", "Address", "u256", "u64", "allow_storage"]
_MILESTONE_V2_STUB = True


def install():
    """Install this module as `genlayer` in sys.modules.

    Idempotent: if the stub is already installed, returns the installed
    module.
    """
    existing = sys.modules.get("genlayer")
    if existing is not None and getattr(existing, "_MILESTONE_V2_STUB", False):
        return existing
    sys.modules["genlayer"] = sys.modules[__name__]
    return sys.modules[__name__]
