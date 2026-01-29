import { useCallback, useEffect, useState } from "react";
import { runtime } from "webextension-polyfill";

export type ConnectionState = "connected" | "disconnected" | "unknown";
export type ConnectionSource = "app" | "fallback" | null;

interface ConnectionInfo {
  state: ConnectionState;
  source: ConnectionSource;
}

export function useConnectionState(): ConnectionInfo {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("unknown");
  const [connectionSource, setConnectionSource] =
    useState<ConnectionSource>(null);

  const checkConnection = useCallback(() => {
    runtime
      .sendMessage({ type: "check-connection" })
      .then((response: unknown) => {
        const msg = response as {
          state?: ConnectionState;
          source?: ConnectionSource;
        };
        if (msg?.state) {
          setConnectionState(msg.state);
          setConnectionSource(msg.source ?? null);
        }
      })
      .catch(() => {
        setConnectionState("unknown");
        setConnectionSource(null);
      });
  }, []);

  // Initial fetch and listen for changes
  useEffect(() => {
    runtime
      .sendMessage({ type: "get-connection-state" })
      .then((response: unknown) => {
        const msg = response as {
          state?: ConnectionState;
          source?: ConnectionSource;
        };
        if (msg?.state) {
          setConnectionState(msg.state);
          setConnectionSource(msg.source ?? null);
        }
      })
      .catch(() => {
        setConnectionState("unknown");
        setConnectionSource(null);
      });

    const listener = (message: unknown) => {
      const msg = message as {
        type?: string;
        state?: ConnectionState;
        source?: ConnectionSource;
      };
      if (msg?.type === "connection-state" && msg?.state) {
        setConnectionState(msg.state);
        setConnectionSource(msg.source ?? null);
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

  return { state: connectionState, source: connectionSource };
}
