import { useEffect, useState } from "react";
import { runtime } from "webextension-polyfill";

import type { ConnectionState } from "./useConnectionState";

export interface WalletInfo {
  accounts: string[];
  chainId: string;
  balance: string;
}

export function useWalletInfo(connectionState: ConnectionState) {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connectionState === "connected") {
      setLoading(true);
      runtime
        .sendMessage({ type: "get-wallet-info" })
        .then((response: unknown) => {
          const msg = response as { info?: WalletInfo };
          if (msg?.info) {
            setWalletInfo(msg.info);
          }
        })
        .catch(() => {
          setWalletInfo(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setWalletInfo(null);
    }
  }, [connectionState]);

  return { walletInfo, loading };
}
