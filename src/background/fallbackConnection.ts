/**
 * Fallback WebSocket connection handler.
 *
 * When the ethui desktop app is unavailable, this module provides a fallback
 * connection to a local Ethereum node at ws://localhost:8545 (standard JSON-RPC
 * WebSocket port).
 *
 * The fallback is transparent to the page - requests are proxied in the same
 * format as they would be to the ethui app.
 */

import log from "loglevel";
import { ArrayQueue, WebsocketBuilder } from "websocket-ts";
import { setConnectionState } from "./connectionState";

const FALLBACK_ENDPOINT = "ws://localhost:8545";

export type MessageHandler = (data: unknown) => void;

export interface FallbackConnectionResult {
  send: (msg: string) => void;
  close: () => void;
  isConnected: () => boolean;
  isConnecting: () => boolean;
}

/**
 * Creates a fallback connection to a local Ethereum node.
 *
 * @param onMessage - Handler for incoming messages
 * @param onDisconnect - Handler called when connection is lost
 * @returns Connection control object
 */
export function createFallbackConnection(
  onMessage: MessageHandler,
  onDisconnect: () => void,
): FallbackConnectionResult {
  let ws: ReturnType<typeof WebsocketBuilder.prototype.build> | undefined;
  let isConnectingFlag = false;
  let intentionalClose = false;
  let queue: string[] = [];

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
    log.debug(
      `[FallbackConnection] Initializing connection to ${FALLBACK_ENDPOINT}`,
    );

    ws = new WebsocketBuilder(FALLBACK_ENDPOINT)
      .onOpen(() => {
        log.debug("[FallbackConnection] Connection opened");
        isConnectingFlag = false;
        setConnectionState("connected", "fallback");

        // Flush queue
        while (queue.length > 0) {
          const msg = queue.shift()!;
          ws!.send(msg);
        }
      })
      .onClose(() => {
        log.debug("[FallbackConnection] Connection closed");
        ws = undefined;
        isConnectingFlag = false;

        if (intentionalClose) {
          intentionalClose = false;
          return;
        }

        onDisconnect();
      })
      .onError((e) => {
        log.error("[FallbackConnection] Error:", e);
        isConnectingFlag = false;
        if (!intentionalClose) {
          onDisconnect();
        }
      })
      .withBuffer(new ArrayQueue())
      .onMessage((_ins, event) => {
        // Standard JSON-RPC nodes don't send ping, but handle it just in case
        if (event.data === "ping") {
          log.debug("[FallbackConnection] ping");
          ws!.send("pong");
          return;
        }
        log.debug("[FallbackConnection] message", event.data);
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
 * Checks if the fallback endpoint is available.
 *
 * @returns Promise that resolves to true if fallback is available
 */
export function checkFallbackAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(FALLBACK_ENDPOINT);
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
 * Returns the fallback endpoint URL.
 */
export function getFallbackEndpoint(): string {
  return FALLBACK_ENDPOINT;
}
