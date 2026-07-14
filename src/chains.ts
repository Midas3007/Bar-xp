/*
 * Chain registry. Add or remove EVM networks here — everything downstream is
 * driven by this table. Public RPCs are provided as convenient defaults but
 * they rate-limit hard; override per chain with RPC_<KEY> in your .env.
 *
 * `alchemyNetwork` is the subdomain Alchemy uses for that chain. It's only
 * needed if you enable Alchemy-based token auto-discovery.
 */

export interface ChainConfig {
  /** Stable lowercase identifier, used in CHAINS and RPC_<KEY> env vars. */
  key: string;
  /** Human-readable name. */
  name: string;
  chainId: number;
  /** Default public RPC. Override with RPC_<KEY>. */
  defaultRpc: string;
  nativeSymbol: string;
  /** Block explorer base (for printing tx links). */
  explorerTx?: string;
  /** Alchemy network subdomain, if the chain is on Alchemy. */
  alchemyNetwork?: string;
}

export const CHAINS: ChainConfig[] = [
  {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    defaultRpc: "https://eth.llamarpc.com",
    nativeSymbol: "ETH",
    explorerTx: "https://etherscan.io/tx/",
    alchemyNetwork: "eth-mainnet",
  },
  {
    key: "base",
    name: "Base",
    chainId: 8453,
    defaultRpc: "https://mainnet.base.org",
    nativeSymbol: "ETH",
    explorerTx: "https://basescan.org/tx/",
    alchemyNetwork: "base-mainnet",
  },
  {
    key: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    defaultRpc: "https://arb1.arbitrum.io/rpc",
    nativeSymbol: "ETH",
    explorerTx: "https://arbiscan.io/tx/",
    alchemyNetwork: "arb-mainnet",
  },
  {
    key: "optimism",
    name: "OP Mainnet",
    chainId: 10,
    defaultRpc: "https://mainnet.optimism.io",
    nativeSymbol: "ETH",
    explorerTx: "https://optimistic.etherscan.io/tx/",
    alchemyNetwork: "opt-mainnet",
  },
  {
    key: "polygon",
    name: "Polygon PoS",
    chainId: 137,
    defaultRpc: "https://polygon-rpc.com",
    nativeSymbol: "POL",
    explorerTx: "https://polygonscan.com/tx/",
    alchemyNetwork: "polygon-mainnet",
  },
  {
    key: "bnb",
    name: "BNB Smart Chain",
    chainId: 56,
    defaultRpc: "https://bsc-dataseed.binance.org",
    nativeSymbol: "BNB",
    explorerTx: "https://bscscan.com/tx/",
    // Alchemy supports BNB on a separate product; leave undefined for now.
  },
];

export function resolveRpc(chain: ChainConfig, env: NodeJS.ProcessEnv): string {
  const override = env[`RPC_${chain.key.toUpperCase()}`];
  return override && override.trim() ? override.trim() : chain.defaultRpc;
}

export function getChain(key: string): ChainConfig | undefined {
  return CHAINS.find((c) => c.key === key.toLowerCase());
}
