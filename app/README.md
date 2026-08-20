# Bar XP — Calisthenics RPG

A fitness tracker that treats training like a character sheet. Log calisthenics
work to earn XP, level up, bank **Bar Coins**, and grow four core stats —
**Strength, Endurance, Aesthetics, Discipline** — that decide your rank.

React 18 · TypeScript · Vite · Tailwind CSS · Firebase (Auth + Firestore) ·
Recharts · Lucide React.

---

## Quick start

```bash
npm install
cp .env.example .env      # fill in your Firebase web config
npm run dev
```

Without a `.env` the app boots to a setup screen listing the missing keys
rather than crashing, so `npm run dev` is useful on a fresh clone.

| Script            | Does                                        |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | Dev server on :5173                         |
| `npm run build`   | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the built bundle                      |
| `npm run typecheck` | `tsc --noEmit`                            |

---

## Firebase setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: enable **Google** and **Email/Password**.
3. **Firestore Database**: create one in production mode.
4. Copy the web app config into `.env` (see `.env.example`). These values are
   public by design — access is controlled by the security rules, not by hiding
   them.
5. Deploy the rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.indexes.json` contains the two composite indexes the history queries
need (`uid` + `createdAt` on `workouts` and `stats_history`). Without them the
Progress view loads empty and the console prints an index-creation link.

---

## Game systems

### Movement access

Movements are graded rather than uniformly level-gated:

| Grade | Access | Examples |
| --- | --- | --- |
| **Foundation** | Open from level 1 | Push-up, Pull-up, Dip, Squat, Plank, Chin-up, Row |
| **Intermediate** | Light level gate (5–8) | Archer push-up, L-sit, Pistol squat, Toes to bar |
| **Elite** | Level 12–20, or a shop unlock | Muscle-up, Front lever, Planche, Human flag, HSPU |

Gating the basics only blocks training, so everything a beginner can reasonably
attempt is available immediately. Every gated movement carries a **progression**
— an ordered set of drills describing how to earn it — which is visible whether
or not the movement is unlocked.

Each movement also carries form cues, common mistakes, a schematic side-view
diagram (inline SVG, so it works offline), and a link to video demos.

### Muscle groups & equipment

Every movement is mapped to primary and secondary muscle groups
(`lib/game/muscles.ts`), and to the equipment it needs. Equipment is bundled
into the setups people actually have — **No equipment**, **Bar only**,
**Power tower**, **Calisthenics park** — which filters the logger, the library
and the routine list in one control.

Logging a session accumulates per-muscle volume on the profile (assisting
muscles at a third weight; four seconds of a hold counts as one rep). That
drives:

- **Muscle ratings**, scored relative to the athlete's own best-trained muscle.
  Absolute targets would be meaningless across experience levels; the useful
  question is which muscles you are neglecting compared to the rest of your body.
- **Structural balance checks** — push/pull, upper/lower, front/back — with the
  ratio ranges that keep shoulders healthy and proportions even.
- **The Physique Lab**, a private section rating eight physique traits with a
  specific next action for each. Collapsed by default, revealed by a local
  toggle. Scores come only from logged data; body-fat guidance stops at healthy
  ranges rather than rewarding ever-lower numbers.

### Levels & XP

Each movement carries an XP-per-unit value (per rep, or per second for holds).
A session's XP is the sum of its entries, with two adjustments:

- **Diminishing returns** — volume past 100 units in one entry is worth 60%, so
  grinding a single movement is never the optimal play.
- **Streak multiplier** — `+3%` per streak day, capped at `+45%`.

Level is **always derived** from lifetime XP (`levelFromTotalXp`) rather than
trusted from the document, so the two can never drift apart. The curve is
`100 · level^1.32 + 20 · level`, capped at level 100.

### Tiers

Rank comes from the **average of the four core stats**:

| Tier | Avg stat | | Tier | Avg stat |
| --- | --- | --- | --- | --- |
| Uninitiated | 0 | | Platinum | 68 |
| Bronze | 12 | | Diamond | 95 |
| Silver | 26 | | Mythic | 130 |
| Gold | 45 | | Legend | 175 |

### Identities & streaks

Consecutive training days map to an identity label:

`0 → Fading` · `1 → Stirring` · `3 → Consistent` · `7 → Disciplined` ·
`15+ → Relentless`

Streaks use **local calendar days** (`YYYY-MM-DD`), not timestamps, so a 23:50
session and a 00:10 session correctly count as two days.

### Background recalculation

`AuthContext` runs a recalculation pass on sign-in, **every hour**, and whenever
the tab regains focus (an hourly timer alone would miss a laptop asleep across
the day boundary). Each pass:

1. Applies **streak decay**. Training today or yesterday is safe. Each fully
   missed day can be bridged by consuming one **Streak Shield**, spent
   automatically. If the gap outruns the shields the streak resets — and the
   shields are *not* spent on a gap they cannot bridge, so they carry over.
2. Recomputes **tier** and **identity**, persisting any drift.

### Economy

Bar Coins come from sessions (`15 + xp/12`) and completed goals. They buy:

- **Streak Shields** (consumable, max 5 held)
- **Name cosmetics** — Neon / Ember / Void gradients, applied to your display
  name everywhere including the leaderboard
- **Movement unlocks** — early access to muscle-ups, planches, levers and more,
  bypassing their level gate

### Sets and routines

A workout entry can describe what actually happened set by set. An entry carries
an optional `reps` ladder — `[12, 10, 8]` — stored *only* when the sets genuinely
differ, so a uniform session writes exactly the document it wrote before the
field existed. `volume` stays the single figure the scorer reads, and for a
varied ladder it is deliberately less than `sets × amount`. Historical entries
have no ladder and are scored from their stored volume untouched; `entryVolume`
never falls back to re-deriving it, because `workouts` documents are immutable
and whatever an old session was worth it is still worth.

`amount` is the *hardest* set, which is what a personal best measures.

Routines are the editable counterpart to the read-only built-in presets: an
ordered list of movements with target reps per set, saved from whatever is in
the session panel and started again in one tap. They live on the user document
beside goals and custom exercises, bounded at twelve and mirrored by a size cap
in the rules. Saving under a name that already exists replaces that routine,
which is the whole editing story.

### Goals & achievements

Three active goals at a time, rolled from templates filtered by level. A
completed goal pays out instantly and is replaced.

Achievements are **derived, never stored** — every badge is computed from data
the profile already holds, so there is no schema to migrate, no extra writes,
and no way for the badge list to drift out of sync with reality.

---

## Architecture

```
src/
  lib/
    safe.ts             Total numeric helpers — the NaN firewall
    types.ts            Domain types
    firebase.ts         SDK bootstrap + config detection
    data.ts             Every Firestore read and write
    game/
      constants.ts      XP curve, tiers, identities, stat metadata
      exercises.ts      Movement catalog, unlock gating, presets
      xp.ts             Session scoring and stat gains
      streak.ts         Calendar-day streak decay and shield logic
      goals.ts          Goal templates, rolling, advancement
      shop.ts           Shop catalog and purchase states
      profile.ts        Document normalization + assessment baseline
      validation.ts     Anti-cheat bounds
      achievements.ts   Derived badge definitions
      muscles.ts        Muscle groups, equipment setups, volume & balance
      aesthetics.ts     Physique trait ratings and tips
  context/
    AuthContext.tsx     Auth state, profile listener, hourly recalculation
    ToastContext.tsx    Toast notifications
  components/
    ExerciseDiagram.tsx Inline SVG movement figures
    ExerciseDetail.tsx  Form cues, mistakes, progression routes
    RestTimer.tsx       Between-sets countdown
    MuscleMap.tsx       Muscle ratings and balance checks
    PhysiqueLab.tsx     Private physique breakdown
    Achievements.tsx    Badge grid
    ui/, layout/        Primitives and app shell
  views/                One file per screen
