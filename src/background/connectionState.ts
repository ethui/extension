import { action, notifications, runtime, tabs } from "webextension-polyfill";

import { loadSettings } from "#/settings";

type ConnectionState = "connected" | "disconnected" | "unknown";

interface WalletInfo {
  accounts: string[];
  chainId: string;
  balance: string;
}

let globalConnectionState: ConnectionState = "unknown";
let hasShownNotification = false;

const NOTIFICATION_ID = "ethui-connection-status";

export function setConnectionState(state: ConnectionState) {
  const previousState = globalConnectionState;
  globalConnectionState = state;

  // Broadcast state change to any open popups
  runtime
    .sendMessage({
      type: "connection-state",
      state: globalConnectionState,
    })
    .catch(() => {
      // Popup may not be open, ignore error
    });

  updateBadge();

  // Show notification on first disconnection
  if (
    state === "disconnected" &&
    previousState !== "disconnected" &&
    !hasShownNotification
  ) {
    showDisconnectedNotification();
    hasShownNotification = true;
  }

  // Reset notification flag when connected
  if (state === "connected") {
    hasShownNotification = false;
  }
}

function updateBadge() {
  if (globalConnectionState === "disconnected") {
    action.setBadgeText({ text: "!" });
    action.setBadgeBackgroundColor({ color: "#ef4444" });
  } else {
    action.setBadgeText({ text: "" });
  }
}

function showDisconnectedNotification() {
  if (!notifications?.create) {
    return;
  }

  notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: runtime.getURL("icons/ethui-black-128.png"),
    title: "ethui Desktop Not Running",
    message:
      "The ethui desktop app doesn't appear to be running. Click the extension icon for more info.",
  });
}

async function checkConnection(): Promise<ConnectionState> {
  const settings = await loadSettings();
  const endpoint = settings.endpoint;

  return new Promise((resolve) => {
    let resolved = false;
    const done = (state: ConnectionState) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      setConnectionState(state);
      resolve(state);
    };

    const ws = new WebSocket(endpoint);
    const timeout = setTimeout(() => {
      ws.close();
      done("disconnected");
    }, 3000);

    ws.onopen = () => {
      done("connected");
      ws.close();
    };

    ws.onerror = () => {
      ws.close();
      done("disconnected");
    };

    ws.onclose = () => {
      done("disconnected");
    };
  });
}

async function fetchWalletInfo(): Promise<WalletInfo | null> {
  const settings = await loadSettings();
  const endpoint = settings.endpoint;

  return new Promise((resolve) => {
    const ws = new WebSocket(endpoint);
    let requestId = 1;
    const pending = new Map<number, (result: unknown) => void>();

    const sendRequest = (method: string, params: unknown[] = []) => {
      const id = requestId++;
      return new Promise<unknown>((res) => {
        pending.set(id, res);
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    };

    const timeout = setTimeout(() => {
      ws.close();
      resolve(null);
    }, 5000);

    ws.onopen = async () => {
      try {
        const [accounts, chainId] = await Promise.all([
          sendRequest("eth_accounts"),
          sendRequest("eth_chainId"),
        ]);

        const accountsArray = accounts as string[];
        let balance = "0x0";

        if (accountsArray.length > 0) {
          balance = (await sendRequest("eth_getBalance", [
            accountsArray[0],
            "latest",
          ])) as string;
        }

        clearTimeout(timeout);
        ws.close();
        resolve({
          accounts: accountsArray,
          chainId: chainId as string,
          balance,
        });
      } catch {
        clearTimeout(timeout);
        ws.close();
        resolve(null);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id && pending.has(data.id)) {
          const callback = pending.get(data.id)!;
          pending.delete(data.id);
          callback(data.result);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };
  });
}

export function setupConnectionStateListener() {
  const handleMessage = (
    message: unknown,
    _sender: unknown,
    sendResponse: (r: unknown) => void,
  ): true | undefined => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message)
    ) {
      return;
    }

    const msg = message as { type: string };

    if (msg.type === "get-connection-state") {
      // If state is unknown, check connection before responding
      if (globalConnectionState === "unknown") {
        checkConnection().then((state) => {
          sendResponse({ type: "connection-state", state });
        });
      } else {
        sendResponse({
          type: "connection-state",
          state: globalConnectionState,
        });
      }
      return true;
    }

    if (msg.type === "get-wallet-info") {
      fetchWalletInfo().then((info) => {
        sendResponse({ type: "wallet-info", info });
      });
      return true;
    }

    if (msg.type === "check-connection") {
      checkConnection().then((state) => {
        sendResponse({ type: "connection-state", state });
      });
      return true;
    }
  };

  runtime.onMessage.addListener(
    handleMessage as Parameters<typeof runtime.onMessage.addListener>[0],
  );

  // Handle notification click - open ethui.dev
  notifications.onClicked.addListener((notificationId) => {
    if (notificationId === NOTIFICATION_ID) {
      tabs.create({ url: "https://ethui.dev" });
    }
  });
}
