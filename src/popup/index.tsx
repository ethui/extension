import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ConnectedView } from "./components/ConnectedView";
import { DisconnectedView } from "./components/DisconnectedView";
import { useConnectionState } from "./hooks/useConnectionState";

import "./styles.css";

function App() {
  const connectionState = useConnectionState();

  if (connectionState === "connected") {
    return <ConnectedView />;
  }

  return <DisconnectedView connectionState={connectionState} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
