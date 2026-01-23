/// <reference types="chrome" />
import { action, runtime } from "webextension-polyfill";

export type ConnectionState = "connected" | "disconnected" | "unknown";

let globalConnectionState: ConnectionState = "unknown";
let hasShownNotification = false;

const NOTIFICATION_ID = "ethui-connection-status";

export function getConnectionState(): ConnectionState {
  return globalConnectionState;
}

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
  } else if (globalConnectionState === "connected") {
    action.setBadgeText({ text: "" });
  }
}

function showDisconnectedNotification() {
  if (!chrome.notifications?.create) {
    return;
  }

  chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/ethui-purple-128.png"),
    title: "ethui Desktop Not Running",
    message:
      "The ethui desktop app doesn't appear to be running. Click the extension icon for more info.",
  });
}

export function setupConnectionStateListener() {
  runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as { type: string }).type === "get-connection-state"
    ) {
      return Promise.resolve({
        type: "connection-state",
        state: globalConnectionState,
      });
    }
  });

  // Handle notification click - open ethui.dev
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === NOTIFICATION_ID) {
      chrome.tabs.create({ url: "https://ethui.dev" });
    }
  });
}
