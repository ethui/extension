/**
 * Background service worker entry point.
 *
 * This module handles the main connection logic between web pages and either
 * the ethui desktop app or a fallback local Ethereum node.
 *
 * Connection priority:
 * 1. ethui desktop app (ws://localhost:9002 or 9102 in dev mode)
 * 2. Fallback to local node (ws://localhost:8545) if ethui is unavailable
 * 3. Periodically check if ethui comes back online and switch back
 */

import log from "loglevel";
import { type Runtime, runtime, storage } from "webextension-polyfill";
import {
  defaultSettings,
  getEndpoint,
  loadSettings,
  type Settings,
} from "#/settings";
import {
  type AppConnectionResult,
  checkAppAvailable,
  createAppConnection,
} from "./appConnection";
import {
  resetConnectionState,
  setConnectionState,
  setupConnectionStateListener,
} from "./connectionState";
import {
  checkFallbackAvailable,
  createFallbackConnection,
  type FallbackConnectionResult,
} from "./fallbackConnection";
import { startHeartbeat } from "./heartbeat";
import { updateIcon } from "./utils";

// Interval to check if ethui app comes back online when using fallback
const APP_CHECK_INTERVAL = 5000;

// init on load
(async () => init())();

let settings: Settings = defaultSettings;

interface ActiveConnection {
  close: () => void;
  send: (msg: string) => void;
  isFallback: boolean;
}

const activeConnections: Map<number, ActiveConnection> = new Map();

/**
 * Loads the current settings, and listens for incoming connections (from the injected contentscript)
 */
async function init() {
  startHeartbeat();
  settings = await loadSettings();
  log.setLevel(settings.logLevel);
  updateIcon(settings.devMode);

  setupConnectionStateListener();
  setupSettingsChangeListener();

  // handle each incoming content script connection
  runtime.onConnect.addListener((port: Runtime.Port) => {
    if (!port.sender) {
      return;
    }

    if (port.sender.frameId !== 0) {
      return;
    }

    setupProviderConnection(port);
  });
}

/**
 * Listen for settings changes and reconnect all active connections when endpoint changes
 */
function setupSettingsChangeListener() {
  storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    if (changes.logLevel?.newValue) {
      settings.logLevel = changes.logLevel.newValue as Settings["logLevel"];
      log.setLevel(settings.logLevel);
      log.debug("Log level changed to", settings.logLevel);
    }

    if (changes.devMode?.newValue !== undefined) {
      settings.devMode = changes.devMode.newValue as boolean;
      log.debug(
        "Dev mode changed to",
        settings.devMode,
        "- endpoint:",
        getEndpoint(settings),
      );

      // Update icon color
      updateIcon(settings.devMode);

      // Reset connection state to trigger fresh check
      resetConnectionState();

      // Close all active connections - they will reconnect with new endpoint on next message
      for (const [tabId, conn] of activeConnections) {
        log.debug(`Closing connection for tab ${tabId}`);
        conn.close();
      }
    }
  });
}

/**
 * Sends a message to the devtools in every page.
 * Each message will include a timestamp.
 * @param msg - message to be sent to the devtools
 */
async function notifyDevtools(
  tabId: number,
  type: "request" | "response" | "start",
  data?: unknown,
) {
  try {
    await runtime.sendMessage({
      type,
      tabId,
      data,
      timestamp: Date.now(),
    });
  } catch (e: unknown) {
    if (
      !(
        e instanceof Error &&
        e.message.includes("Receiving end does not exist.")
      )
    ) {
      throw e;
    }
  }
}

/**
 * Set up connection stream to new content scripts.
 * Handles connection with fallback logic:
 * 1. Try to connect to ethui app
 * 2. If unavailable, fall back to local node at ws://localhost:8545
 * 3. Periodically check if ethui comes back and switch to it
 */
