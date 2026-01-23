import { Button } from "@ethui/ui/components/shadcn/button";
import { cn } from "@ethui/ui/lib/utils";
import { Copy, Check } from "lucide-react";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as chains from "viem/chains";
import { runtime } from "webextension-polyfill";

import "./styles.css";

type ConnectionState = "connected" | "disconnected" | "unknown";

interface WalletInfo {
  accounts: string[];
  chainId: string;
  balance: string;
}

// Build a map of chain ID to name from viem's chains
const CHAIN_NAMES: Record<number, string> = Object.values(chains).reduce(
  (acc, chain) => {
    if (typeof chain === "object" && "id" in chain && "name" in chain) {
      acc[chain.id] = chain.name;
    }
    return acc;
  },
  {} as Record<number, string>,
);

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatBalance(balanceHex: string): string {
  try {
    const wei = BigInt(balanceHex);
    const eth = Number(wei) / 1e18;
    if (eth === 0) return "0 ETH";
    if (eth < 0.0001) return "<0.0001 ETH";
    return `${eth.toFixed(4)} ETH`;
  } catch {
    return "0 ETH";
  }
}

function getChainName(chainId: string): string {
  const id = parseInt(chainId, 16);
  return CHAIN_NAMES[id] || `Chain ${id}`;
}

function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("unknown");
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const copyAddress = async () => {
    if (walletInfo?.accounts[0]) {
      await navigator.clipboard.writeText(walletInfo.accounts[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (connectionState === "connected") {
    const address = walletInfo?.accounts[0];
    const chainId = walletInfo?.chainId;
    const balance = walletInfo?.balance;

    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium text-green-500 text-sm">Connected</span>
          {chainId && (
            <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground text-xs">
              {getChainName(chainId)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-4 text-center text-muted-foreground text-sm">
            Loading wallet info...
          </div>
        ) : address ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="mb-1 text-muted-foreground text-xs">Address</div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">
                  {truncateAddress(address)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={copyAddress}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {balance && (
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="mb-1 text-muted-foreground text-xs">Balance</div>
                <div className="font-medium text-sm">{formatBalance(balance)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-center text-muted-foreground text-sm">
            No wallet connected
          </div>
        )}
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
        {connectionState === "disconnected" ? "Not Connected" : "Checking..."}
      </div>
      {connectionState === "disconnected" && (
        <>
          <p className="mb-4 text-muted-foreground text-sm">
            The ethui desktop app doesn't appear to be running.
          </p>
          <Button asChild>
            <a href="https://ethui.dev" target="_blank" rel="noopener noreferrer">
              Get ethui Desktop
            </a>
          </Button>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