```

### Preventing NaN in the UI

Firestore documents can carry `undefined`, `null`, strings, or fields written by
an older schema. A single `NaN` reaching JSX renders the literal text "NaN" and
can break a chart's axis domain. Three layers guard against it:

1. **`lib/safe.ts`** — `num`, `int`, `pct`, `fmt` and friends are *total*: they
   always return a finite number, whatever they are handed.
2. **`normalizeProfile`** — every profile read passes through it, producing a
   fully populated object with finite values. Level and tier are re-derived
   rather than trusted.
3. **Component-level coercion** — `ProgressBar` clamps its own width to 0–100,
   so an invalid value can never produce an invalid style.

### Firestore listener lifecycle

The profile `onSnapshot` teardown lives in a ref so sign-out can detach it
**synchronously**, before Firebase revokes the token. An attached listener plus
a revoked token produces a `permission-denied` storm against a document the user
can no longer read, and leaks the subscription. The listener is also detached
when the auth state changes to a different user, on unmount, and from inside its
own error handler on `permission-denied`.

### Auth UX

`auth/popup-closed-by-user`, `auth/cancelled-popup-request` and
`auth/user-cancelled` are swallowed silently — closing a popup is a deliberate
user action, not a failure. Every other code maps to a plain-language message.

---

## Anti-cheat

Client-side bounds in `lib/game/validation.ts` are **mirrored in
`firestore.rules`**, so a hand-rolled client cannot write numbers the UI would
have rejected:

| Bound | Limit |
| --- | --- |
| Reps in one set | 1–499 (500+ rejected) |
| Seconds in one hold | 1–3599 (3600+ rejected) |
| Sets per exercise | 1–20 |
| Exercises per session | 12 |
| Total session volume | 5,000 units |
| Custom exercise XP/unit | 0.1–8 |
| Body fat | 3–60% |

The rules additionally enforce that `totalXp` is **monotonic** — it can never be
reduced — and that `workouts` and `stats_history` documents are **immutable**
once written.

### Data model

| Collection | Access |
| --- | --- |
| `users/{uid}` | **Owner-only, read and write.** Holds email, body-fat readings, the assessment, personal bests and per-muscle volume. |
| `public_profiles/{uid}` | Readable by any signed-in user. Exactly the nine fields the leaderboard renders, enforced with `hasOnly`. Mirrored from the user document on every write that changes one. |
| `workouts/{id}` | Private to the owner. Create-only, never updated or deleted. |
| `stats_history/{id}` | Private to the owner. Append-only audit trail. |

The split matters: an earlier version let any signed-in user read whole user
documents, on the reasoning that the client only rendered safe fields. That was
wrong — rules govern the database, not the UI, so anyone signed in could query
the raw document and read another athlete's email and body fat. Restricting the
UI would not have helped; the data had to move.

### Testing the rules

```bash
npm run test:rules
```

Runs 49 assertions against the Firestore emulator, which executes the real
rules engine — the rules are enforced, not merely inspected. Needs the Firebase
CLI on your PATH and a JVM. Coverage includes cross-user read/write denial,
XP monotonicity, immutability of `workouts` and `stats_history`, the anti-cheat
bounds, and that private fields cannot be smuggled into `public_profiles`.

A logged session writes all three in **one batch**, so it can never half-commit.

---

## License

MIT — see [LICENSE](../LICENSE).
