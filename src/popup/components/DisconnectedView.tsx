import { Alert, AlertDescription } from "@ethui/ui/components/shadcn/alert";
import { Button } from "@ethui/ui/components/shadcn/button";
import { CircleX } from "lucide-react";

import type { ConnectionState } from "../hooks/useConnectionState";
import { Header } from "./Header";

interface DisconnectedViewProps {
  connectionState: ConnectionState;
  onExpand?: () => void;
  onSettings: () => void;
  devMode?: boolean;
}

export function DisconnectedView({
  connectionState,
  onExpand,
  onSettings,
  devMode,
}: DisconnectedViewProps) {
  const title =
    connectionState === "disconnected" ? "Not Connected" : "Checking...";

  return (
    <div className="p-4">
      <Header
        title={title}
        devMode={devMode}
        onExpand={onExpand}
        onSettings={onSettings}
      />
      {connectionState === "disconnected" && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <CircleX className="h-4 w-4" />
            <AlertDescription>
              The ethui desktop app doesn't appear to be running.
            </AlertDescription>
          </Alert>
          <Button asChild size="sm">
            <a
              href="https://ethui.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get ethui Desktop
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
