import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Info,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';

import type { Exercise, Profile, WorkoutEntry } from '../lib/types';
import type { ViewKey } from '../components/layout/AppShell';
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '../components/ui/Primitives';
import { ExerciseDiagram } from '../components/ExerciseDiagram';
import { ExerciseSheet } from '../components/ExerciseDetail';
import { RestTimer } from '../components/RestTimer';
import { fmt, fmtDecimal, int, num } from '../lib/safe';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  GRADE_META,
  PRESETS,
  allExercisesFor,
  isUnlocked,
  lockReason,
  type Preset,
} from '../lib/game/exercises';
import {
  EQUIPMENT_META,
  MUSCLE_META,
  SETUPS,
  equipmentFor,
  matchesSetup,
  MUSCLE_KEYS,
  muscleProfileFor,
  musclesFor,
  type MuscleKey,
  type SetupKey,
} from '../lib/game/muscles';
import { buildEntry, entryXp, streakMultiplier } from '../lib/game/xp';
import { validateEntry, validateSession, LIMITS } from '../lib/game/validation';
import { logWorkout } from '../lib/data';
import { useToast } from '../context/ToastContext';

type Tab = 'log' | 'presets' | 'library';

export function WorkoutLoggerView({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: ViewKey) => void;
}) {
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('log');
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sheetExercise, setSheetExercise] = useState<Exercise | null>(null);
  /** Set when the Library's "Log this" jumps back to the log tab. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** Which equipment the user has access to right now. */
  const [setup, setSetup] = useState<SetupKey>('all');

  // The session card is scrolled into view after an add on small screens.
  const sessionRef = useRef<HTMLDivElement | null>(null);

  // Stable identity so the picker's effect does not re-fire every render.
  const consumePick = useCallback(() => setPickedId(null), []);

  const catalog = useMemo(() => allExercisesFor(profile), [profile]);
  const resolve = useMemo(() => (id: string) => catalog.find((e) => e.id === id), [catalog]);

  const available = useMemo(
    () => catalog.filter((e) => isUnlocked(e, profile) && matchesSetup(e, setup)),
    [catalog, profile, setup],
  );
  const locked = useMemo(
    () => catalog.filter((e) => !isUnlocked(e, profile) && matchesSetup(e, setup)),
    [catalog, profile, setup],
  );

  const multiplier = streakMultiplier(profile.streak.current);
  const baseXp = entries.reduce((acc, e) => acc + num(e.xp, 0), 0);
  const projectedXp = Math.round(baseXp * multiplier);

  const addEntry = (entry: WorkoutEntry) => {
    setSessionError(null);
    setEntries((current) => [...current, entry]);

    // Without this the entry lands in a panel that can be well below the fold
    // on a phone, and the Add button looks like it did nothing.
    toast.success(
      `${entry.exerciseName} added`,
      `${fmt(entry.sets)} × ${fmt(entry.amount)}${entry.unit === 'seconds' ? 's' : ' reps'} · +${fmt(entry.xp)} XP`,
    );
    window.setTimeout(() => {
      sessionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
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
    setTab('log');

    if (skipped.length > 0) {
      toast.info(
        `${preset.name} loaded, ${skipped.length} skipped`,
        `Still locked: ${skipped.join(', ')}. Open the Library to see how to train for them.`,
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
    <div className="mx-auto max-w-6xl space-y-5 pb-28 lg:pb-0">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">
          Log a Session
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {available.length} movement{available.length === 1 ? '' : 's'} available
          {locked.length > 0 ? ` · ${locked.length} still locked` : ''}.
        </p>
      </div>

      {/* --- Tabs --- */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-900 p-1 ring-1 ring-white/5 sm:inline-grid sm:auto-cols-max sm:grid-flow-col">
        <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
          <Dumbbell className="h-4 w-4" aria-hidden />
          Log
        </TabButton>
        <TabButton active={tab === 'presets'} onClick={() => setTab('presets')}>
          <ClipboardList className="h-4 w-4" aria-hidden />
          Presets
        </TabButton>
        <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
          <BookOpen className="h-4 w-4" aria-hidden />
          Library
        </TabButton>
      </div>

      {/* --- What equipment do you have right now? --- */}
      <SetupFilter setup={setup} onChange={setSetup} />

      {/*
        Explicit grid placement rather than plain column order: on a phone the
        session panel must sit immediately after the add form, otherwise it
        ends up ~1,300px below the fold behind the locked-movement list and an
        added entry appears to vanish.
      */}
      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        {/* --- Primary column --- */}
        <div className="order-1 space-y-5 lg:col-span-3 lg:col-start-1 lg:row-start-1">
          {tab === 'log' ? (
            <ExercisePicker
              available={available}
              profile={profile}
              onAdd={addEntry}
              onInspect={setSheetExercise}
              disabled={entries.length >= LIMITS.MAX_ENTRIES}
              pickedId={pickedId}
              onConsumePick={consumePick}
            />
          ) : null}
          {tab === 'presets' ? (
            <PresetList profile={profile} setup={setup} onLoad={loadPreset} />
          ) : null}
          {tab === 'library' ? (
            <LibraryList profile={profile} setup={setup} onInspect={setSheetExercise} />
          ) : null}
        </div>

        {/* --- Session panel --- */}
        <div
          ref={sessionRef}
          className="order-2 lg:sticky lg:top-24 lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1"
        >
          <Card>
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
                message="Pick a movement above and tap Add, or load a preset to start from a template."
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
                          {entry.unit === 'seconds' ? 's' : ' reps'} = {fmt(entry.volume)}{' '}
                          {entry.unit === 'seconds' ? 'sec' : 'reps'}
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
                    <span className="font-mono text-ember-300">×{fmtDecimal(multiplier, 2)}</span>
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
                      <TriangleAlert
                        className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
                        aria-hidden
                      />
                      <p className="text-xs leading-relaxed text-rose-200">{sessionError}</p>
                    </div>
                  ) : null}

                  <Button size="lg" className="w-full" onClick={() => void finish()} disabled={busy}>
                    {busy ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    )}
                    Finish session
                  </Button>
                </div>
              </>
            )}
          </Card>

          {/* Rest timer lives beside the session so it is reachable mid-workout. */}
          <div className="mt-4">
            <RestTimer />
          </div>
        </div>

        {/* --- Locked movements (log tab only) --- */}
        {tab === 'log' && locked.length > 0 ? (
          <div className="order-3 lg:col-span-3 lg:col-start-1 lg:row-start-2">
            <Card>
              <CardHeader
                title="Locked Movements"
                subtitle="Tap any of them to see exactly how to train for it."
                icon={<Lock className="h-4 w-4" aria-hidden />}
              />
              <ul className="divide-y divide-white/5">
                {locked.map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => setSheetExercise(exercise)}
                      className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.03]"
                    >
                      <div className="shrink-0 text-slate-600">
                        <ExerciseDiagram
                          diagram={exercise.diagram}
                          className="h-12 w-16"
                          title={exercise.name}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-400">
                          <Lock className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />
                          {exercise.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          {lockReason(exercise, profile)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}
      </div>

      {/* --- Sticky mobile summary: always-visible proof the add worked --- */}
      {entries.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[57px] z-30 border-t border-white/10 bg-ink-900/95 px-4 py-2.5 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                sessionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="min-w-0 flex-1 text-left"
            >
              <p className="text-xs font-semibold text-slate-200">
                {fmt(entries.length)} movement{entries.length === 1 ? '' : 's'} queued
              </p>
              <p className="font-mono text-[11px] text-forge-300">+{fmt(projectedXp)} XP</p>
            </button>
            <Button size="sm" onClick={() => void finish()} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
              Finish
            </Button>
          </div>
        </div>
      ) : null}

      <ExerciseSheet
        exercise={sheetExercise}
        profile={profile}
        onClose={() => setSheetExercise(null)}
        onPick={(exercise) => {
          setPickedId(exercise.id);
          setTab('log');
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Setup filter                                                                */
/* -------------------------------------------------------------------------- */

/** What can you actually train with right now? Filters everything below it. */
function SetupFilter({
  setup,
  onChange,
}: {
  setup: SetupKey;
  onChange: (setup: SetupKey) => void;
}) {
  const active = SETUPS.find((s) => s.key === setup) ?? SETUPS[0];
  return (
    <Card className="p-4">
      <p className="mb-2.5 font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        What have you got access to?
      </p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SETUPS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              setup === option.key
                ? 'bg-forge-500/15 text-forge-300 ring-1 ring-forge-500/30'
                : 'bg-white/5 text-slate-500 ring-1 ring-white/5 hover:text-slate-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-600">{active.description}</p>
    </Card>
  );
}

/** The muscles a movement trains, primary highlighted. */
function MuscleChips({ exerciseId }: { exerciseId: string }) {
  const profile = muscleProfileFor(exerciseId);
  if (profile.primary.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {profile.primary.map((m: MuscleKey) => (
        <span
          key={m}
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ color: MUSCLE_META[m].hex, backgroundColor: `${MUSCLE_META[m].hex}1f` }}
        >
          {MUSCLE_META[m].label}
        </span>
      ))}
      {profile.secondary.map((m: MuscleKey) => (
        <span key={m} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">
          {MUSCLE_META[m].label}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exercise picker                                                             */
/* -------------------------------------------------------------------------- */

function ExercisePicker({
  available,
  profile,
  onAdd,
  onInspect,
  disabled,
  pickedId,
  onConsumePick,
}: {
  available: Exercise[];
  profile: Profile;
  onAdd: (entry: WorkoutEntry) => void;
  onInspect: (exercise: Exercise) => void;
  disabled: boolean;
  pickedId: string | null;
  onConsumePick: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(available[0]?.id ?? '');
  const [sets, setSets] = useState('3');
  const [amount, setAmount] = useState('10');
  const [error, setError] = useState<string | null>(null);

  // A "Log this" tap from the Library selects that movement here. This runs in
  // an effect rather than during render because clearing the pick updates the
  // *parent* — doing that mid-render triggers a React warning.
  useEffect(() => {
    if (!pickedId) return;
    const picked = available.find((e) => e.id === pickedId);
    if (picked) {
      setSelectedId(picked.id);
      setAmount(picked.unit === 'seconds' ? '30' : '10');
    }
    onConsumePick();
  }, [pickedId, available, onConsumePick]);

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

  const step = (delta: number, value: string, setValue: (v: string) => void, min: number, max: number) => {
    const next = Math.min(max, Math.max(min, int(num(value, min), min) + delta));
    setValue(String(next));
    setError(null);
  };

  return (
    <Card>
      <CardHeader
        title="Add a Movement"
        subtitle="Every basic movement is available from level 1."
        icon={<Plus className="h-4 w-4" aria-hidden />}
      />
      <div className="space-y-4 p-5">
        <Field label="Exercise">
          <select
            value={selected?.id ?? ''}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setError(null);
              const next = available.find((ex) => ex.id === e.target.value);
              setAmount(next?.unit === 'seconds' ? '30' : '10');
            }}
            className="w-full rounded-xl bg-ink-900 px-3.5 py-3 text-sm text-slate-100 ring-1 ring-white/10 transition focus:outline-none focus:ring-2 focus:ring-forge-500"
          >
            {CATEGORY_ORDER.map((category) => {
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

        {/* --- Selected movement preview --- */}
        {selected ? (
          <button
            type="button"
            onClick={() => onInspect(selected)}
            className="flex w-full items-center gap-3 rounded-xl bg-ink-900/60 p-3 text-left ring-1 ring-white/5 transition hover:ring-white/15"
          >
            <div className="shrink-0 text-forge-300">
              <ExerciseDiagram
                diagram={selected.diagram}
                className="h-14 w-20"
                title={selected.name}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip className={`${CATEGORY_META[selected.category].ring} ${CATEGORY_META[selected.category].color}`}>
                  {CATEGORY_META[selected.category].label}
                </Chip>
                <Chip className="bg-white/5 text-slate-400 ring-white/10">
                  {fmtDecimal(selected.xpPerUnit, 2)} XP/
                  {selected.unit === 'seconds' ? 'sec' : 'rep'}
                </Chip>
                {selected.custom ? (
                  <Chip className="bg-arcane-500/10 text-arcane-300 ring-arcane-500/30">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    Custom
                  </Chip>
                ) : null}
              </div>
              <div className="mt-1.5">
                <MuscleChips exerciseId={selected.id} />
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-forge-300">
                <Info className="h-3 w-3" aria-hidden />
                How to do it · needs {EQUIPMENT_META[equipmentFor(selected)].short}
              </p>
            </div>
          </button>
        ) : null}

        {/* --- Sets & reps with tap-friendly steppers --- */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sets" hint={`1–${LIMITS.MAX_SETS}`}>
            <Stepper
              value={sets}
              onChange={(v) => {
                setSets(v);
                setError(null);
              }}
              onStep={(d) => step(d, sets, setSets, 1, LIMITS.MAX_SETS)}
              max={LIMITS.MAX_SETS}
            />
          </Field>
          <Field
            label={selected?.unit === 'seconds' ? 'Seconds / set' : 'Reps / set'}
            hint={selected?.unit === 'seconds' ? `1–${LIMITS.MAX_SECONDS}` : `1–${LIMITS.MAX_REPS}`}
          >
            <Stepper
              value={amount}
              onChange={(v) => {
                setAmount(v);
                setError(null);
              }}
              onStep={(d) =>
                step(
                  d * (selected?.unit === 'seconds' ? 5 : 1),
                  amount,
                  setAmount,
                  1,
                  selected?.unit === 'seconds' ? LIMITS.MAX_SECONDS : LIMITS.MAX_REPS,
                )
              }
              max={selected?.unit === 'seconds' ? LIMITS.MAX_SECONDS : LIMITS.MAX_REPS}
            />
          </Field>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-500/25">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
            <p className="text-xs leading-relaxed text-rose-200">{error}</p>
          </div>
        ) : null}

        <Button size="lg" className="w-full" onClick={submit} disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden />
          Add to session · +{fmt(previewXp)} XP
        </Button>

        {disabled ? (
          <p className="text-xs text-amber-400/80">
            This session is full at {LIMITS.MAX_ENTRIES} movements. Finish it and log another.
          </p>
        ) : null}

        {profile.customExercises.length === 0 ? (
          <p className="text-center text-[11px] leading-relaxed text-slate-600">
            Missing a movement? Add your own from the Profile tab.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Number field with big +/- targets — typing on a phone keyboard is painful. */
function Stepper({
  value,
  onChange,
  onStep,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  onStep: (delta: number) => void;
  max: number;
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => onStep(-1)}
        className="w-11 shrink-0 rounded-xl bg-ink-750 font-mono text-lg font-bold text-slate-300 ring-1 ring-white/10 transition active:bg-ink-700"
        aria-label="Decrease"
      >
        −
      </button>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-center font-mono text-base"
      />
      <button
        type="button"
        onClick={() => onStep(1)}
        className="w-11 shrink-0 rounded-xl bg-ink-750 font-mono text-lg font-bold text-slate-300 ring-1 ring-white/10 transition active:bg-ink-700"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Library                                                                     */
/* -------------------------------------------------------------------------- */

function LibraryList({
  profile,
  setup,
  onInspect,
}: {
  profile: Profile;
  setup: SetupKey;
  onInspect: (exercise: Exercise) => void;
}) {
  const [muscle, setMuscle] = useState<MuscleKey | 'all'>('all');

  const catalog = useMemo(
    () =>
      allExercisesFor(profile)
        .filter((e) => matchesSetup(e, setup))
        .filter((e) => muscle === 'all' || musclesFor(e.id).includes(muscle)),
    [profile, setup, muscle],
  );

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          Every movement, with form cues, common mistakes and — for the elite skills — a
          step-by-step route to earning them. Tap any movement for the full breakdown.
        </p>
        <p className="mb-2 mt-4 font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Filter by muscle
        </p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setMuscle('all')}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
              muscle === 'all'
                ? 'bg-forge-500/15 text-forge-300 ring-1 ring-forge-500/30'
                : 'bg-white/5 text-slate-500 ring-1 ring-white/5'
            }`}
          >
            All
          </button>
          {MUSCLE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMuscle(key)}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ring-1 transition"
              style={
                muscle === key
                  ? {
                      color: MUSCLE_META[key].hex,
                      backgroundColor: `${MUSCLE_META[key].hex}26`,
                      borderColor: 'transparent',
                    }
                  : { color: '#64748b', backgroundColor: 'rgba(255,255,255,0.04)' }
              }
            >
              {MUSCLE_META[key].label}
            </button>
          ))}
        </div>
      </Card>

      {catalog.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing matches"
            message="No movement fits that muscle and equipment combination. Widen either filter."
          />
        </Card>
      ) : null}

      {CATEGORY_ORDER.map((category) => {
        const group = catalog.filter((e) => e.category === category);
        if (group.length === 0) return null;
        const meta = CATEGORY_META[category];

        return (
          <Card key={category}>
            <CardHeader title={meta.label} subtitle={`${group.length} movements`} />
            <ul className="divide-y divide-white/5">
              {group.map((exercise) => {
                const unlocked = isUnlocked(exercise, profile);
                const grade = GRADE_META[exercise.grade];
                return (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => onInspect(exercise)}
                      className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.03]"
                    >
                      <div className={`shrink-0 ${unlocked ? meta.color : 'text-slate-700'}`}>
                        <ExerciseDiagram
                          diagram={exercise.diagram}
                          className="h-12 w-16"
                          title={exercise.name}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`flex items-center gap-1.5 text-sm font-medium ${
                            unlocked ? 'text-slate-200' : 'text-slate-500'
                          }`}
                        >
                          {!unlocked ? (
                            <Lock className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />
                          ) : null}
                          {exercise.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${grade.color}`}
                          >
                            {grade.label}
                          </span>
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {EQUIPMENT_META[equipmentFor(exercise)].short}
                          </span>
                        </div>
                        <div className="mt-1">
                          <MuscleChips exerciseId={exercise.id} />
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

function PresetList({
  profile,
  setup,
  onLoad,
}: {
  profile: Profile;
  setup: SetupKey;
  onLoad: (preset: Preset) => void;
}) {
  const catalog = useMemo(() => allExercisesFor(profile), [profile]);

  // A routine is offered when every movement in it fits the chosen setup.
  const visible = useMemo(
    () =>
      PRESETS.filter((preset) =>
        preset.items.every((item) => {
          const exercise = catalog.find((e) => e.id === item.exerciseId);
          return !exercise || matchesSetup(exercise, setup);
        }),
      ),
    [catalog, setup],
  );

  if (visible.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No routines for that setup"
          message="Every stored routine needs equipment you have not selected. Choose a broader setup above."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {visible.map((preset) => {
        const items = preset.items.map((item) => {
          const exercise = catalog.find((e) => e.id === item.exerciseId);
          return { item, exercise, unlocked: exercise ? isUnlocked(exercise, profile) : false };
        });

        const lockedCount = items.filter((i) => !i.unlocked).length;
        const allLocked = lockedCount === items.length;
        const belowLevel = int(profile.level, 1) < preset.recommendedLevel;

        return (
          <Card key={preset.id} className="overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-semibold text-slate-100">
                  {preset.name}
                </h3>
                <Chip
                  className={`${CATEGORY_META[preset.focus].ring} ${CATEGORY_META[preset.focus].color}`}
                >
                  {CATEGORY_META[preset.focus].label}
                </Chip>
                {belowLevel ? (
                  <Chip className="bg-amber-500/10 text-amber-300 ring-amber-500/30">
                    Suggested Lv {fmt(preset.recommendedLevel)}+
                  </Chip>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{preset.description}</p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {preset.targets.map((t) => {
                  const meta = MUSCLE_META[t as MuscleKey];
                  if (!meta) return null;
                  return (
                    <span
                      key={t}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ color: meta.hex, backgroundColor: `${meta.hex}1f` }}
                    >
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <ul className="divide-y divide-white/5 border-t border-white/5">
              {items.map(({ item, exercise, unlocked }) => (
                <li
                  key={item.exerciseId}
                  className="flex items-center justify-between gap-4 px-5 py-2.5"
                >
                  <p
                    className={`flex items-center gap-2 text-sm ${
                      unlocked ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {!unlocked ? <Lock className="h-3 w-3 shrink-0" aria-hidden /> : null}
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

            <div className="border-t border-white/5 p-4">
              <Button
                variant={allLocked ? 'secondary' : 'primary'}
                className="w-full"
                onClick={() => onLoad(preset)}
                disabled={allLocked}
              >
                {allLocked ? 'All movements locked' : 'Load this session'}
              </Button>
              {lockedCount > 0 && !allLocked ? (
                <p className="mt-2 text-center text-[11px] text-amber-400/80">
                  {lockedCount} locked movement{lockedCount === 1 ? '' : 's'} will be skipped.
                </p>
              ) : null}
            </div>
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
        active ? 'bg-ink-750 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