function setupProviderConnection(port: Runtime.Port) {
  log.debug("setupProviderConnection", port.name);
  const tab = port.sender!.tab!;
  const tabId = tab.id!;

  notifyDevtools(tabId, "start");

  type Request = { id: number; method: string; params?: unknown };
  const reqs: Map<Request["id"], Request> = new Map();

  let appConnection: AppConnectionResult | null = null;
  let fallbackConnection: FallbackConnectionResult | null = null;
  let usingFallback = false;
  let appCheckTimer: ReturnType<typeof setInterval> | null = null;
  let pendingMessages: string[] = [];
  let isInitializing = false;

  const handleMessage = (data: unknown) => {
    const resp = data as { id?: number; error?: unknown; result?: unknown };
    port.postMessage(resp);

    if (resp.id !== undefined) {
      const req = reqs.get(resp.id);
      const logRequest = req?.params
        ? [req?.method, req?.params]
        : [req?.method];
      const fn = resp.error ? log.error : log.debug;
      fn(...logRequest, resp.error || resp.result);
    }
    notifyDevtools(tabId, "response", data);
  };

  /**
   * Start periodic checking for ethui app availability when using fallback
   */
  const startAppCheck = () => {
    if (appCheckTimer) return;

    log.debug("[Fallback] Starting periodic ethui app check");
    appCheckTimer = setInterval(async () => {
      if (!usingFallback) {
        stopAppCheck();
        return;
      }

      log.debug("[Fallback] Checking if ethui app is available...");
      const available = await checkAppAvailable(settings);
      if (available && usingFallback) {
        log.info("[Fallback] ethui app is back! Switching to app connection");
        switchToAppConnection();
      }
    }, APP_CHECK_INTERVAL);
  };

  const stopAppCheck = () => {
    if (appCheckTimer) {
      clearInterval(appCheckTimer);
      appCheckTimer = null;
    }
  };

  /**
   * Switch from fallback to app connection
   */
  const switchToAppConnection = () => {
    // Close fallback connection
    if (fallbackConnection) {
      fallbackConnection.close();
      fallbackConnection = null;
    }

    usingFallback = false;
    stopAppCheck();

    // Create new app connection
    appConnection = createAppConnection(
      settings,
      port,
      handleMessage,
      handleAppDisconnect,
    );

    // Update the active connection reference
    activeConnections.set(tabId, {
      close: closeAllConnections,
      send: (msg) => sendMessage(msg),
      isFallback: false,
    });
  };

  /**
   * Switch from app to fallback connection
   */
  const switchToFallbackConnection = async () => {
    // Check if fallback is available
    const fallbackAvailable = await checkFallbackAvailable();
    if (!fallbackAvailable) {
      log.warn("[Fallback] Fallback endpoint also unavailable");
      setConnectionState("disconnected");
      // Retry app connection after delay
      setTimeout(() => {
        if (
          !appConnection?.isConnected() &&
          !fallbackConnection?.isConnected()
        ) {
          initializeConnection();
        }
      }, 1000);
      return;
    }

    log.info("[Fallback] Switching to fallback connection");

    // Close app connection
    if (appConnection) {
      appConnection.close();
      appConnection = null;
    }

    usingFallback = true;

    // Create fallback connection
    fallbackConnection = createFallbackConnection(
      handleMessage,
      handleFallbackDisconnect,
    );

    // Update the active connection reference
    activeConnections.set(tabId, {
      close: closeAllConnections,
      send: (msg) => sendMessage(msg),
      isFallback: true,
    });

    // Send any pending messages
    for (const msg of pendingMessages) {
      fallbackConnection.send(msg);
    }
    pendingMessages = [];

    // Start checking for ethui app availability
    startAppCheck();
  };

  /**
   * Handle app connection disconnect
   */
  const handleAppDisconnect = () => {
    log.debug("[AppConnection] Disconnected, attempting fallback");
    switchToFallbackConnection();
  };

  /**
   * Handle fallback connection disconnect
   */
  const handleFallbackDisconnect = () => {
    log.debug("[FallbackConnection] Disconnected");
    setConnectionState("disconnected");

    // Try to reconnect (prefer app, then fallback)
    setTimeout(() => {
      if (!appConnection?.isConnected() && !fallbackConnection?.isConnected()) {
        initializeConnection();
      }
    }, 1000);
  };

  /**
   * Initialize connection - try app first, then fallback
   */
  const initializeConnection = async () => {
    if (isInitializing) return;
    isInitializing = true;

    try {
      // First, try the ethui app
      const appAvailable = await checkAppAvailable(settings);
      if (appAvailable) {
        log.debug("[Connection] ethui app is available, connecting");
        appConnection = createAppConnection(
          settings,
          port,
          handleMessage,
          handleAppDisconnect,
        );

        // Update the active connection reference
        activeConnections.set(tabId, {
          close: closeAllConnections,
          send: (msg) => sendMessage(msg),
          isFallback: false,
        });

        // Send any pending messages
        for (const msg of pendingMessages) {
          appConnection.send(msg);
        }
        pendingMessages = [];
      } else {
        // Try fallback
        await switchToFallbackConnection();
      }
    } finally {
      isInitializing = false;
    }
  };

  /**
   * Send message through the active connection
   */
  const sendMessage = (msg: string) => {
    if (usingFallback && fallbackConnection) {
      fallbackConnection.send(msg);
    } else if (appConnection) {
      appConnection.send(msg);
    } else {
      // Queue message while initializing
      pendingMessages.push(msg);
      initializeConnection();
    }
  };

  const closeAllConnections = () => {
    stopAppCheck();
    appConnection?.close();
    fallbackConnection?.close();
    appConnection = null;
    fallbackConnection = null;
    pendingMessages = [];
  };

  // Register this connection for settings change handling
  activeConnections.set(tabId, {
    close: closeAllConnections,
    send: sendMessage,
    isFallback: false,
  });

  // forwarding incoming stream data to the active connection
  port.onMessage.addListener((data) => {
    const req = data as Request;
    if (req.id) {
      reqs.set(req.id as number, req);
    }

    const msg = JSON.stringify(data);
    sendMessage(msg);

    notifyDevtools(tabId, "request", data);
  });

  port.onDisconnect.addListener(() => {
    log.debug("port disconnected");
    closeAllConnections();
    activeConnections.delete(tabId);
  });
}
