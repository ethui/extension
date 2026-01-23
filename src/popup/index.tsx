import { Button } from "@ethui/ui/components/shadcn/button";
import { cn } from "@ethui/ui/lib/utils";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { runtime } from "webextension-polyfill";

import "./styles.css";

type ConnectionState = "connected" | "disconnected" | "unknown";

interface ConnectionMessage {
  type: "connection-state";
  state: ConnectionState;
}

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("unknown");

  useEffect(() => {
    runtime
      .sendMessage({ type: "get-connection-state" })
      .then((response: unknown) => {
        const msg = response as ConnectionMessage;
        if (msg?.state) {
          setConnectionState(msg.state);
        }
      })
      .catch(() => {
        setConnectionState("unknown");
      });

    const listener = (message: unknown) => {
      const msg = message as ConnectionMessage;
      if (msg?.type === "connection-state" && msg?.state) {
        setConnectionState(msg.state);
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, []);

  if (connectionState === "connected") {
    return (
      <div className="p-5 text-center">
        <div className="mb-2 font-bold text-green-500 text-lg">Connected</div>
        <p className="text-muted-foreground text-sm">
          ethui desktop app is running
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 text-center">
      <div
        className={cn(
          "mb-2 font-bold text-lg",
          connectionState === "disconnected"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {connectionState === "disconnected" ? "Not Connected" : "Loading..."}
      </div>
      <p className="mb-4 text-muted-foreground text-sm">
        The ethui desktop app doesn't appear to be running.
      </p>
      <Button asChild>
        <a href="https://ethui.dev" target="_blank" rel="noopener noreferrer">
          Get ethui Desktop
        </a>
      </Button>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
