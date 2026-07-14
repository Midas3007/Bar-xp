import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { CHAINS, getChain, type ChainConfig } from "./chains.js";

export interface AppConfig {
  destination: string;
  privateKeys: string[];
  chains: ChainConfig[];
  alchemyApiKey: string | null;
  /** Native amount to leave in each source wallet, as a decimal string. */
  nativeGasReserve: string;
  /** Minimum whole-token amount worth transferring, as a decimal string. */
  minTokenAmount: string;
  sweepNative: boolean;
  execute: boolean;
  /** token contract addresses per chain key, from tokens.json (optional). */
  tokenLists: Record<string, string[]>;
}

function req(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function parseKeys(raw: string): string[] {
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (k.startsWith("0x") ? k : `0x${k}`));

  for (const k of keys) {
    try {
      // Validates length + hex; throws on bad input.
      new ethers.Wallet(k);
    } catch {
      throw new Error(
        `A value in PRIVATE_KEYS is not a valid private key (…${k.slice(-6)}).`,
      );
    }
  }
  if (keys.length === 0) throw new Error("PRIVATE_KEYS is empty.");
  return keys;
}

function loadTokenLists(): Record<string, string[]> {
  const path = resolve(process.cwd(), "tokens.json");
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      string[]
    >;
    const out: Record<string, string[]> = {};
    for (const [chainKey, addrs] of Object.entries(parsed)) {
      out[chainKey.toLowerCase()] = (addrs ?? [])
        .filter((a) => ethers.isAddress(a))
        .map((a) => ethers.getAddress(a));
    }
    return out;
  } catch (e) {
    throw new Error(`Failed to parse tokens.json: ${(e as Error).message}`);
  }
}

export function loadConfig(argv: string[]): AppConfig {
  const env = process.env;

  const destinationRaw = req("DESTINATION_ADDRESS", env.DESTINATION_ADDRESS);
  if (!ethers.isAddress(destinationRaw)) {
    throw new Error(`DESTINATION_ADDRESS is not a valid address: ${destinationRaw}`);
  }
  const destination = ethers.getAddress(destinationRaw);

  const privateKeys = parseKeys(req("PRIVATE_KEYS", env.PRIVATE_KEYS));

  const chainKeys = (env.CHAINS?.trim()
    ? env.CHAINS.split(",").map((s) => s.trim()).filter(Boolean)
    : CHAINS.map((c) => c.key));

  const chains: ChainConfig[] = [];
  for (const key of chainKeys) {
    const chain = getChain(key);
    if (!chain) {
      throw new Error(
        `Unknown chain "${key}" in CHAINS. Known: ${CHAINS.map((c) => c.key).join(", ")}`,
      );
    }
    chains.push(chain);
  }

  const boolEnv = (v: string | undefined, def: boolean) =>
    v == null ? def : /^(1|true|yes|on)$/i.test(v.trim());

  return {
    destination,
    privateKeys,
    chains,
    alchemyApiKey: env.ALCHEMY_API_KEY?.trim() || null,
    nativeGasReserve: env.NATIVE_GAS_RESERVE?.trim() || "0.0005",
    minTokenAmount: env.MIN_TOKEN_AMOUNT?.trim() || "0",
    sweepNative: boolEnv(env.SWEEP_NATIVE, true),
    execute: argv.includes("--execute"),
    tokenLists: loadTokenLists(),
  };
}
