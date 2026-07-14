import { ethers } from "ethers";

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export interface TokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  raw: bigint;
  formatted: string;
}

/**
 * Read symbol/decimals/balance for a token. Returns null if the contract
 * doesn't behave like an ERC-20 (self-destructed, proxy weirdness, etc.).
 */
export async function readTokenBalance(
  tokenAddress: string,
  owner: string,
  provider: ethers.Provider,
): Promise<TokenBalance | null> {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  try {
    const [raw, decimals, symbol] = await Promise.all([
      token.balanceOf(owner) as Promise<bigint>,
      token.decimals() as Promise<bigint>,
      token.symbol().catch(() => "???") as Promise<string>,
    ]);
    const dec = Number(decimals);
    return {
      address: ethers.getAddress(tokenAddress),
      symbol,
      decimals: dec,
      raw,
      formatted: ethers.formatUnits(raw, dec),
    };
  } catch {
    return null;
  }
}
