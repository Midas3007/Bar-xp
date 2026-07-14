import { ethers } from "ethers";
import type { ChainConfig } from "./chains.js";

/*
 * Token discovery: figure out which ERC-20 contracts a given wallet holds.
 *
 * You cannot enumerate a wallet's tokens from the base JSON-RPC alone, so we
 * combine two sources:
 *   1. Alchemy's `alchemy_getTokenBalances` (if ALCHEMY_API_KEY + supported chain)
 *   2. A static tokens.json list of contract addresses per chain
 *
 * The union of both, de-duplicated, is returned. Actual balances/decimals are
 * read on-chain afterwards (see erc20.ts), so this only needs to surface
 * candidate contract addresses.
 */

async function alchemyTokenAddresses(
  chain: ChainConfig,
  owner: string,
  apiKey: string,
): Promise<string[]> {
  if (!chain.alchemyNetwork) return [];
  const url = `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;

  const addresses: string[] = [];
  let pageKey: string | undefined;

  do {
    const params: unknown[] = [owner, "erc20"];
    if (pageKey) params.push({ pageKey });

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params,
      }),
    });
    if (!res.ok) {
      throw new Error(`Alchemy ${chain.key} HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      error?: { message: string };
      result?: {
        tokenBalances: { contractAddress: string; tokenBalance: string }[];
        pageKey?: string;
      };
    };
    if (json.error) throw new Error(`Alchemy ${chain.key}: ${json.error.message}`);

    for (const tb of json.result?.tokenBalances ?? []) {
      // Skip zero balances up front to avoid pointless on-chain reads.
      if (tb.tokenBalance && BigInt(tb.tokenBalance) > 0n) {
        addresses.push(ethers.getAddress(tb.contractAddress));
      }
    }
    pageKey = json.result?.pageKey;
  } while (pageKey);

  return addresses;
}

export async function discoverTokens(
  chain: ChainConfig,
  owner: string,
  opts: { alchemyApiKey: string | null; tokenList: string[] },
): Promise<string[]> {
  const set = new Set<string>();

  for (const addr of opts.tokenList) {
    if (ethers.isAddress(addr)) set.add(ethers.getAddress(addr));
  }

  if (opts.alchemyApiKey && chain.alchemyNetwork) {
    try {
      for (const addr of await alchemyTokenAddresses(chain, owner, opts.alchemyApiKey)) {
        set.add(addr);
      }
    } catch (e) {
      // Non-fatal: fall back to whatever the static list gave us.
      console.log(`  (token auto-discovery failed on ${chain.key}: ${(e as Error).message})`);
    }
  }

  return [...set];
}
