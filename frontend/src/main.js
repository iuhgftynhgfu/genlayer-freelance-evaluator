/**
 * GenLayer Freelance Evaluator — single page application.
 *
 * The app talks to the `TaskEvaluator` intelligent contract through the
 * official `genlayer-js` SDK:
 *
 *   1. a client publishes a task          -> create_task(title, requirements)
 *   2. a freelancer delivers the work     -> submit_work(task_id, content)
 *   3. the AI grades the delivery         -> evaluate_submission(submission_id)
 *
 * Writes go through GenLayer consensus, so every action waits for the network
 * to accept and finalize the transaction before the UI updates.
 */

import {
  NETWORK_NAME,
  connectInjectedWallet,
  connectStudioAccount,
  disconnect,
  getContractAddress,
  getRpcUrl,
  isConnected,
  isValidAddress,
  readContract,
  setContractAddress,
  setRpcUrl,
  writeContract,
} from "./genlayer.js";

import {
  copyToClipboard,
  describeError,
  escapeHtml,
  formatDate,
  scoreColor,
  setLoading,
  shortAddress,
  toast,
} from "./ui.js";

const state = {
  contractInfo: null,
  task: null,
  submissions: [],
  threshold: 70,
};

/* ------------------------------------------------------------------ elements */

const elements = {
  networkLabel: document.getElementById("network-label"),
  footerAddress: document.getElementById("footer-address"),
  footerNetwork: document.getElementById("footer-network"),
  setupBanner: document.getElementById("setup-banner"),
  setupAddress: document.getElementById("setup-address"),
  setupSave: document.getElementById("setup-save"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsDialog: document.getElementById("settings-dialog"),
  settingsClose: document.getElementById("settings-close"),
  settingsAddress: document.getElementById("settings-address"),
  settingsRpc: document.getElementById("settings-rpc"),
  settingsSave: document.getElementById("settings-save"),
  walletBtn: document.getElementById("wallet-btn"),
  walletDialog: document.getElementById("wallet-dialog"),
  walletClose: document.getElementById("wallet-close"),
  walletDialogTitle: document.getElementById("wallet-dialog-title"),
  walletDisconnected: document.getElementById("wallet-disconnected"),
  walletConnected: document.getElementById("wallet-connected"),
  walletAddress: document.getElementById("wallet-address"),
  connectInjected: document.getElementById("connect-injected"),
  connectBurner: document.getElementById("connect-burner"),
  copyAddress: document.getElementById("copy-address"),
  disconnectBtn: document.getElementById("disconnect"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    create: document.getElementById("panel-create"),
    submit: document.getElementById("panel-submit"),
    evaluate: document.getElementById("panel-evaluate"),
  },
  taskTitle: document.getElementById("task-title"),
  taskRequirements: document.getElementById("task-requirements"),
  createTask: document.getElementById("create-task"),
  createNote: document.getElementById("create-note"),
  submitTaskId: document.getElementById("submit-task-id"),
  submitContent: document.getElementById("submit-content"),
  submitWork: document.getElementById("submit-work"),
  evaluateSubmissionId: document.getElementById("evaluate-submission-id"),
  evaluateSubmission: document.getElementById("evaluate-submission"),
  evaluateNote: document.getElementById("evaluate-note"),
  inspectTaskId: document.getElementById("inspect-task-id"),
  loadTask: document.getElementById("load-task"),
  inspector: document.getElementById("inspector"),
  recentTasks: document.getElementById("recent-tasks"),
  refreshTasks: document.getElementById("refresh-tasks"),
  statTasks: document.getElementById("stat-tasks"),
  statSubmissions: document.getElementById("stat-submissions"),
  statThreshold: document.getElementById("stat-threshold"),
  heroCreate: document.getElementById("hero-create"),
  heroSubmit: document.getElementById("hero-submit"),
};

/* -------------------------------------------------------------------- helpers */

function switchTab(name) {
  for (const tab of elements.tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const [key, panel] of Object.entries(elements.panels)) {
    panel.classList.toggle("is-active", key === name);
  }
}

function contractConfigured() {
  return isValidAddress(getContractAddress());
}

function requireContract() {
  if (!contractConfigured()) {
    throw new Error("Configure the TaskEvaluator contract address first (Settings).");
  }
}

function requireWallet() {
  if (!isConnected()) {
    throw new Error("Connect a wallet first — opens the signer dialog.");
  }
}

/* ------------------------------------------------------------------- rendering */

function renderWalletState() {
  const connected = isConnected();
  elements.walletBtn.textContent = connected
    ? shortAddress(typeof window !== "undefined" && connected ? String(currentAddress()) : "")
    : "Connect wallet";
  elements.walletBtn.classList.toggle("btn-primary", !connected);
  elements.walletBtn.classList.toggle("btn-outline", connected);

  elements.walletDisconnected.hidden = connected;
  elements.walletConnected.hidden = !connected;
  elements.walletDialogTitle.textContent = connected ? "Wallet" : "Connect a signer";

  if (connected) {
    elements.walletAddress.textContent = currentAddress();
  }
}

let cachedAddress = "";

function currentAddress() {
  return cachedAddress;
}

function setAddress(address) {
  cachedAddress = address || "";
  renderWalletState();
}

function renderStats() {
  const info = state.contractInfo;
  elements.statTasks.textContent = info ? Number(info.task_count ?? 0) : "—";
  elements.statSubmissions.textContent = info ? Number(info.submission_count ?? 0) : "—";
  elements.statThreshold.textContent = info ? Number(info.pass_threshold ?? 70) : "—";
}

function renderSubmission(submission) {
  const evaluated = submission.status === "EVALUATED";
  const score = Number(submission.score ?? 0);
  const threshold = state.threshold;

  const badge = evaluated
    ? submission.passed
      ? '<span class="badge badge-pass">Passed</span>'
      : '<span class="badge badge-fail">Failed</span>'
    : '<span class="badge badge-pending">Awaiting review</span>';

  const criteria = Array.isArray(submission.criteria) ? submission.criteria : [];
  const criteriaHtml = criteria.length
    ? `<ul class="criteria">${criteria
        .map((criterion) => {
          const met = Boolean(criterion?.met);
          return `<li>
            <span class="tick ${met ? "met" : "unmet"}">${met ? "✓" : "✕"}</span>
            <span>
              <span class="crit-req">${escapeHtml(criterion?.requirement || "Requirement")}</span>
              ${
                criterion?.note
                  ? `<br /><span class="crit-note">${escapeHtml(criterion.note)}</span>`
                  : ""
              }
            </span>
          </li>`;
        })
        .join("")}</ul>`
    : "";

  const resultHtml = evaluated
    ? `<div class="result">
        <div class="score-ring" style="--score:${score}; --ring-color:${scoreColor(
          score,
          threshold,
        )}">
          <span>${score}</span>
        </div>
        <div class="result-body">
          <p class="result-summary">${escapeHtml(submission.summary || "")}</p>
          ${criteriaHtml}
        </div>
      </div>`
    : `<p class="result-summary">Submitted but not graded yet. Request an AI evaluation to
       let the validator set score it.</p>`;

  const canEvaluate = !evaluated && isConnected();

  return `<article class="submission" data-submission-id="${escapeHtml(
    submission.submission_id,
  )}">
    <div class="submission-head">
      <div>
        <span class="submission-id">${escapeHtml(submission.submission_id)}</span>
        <div class="submission-by">
          by ${escapeHtml(shortAddress(submission.freelancer))} ·
          ${escapeHtml(submission.source_type === "url" ? "link" : "text")}
          ${
            submission.evaluated_at
              ? `· graded ${escapeHtml(formatDate(submission.evaluated_at))}`
              : ""
          }
        </div>
      </div>
      ${badge}
    </div>
    ${resultHtml}
    <div class="submission-actions">
      <button class="btn btn-outline btn-sm" data-action="evaluate" data-id="${escapeHtml(
        submission.submission_id,
      )}" ${canEvaluate ? "" : "disabled"}>
        ${evaluated ? "Re-evaluate" : "Evaluate"}
      </button>
      <button class="btn btn-ghost btn-sm" data-action="copy-content" data-id="${escapeHtml(
        submission.submission_id,
      )}">
        Copy submission
      </button>
    </div>
  </article>`;
}

function renderInspector() {
  const task = state.task;

  if (!task) {
    elements.inspector.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M4 5.5h16M4 12h10M4 18.5h7" stroke-linecap="round" />
          </svg>
        </div>
        <p>No task loaded yet.</p>
        <span>Publish a task, pick one from the list, or enter a task id above.</span>
      </div>`;
    return;
  }

  const isClient = isConnected() && currentAddress() === task.client;
  const statusBadge = task.is_open
    ? '<span class="badge badge-open">Open</span>'
    : '<span class="badge badge-closed">Closed</span>';

  const submissions = state.submissions.length
    ? state.submissions.map(renderSubmission).join("")
    : `<p class="muted">No submissions yet.</p>`;

  elements.inspector.innerHTML = `
    <div class="task-card">
      <div class="task-card-head">
        <div>
          <h4>${escapeHtml(task.title)}</h4>
          <div class="task-meta">
            <code>${escapeHtml(task.task_id)}</code>
            <span>client <code>${escapeHtml(shortAddress(task.client))}</code></span>
            <span>${escapeHtml(formatDate(task.created_at))}</span>
            <span>${Number(task.submission_count ?? 0)} submission(s)</span>
          </div>
        </div>
        ${statusBadge}
      </div>
      <pre class="requirements">${escapeHtml(task.requirements)}</pre>
      <div class="submission-list">${submissions}</div>
      ${
        isClient
          ? `<div class="task-actions">
              <button class="btn btn-outline btn-sm" data-action="toggle-task" data-id="${escapeHtml(
                task.task_id,
              )}">
                ${task.is_open ? "Close task" : "Reopen task"}
              </button>
            </div>`
          : ""
      }
    </div>`;
}

function renderRecentTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    elements.recentTasks.innerHTML = '<p class="muted">No tasks published yet.</p>';
    return;
  }

  elements.recentTasks.innerHTML = tasks
    .map(
      (task) => `
      <button class="task-tile" data-action="open-task" data-id="${escapeHtml(task.task_id)}">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="tile-meta">
          <span>${escapeHtml(task.task_id)}</span>
          <span>${Number(task.submission_count ?? 0)} sub.</span>
        </div>
        <div class="tile-meta">
          <span>${task.is_open ? "open" : "closed"}</span>
          <span>${escapeHtml(shortAddress(task.client, 4))}</span>
        </div>
      </button>`,
    )
    .join("");
}

/* --------------------------------------------------------------------- actions */

async function refreshContractInfo() {
  if (!contractConfigured()) {
    return;
  }

  try {
    const info = await readContract("get_contract_info", []);
    state.contractInfo = info;
    state.threshold = Number(info?.pass_threshold ?? 70);
    renderStats();
  } catch (error) {
    console.warn("Could not read contract info:", error);
  }
}

async function refreshRecentTasks() {
  if (!contractConfigured()) {
    elements.recentTasks.innerHTML =
      '<p class="muted">Connect a contract address to list tasks.</p>';
    return;
  }

  try {
    const tasks = await readContract("get_recent_tasks", [12]);
    renderRecentTasks(tasks);
  } catch (error) {
    elements.recentTasks.innerHTML = `<p class="muted">${escapeHtml(
      describeError(error),
    )}</p>`;
  }
}

async function loadTask(taskId) {
  const id = String(taskId || "").trim();
  if (!id) {
    toast("error", "Task id required", "Enter the id of the task you want to inspect.");
    return;
  }

  try {
    const [task, submissions] = await Promise.all([
      readContract("get_task", [id]),
      readContract("get_task_submissions", [id]),
    ]);

    state.task = task;
    state.submissions = Array.isArray(submissions) ? submissions : [];
    elements.inspectTaskId.value = id;
    renderInspector();
  } catch (error) {
    toast("error", "Could not load task", describeError(error));
  }
}

async function createTask(button) {
  try {
    requireContract();
    requireWallet();
  } catch (error) {
    toast("error", "Not ready", describeError(error));
    return;
  }

  const title = elements.taskTitle.value.trim();
  const requirements = elements.taskRequirements.value.trim();

  if (title.length < 3) {
    toast("error", "Title too short", "Give the task a short, descriptive title.");
    return;
  }
  if (requirements.length < 10) {
    toast("error", "Requirements too short", "Describe what the freelancer has to deliver.");
    return;
  }

  setLoading(button, true, "Publishing task");
  elements.createNote.textContent = "Publishing the task on chain…";

  try {
    const { hash } = await writeContract("create_task", [title, requirements]);
    const taskId = await readContract("get_last_task_id", []);
    toast("success", "Task published", `${taskId || "Task"} is live. Tx ${shortAddress(hash, 6)}`);
    elements.taskTitle.value = "";
    elements.taskRequirements.value = "";
    await refreshContractInfo();
    await refreshRecentTasks();
    if (taskId) {
      await loadTask(taskId);
    }
  } catch (error) {
    toast("error", "Publishing failed", describeError(error));
  } finally {
    setLoading(button, false);
    elements.createNote.textContent =
      "Requires a connected wallet. The task id is returned by the contract.";
  }
}

async function submitWork(button) {
  try {
    requireContract();
    requireWallet();
  } catch (error) {
    toast("error", "Not ready", describeError(error));
    return;
  }

  const taskId = elements.submitTaskId.value.trim();
  const content = elements.submitContent.value.trim();

  if (!taskId) {
    toast("error", "Task id required", "Paste the id of the task you are answering.");
    return;
  }
  if (content.length < 10) {
    toast("error", "Submission too short", "Paste your deliverable or a public link.");
    return;
  }

  setLoading(button, true, "Submitting work");

  try {
    const { hash } = await writeContract("submit_work", [taskId, content]);
    toast("success", "Work submitted", `Stored as ${taskId}. Tx ${shortAddress(hash, 6)}`);
    elements.submitContent.value = "";
    await refreshContractInfo();
    await refreshRecentTasks();
    await loadTask(taskId);
  } catch (error) {
    toast("error", "Submission failed", describeError(error));
  } finally {
    setLoading(button, false);
  }
}

async function evaluateSubmission(submissionId, button) {
  try {
    requireContract();
    requireWallet();
  } catch (error) {
    toast("error", "Not ready", describeError(error));
    return;
  }

  const id = String(submissionId || "").trim();
  if (!id) {
    toast("error", "Submission id required", "Pick a submission from the task inspector.");
    return;
  }

  setLoading(button, true, "Waiting for consensus");
  elements.evaluateNote.textContent =
    "The validator set is grading the submission. This usually takes 10–60 seconds…";

  try {
    const { hash } = await writeContract("evaluate_submission", [id]);
    toast("success", "Verdict reached", `${id} was graded. Tx ${shortAddress(hash, 6)}`);
    await refreshContractInfo();
    await refreshRecentTasks();
    await loadTask(state.task?.task_id || elements.inspectTaskId.value.trim());
  } catch (error) {
    toast("error", "Evaluation failed", describeError(error));
  } finally {
    setLoading(button, false);
    elements.evaluateNote.textContent =
      "LLM consensus usually takes 10–60 seconds. Do not close the tab.";
  }
}

async function toggleTaskStatus(taskId, button) {
  if (!state.task) {
    return;
  }

  setLoading(button, true);
  try {
    await writeContract("set_task_open", [taskId, !state.task.is_open]);
    toast(
      "success",
      state.task.is_open ? "Task closed" : "Task reopened",
      `${taskId} is now ${state.task.is_open ? "closed" : "open"}.`,
    );
    await refreshRecentTasks();
    await loadTask(taskId);
  } catch (error) {
    toast("error", "Could not update the task", describeError(error));
  } finally {
    setLoading(button, false);
  }
}

async function openWalletDialog() {
  if (isConnected()) {
    elements.walletDialog.showModal();
    return;
  }
  elements.walletDialog.showModal();
}

async function connectWallet(kind) {
  try {
    const address =
      kind === "studio" ? connectStudioAccount() : await connectInjectedWallet();
    setAddress(address);
    elements.walletDialog.close();
    toast(
      "success",
      kind === "studio" ? "Studio account ready" : "Wallet connected",
      kind === "studio"
        ? "Ephemeral in-memory account. Use it for local Studio testing only."
        : address,
    );
    renderInspector();
  } catch (error) {
    toast("error", "Could not connect", describeError(error));
  }
}

/* ------------------------------------------------------------------- listeners */

function bindEvents() {
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  }

  elements.heroCreate.addEventListener("click", () => {
    switchTab("create");
    elements.taskTitle.focus();
  });

  elements.heroSubmit.addEventListener("click", () => {
    switchTab("submit");
    elements.submitTaskId.focus();
  });

  elements.createTask.addEventListener("click", (event) => {
    event.preventDefault();
    createTask(elements.createTask);
  });

  elements.submitWork.addEventListener("click", (event) => {
    event.preventDefault();
    submitWork(elements.submitWork);
  });

  elements.evaluateSubmission.addEventListener("click", (event) => {
    event.preventDefault();
    evaluateSubmission(elements.evaluateSubmissionId.value.trim(), elements.evaluateSubmission);
  });

  elements.loadTask.addEventListener("click", () => {
    loadTask(elements.inspectTaskId.value.trim());
  });

  elements.inspectTaskId.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadTask(elements.inspectTaskId.value.trim());
    }
  });

  elements.refreshTasks.addEventListener("click", async () => {
    await refreshContractInfo();
    await refreshRecentTasks();
  });

  // Delegated actions inside the inspector and the recent task list.
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const { action, id } = target.dataset;

    if (action === "open-task") {
      elements.submitTaskId.value = id;
      await loadTask(id);
      window.scrollTo({ top: 420, behavior: "smooth" });
    }

    if (action === "evaluate") {
      elements.evaluateSubmissionId.value = id;
      await evaluateSubmission(id, target);
    }

    if (action === "toggle-task") {
      await toggleTaskStatus(id, target);
    }

    if (action === "copy-content") {
      const submission = state.submissions.find((item) => item.submission_id === id);
      if (submission) {
        const copied = await copyToClipboard(submission.content || "");
        toast(
          copied ? "success" : "error",
          copied ? "Copied" : "Copy failed",
          copied ? "Submission copied to the clipboard." : "Clipboard access was denied.",
        );
      }
    }
  });

  // Wallet dialog
  elements.walletBtn.addEventListener("click", openWalletDialog);
  elements.walletClose.addEventListener("click", () => elements.walletDialog.close());
  elements.connectInjected.addEventListener("click", () => connectWallet("injected"));
  elements.connectBurner.addEventListener("click", () => connectWallet("studio"));
  elements.copyAddress.addEventListener("click", async () => {
    const copied = await copyToClipboard(currentAddress());
    toast(
      copied ? "success" : "error",
      copied ? "Address copied" : "Copy failed",
      copied ? currentAddress() : "Clipboard access was denied.",
    );
  });
  elements.disconnectBtn.addEventListener("click", () => {
    disconnect();
    setAddress("");
    elements.walletDialog.close();
    toast("info", "Disconnected", "The wallet is no longer connected.");
    renderInspector();
  });

  // Settings dialog
  elements.settingsBtn.addEventListener("click", () => {
    elements.settingsAddress.value = getContractAddress();
    elements.settingsRpc.value = getRpcUrl();
    elements.settingsDialog.showModal();
  });
  elements.settingsClose.addEventListener("click", () => elements.settingsDialog.close());
  elements.settingsSave.addEventListener("click", async () => {
    const address = elements.settingsAddress.value.trim();
    if (!isValidAddress(address)) {
      toast("error", "Invalid address", "A contract address looks like 0x followed by 40 hex characters.");
      return;
    }
    setContractAddress(address);
    setRpcUrl(elements.settingsRpc.value.trim());
    elements.settingsDialog.close();
    toast("success", "Settings saved", address);
    await bootstrapContract();
  });

  // Setup banner
  elements.setupSave.addEventListener("click", async () => {
    const address = elements.setupAddress.value.trim();
    if (!isValidAddress(address)) {
      toast("error", "Invalid address", "A contract address looks like 0x followed by 40 hex characters.");
      return;
    }
    setContractAddress(address);
    toast("success", "Contract configured", address);
    await bootstrapContract();
  });
}

/* --------------------------------------------------------------------- startup */

async function bootstrapContract() {
  const address = getContractAddress();
  const configured = isValidAddress(address);

  elements.setupBanner.hidden = configured;
  elements.footerAddress.textContent = configured ? address : "not configured";
  elements.setupAddress.value = address || "";

  if (!configured) {
    renderStats();
    elements.recentTasks.innerHTML =
      '<p class="muted">Connect a contract address to list tasks.</p>';
    return;
  }

  await refreshContractInfo();
  await refreshRecentTasks();
}

function init() {
  elements.networkLabel.textContent = NETWORK_NAME;
  elements.footerNetwork.textContent = NETWORK_NAME;

  bindEvents();
  renderWalletState();
  bootstrapContract();
}

init();
