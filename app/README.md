# Bar XP — Calisthenics RPG

[![CI](https://github.com/Midas3007/Bar-xp/actions/workflows/ci.yml/badge.svg)](https://github.com/Midas3007/Bar-xp/actions/workflows/ci.yml)

**[Try it without signing up →](https://workout-117fc.web.app)** — the sign-in
screen has a **Look around first** button that drops you into a sample athlete
with eighteen weeks of training behind him: filled charts, a Diamond rank, a
muscle map, personal bests and a leaderboard he sits fourth on. Everything is
read-only and no account is needed.

A fitness tracker that treats training like a character sheet. Log calisthenics
work to earn XP, level up, bank **Bar Coins**, and grow four core stats —
**Strength, Endurance, Aesthetics, Discipline** — that decide your rank.

React 18 · TypeScript · Vite · Tailwind CSS · Firebase (Auth + Firestore) ·
Recharts · Lucide React.

### The demo athlete

The demo is a **local fixture, not an anonymous Firebase session**, and that was
a deliberate call. An anonymous account would write a real user document and a
real leaderboard row for every visitor — onto the board the actual users share,
with no cleanup — and it would start _empty_, which is precisely the impression
a demo exists to avoid.

Instead, `src/lib/demo/fixture.ts` simulates eighteen weeks of training **through
the real game engine**: `scoreSession`, `registerWorkout`, `settleStreak`,
`advanceGoals`, `mergeMuscleVolume`. So `totalXp` really is the sum of the
sessions, `level` really is `levelFromTotalXp` of it, and the streak really is
what that schedule produces — including a week bridged by a Streak Shield and a
later week where the run breaks and rebuilds. There is no seam to find. It is
deterministic given a clock, needs no network and no Firebase config at all, and
the test suite asserts it stays internally consistent and inside a believable
band.

---

## Quick start

```bash
npm install
cp .env.example .env      # fill in your Firebase web config
npm run dev
```

Without a `.env` the app boots to a setup screen listing the missing keys
rather than crashing, so `npm run dev` is useful on a fresh clone.

| Script              | Does                                        |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Dev server on :5173                         |
| `npm run build`     | Typecheck, then production build to `dist/` |
| `npm run preview`   | Serve the built bundle                      |
| `npm run typecheck` | `tsc --noEmit`                              |

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

| Grade            | Access                        | Examples                                          |
| ---------------- | ----------------------------- | ------------------------------------------------- |
| **Foundation**   | Open from level 1             | Push-up, Pull-up, Dip, Squat, Plank, Chin-up, Row |
| **Intermediate** | Light level gate (5–8)        | Archer push-up, L-sit, Pistol squat, Toes to bar  |
| **Elite**        | Level 12–20, or a shop unlock | Muscle-up, Front lever, Planche, Human flag, HSPU |

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
  toggle. Body-fat guidance stops at healthy ranges rather than rewarding
  ever-lower numbers. **Gym Bro Mode** — on by default, toggled from the profile
  — reads the _overall_ verdict as Chud / Normie / Chad / GIGACHAD instead of
  Lagging / Building / Good / Standout. It reaches the headline and nothing
  else: eight joke labels turn a breakdown meant to be read into noise, and
  "Chud" against one lagging muscle group reads as an insult rather than a
  diagnosis. Only the words change; the two vocabularies share one lookup table
  and the scores behind them are untouched.

  Most traits are scored from logged training volume. The **V-taper** trait is
  the exception: where the athlete has recorded both a back and a waist
  measurement, that ratio replaces the volume proxy, because a tape settles the
  question a training estimate can only approximate. The curve has no ideal at
  the top — it saturates rather than rewarding an ever-smaller waist — and no
  other trait reads a measurement.

### Body measurements

Bodyweight and six girths — chest, back, waist, biceps, thigh, calf — can be
recorded optionally at onboarding and any time afterwards from the profile, and
each is charted over time on the Progress view.

They live on the existing `stats_history` collection rather than a new one:
that collection is already append-only, already private to the owner, and
already covered by the `uid` + `createdAt` composite index, so the query, the
loading state and the immutability guarantee come for free. A snapshot gains an
optional map of the sites recorded in that sitting; the profile keeps the latest
known value per site for the entry form. Re-emitting a three-month-old chest
measurement alongside today's waist would draw a flat line that looks like data
and is not.

Values are **always stored metric** — kilograms and centimetres. The unit
system is a display preference converted at the UI boundary, so switching it
never rewrites a document and never mixes scales on an axis.

**Almost nothing here is scored.** There is no target range and no comparison
against another athlete. The single exception is the V-taper trait in the
Physique Lab, which reads a recorded back-and-waist pair because that ratio is
the one physique question a tape can actually settle; its curve saturates rather
than rewarding an ever-smaller waist. A test pins the boundary — a measurement
moves that trait and provably leaves every other one untouched.

The girth charts are small multiples rather than one six-line overlay: six
categorical hues bright enough for this surface cannot be told apart under
deuteranopia across every pair, and chest centimetres and calf centimetres share
an axis unit but nothing else.

### Levels & XP

Each movement carries an XP-per-unit value (per rep, or per second for holds).
A session's XP is the sum of its entries, with two adjustments:

- **Diminishing returns** — volume past 100 units in one entry is worth 60%, so
  grinding a single movement is never the optimal play.
- **Streak multiplier** — `+3%` per streak day, capped at `+45%`.

Level is **always derived** from _net_ lifetime XP (`levelFromTotalXp`) rather
than trusted from the document, so the two can never drift apart. The curve is
`100 · level^1.32 + 20 · level`, capped at level 100.

### Tiers

Rank comes from the **average of the four core stats**:

| Tier        | Avg stat |     | Tier     | Avg stat |
| ----------- | -------- | --- | -------- | -------- |
| Uninitiated | 0        |     | Platinum | 68       |
| Bronze      | 12       |     | Diamond  | 95       |
| Silver      | 26       |     | Mythic   | 130      |
| Gold        | 45       |     | Legend   | 175      |

### Identities & streaks

The streak counts **consecutive training days**, and it is protected by a
weekly target rather than by having to train every single day:

- Every distinct day you train adds one. A second session on a day already
  logged is welcome but does not advance it.
- A gap never breaks the run **while the week is still live** — you have until
  Sunday to reach the target.
- Once a week has elapsed, hitting **4 distinct days** in it carries the streak
  through untouched. Falling short spends a **Streak Shield**; with no shield
  left, the run resets.

That is the whole point of the shape: four sessions a week keeps a streak alive
indefinitely without punishing a rest day, while a week of nothing still costs
you something.

Consecutive training days map to an identity label:

`0 → Fading` · `1 → Stirring` · `3 → Consistent` · `7 → Disciplined` ·
`15+ → Relentless`

Streaks use **local calendar days** (`YYYY-MM-DD`), not timestamps, so a 23:50
session and a 00:10 session correctly count as two days.

The counter has been through three schemes — days, then weeks, then days again
— and each stored shape is converted on read exactly once. Documents written
under the weekly model carry no `model` marker; their week count converts at
`weeks × 4`, the honest floor for what holding those weeks required, and `best`
converts on the same scale so a record can never shrink. Every write since
stamps `model: 'daily'`, which makes the conversion idempotent.

### Background recalculation

`AuthContext` runs a recalculation pass on sign-in, **every hour**, and whenever
the tab regains focus (an hourly timer alone would miss a laptop asleep across
the day boundary). Each pass:

1. Applies **streak decay**. Training today or yesterday is safe. Each fully
   missed day can be bridged by consuming one **Streak Shield**, spent
   automatically. If the gap outruns the shields the streak resets — and the
   shields are _not_ spent on a gap they cannot bridge, so they carry over.
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
an optional `reps` ladder — `[12, 10, 8]` — stored _only_ when the sets genuinely
differ, so a uniform session writes exactly the document it wrote before the
field existed. `volume` stays the single figure the scorer reads, and for a
varied ladder it is deliberately less than `sets × amount`. Historical entries
have no ladder and are scored from their stored volume untouched; `entryVolume`
never falls back to re-deriving it, because `workouts` documents are immutable
and whatever an old session was worth it is still worth.

`amount` is the _hardest_ set, which is what a personal best measures.

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

## Competing

### Friends

A friend request has **no status field**: its existence is the pending state.
Accepting creates the friendship and deletes the request; declining or
cancelling deletes it. With no mutable state there is nothing to forge, and no
"who may set `status: accepted`" question — which is where friend systems
usually leak.

The friendship's document id is the two uids sorted and joined (`alice__bob`),
so a pair has exactly one address, checkable from a rule without a query, and a
duplicate friendship is impossible. Creating one requires that
`friend_requests/{them}__{you}` exists — and a request can only be created by
its sender, so you cannot manufacture your own invitation. That single
`exists()` is the hinge of the whole design.

### What a friend can see

`public_profiles` stays exactly as narrow as it was — the nine leaderboard
fields plus the five season/search fields, still enforced with `hasOnly`. The
richer view lives in a **separate collection**, `friend_cards`, readable only by
someone holding an accepted friendship. A second, consent-gated door rather than
a wider version of the first one.

The card carries level, XP, tier, the four core stats, lifetime reps, session
count, streaks and the last fourteen training days. It carries nothing about the
body, the assessment, personal bests, goals, custom movements, coins or
inventory, and `FRIEND_CARD_FIELDS` in `game/friends.ts` is an explicit
allow-list mirrored by the rules and asserted by a test — all three change
together or not at all.

### Challenges

Time-boxed contests between two friends over the current week or month:
sessions, volume, XP, or the volume of one movement. `sessions` counts distinct
_days_, so splitting one workout into five logs wins nothing.

**No result is ever stored.** Each athlete writes their own score to
`challenges/{id}/scores/{uid}`, and both clients derive the same winner from the
same two documents. There is nothing to forge, no rule deciding who may declare
victory, and no way for the two sides to disagree about a stored answer. A tie
stays a tie — with self-reported numbers, a tiebreak is theatre.

Every number in Bar XP is self-reported and unverifiable, and the interface says
so on every card, with the time each score was last computed. What the rules
guarantee is narrower and actually achievable: **nobody writes anybody else's
number.**

### Seasons

Rank was a ratchet: stats only ever increase, tier is their average, so a rank
you cannot lose and cannot be overtaken in stops being a competition — and
whoever installed the app first wins the lifetime ladder permanently.

A season is one calendar quarter, **derived from the calendar** by every client
independently, so there is no server, no scheduler and no admin document.
Season XP is a second counter beside lifetime XP. At a boundary the finished
season is recorded permanently on the profile and the counter resets.

Lifetime XP, level, stats, tier, coins, unlocks and personal bests are
untouched, and the rule that `totalXp` can never decrease is unchanged —
`rolloverSeason` takes none of them as inputs and cannot return them, which a
test asserts structurally rather than leaving to memory. Profiles written before
seasons existed carry no season field, read as the start of the current one, and
gain **no invented history**.

A finished season's placement is resolved from the union of two queries — live
`seasonId` and `lastSeasonId` — so an athlete who opens the app a week into the
new season is ranked against the real field rather than told they came first in
a field of one.

---

## Not losing data

### Routing

Six flat destinations on the History API — `/dashboard`, `/train`, `/progress`,
`/leaderboard`, `/shop`, `/profile` — with one `popstate` listener and no
router dependency. Deep links and the browser back button both work against the
hosting rewrite that was already in place, which matters most in the installed
PWA, where `"display": "standalone"` means the system back gesture with no
in-app history closes the app outright. `/` and any unknown path normalise onto
`/dashboard` with `replaceState`, so the first Back press leaves the app rather
than bouncing between two spellings of the same view.

### Session drafts

The in-progress session is written to `localStorage` per account on every
change and restored on return, expiring after eighteen hours. Not Firestore: a
draft is not a record, writing every keystroke would cost money and need its own
collection and rules, and it would still be lost offline. Stored entries are
re-normalised through `safe.ts` on the way back in, because `localStorage` is
user-writable and therefore untrusted like any other input.

### Offline

Firestore's IndexedDB cache is enabled, which buys offline reads, offline
queries and offline writes that replay on reconnect. The consequence that has to
be handled: `WriteBatch.commit()` does not settle until the _server_
acknowledges, so offline it never settles. Writes are applied to the local cache
synchronously either way, so `commitBatch` reports success once the write is
durable on the device and tells the caller whether the server has seen it yet —
the Finish button completes, and a second toast says the session will sync.

A hand-written service worker (`public/sw.js`, ~70 lines, no Workbox) serves the
app shell when navigation fails and cache-firsts the content-hashed assets Vite
emits. It never intercepts cross-origin requests: caching a Firestore or
Identity Toolkit response would produce failures that look like data corruption.

### Corrections

A mistyped session — `300` where `30` was meant — used to be permanent, because
the ledger is append-only and XP is monotonic. Neither invariant was worth
trading away, so corrections **add** rather than rewrite:

- The session is retracted by appending a `correction` document to `workouts`
  that names the one it voids. The original is never touched.
- The XP comes off through a second append-only counter, `xpVoided`, which can
  never exceed `totalXp`. Level, tier, charts and the leaderboard read the
  **difference** of two counters that only ever grow, which is free to fall.
- Existing documents have no `xpVoided`; absent reads as 0, so every account's
  numbers are unchanged and there is no migration.

Corrections are available for 48 hours — a UX guard, not a security control,
since the maths is unexploitable either way. **Fix numbers** voids the session
and hands its movements back to the logger as a draft; the re-log carries
today's date, which is the price of an append-only ledger.

Reversed: XP, coins, stats, reps and muscle volume. **Not** reversed: personal
bests, streak and goal progress — each is impossible to reconstruct honestly
from the stored document (restoring a PR would need the full history the client
never holds; `daysThisWeek` is a count, not a set of days), and the confirmation
copy says so before the athlete commits. One further asymmetry is documented in
`correction.ts`: the streak-scaled discipline bonus is applied outside
`scoreSession` and the workout does not record the streak, so a reversal leaves
up to 1.5 discipline behind rather than risk removing more than was granted.

### Export and erasure

The Profile view exports the full history as JSON (profile, sessions, stat
snapshots) or CSV (one row per _entry_, every cell quoted, so a movement named
`Front lever, tucked` stays in one cell). Delete-account erases the profile,
every session, every snapshot, the leaderboard row and the sign-in itself,
behind a typed `DELETE` confirmation. Deletes are owner-only and destroy history
without inflating anything; the rule that actually protects the game — a logged
session can never be rewritten — stays absolute.

### The rest timer

Lifted out of the logger into an app-level provider, because it used to unmount
the moment the athlete opened the Dashboard, which is to say it stopped working
at the one moment it exists for. It now survives navigation and reload
(deadline-based, so a throttled background tab cannot make it drift), alerts
with a Web Audio triple beep as well as vibration — `navigator.vibrate` alone is
a no-op on iOS Safari, so the timer was previously silent on iPhone — carries a
persisted mute toggle, and shows a floating pill from every view.

The honest limit: a fully backgrounded browser on iOS cannot reliably play
audio, so the alert may land on return to the app. Fixing that properly needs
Notifications or a wake lock, which are deliberately out of scope.

---

## Design system

Colour lives in one place. `src/index.css` defines two layers of CSS custom
properties — surfaces, four text levels, hairlines, seven brand hues and eleven
rank tones — and `tailwind.config.js` exposes them as semantic utilities. A
component names meaning (`text-content-muted`, `bg-surface-raised`) rather than
pigment, which is what makes a second theme a second block of values instead of
a `dark:` variant on every element.

Before this, the app carried two colour systems at once: five brand ramps plus
thirteen stock Tailwind palettes used directly across the views, 752 colour
utilities in all. Nothing tied them together, so "secondary text" was written
four different ways in four files, and four call sites reached past the end of
the `forge` ramp for shades that were never defined — emitting no class at all
and leaving those hover states silently dead.

**Contrast is measured, not assumed.** The three worst offenders sat at 1.82:1,
2.49:1 and 3.96:1 against the card surface across 126 uses carrying real content
— achievement descriptions, the reason a movement is locked, input placeholders,
empty states. Every text token now clears 4.5:1 on every surface in both themes,
and the tests assert the ratios for all fourteen muscle colours and all four
stat colours rather than trusting them. `content-faint` is the one decorative
token: never put words in it.

**Themes.** Light, Dark or System, chosen from Profile → Appearance and stored
per device in `localStorage` — not in Firestore, which would buy a schema change
and a live migration for a per-device preference. A small blocking script in
`index.html` applies the class before first paint, so there is no flash. It
duplicates the storage key on purpose: it has to run before any module loads.

**Focus.** A blanket `:focus-visible { outline: none }` in the base layer had
left roughly 35 of 36 interactive elements with no keyboard affordance at all.
One zero-specificity `:where(...)` rule now gives every one of them a 2px
outline, and a component can still override it deliberately.

**Dialogs.** The movement sheet and the navigation drawer are real dialogs
through one ~90-line primitive (`components/ui/Modal.tsx`): `role="dialog"`,
`aria-modal`, `aria-labelledby`, Escape, a focus trap, body scroll lock and
focus restoration on close. The scrim is an `aria-hidden` div rather than a
focusable button — a full-viewport tab stop inside a focus trap is worse than
the problem it solves.

**Mobile navigation.** Six destinations at a 56px hit target, with
`env(safe-area-inset-bottom)` so the labels clear the home indicator on a
notched phone, a short label ("Ranks") so all six fit at 320px, and an active
indicator bar so the current tab is not signalled by colour alone. The bar's
height is a spacing token (`nav`), which the logger's sticky session summary
reads too — it used to be a hardcoded `bottom-[57px]` guess that detached
whenever the nav's padding changed.

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
      aesthetics.ts     Physique trait ratings, tips, and the two grade vocabularies
      measurements.ts   Measurement sites, metric/imperial conversion, coercion
      correction.ts     Reversal maths for voiding a logged session
      friends.ts        Pair keys, the friend-card allow-list, recent days
      season.ts         Season calendar, rollover and standings maths
      challenges.ts     Challenge templates, windows, scoring and resolution
    social.ts           Every Firestore read and write for the social layer
    theme.ts            Theme preference resolution (pure)
    routing.ts          ViewKey <-> path table and the History API hook
    draft.ts            The in-progress session, in localStorage
    export.ts           JSON and CSV export builders
  context/
    ThemeContext.tsx    Light/System/Dark preference and the `.dark` class
    AuthContext.tsx     Auth state, profile listener, hourly recalculation, erasure
    ToastContext.tsx    Toast notifications
    RestTimerContext.tsx App-level rest timer: deadline, sound, persistence
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

1. **`lib/safe.ts`** — `num`, `int`, `pct`, `fmt` and friends are _total_: they
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

Client-side bounds live in `lib/game/validation.ts`. **Read the mirroring claim
carefully, because it is only partly true**, and an accurate limitation is worth
more than an overstated guarantee:

- The **aggregate** bounds — total session volume, session XP, session coins,
  body fat, XP monotonicity, the per-write XP and coin deltas — _are_ enforced
  in `firestore.rules`.
- The **per-set** bounds — reps per set, seconds per hold, sets per exercise —
  are enforced **client-side only**. Firestore rules cannot iterate a list, so
  the contents of a workout's `entries` array cannot be inspected element by
  element. What the rules can and do enforce is that the session totals those
  entries roll up to stay inside a range a real session could reach.

So a hand-rolled client can write an entry claiming 900 reps in one set — but it
cannot make that session worth more XP than a legitimate one, and it cannot move
the profile by more than one session's worth.

| Bound                   | Limit                   |
| ----------------------- | ----------------------- |
| Reps in one set         | 1–499 (500+ rejected)   |
| Seconds in one hold     | 1–3599 (3600+ rejected) |
| Sets per exercise       | 1–20                    |
| Exercises per session   | 12                      |
| Total session volume    | 5,000 units             |
| Custom exercise XP/unit | 0.1–8                   |
| Body fat                | 3–60%                   |
| Bodyweight              | 20–400 kg               |
| Any girth measurement   | 10–250 cm               |

The rules additionally enforce that `totalXp` is **monotonic** — it can never be
reduced — that `xpVoided` is monotonic and can never exceed it, and that
`workouts` and `stats_history` documents are **immutable** once written.

### Data model

| Collection                     | Access                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                  | **Owner-only, read and write.** Holds email, body-fat readings, the assessment, personal bests and per-muscle volume.                                                      |
| `public_profiles/{uid}`        | Readable by any signed-in user. Exactly the nine fields the leaderboard renders, enforced with `hasOnly`. Mirrored from the user document on every write that changes one. |
| `workouts/{id}`                | Private to the owner. Create-only and **never updated**; deletable only by the owner, for account erasure.                                                                 |
| `stats_history/{id}`           | Private to the owner. Append-only audit trail, and where body measurements are recorded. Owner-deletable for erasure.                                                      |
| `friend_requests/{from}__{to}` | Readable by its two parties. No mutable state — its existence _is_ "pending". Created only by the sender; deleted by either.                                               |
| `friendships/{a}__{b}`         | Readable by its two members. Id is the sorted pair, so a pair has one address. Created only by the recipient of a matching request.                                        |
| `friend_cards/{uid}`           | The richer projection — core stats, volume, streak, training days. Readable by an accepted friend; writable only by its owner.                                             |
| `challenges/{id}`              | Readable by its two members. Only the _invited_ member may set `status`, and only once.                                                                                    |
| `challenges/{id}/scores/{uid}` | One document per athlete, named after them. The rule stopping you writing your opponent's number is the document id.                                                       |

The split matters: an earlier version let any signed-in user read whole user
documents, on the reasoning that the client only rendered safe fields. That was
wrong — rules govern the database, not the UI, so anyone signed in could query
the raw document and read another athlete's email and body fat. Restricting the
UI would not have helped; the data had to move.

### Testing the rules

```bash
npm run test:rules
```

Runs 110 assertions against the Firestore emulator, which executes the real
rules engine — the rules are enforced, not merely inspected. Needs the Firebase
CLI on your PATH and a JVM. Coverage includes cross-user read/write denial, XP
monotonicity, immutability of `workouts` and `stats_history`, the aggregate
anti-cheat bounds, leaderboard forgery, and that private fields cannot be
smuggled into `public_profiles`.

**The suite has been shown to fail.** Eight of these assertions once passed for
the wrong reason: the emulator was never reset between tests, so an early one
left `totalXp` high and every later negative fixture — which defaults to zero —
was rejected by the monotonicity clause _before the field under test was ever
evaluated_. `statsAreValid`, the coin bound, the level cap and the body-fat
bound could all be deleted with the suite still green. Each negative test now
resets to a known document first, and every guard was verified by removing its
rule and confirming that specific test goes red.

```bash
npm run test:paths
```

Replays every write path in `data.ts` against the live rules. The rules suite
proves each _rule_ works; this proves the _application_ can still write, which
is a different question and the one that breaks when a rule is tightened. It
caught two real regressions during this work — see the note on Firestore's
1,000-expression request budget in `firestore.rules`.

A logged session writes the workout, the profile and the snapshot in **one
batch**, so it can never half-commit. The public leaderboard row is written
_after_ that batch rather than inside it: the rules cross-read the private
document to prove the row is not forged, and a rule's `get()` inside a batch
sees pre-batch state. A stale row is cosmetic and self-corrects; a forgeable
leaderboard would not be.

---

## License

MIT — see [LICENSE](LICENSE).
