import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';

import type { Exercise, Profile, WorkoutEntry } from '../lib/types';
import type { ViewKey } from '../components/layout/AppShell';
import { Button, Card, CardHeader, Chip, EmptyState, Field, Input, Spinner } from '../components/ui/Primitives';
import { fmt, fmtDecimal, int, num } from '../lib/safe';
import {
  CATEGORY_META,
  PRESETS,
  allExercisesFor,
  isUnlocked,
  lockReason,
  type Preset,
} from '../lib/game/exercises';
import { buildEntry, entryXp, streakMultiplier } from '../lib/game/xp';
import { validateEntry, validateSession, LIMITS } from '../lib/game/validation';
import { logWorkout } from '../lib/data';
import { useToast } from '../context/ToastContext';

type Tab = 'custom' | 'presets';

export function WorkoutLoggerView({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: ViewKey) => void;
}) {
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('custom');
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const catalog = useMemo(() => allExercisesFor(profile), [profile]);
  const resolve = useMemo(
    () => (id: string) => catalog.find((e) => e.id === id),
    [catalog],
  );

  const available = useMemo(
    () => catalog.filter((e) => isUnlocked(e, profile)),
    [catalog, profile],
  );
  const locked = useMemo(
    () => catalog.filter((e) => !isUnlocked(e, profile)),
    [catalog, profile],
  );

  const multiplier = streakMultiplier(profile.streak.current);
  const baseXp = entries.reduce((acc, e) => acc + num(e.xp, 0), 0);
  const projectedXp = Math.round(baseXp * multiplier);

  const addEntry = (entry: WorkoutEntry) => {
    setSessionError(null);
    setEntries((current) => [...current, entry]);
  };

  const removeEntry = (index: number) => {
    setEntries((current) => current.filter((_, i) => i !== index));
  };

  const clearSession = () => {
    setEntries([]);
    setPresetId(null);
    setSessionError(null);
  };

  const loadPreset = (preset: Preset) => {
    const loaded: WorkoutEntry[] = [];
    const skipped: string[] = [];

    for (const item of preset.items) {
      const exercise = resolve(item.exerciseId);
      if (!exercise) continue;
      if (!isUnlocked(exercise, profile)) {
        skipped.push(exercise.name);
        continue;
      }
      loaded.push(buildEntry(exercise, item.sets, item.amount));
    }

    setEntries(loaded);
    setPresetId(preset.id);
    setSessionError(null);
    setTab('custom');

    if (skipped.length > 0) {
      toast.info(
        `${preset.name} loaded with ${skipped.length} movement${skipped.length === 1 ? '' : 's'} skipped`,
        `Still locked: ${skipped.join(', ')}. Level up or unlock them in the shop.`,
      );
    } else {
      toast.success(`${preset.name} loaded`, 'Adjust the numbers to match what you actually did.');
    }
  };

  const finish = async () => {
    const check = validateSession(entries);
    if (!check.ok) {
      setSessionError(check.error ?? 'This session cannot be saved.');
      return;
    }

    setSessionError(null);
    setBusy(true);
    try {
      const result = await logWorkout(profile, entries, resolve, presetId);

      toast.xp(
        `+${fmt(result.xpEarned)} XP · +${fmt(result.coinsEarned)} Bar Coins`,
        `${fmt(result.totalReps)} reps moved. Streak now ${fmt(result.streak)} day${result.streak === 1 ? '' : 's'}.`,
      );

      if (result.levelsGained > 0) {
        toast.success(
          `Level ${fmt(result.newLevel)} reached`,
          result.levelsGained > 1
            ? `${result.levelsGained} levels in one session. New movements may have unlocked.`
            : 'New movements may have unlocked in the logger.',
        );
      }
      if (result.tierChanged) {
        toast.success(`New rank: ${result.newTier}`, 'Your stats crossed the threshold.');
      }
      for (const pb of result.newPersonalBests) {
        toast.success(
          `Personal best — ${pb.exerciseName}`,
          `${fmt(pb.value)} ${pb.unit === 'seconds' ? 'seconds' : 'reps'} in a single set.`,
        );
      }
      for (const goal of result.completedGoals) {
        toast.success(`Goal complete — ${goal}`, 'Reward banked and a new goal rolled.');
      }

      clearSession();
      onNavigate('dashboard');
    } catch (error) {
      console.error('[logger] failed to save workout', error);
      setSessionError('Could not save the session. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">
          Log a Session
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Every rep is scored. {available.length} movement{available.length === 1 ? '' : 's'}{' '}
          unlocked at level {fmt(profile.level)}
          {locked.length > 0 ? ` · ${locked.length} still locked` : ''}.
        </p>
      </div>

      {/* --- Tabs --- */}
      <div className="flex rounded-xl bg-ink-900 p-1 ring-1 ring-white/5 sm:inline-flex">
        <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
          <Dumbbell className="h-4 w-4" aria-hidden />
          Custom Logging
        </TabButton>
        <TabButton active={tab === 'presets'} onClick={() => setTab('presets')}>
          <ClipboardList className="h-4 w-4" aria-hidden />
          Presets
        </TabButton>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {tab === 'custom' ? (
            <ExercisePicker
              available={available}
              locked={locked}
              profile={profile}
              onAdd={addEntry}
              disabled={entries.length >= LIMITS.MAX_ENTRIES}
            />
          ) : (
            <PresetList profile={profile} onLoad={loadPreset} />
          )}
        </div>

        {/* --- Session panel --- */}
        <div className="lg:col-span-2">
          <Card className="sticky top-24">
            <CardHeader
              title="This Session"
              subtitle={
                presetId
                  ? `Loaded from ${PRESETS.find((p) => p.id === presetId)?.name ?? 'a preset'}`
                  : 'Add movements, then finish.'
              }
              icon={<Zap className="h-4 w-4" aria-hidden />}
              action={
                entries.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearSession}
                    className="text-xs font-medium text-slate-500 transition hover:text-rose-300"
                  >
                    Clear
                  </button>
                ) : null
              }
            />

            {entries.length === 0 ? (
              <EmptyState
                icon={<Dumbbell className="h-8 w-8" aria-hidden />}
                title="Session is empty"
                message="Pick a movement and add your sets, or load a preset to start from a template."
              />
            ) : (
              <>
                <ul className="divide-y divide-white/5">
                  {entries.map((entry, index) => (
                    <li key={`${entry.exerciseId}-${index}`} className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">
                          {entry.exerciseName}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {fmt(entry.sets)} × {fmt(entry.amount)}
                          {entry.unit === 'seconds' ? 's' : ' reps'} ={' '}
                          {fmt(entry.volume)} {entry.unit === 'seconds' ? 'sec' : 'reps'}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-semibold text-forge-300">
                        +{fmt(entry.xp)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:bg-white/5 hover:text-rose-300"
                        aria-label={`Remove ${entry.exerciseName}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3 border-t border-white/5 p-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Base XP</span>
                    <span className="font-mono text-slate-300">{fmt(baseXp)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Streak bonus ({fmt(profile.streak.current)}d)
                    </span>
                    <span className="font-mono text-ember-300">
                      ×{fmtDecimal(multiplier, 2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <span className="font-display text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Projected
                    </span>
                    <span className="font-mono text-lg font-bold text-forge-300">
                      +{fmt(projectedXp)} XP
                    </span>
                  </div>

                  {sessionError ? (
                    <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-500/25">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                      <p className="text-xs leading-relaxed text-rose-200">{sessionError}</p>
                    </div>
                  ) : null}

                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => void finish()}
                    disabled={busy}
                  >
                    {busy ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                    Finish session
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-slate-600">
                    Goals advance, PRs are recorded and a progress snapshot is saved automatically.
                  </p>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exercise picker                                                             */
/* -------------------------------------------------------------------------- */

function ExercisePicker({
  available,
  locked,
  profile,
  onAdd,
  disabled,
}: {
  available: Exercise[];
  locked: Exercise[];
  profile: Profile;
  onAdd: (entry: WorkoutEntry) => void;
  disabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>(available[0]?.id ?? '');
  const [sets, setSets] = useState('3');
  const [amount, setAmount] = useState('10');
  const [error, setError] = useState<string | null>(null);

  const selected = available.find((e) => e.id === selectedId) ?? available[0];

  const previewXp = selected ? entryXp(selected, num(sets, 0), num(amount, 0)) : 0;

  const submit = () => {
    const setsValue = num(sets, NaN);
    const amountValue = num(amount, NaN);

    const check = validateEntry(selected, setsValue, amountValue);
    if (!check.ok) {
      setError(check.error ?? 'Those numbers are not valid.');
      return;
    }
    if (!selected) return;

    setError(null);
    onAdd(buildEntry(selected, setsValue, amountValue));
  };

  if (available.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="h-8 w-8" aria-hidden />}
          title="No movements available"
          message="Something has gone wrong with the exercise catalog. Reload the page."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Add a Movement"
          subtitle="Only movements you have unlocked appear here."
          icon={<Plus className="h-4 w-4" aria-hidden />}
        />
        <div className="space-y-4 p-5">
          <Field label="Exercise">
            <select
              value={selected?.id ?? ''}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setError(null);
                // Holds are logged in seconds, so seed a sensible default.
                const next = available.find((ex) => ex.id === e.target.value);
                if (next?.unit === 'seconds') setAmount('30');
                else setAmount('10');
              }}
              className="w-full rounded-xl bg-ink-900 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-white/10 transition focus:outline-none focus:ring-2 focus:ring-forge-500"
            >
              {(['push', 'pull', 'legs', 'core', 'skill', 'conditioning'] as const).map((category) => {
                const group = available.filter((e) => e.category === category);
                if (group.length === 0) return null;
                return (
                  <optgroup key={category} label={CATEGORY_META[category].label}>
                    {group.map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.name}
                        {exercise.custom ? ' (custom)' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </Field>

          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip className={CATEGORY_META[selected.category].ring + ' ' + CATEGORY_META[selected.category].color}>
                {CATEGORY_META[selected.category].label}
              </Chip>
              <Chip className="bg-white/5 text-slate-400 ring-white/10">
                {fmtDecimal(selected.xpPerUnit, 2)} XP per{' '}
                {selected.unit === 'seconds' ? 'second' : 'rep'}
              </Chip>
              {selected.custom ? (
                <Chip className="bg-arcane-500/10 text-arcane-300 ring-arcane-500/30">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Custom
                </Chip>
              ) : null}
            </div>
          ) : null}

          {selected?.hint ? (
            <p className="text-xs italic leading-relaxed text-slate-500">{selected.hint}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Sets" hint={`1–${LIMITS.MAX_SETS}`}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={LIMITS.MAX_SETS}
                value={sets}
                onChange={(e) => {
                  setSets(e.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Field
              label={selected?.unit === 'seconds' ? 'Seconds per set' : 'Reps per set'}
              hint={
                selected?.unit === 'seconds'
                  ? `1–${LIMITS.MAX_SECONDS}`
                  : `1–${LIMITS.MAX_REPS}`
              }
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={selected?.unit === 'seconds' ? LIMITS.MAX_SECONDS : LIMITS.MAX_REPS}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
              />
            </Field>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-500/25">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
              <p className="text-xs leading-relaxed text-rose-200">{error}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
            <p className="text-xs text-slate-500">
              Worth{' '}
              <span className="font-mono font-semibold text-forge-300">+{fmt(previewXp)} XP</span>{' '}
              before the streak bonus.
            </p>
            <Button onClick={submit} disabled={disabled}>
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </div>
          {disabled ? (
            <p className="text-xs text-amber-400/80">
              This session is full at {LIMITS.MAX_ENTRIES} movements. Finish it and log another.
            </p>
          ) : null}
        </div>
      </Card>

      {locked.length > 0 ? (
        <Card>
          <CardHeader
            title="Locked Movements"
            subtitle="Level up or buy early access in the shop."
            icon={<Lock className="h-4 w-4" aria-hidden />}
          />
          <ul className="divide-y divide-white/5">
            {locked.map((exercise) => (
              <li key={exercise.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
                    {exercise.name}
                  </p>
                  <p className="mt-0.5 pl-5 text-[11px] text-slate-600">
                    {lockReason(exercise, profile)}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-slate-600">
                  Lv {fmt(exercise.minLevel)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

function PresetList({
  profile,
  onLoad,
}: {
  profile: Profile;
  onLoad: (preset: Preset) => void;
}) {
  const catalog = useMemo(() => allExercisesFor(profile), [profile]);

  return (
    <div className="space-y-4">
      {PRESETS.map((preset) => {
        const items = preset.items.map((item) => {
          const exercise = catalog.find((e) => e.id === item.exerciseId);
          return {
            item,
            exercise,
            unlocked: exercise ? isUnlocked(exercise, profile) : false,
          };
        });

        const lockedCount = items.filter((i) => !i.unlocked).length;
        const allLocked = lockedCount === items.length;
        const belowLevel = int(profile.level, 1) < preset.recommendedLevel;

        return (
          <Card key={preset.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-slate-100">
                    {preset.name}
                  </h3>
                  <Chip
                    className={
                      CATEGORY_META[preset.focus].ring + ' ' + CATEGORY_META[preset.focus].color
                    }
                  >
                    {CATEGORY_META[preset.focus].label}
                  </Chip>
                  {belowLevel ? (
                    <Chip className="bg-amber-500/10 text-amber-300 ring-amber-500/30">
                      Suggested Lv {fmt(preset.recommendedLevel)}+
                    </Chip>
                  ) : null}
                </div>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                  {preset.description}
                </p>
              </div>

              <Button
                variant={allLocked ? 'secondary' : 'primary'}
                onClick={() => onLoad(preset)}
                disabled={allLocked}
              >
                {allLocked ? 'All locked' : 'Load preset'}
              </Button>
            </div>

            <ul className="divide-y divide-white/5 border-t border-white/5">
              {items.map(({ item, exercise, unlocked }) => (
                <li
                  key={item.exerciseId}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <p
                    className={`flex items-center gap-2 text-sm ${
                      unlocked ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {!unlocked ? <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                    {exercise?.name ?? item.exerciseId}
                  </p>
                  <span
                    className={`shrink-0 font-mono text-xs ${
                      unlocked ? 'text-slate-500' : 'text-slate-700'
                    }`}
                  >
                    {fmt(item.sets)} × {fmt(item.amount)}
                    {exercise?.unit === 'seconds' ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>

            {lockedCount > 0 && !allLocked ? (
              <p className="border-t border-white/5 px-5 py-3 text-[11px] text-amber-400/80">
                {lockedCount} movement{lockedCount === 1 ? '' : 's'} still locked — loading will
                skip {lockedCount === 1 ? 'it' : 'them'}.
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200 sm:flex-none ${
        active ? 'bg-ink-750 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
