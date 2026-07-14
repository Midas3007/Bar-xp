import { ethers } from "ethers";
import type { AppConfig } from "./config.js";
import type { ChainConfig } from "./chains.js";
import { resolveRpc } from "./chains.js";
import { discoverTokens } from "./discovery.js";
import { ERC20_ABI, readTokenBalance } from "./erc20.js";
import { log, c } from "./logger.js";

// Gas limit for a plain native-value transfer. Token transfers are estimated.
const NATIVE_TRANSFER_GAS = 21000n;
// Multiplier (as basis points) applied to estimated gas cost for headroom.
const GAS_BUFFER_BPS = 130n; // 1.30x

export interface SweepStats {
  tokenTransfers: number;
  nativeSweeps: number;
  skipped: number;
  errors: number;
}

function txLink(chain: ChainConfig, hash: string): string {
  return chain.explorerTx ? `${chain.explorerTx}${hash}` : hash;
}

async function feePerGas(provider: ethers.Provider): Promise<bigint> {
  const fee = await provider.getFeeData();
  const p = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  return p > 0n ? p : ethers.parseUnits("1", "gwei");
}

export async function sweepChain(
  chain: ChainConfig,
  cfg: AppConfig,
  stats: SweepStats,
): Promise<void> {
  const rpc = resolveRpc(chain, process.env);
  const provider = new ethers.JsonRpcProvider(rpc, chain.chainId, {
    staticNetwork: true,
  });

  // Confirm the RPC actually serves this chain before doing anything. Use a
  // real request (getBlockNumber) as a liveness probe — with staticNetwork set,
  // getNetwork() would answer from config without ever touching the network.
  try {
    const [net] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
    if (Number(net.chainId) !== chain.chainId) {
      log.err(`${chain.name}: RPC reports chainId ${net.chainId}, expected ${chain.chainId}. Skipping.`);
      stats.errors++;
      return;
    }
  } catch (e) {
    log.err(`${chain.name}: cannot reach RPC (${rpc}) — ${(e as Error).message}`);
    stats.errors++;
    return;
  }

  log.header(`━━ ${chain.name} (${chain.nativeSymbol}) ━━`);

  const reserveWei = ethers.parseEther(cfg.nativeGasReserve);
  const minTokenRaw = cfg.minTokenAmount;

  for (const pk of cfg.privateKeys) {
    const signer = new ethers.Wallet(pk, provider);
    const from = await signer.getAddress();

    if (from.toLowerCase() === cfg.destination.toLowerCase()) {
      log.dim(`  ${from}  → is the destination, skipping.`);
      continue;
    }

    log.step(`Wallet ${from}`);

    // --- ERC-20 tokens -------------------------------------------------------
    const candidates = await discoverTokens(chain, from, {
      alchemyApiKey: cfg.alchemyApiKey,
      tokenList: cfg.tokenLists[chain.key] ?? [],
    });

    for (const tokenAddr of candidates) {
      const bal = await readTokenBalance(tokenAddr, from, provider);
      if (!bal) continue;
      if (bal.raw === 0n) continue;

      if (minTokenRaw !== "0") {
        const minRaw = ethers.parseUnits(minTokenRaw, bal.decimals);
        if (bal.raw < minRaw) {
          log.dim(`    · ${bal.symbol}: ${bal.formatted} below MIN_TOKEN_AMOUNT, skipping`);
          continue;
        }
      }

      const line = `${bal.symbol} ${bal.formatted} → ${cfg.destination}`;
      if (!cfg.execute) {
        log.raw(`    ${c.yellow("[dry-run]")} would send ${line}`);
        stats.tokenTransfers++;
        continue;
      }

      try {
        const token = new ethers.Contract(bal.address, ERC20_ABI, signer);
        const tx = await token.transfer(cfg.destination, bal.raw);
        log.raw(`    ${c.cyan("sent")} ${line}`);
        log.dim(`      ${txLink(chain, tx.hash)}`);
        await tx.wait(1);
        stats.tokenTransfers++;
      } catch (e) {
        log.err(`    ${bal.symbol}: transfer failed — ${(e as Error).message}`);
        stats.errors++;
      }
    }

    // --- Native gas token ----------------------------------------------------
    if (!cfg.sweepNative) continue;

    try {
      const balance = await provider.getBalance(from);
      if (balance === 0n) {
        log.dim(`    · native ${chain.nativeSymbol}: 0, nothing to sweep`);
        continue;
      }

      const price = await feePerGas(provider);
      const gasCost = (NATIVE_TRANSFER_GAS * price * GAS_BUFFER_BPS) / 100n;
      const sendable = balance - gasCost - reserveWei;

      if (sendable <= 0n) {
        log.dim(
          `    · native ${chain.nativeSymbol}: ${ethers.formatEther(balance)} — too low after gas + reserve, skipping`,
        );
        continue;
      }

      const line = `${ethers.formatEther(sendable)} ${chain.nativeSymbol} → ${cfg.destination}`;
      if (!cfg.execute) {
        log.raw(`    ${c.yellow("[dry-run]")} would sweep ${line}`);
        stats.nativeSweeps++;
        continue;
      }

      const tx = await signer.sendTransaction({
        to: cfg.destination,
        value: sendable,
      });
      log.raw(`    ${c.cyan("sent")} ${line}`);
      log.dim(`      ${txLink(chain, tx.hash)}`);
      await tx.wait(1);
      stats.nativeSweeps++;
    } catch (e) {
      log.err(`    native ${chain.nativeSymbol} sweep failed — ${(e as Error).message}`);
      stats.errors++;
    }
  }
}
