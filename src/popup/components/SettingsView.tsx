import { useEffect, useRef, useState } from "react";
import { storage } from "webextension-polyfill";

import { defaultSettings, type Settings } from "#/settings";
import { Header } from "./Header";

interface SettingsViewProps {
  onBack: () => void;
  onExpand?: () => void;
  devMode?: boolean;
}

export function SettingsView({
  onBack,
  onExpand,
  devMode: devModeProp,
}: SettingsViewProps) {
  const [logLevel, setLogLevel] = useState(defaultSettings.logLevel);
  const [devMode, setDevMode] = useState(defaultSettings.devMode);
  const [status, setStatus] = useState("");
  const initialized = useRef(false);

  // Load settings on mount
  useEffect(() => {
    storage.sync.get(defaultSettings).then((items) => {
      setLogLevel(items.logLevel as Settings["logLevel"]);
      setDevMode(items.devMode as boolean);
      initialized.current = true;
    });
  }, []);

  // Auto-save on change
  useEffect(() => {
    if (!initialized.current) return;

    const options: Settings = {
      logLevel: logLevel || defaultSettings.logLevel,
      devMode,
    };

    storage.sync.set(options).then(() => {
      setStatus("Saved");
      setTimeout(() => setStatus(""), 750);
    });
  }, [logLevel, devMode]);

  return (
    <div className="p-4">
      <Header
        title="Settings"
        devMode={devModeProp}
        onBack={onBack}
        onExpand={onExpand}
      />

      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="logLevel" className="text-muted-foreground text-xs">
            Log Level
          </label>
          <select
            id="logLevel"
            value={logLevel}
            onChange={(e) =>
              setLogLevel(e.target.value as Settings["logLevel"])
            }
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="devMode"
            checked={devMode}
            onChange={(e) => setDevMode(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="devMode" className="text-sm">
            Developer Mode
          </label>
        </div>
        {devMode && (
          <p className="text-muted-foreground text-xs">
            Connects to port 9102 instead of 9002. Only enable this if you are
            debugging the extension itself.
          </p>
        )}

        {status && (
          <span className="text-muted-foreground text-xs">{status}</span>
        )}
      </div>
    </div>
  );
}
