import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ConnectedView } from "./components/ConnectedView";
import { DisconnectedView } from "./components/DisconnectedView";
import { useConnectionState } from "./hooks/useConnectionState";
import { useWalletInfo } from "./hooks/useWalletInfo";

import "./styles.css";

function App() {
  const connectionState = useConnectionState();
  const { walletInfo, loading } = useWalletInfo(connectionState);

  if (connectionState === "connected") {
    return <ConnectedView walletInfo={walletInfo} loading={loading} />;
  }

  return <DisconnectedView connectionState={connectionState} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
