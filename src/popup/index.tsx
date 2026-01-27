import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { runtime, storage } from "webextension-polyfill";

import { defaultSettings } from "#/settings";
import { ConnectedView } from "./components/ConnectedView";
import { DisconnectedView } from "./components/DisconnectedView";
import { SettingsView } from "./components/SettingsView";
import { useConnectionState } from "./hooks/useConnectionState";

import "./styles.css";

type View = "home" | "settings";

function getInitialView(): View {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  return view === "settings" ? "settings" : "home";
}

// Check if we're in expanded mode (opened in a tab with query params)
const isExpanded = window.location.search.length > 0;

function App() {
  const connectionState = useConnectionState();
  const [view, setView] = useState<View>(getInitialView);
  const [devMode, setDevMode] = useState(defaultSettings.devMode);

  // Load devMode setting and listen for changes
  useEffect(() => {
    storage.sync
      .get(defaultSettings as Record<string, unknown>)
      .then((items) => {
        setDevMode(items.devMode as boolean);
      });

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.devMode?.newValue !== undefined) {
        setDevMode(changes.devMode.newValue as boolean);
      }
    };
    storage.onChanged.addListener(listener);
    return () => storage.onChanged.removeListener(listener);
  }, []);

  const handleExpand = useCallback(() => {
    const url = runtime.getURL(`popup/index.html?view=${view}`);
    window.open(url, "_blank");
  }, [view]);

  const navigate = useCallback((newView: View) => {
    setView(newView);
    const url = new URL(window.location.href);
    if (newView === "home") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", newView);
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handleSettings = useCallback(() => navigate("settings"), [navigate]);
  const handleBack = useCallback(() => navigate("home"), [navigate]);

  // Only show expand button when not already expanded
  const expandHandler = isExpanded ? undefined : handleExpand;

  if (view === "settings") {
    return (
      <SettingsView
        onBack={handleBack}
        onExpand={expandHandler}
        devMode={devMode}
      />
    );
  }

  if (connectionState === "connected") {
    return (
      <ConnectedView
        onExpand={expandHandler}
        onSettings={handleSettings}
        devMode={devMode}
      />
    );
  }

  return (
    <DisconnectedView
      connectionState={connectionState}
      onExpand={expandHandler}
      onSettings={handleSettings}
      devMode={devMode}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
