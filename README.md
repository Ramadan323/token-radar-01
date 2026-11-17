# Token Radar — make.fun token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Ramadan323/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Ramadan323/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, ranks the ones that
record no token by the implied value of a token they have not issued yet, and hands in a static
dashboard a reader can use — a sortable, filterable board, a detail view for every protocol with
the model's own arithmetic and a seven-step farm plan, a live-token view, and the model's
calibration.

## The model (radar-2)

```
implied = TVL × 0.25 × category × chains × growth × maturity
```

- **Base 0.25** is the market's own multiple: the median mcap/TVL of the snapshot's live-token
  protocols (measured 0.246 over 119 of them), not a chosen number.
- **Category** is the live median mcap/TVL for the protocol's category over the global median,
  shrunk by n/(n+5) and clamped to [0.6, 1.6]; a category with fewer than 3 live protocols stays
  at 1.00. It is recomputed from the snapshot on every run — no name is ever special-cased.
- **Chains** is 1 + 0.015 × min(chains, 10), a small credit for multi-chain reach.
- **Growth** is 1 + clamp(7-day %, −60, +120) / 100 × 0.5.
- **Maturity** is 0.6 + min(age, 1095) / 1095 × 0.4 (unknown age: 365 days).

The board covers all 40 watchlist protocols (TVL ≥ $50M, no token) and adds the 160 largest
pre-token protocols below the floor — 200 rows. Rank 1 is Steakhouse Financial at $625,181,492
of implied value. The 24 live-token protocols are shown apart, at the market's own value, and
they calibrate the model instead of competing with it.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22 or later, standard library only. It writes `out/board.json`, `out/data.js`,
`out/dashboard/`, `out/screenshots/` and `out/dossier.json`.

Entered in make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC).
