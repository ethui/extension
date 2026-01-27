import log from "loglevel";
import { action, type Runtime, runtime, storage } from "webextension-polyfill";
import { ArrayQueue, WebsocketBuilder } from "websocket-ts";

import {
  defaultSettings,
  getEndpoint,
  loadSettings,
  type Settings,
} from "#/settings";
import {
  resetConnectionState,
  setConnectionState,
  setupConnectionStateListener,
} from "./connectionState";
import { startHeartbeat } from "./heartbeat";

// init on load
(async () => init())();

let settings: Settings = defaultSettings;

// Track active connections for settings change handling
const activeConnections: Map<number, { close: () => void }> = new Map();

/**
 * Loads the current settings, and listens for incoming connections (from the injected contentscript)
 */
function updateIcon(devMode: boolean) {
  const color = devMode ? "purple" : "black";
  action.setIcon({
    path: {
      16: `/icons/ethui-${color}-16.png`,
      48: `/icons/ethui-${color}-48.png`,
      96: `/icons/ethui-${color}-96.png`,
      128: `/icons/ethui-${color}-128.png`,
    },
  });
}

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
 * The stream data is attached to a WebsocketConnection to server run by the ethui desktop app
 *
 * The WS connection is created lazily (when the first data packet is sent).
 * This behaviour prevents initiating connections for browser tabs where `window.ethereum` is not actually used
 */
function setupProviderConnection(port: Runtime.Port) {
  log.debug("setupProviderConnection", port.name);
  const tab = port.sender!.tab!;
  const tabId = tab.id!;
  const url = tab.url;

  notifyDevtools(tabId, "start");

  type Request = { id: number; method: string; params?: unknown };
  const reqs: Map<Request["id"], Request> = new Map();

  let queue: string[] = [];
  let ws: ReturnType<typeof WebsocketBuilder.prototype.build> | undefined;
  let isConnecting = false;
  let intentionalClose = false;

  const closeWebSocket = () => {
    if (ws) {
      intentionalClose = true;
      ws.close();
      ws = undefined;
    }
    isConnecting = false;
  };

  // Register this connection for settings change handling
  activeConnections.set(tabId, { close: closeWebSocket });

  const initWebSocket = () => {
    if (ws || isConnecting) return;

    isConnecting = true;
    log.debug(`Initializing WS connection for ${url}`);

    ws = new WebsocketBuilder(endpoint(port))
      .onOpen(() => {
        log.debug(`WS connection opened (${url})`);
        isConnecting = false;
        setConnectionState("connected");

        // flush queue
        while (queue.length > 0) {
          const msg = queue.shift()!;
          ws!.send(msg);
        }
      })
      .onClose(() => {
        log.debug(`WS connection closed (${url})`);
        ws = undefined;
        isConnecting = false;

        if (intentionalClose) {
          // Settings change - don't reconnect, don't set disconnected state
          intentionalClose = false;
          return;
        }

        setConnectionState("disconnected");
        // Auto-retry after 1 second with current endpoint
        setTimeout(() => {
          if (!ws && !isConnecting) {
            log.debug("Attempting to reconnect...");
            initWebSocket();
          }
        }, 1000);
      })
      .onError((e) => {
        log.error("[WS] error:", e);
        isConnecting = false;
        if (!intentionalClose) {
          setConnectionState("disconnected");
        }
      })
      .withBuffer(new ArrayQueue())
      .onMessage((_ins, event) => {
        if (event.data === "ping") {
          log.debug("[ws] ping");
          ws!.send("pong");
          return;
        }
        log.debug("WS message", event.data);
        // forward WS server messages back to the stream (content script)
        const resp = JSON.parse(event.data);
        port.postMessage(resp);

        const req = reqs.get(resp.id);
        const logRequest = req?.params
          ? [req?.method, req?.params]
          : [req?.method];
        const fn = resp.error ? log.error : log.debug;
        fn(...logRequest, resp.error || resp.result);
        notifyDevtools(tabId, "response", resp);
      })
      .build();
  };

  // forwarding incoming stream data to the WS server
  port.onMessage.addListener((data) => {
    const req = data as Request;
    if (req.id) {
      reqs.set(req.id as number, req);
    }

    const msg = JSON.stringify(data);

    // Initialize WebSocket on first message if not already done
    if (!ws && !isConnecting) {
      initWebSocket();
    }

    // Queue message if WS is not ready, otherwise send directly
    if (!ws || isConnecting) {
      queue.push(msg);
    } else {
      ws.send(msg);
    }

    notifyDevtools(tabId, "request", data);
  });

  port.onDisconnect.addListener(() => {
    log.debug("port disconnected");
    closeWebSocket();
    activeConnections.delete(tabId);
    queue = [];
  });
}

/**
 * The URL of the ethui server based on current settings, with connection metadata being appended as URL params
 */
function endpoint(port: Runtime.Port) {
  return `${getEndpoint(settings)}?${connParams(port)}`;
}

/**
 * URL-encoded connection info
 *
 * This includes all info that may be useful for the ethui server.
 */
function connParams(port: Runtime.Port) {
  const sender = port.sender;
  const tab = sender?.tab;

  const params: Record<string, string | undefined> = {
    origin: (port.sender as unknown as { origin: string }).origin,
    url: tab?.url,
    title: tab?.title,
  };

  return encodeUrlParams(params);
}

/**
 * URL-encode a set of params
 */
function encodeUrlParams(p: Record<string, string | undefined>) {
  const filtered: Record<string, string> = Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  return Object.entries(filtered)
    .map((kv) => kv.map(encodeURIComponent).join("="))
    .join("&");
}
