#!/usr/bin/env -S npx tsx
import { loadConfig } from "./config.js";
import { sweepChain, type SweepStats } from "./sweep.js";
import { log, c } from "./logger.js";

function printBanner(): void {
  log.raw(c.b("\nbar-xp · wallet consolidation"));
  log.dim("Sweeps ERC-20 tokens + leftover native gas from your wallets into one.\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printBanner();
    log.raw(`Usage:
  npm run dry-run      Preview every transfer without broadcasting (default)
  npm run execute      Actually send the transactions (real funds move!)
  npm run sweep -- --execute   Same as above

Config lives in .env (copy from .env.example). Optional tokens.json lists
token contract addresses per chain for wallets you sweep without Alchemy.
`);
    return;
  }

  printBanner();

  let cfg;
  try {
    cfg = loadConfig(argv);
  } catch (e) {
    log.err((e as Error).message);
    log.dim("Fix your .env (see .env.example) and try again.");
    process.exitCode = 1;
    return;
  }

  log.info(`Destination : ${c.green(cfg.destination)}`);
  log.info(`Source wallets: ${cfg.privateKeys.length}`);
  log.info(`Chains      : ${cfg.chains.map((c2) => c2.name).join(", ")}`);
  log.info(
    `Token discovery: ${cfg.alchemyApiKey ? "Alchemy + tokens.json" : Object.keys(cfg.tokenLists).length ? "tokens.json only" : c.yellow("none (native only)")}`,
  );

  if (cfg.execute) {
    log.warn("\nEXECUTE MODE — this will broadcast real transactions and move funds.");
  } else {
    log.raw(`\n${c.yellow("DRY RUN")} — no transactions will be sent. Add ${c.b("--execute")} to broadcast.`);
  }

  const stats: SweepStats = {
    tokenTransfers: 0,
    nativeSweeps: 0,
    skipped: 0,
    errors: 0,
  };

  for (const chain of cfg.chains) {
    try {
      await sweepChain(chain, cfg, stats);
    } catch (e) {
      log.err(`${chain.name}: unexpected error — ${(e as Error).message}`);
      stats.errors++;
    }
  }

  log.header("━━ Summary ━━");
  const verb = cfg.execute ? "sent" : "planned";
  log.info(`Token transfers ${verb}: ${c.b(String(stats.tokenTransfers))}`);
  log.info(`Native sweeps ${verb}  : ${c.b(String(stats.nativeSweeps))}`);
  if (stats.errors) log.err(`Errors: ${stats.errors}`);
  if (!cfg.execute) {
    log.raw(`\nLooks right? Re-run with ${c.b("npm run execute")} to move the funds.`);
  } else {
    log.ok("Done.");
  }
}

main().catch((e) => {
  log.err(`Fatal: ${(e as Error).message}`);
  process.exitCode = 1;
});
