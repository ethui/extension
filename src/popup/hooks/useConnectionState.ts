import { useEffect, useState } from "react";
import { runtime } from "webextension-polyfill";

export type ConnectionState = "connected" | "disconnected" | "unknown";

export function useConnectionState() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("unknown");

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
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, []);

  // Poll for connection changes
  // Poll frequently when disconnected (to detect app startup quickly),
  // but slowly when connected (disconnection is detected immediately via WebSocket onClose)
  useEffect(() => {
    if (connectionState === "unknown") return;

    const pollInterval = connectionState === "disconnected" ? 3000 : 15000;

    const interval = setInterval(() => {
      runtime
        .sendMessage({ type: "check-connection" })
        .then((response: unknown) => {
          const msg = response as { state?: ConnectionState };
          if (msg?.state && msg.state !== connectionState) {
            setConnectionState(msg.state);
          }
        })
        .catch(() => {});
    }, pollInterval);

    return () => clearInterval(interval);
  }, [connectionState]);

  return connectionState;
}
