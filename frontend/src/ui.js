/**
 * Small DOM/formatting helpers shared by the app.
 */

/** Escape untrusted text before injecting it into innerHTML. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 0x1234...cdef */
export function shortAddress(address, size = 6) {
  const value = String(address || "");
  if (!value.startsWith("0x") || value.length < 12) {
    return value || "—";
  }
  return `${value.slice(0, size + 2)}...${value.slice(-4)}`;
}

/** Unix seconds -> localized date string. */
export function formatDate(seconds) {
  const value = Number(seconds || 0);
  if (!value) {
    return "—";
  }
  try {
    return new Date(value * 1000).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (error) {
    return new Date(value * 1000).toISOString();
  }
}

/** Colour used for the score ring depending on the pass threshold. */
export function scoreColor(score, threshold) {
  const value = Number(score || 0);
  if (value >= threshold) {
    return "var(--success)";
  }
  if (value >= threshold - 20) {
    return "var(--warning)";
  }
  return "var(--danger)";
}

/** Show a toast notification. */
export function toast(type, title, message = "") {
  const container = document.getElementById("toasts");
  if (!container) {
    return;
  }

  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.innerHTML = `
    <span class="toast-dot"></span>
    <div>
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<span>${escapeHtml(message)}</span>` : ""}
    </div>
  `;

  container.appendChild(element);

  const remove = () => {
    element.classList.add("is-leaving");
    window.setTimeout(() => element.remove(), 260);
  };

  window.setTimeout(remove, type === "error" ? 9000 : 5000);
  element.addEventListener("click", remove);
}

/** Toggle the loading state of a button. */
export function setLoading(button, loading, label) {
  if (!button) {
    return;
  }

  if (loading) {
    button.dataset.label = button.textContent;
    button.classList.add("is-loading");
    button.disabled = true;
    if (label) {
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-label", label);
    }
  } else {
    button.classList.remove("is-loading");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-label");
  }
}

/** Human readable error message from anything that was thrown. */
export function describeError(error) {
  if (!error) {
    return "Unknown error.";
  }

  const raw = error?.shortMessage || error?.message || String(error);
  const lowered = raw.toLowerCase();

  if (lowered.includes("user rejected") || lowered.includes("user denied")) {
    return "The wallet rejected the request.";
  }
  if (lowered.includes("insufficient funds") || lowered.includes("balance")) {
    return "The signer has insufficient GEN for this transaction.";
  }
  if (lowered.includes("execution failed")) {
    return raw;
  }
  if (lowered.includes("not found")) {
    return `${raw} — is the contract address correct on ${"this network"}?`;
  }
  if (lowered.includes("failed to fetch") || lowered.includes("network")) {
    return `${raw} — the GenLayer RPC endpoint could not be reached.`;
  }

  return raw;
}

/** Copy text to the clipboard with a graceful fallback. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}
