/**
 * Main ethui app WebSocket connection handler.
 *
 * This module handles the primary connection to the ethui desktop application.
 * When the ethui app is running, all Ethereum JSON-RPC requests are proxied
 * through this connection.
 */

import log from "loglevel";
import type { Runtime } from "webextension-polyfill";
import { ArrayQueue, WebsocketBuilder } from "websocket-ts";
import { getEndpoint, type Settings } from "#/settings";
import { setConnectionState } from "./connectionState";

export type MessageHandler = (data: unknown) => void;
export type DisconnectHandler = () => void;

export interface AppConnectionResult {
  send: (msg: string) => void;
  close: () => void;
  isConnected: () => boolean;
  isConnecting: () => boolean;
}

/**
 * Creates a connection to the ethui desktop app.
 *
 * @param settings - Current extension settings
 * @param port - The runtime port for connection metadata
 * @param onMessage - Handler for incoming messages from the ethui app
 * @param onDisconnect - Handler called when connection is lost (for fallback switching)
 * @returns Connection control object
 */
export function createAppConnection(
  settings: Settings,
  port: Runtime.Port,
  onMessage: MessageHandler,
  onDisconnect: DisconnectHandler,
): AppConnectionResult {
  let ws: ReturnType<typeof WebsocketBuilder.prototype.build> | undefined;
  let isConnectingFlag = false;
  let intentionalClose = false;
  let queue: string[] = [];

  const tab = port.sender?.tab;
  const url = tab?.url ?? "unknown";

  const endpoint = buildEndpoint(settings, port);

  const close = () => {
    if (ws) {
      intentionalClose = true;
      ws.close();
      ws = undefined;
    }
    isConnectingFlag = false;
    queue = [];
  };

  const initWebSocket = () => {
    if (ws || isConnectingFlag) return;

    isConnectingFlag = true;
    log.debug(`[AppConnection] Initializing WS connection for ${url}`);

    ws = new WebsocketBuilder(endpoint)
      .onOpen(() => {
        log.debug(`[AppConnection] WS connection opened (${url})`);
        isConnectingFlag = false;
        setConnectionState("connected", "app");

        // Flush queue
        while (queue.length > 0) {
          const msg = queue.shift()!;
          ws!.send(msg);
        }
      })
      .onClose(() => {
        log.debug(`[AppConnection] WS connection closed (${url})`);
        ws = undefined;
        isConnectingFlag = false;

        if (intentionalClose) {
          intentionalClose = false;
          return;
        }

        // Notify parent about disconnection for fallback handling
        onDisconnect();
      })
      .onError((e) => {
        log.error("[AppConnection] WS error:", e);
        isConnectingFlag = false;
        if (!intentionalClose) {
          // Don't set disconnected here - let onDisconnect handler decide
          onDisconnect();
        }
      })
      .withBuffer(new ArrayQueue())
      .onMessage((_ins, event) => {
        if (event.data === "ping") {
          log.debug("[AppConnection] ping");
          ws!.send("pong");
          return;
        }
        log.debug("[AppConnection] message", event.data);
        onMessage(JSON.parse(event.data));
      })
      .build();
  };

  const send = (msg: string) => {
    if (!ws && !isConnectingFlag) {
      initWebSocket();
    }

    if (!ws || isConnectingFlag) {
      queue.push(msg);
    } else {
      ws.send(msg);
    }
  };

  return {
    send,
    close,
    isConnected: () => !!ws && !isConnectingFlag,
    isConnecting: () => isConnectingFlag,
  };
}

/**
 * Checks if the ethui app is available at the given endpoint.
 *
 * @param settings - Current extension settings
 * @returns Promise that resolves to true if app is available
 */
export function checkAppAvailable(settings: Settings): Promise<boolean> {
  const endpoint = getEndpoint(settings);

  return new Promise((resolve) => {
    const ws = new WebSocket(endpoint);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 2000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      ws.close();
      resolve(false);
    };
  });
}

/**
 * Builds the WebSocket endpoint URL with connection metadata.
 */
function buildEndpoint(settings: Settings, port: Runtime.Port): string {
  const base = getEndpoint(settings);
  const params = buildConnParams(port);
  return `${base}?${params}`;
}

/**
 * URL-encoded connection info for the ethui server.
 */
function buildConnParams(port: Runtime.Port): string {
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
 * URL-encode a set of params.
 */
function encodeUrlParams(p: Record<string, string | undefined>): string {
  const filtered: Record<string, string> = Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  return Object.entries(filtered)
    .map((kv) => kv.map(encodeURIComponent).join("="))
    .join("&");
}
