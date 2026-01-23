import log from "loglevel";
import { type Runtime, runtime } from "webextension-polyfill";
import { ArrayQueue, ConstantBackoff, WebsocketBuilder } from "websocket-ts";

import { defaultSettings, loadSettings, type Settings } from "#/settings";
import { setConnectionState, setupConnectionStateListener } from "./connectionState";
import { startHeartbeat } from "./heartbeat";

// init on load
(async () => init())();

let settings: Settings = defaultSettings;

/**
 * Loads the current settings, and listens for incoming connections (from the injected contentscript)
 */
async function init() {
  startHeartbeat();
  settings = await loadSettings();
  log.setLevel(settings.logLevel);

  setupConnectionStateListener();

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
        setConnectionState("disconnected");
      })
      .onReconnect(() => {
        log.debug("WS connection reconnected");
        setConnectionState("connected");
      })
      .onError((e) => {
        log.error("[WS] error:", e);
        isConnecting = false;
        setConnectionState("disconnected");
      })
      .withBuffer(new ArrayQueue())
      .withBackoff(new ConstantBackoff(1000))
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
    if (ws) {
      ws.close();
      ws = undefined;
    }
    queue = [];
  });
}

/**
 * The URL of the ethui server if given from the settings, with connection metadata being appended as URL params
 */
function endpoint(port: Runtime.Port) {
  return `${settings.endpoint}?${connParams(port)}`;
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
