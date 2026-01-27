import { Button } from "@ethui/ui/components/shadcn/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { useWalletInfo } from "../hooks/useWalletInfo";
import { formatBalance, getChainName, truncateAddress } from "../utils";
import { Header } from "./Header";

export function ConnectedView() {
  const { walletInfo, loading } = useWalletInfo();
  const [copied, setCopied] = useState(false);

  const address = walletInfo?.accounts[0];
  const chainId = walletInfo?.chainId;
  const balance = walletInfo?.balance;

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4">
      <Header
        title="Connected"
        trailing={
          chainId && (
            <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground text-xs">
              {getChainName(chainId)}
            </span>
          )
        }
      />

      {loading ? (
        <div className="py-4 text-muted-foreground text-sm">
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
              <div className="font-medium text-sm">
                {formatBalance(balance)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-4 text-muted-foreground text-sm">
          No wallet connected
        </div>
      )}
    </div>
  );
}
