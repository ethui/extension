import * as chains from "viem/chains";

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

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatBalance(balanceHex: string): string {
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

export function getChainName(chainId: string): string {
  const id = parseInt(chainId, 16);
  return CHAIN_NAMES[id] || `Chain ${id}`;
}
