import { useCallback, useEffect, useState } from "react";
import { runtime } from "webextension-polyfill";

export type ConnectionState = "connected" | "disconnected" | "unknown";

export function useConnectionState() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("unknown");

  const checkConnection = useCallback(() => {
    runtime
      .sendMessage({ type: "check-connection" })
      .then((response: unknown) => {
        const msg = response as { state?: ConnectionState };
        if (msg?.state) {
          setConnectionState(msg.state);
        }
      })
      .catch(() => {
        setConnectionState("unknown");
      });
  }, []);

  // Initial fetch and listen for changes
  useEffect(() => {
    runtime
      .sendMessage({ type: "get-connection-state" })
      .then((response: unknown) => {
        const msg = response as { state?: ConnectionState };
        if (msg?.state) {
          setConnectionState(msg.state);
        }
      })
      .catch(() => {
        setConnectionState("unknown");
      });

    const listener = (message: unknown) => {
      const msg = message as { type?: string; state?: ConnectionState };
      if (msg?.type === "connection-state" && msg?.state) {
        setConnectionState(msg.state);
        // If state was reset to unknown, immediately check connection
        if (msg.state === "unknown") {
          checkConnection();
        }
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, [checkConnection]);

  // Poll for connection changes
  // Poll frequently when disconnected (to detect app startup quickly),
  // but slowly when connected (disconnection is detected immediately via WebSocket onClose)
  useEffect(() => {
    if (connectionState === "unknown") return;

    const pollInterval = connectionState === "disconnected" ? 3000 : 15000;

    const interval = setInterval(() => {
      checkConnection();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [connectionState, checkConnection]);

  return connectionState;
}
