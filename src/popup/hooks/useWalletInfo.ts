import { useEffect, useState } from "react";
import { runtime } from "webextension-polyfill";

interface WalletInfo {
  accounts: string[];
  chainId: string;
  balance: string;
}

export function useWalletInfo() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return { walletInfo, loading };
}
