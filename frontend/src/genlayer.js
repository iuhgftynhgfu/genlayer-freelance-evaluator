/**
 * Thin, typed wrapper around the official `genlayer-js` SDK.
 *
 * Responsibilities:
 *  - pick the active GenLayer network and RPC endpoint;
 *  - create read-only and signing clients;
 *  - read/write the TaskEvaluator intelligent contract;
 *  - manage the browser wallet (or an ephemeral Studio account).
 */

import { createAccount, createClient } from "genlayer-js";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";

const CHAINS = {
  localnet,
  studionet,
  testnetBradbury,
  testnetAsimov,
};

/** Network selected through `VITE_GENLAYER_CHAIN` (default: studionet). */
export const NETWORK_NAME = (
  import.meta.env.VITE_GENLAYER_CHAIN || "studionet"
).toLowerCase();

/** Chain definition consumed by `genlayer-js`. */
export const CHAIN = CHAINS[NETWORK_NAME] || studionet;

/** RPC endpoint override, empty means "use the chain default". */
export const DEFAULT_RPC_URL = import.meta.env.VITE_GENLAYER_RPC_URL || "";

/** Contract address baked into the build, empty means "ask the user". */
export const DEFAULT_CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

const ADDRESS_STORAGE_KEY = "gfe.contractAddress";
const RPC_STORAGE_KEY = "gfe.rpcUrl";

/** Active signer. `account` is either an address string or a viem account. */
export const signer = {
  account: null,
  provider: null,
  kind: null,
};

/* ------------------------------------------------------------------ storage */

function readStore(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch (error) {
    return "";
  }
}

function writeStore(key, value) {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    /* private browsing mode — settings simply do not persist */
  }
}

export function getContractAddress() {
  return (readStore(ADDRESS_STORAGE_KEY) || DEFAULT_CONTRACT_ADDRESS || "").trim();
}

export function setContractAddress(value) {
  writeStore(ADDRESS_STORAGE_KEY, (value || "").trim());
}

export function getRpcUrl() {
  return (readStore(RPC_STORAGE_KEY) || DEFAULT_RPC_URL || "").trim();
}

export function setRpcUrl(value) {
  writeStore(RPC_STORAGE_KEY, (value || "").trim());
}

export function isValidAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || "").trim());
}

/* ------------------------------------------------------------------ clients */

function clientConfig(extra = {}) {
  const config = { chain: CHAIN, ...extra };
  const rpc = getRpcUrl();
  if (rpc) {
    config.endpoint = rpc;
  }
  return config;
}

/** Client used for reads. It never needs a signer. */
export function createReadClient() {
  return createClient(clientConfig());
}

/** Client used for writes, bound to the active signer. */
export function createWriteClient() {
  return createClientFor(signer.account, signer.provider);
}

/** Client bound to an explicit account/provider pair. */
export function createClientFor(account, provider) {
  return createClient(
    clientConfig({
      ...(account ? { account } : {}),
      ...(provider ? { provider } : {}),
    }),
  );
}

/* ------------------------------------------------------------ contract calls */

function requireAddress() {
  const address = getContractAddress();
  if (!isValidAddress(address)) {
    throw new Error(
      "No valid contract address configured. Add the TaskEvaluator address in Settings.",
    );
  }
  return address;
}

/** Read a view method of the TaskEvaluator contract. */
export async function readContract(functionName, args = []) {
  const address = requireAddress();
  const client = createReadClient();
  const result = await client.readContract({
    address,
    functionName,
    args,
    jsonSafeReturn: true,
  });
  return result;
}

/** Wait until the transaction is decided/finalized and return its receipt. */
export async function waitForTransaction(hash) {
  const client = createReadClient();

  if (typeof client.waitForFinalization === "function") {
    return client.waitForFinalization({ hash, interval: 3000, retries: 120 });
  }

  return client.waitForTransactionReceipt({
    hash,
    status: "FINALIZED",
    interval: 3000,
    retries: 120,
  });
}

/**
 * Verify that the consensus actually executed the call successfully.
 * A transaction can be accepted by the network and still have failed inside
 * the contract, so both checks are mandatory.
 */
export function assertSuccessful(receipt) {
  const status = receipt?.statusName || receipt?.status_name || receipt?.status;
  const execution =
    receipt?.txExecutionResultName || receipt?.tx_execution_result_name;

  if (execution && execution !== "FINISHED_WITH_RETURN") {
    throw new Error(`Contract execution failed (${execution}).`);
  }

  const failed = ["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"];
  if (status && failed.includes(String(status))) {
    throw new Error(`The network did not reach consensus (${status}).`);
  }

  return receipt;
}

/**
 * Send a write transaction and wait for its outcome.
 * Returns `{ hash, receipt }`.
 */
export async function writeContract(functionName, args = []) {
  const address = requireAddress();

  if (!signer.account) {
    throw new Error("Connect a wallet before sending a transaction.");
  }

  const client = createWriteClient();
  const payload = {
    address,
    functionName,
    args,
    value: 0n,
  };

  // Fee-charging deployments (GenLayerJS v2) require an explicit deposit.
  // On classic deployments the estimator is not available and this is skipped.
  if (typeof client.estimateTransactionFeesForWrite === "function") {
    try {
      const estimate = await client.estimateTransactionFeesForWrite(payload);
      if (estimate && estimate.distribution) {
        payload.fees = {
          distribution: estimate.distribution,
          feeValue: estimate.feeValue ?? 0n,
        };
      }
    } catch (error) {
      console.warn("Fee estimation failed, submitting without a deposit.", error);
    }
  }

  const hash = await client.writeContract(payload);
  const receipt = assertSuccessful(await waitForTransaction(hash));

  return { hash, receipt };
}

/* ------------------------------------------------------------------- wallet */

/** Connect an EIP-1193 browser wallet (MetaMask, Brave, ...) and switch network. */
export async function connectInjectedWallet() {
  if (!window.ethereum) {
    throw new Error("No browser wallet was detected. Install MetaMask or use a Studio account.");
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) {
    throw new Error("The wallet did not return any account.");
  }

  const address = accounts[0];
  const client = createClientFor(address, window.ethereum);

  try {
    await client.connect(NETWORK_NAME);
  } catch (error) {
    throw new Error(
      `Could not switch the wallet to ${NETWORK_NAME}. ${error?.message || error}`,
    );
  }

  signer.account = address;
  signer.provider = window.ethereum;
  signer.kind = "injected";
  return address;
}

/** Create an ephemeral in-memory account, handy for local Studio testing. */
export function connectStudioAccount() {
  const account = createAccount();
  signer.account = account;
  signer.provider = null;
  signer.kind = "studio";
  return account.address;
}

export function disconnect() {
  signer.account = null;
  signer.provider = null;
  signer.kind = null;
}

export function isConnected() {
  return Boolean(signer.account);
}
