# bar-xp — wallet consolidation

Scrape all your EVM wallets for tokens and sweep them into **one** destination
wallet. Built for the moment you need to gather scattered dust across a dozen
wallets and cash out — pairs naturally with Rabby's "sell dust" once everything
lands in a single address.

It moves:

- every **ERC-20** balance it can find, then
- the **leftover native gas token** (ETH/POL/BNB), minus a reserve so the
  wallet can still pay for its own sweep tx.

Across as many EVM chains as you configure. **Dry-run by default** — it shows
you exactly what it would move and only broadcasts when you pass `--execute`.

> ⚠️ This is for wallets **you control** (you hold the private keys). It signs
> and sends normal transfers from each source wallet. It is not, and cannot be,
> used against wallets you don't have the keys for.

---

## Safety model

- Private keys are read from a **gitignored `.env`** and never leave your
  machine — no key, seed, or RPC response is sent anywhere except the RPC/
  discovery endpoints you configure.
- **Dry-run is the default.** Nothing is broadcast until you explicitly add
  `--execute`.
- Native sweeps always leave a configurable gas reserve behind so a transfer
  can't strand the wallet.
- `.gitignore` already blocks `.env`, `*.key`, `keys.txt`, `wallets.json`.

Handling raw private keys is inherently risky. Run this on a trusted machine,
and consider using fresh/burner RPC keys.

---

## Setup

```bash
npm install
cp .env.example .env
# edit .env: DESTINATION_ADDRESS, PRIVATE_KEYS, CHAINS, RPCs
```

### Telling it which tokens to move

A wallet's token holdings can't be listed from plain JSON-RPC, so pick one
(or both):

1. **Alchemy (recommended)** — set `ALCHEMY_API_KEY` in `.env`. It
   auto-discovers every ERC-20 balance per wallet on supported chains.
2. **Static list** — `cp tokens.example.json tokens.json` and list the token
   contract addresses per chain.

If you set neither, only the native gas token is swept.

---

## Usage

```bash
npm run dry-run      # preview everything, broadcast nothing (default)
npm run execute      # actually send the transactions — real funds move
npm run -- --help    # options
```

Typical flow: run `dry-run`, eyeball the planned transfers, then `execute`.

---

## Configuration (`.env`)

| Var                  | Meaning                                                        |
| -------------------- | -------------------------------------------------------------- |
| `DESTINATION_ADDRESS`| The one wallet everything is swept into.                       |
| `PRIVATE_KEYS`       | Comma-separated private keys of the source wallets you own.    |
| `CHAINS`             | Comma-separated chain keys (default: all configured).          |
| `RPC_<CHAIN>`        | Per-chain RPC override, e.g. `RPC_ETHEREUM`. Recommended.      |
| `ALCHEMY_API_KEY`    | Enables ERC-20 auto-discovery.                                 |
| `NATIVE_GAS_RESERVE` | Native amount left in each wallet (default `0.0005`).          |
| `MIN_TOKEN_AMOUNT`   | Skip token balances below this whole-token amount.             |
| `SWEEP_NATIVE`       | `true`/`false` — also sweep leftover native gas.               |

Chains live in [`src/chains.ts`](src/chains.ts) — add or remove EVM networks
there. Ships with Ethereum, Base, Arbitrum, Optimism, Polygon, and BNB Chain.

---

## Roadmap

- **Sell-dust swaps**: swap sub-threshold tokens to the native token or a
  stablecoin via a DEX aggregator before/instead of transferring, so tiny
  balances become sellable. `src/sweep.ts` has a clean per-token hook for it.
- Solana / non-EVM support as a separate sweeper.

## Project layout

```
src/
  index.ts      CLI entry + summary
  config.ts     .env + tokens.json loading and validation
  chains.ts     EVM chain registry (edit to add networks)
  discovery.ts  token discovery (Alchemy + static list)
  erc20.ts      ERC-20 read/transfer helpers
  sweep.ts      core per-chain, per-wallet sweep logic
  logger.ts     tiny console logger
```
