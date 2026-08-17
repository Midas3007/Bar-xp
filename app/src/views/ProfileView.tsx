import { useState } from 'react';
import {
  Award,
  Check,
  Dumbbell,
  Pencil,
  Percent,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import type { ExerciseCategory, Profile } from '../lib/types';
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  Input,
  ProgressBar,
  Spinner,
} from '../components/ui/Primitives';
import { Avatar } from '../components/layout/AppShell';
import { Achievements } from '../components/Achievements';
import {
  IdentityChip,
  LevelBar,
  NeonName,
  StatGrid,
  StatReadout,
  TierBadge,
  TierProgress,
} from '../components/GameBits';
import { CATEGORY_META } from '../lib/game/exercises';
import { STAT_META, identityForStreak } from '../lib/game/constants';
import { validateCustomExercise, LIMITS } from '../lib/game/validation';
import {
  addCustomExercise,
  removeCustomExercise,
  updateBodyFat,
  updateDisplayName,
} from '../lib/data';
import { useToast } from '../context/ToastContext';
import { arr, fmt, fmtDecimal, int, num } from '../lib/safe';

export function ProfileView({ profile }: { profile: Profile }) {
  const personalBests = Object.values(profile.personalBests ?? {}).sort(
    (a, b) => num(b.achievedAt, 0) - num(a.achievedAt, 0),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHeader profile={profile} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
              Core Stats
            </h2>
            <StatGrid stats={profile.stats} />
            <div className="mt-5 border-t border-white/5 pt-5">
              <TierProgress stats={profile.stats} />
            </div>
          </Card>

          <DisciplineCard profile={profile} />
          <BodyFatCard profile={profile} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Personal Bests"
              subtitle="Your best single set for each movement."
              icon={<Award className="h-4 w-4" aria-hidden />}
            />
            {personalBests.length === 0 ? (
              <EmptyState
                icon={<Award className="h-8 w-8" aria-hidden />}
                title="No personal bests yet"
                message="Log a movement twice and the better set becomes your PR."
              />
            ) : (
              <ul className="divide-y divide-white/5">
                {personalBests.map((pb) => (
                  <li
                    key={pb.exerciseId}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {pb.exerciseName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {formatDate(pb.achievedAt)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold text-ember-300">
                      {fmt(pb.value)}
                      <span className="ml-1 text-[11px] font-normal text-slate-500">
                        {pb.unit === 'seconds' ? 'sec' : 'reps'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <CustomExercisesCard profile={profile} />
        </div>
      </div>

      <Achievements profile={profile} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

function ProfileHeader({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Name too short', 'Use at least 2 characters.');
      return;
    }
    setBusy(true);
    try {
      await updateDisplayName(profile, trimmed);
      toast.success('Name updated');
      setEditing(false);
    } catch (error) {
      console.error('[profile] failed to update name', error);
      toast.error('Could not update your name');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden" glow>
      <div
        className="p-6 sm:p-8"
        style={{
          background:
            'radial-gradient(600px 300px at 0% 0%, rgba(168,85,247,0.10), transparent 65%)',
        }}
      >
        <div className="flex flex-wrap items-start gap-5">
          <Avatar profile={profile} size={64} />

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex max-w-sm items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={LIMITS.MAX_NAME_LENGTH}
                  aria-label="Display name"
                />
                <Button size="sm" onClick={() => void save()} disabled={busy}>
                  {busy ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" aria-hidden />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setName(profile.displayName);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  <NeonName
                    name={profile.displayName}
                    activeCosmetic={profile.activeCosmetic}
                    ownedCosmetics={profile.inventory.cosmetics}
                  />
                </h1>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg p-1.5 text-slate-600 transition hover:bg-white/5 hover:text-slate-300"
                  aria-label="Edit display name"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}

            <p className="mt-1 truncate text-xs text-slate-600">{profile.email}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TierBadge tierName={profile.tier} />
              <IdentityChip streak={profile.streak.current} />
              {profile.inventory.streakShields > 0 ? (
                <Chip className="bg-forge-500/10 text-forge-300 ring-forge-500/30">
                  <Shield className="h-3 w-3" aria-hidden />
                  {fmt(profile.inventory.streakShields)} shield
                  {profile.inventory.streakShields === 1 ? '' : 's'}
                </Chip>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-7">
          <LevelBar totalXp={profile.totalXp} />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-5 border-t border-white/5 pt-6 sm:grid-cols-4">
          <StatReadout label="Sessions" value={fmt(profile.workoutCount)} />
          <StatReadout label="Lifetime reps" value={fmt(profile.totalReps)} />
          <StatReadout
            label="Best streak"
            value={`${fmt(profile.streak.best)}d`}
            accent="text-ember-300"
          />
          <StatReadout
            label="Shields used"
            value={fmt(profile.streak.shieldsUsed)}
            sub="streaks saved"
          />
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Discipline                                                                  */
/* -------------------------------------------------------------------------- */

function DisciplineCard({ profile }: { profile: Profile }) {
  const identity = identityForStreak(profile.streak.current);
  const discipline = num(profile.stats.discipline, 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
          Discipline
        </h2>
        <span className={`font-display text-2xl font-bold ${STAT_META.discipline.color}`}>
          {fmtDecimal(discipline, 1)}
        </span>
      </div>

      <ProgressBar
        value={discipline}
        max={250}
        gradient="from-arcane-500 to-arcane-300"
        height="h-2"
        animated={false}
        label="Discipline"
      />

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {STAT_META.discipline.blurb}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/5 pt-5">
        <StatReadout
          label="Current"
          value={`${fmt(profile.streak.current)}d`}
          accent={identity.text}
        />
        <StatReadout label="Best" value={`${fmt(profile.streak.best)}d`} />
        <StatReadout label="Identity" value={identity.label} accent={identity.text} />
      </div>

      <p className="mt-4 text-[11px] italic leading-relaxed text-slate-600">{identity.blurb}</p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Body fat                                                                    */
/* -------------------------------------------------------------------------- */

function BodyFatCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const bodyFat = num(value, NaN);
    if (!Number.isFinite(bodyFat) || bodyFat < LIMITS.MIN_BODY_FAT || bodyFat > LIMITS.MAX_BODY_FAT) {
      setError(`Enter a value between ${LIMITS.MIN_BODY_FAT}% and ${LIMITS.MAX_BODY_FAT}%.`);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await updateBodyFat(profile, bodyFat);
      toast.success('Body fat recorded', 'A new snapshot was added to your progress charts.');
      setValue('');
    } catch (err) {
      console.error('[profile] failed to record body fat', err);
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
          <Percent className="h-4 w-4 text-slate-500" aria-hidden />
          Body Composition
        </h2>
        <span className="font-display text-2xl font-bold text-vital-300">
          {profile.bodyFat > 0 ? `${fmtDecimal(profile.bodyFat, 1)}%` : '—'}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Recording a leaner reading raises your Aesthetics floor and adds a point to the progress
        chart. It never lowers a stat you have already earned.
      </p>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Field label="New reading" error={error}>
            <Input
              type="number"
              inputMode="decimal"
              min={LIMITS.MIN_BODY_FAT}
              max={LIMITS.MAX_BODY_FAT}
              step="0.5"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="18.5"
            />
          </Field>
        </div>
        <Button onClick={() => void save()} disabled={busy || value === ''} className="mb-[22px]">
          {busy ? <Spinner className="h-4 w-4" /> : null}
          Record
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Custom exercises                                                            */
/* -------------------------------------------------------------------------- */

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'skill', 'conditioning'];

function CustomExercisesCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  const custom = arr<Profile['customExercises'][number]>(profile.customExercises);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [xp, setXp] = useState('1');
  const [unit, setUnit] = useState<'reps' | 'seconds'>('reps');
  const [category, setCategory] = useState<ExerciseCategory>('conditioning');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setXp('1');
    setUnit('reps');
    setCategory('conditioning');
    setError(null);
    setOpen(false);
  };

  const save = async () => {
    const check = validateCustomExercise({
      name,
      xpPerUnit: num(xp, NaN),
      existingCount: custom.length,
    });
    if (!check.ok) {
      setError(check.error ?? 'Check the details.');
      return;
    }

    setBusy(true);
    try {
      await addCustomExercise(profile, {
        name: name.trim(),
        xpPerUnit: num(xp, 1),
        unit,
        category,
      });
      toast.success(`${name.trim()} added`, 'It is now selectable in the workout logger.');
      reset();
    } catch (err) {
      console.error('[profile] failed to add custom exercise', err);
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, label: string) => {
    try {
      await removeCustomExercise(profile, id);
      toast.success(`${label} removed`);
    } catch (error) {
      console.error('[profile] failed to remove custom exercise', error);
      toast.error('Could not remove that movement');
    }
  };

  return (
    <Card>
      <CardHeader
        title="Custom Exercises"
        subtitle={`Your own movements, with your own XP values. ${custom.length}/${LIMITS.MAX_CUSTOM_EXERCISES} used.`}
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        action={
          !open ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpen(true)}
              disabled={custom.length >= LIMITS.MAX_CUSTOM_EXERCISES}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </Button>
          ) : null
        }
      />

      {open ? (
        <div className="space-y-4 border-b border-white/5 bg-ink-900/40 p-5">
          <Field label="Movement name">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Weighted Ring Dip"
              maxLength={LIMITS.MAX_NAME_LENGTH}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Measured in">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value === 'seconds' ? 'seconds' : 'reps')}
                className="w-full rounded-xl bg-ink-900 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-forge-500"
              >
                <option value="reps">Reps</option>
                <option value="seconds">Seconds (hold)</option>
              </select>
            </Field>

            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
                className="w-full rounded-xl bg-ink-900 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-forge-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label={`Base XP per ${unit === 'seconds' ? 'second' : 'rep'}`}
            hint={`Between ${LIMITS.MIN_CUSTOM_XP} and ${LIMITS.MAX_CUSTOM_XP}. For reference: a push-up is 1.0, a pull-up 3.6.`}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={LIMITS.MIN_CUSTOM_XP}
              max={LIMITS.MAX_CUSTOM_XP}
              step="0.1"
              value={xp}
              onChange={(e) => {
                setXp(e.target.value);
                setError(null);
              }}
            />
          </Field>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-500/25">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
              <p className="text-xs leading-relaxed text-rose-200">{error}</p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
              Save movement
            </Button>
          </div>
        </div>
      ) : null}

      {custom.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-8 w-8" aria-hidden />}
          title="No custom movements"
          message="Add anything the catalog is missing — weighted variations, rings work, or your own inventions."
        />
      ) : (
        <ul className="divide-y divide-white/5">
          {custom.map((exercise) => (
            <li key={exercise.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-200">{exercise.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                  {fmtDecimal(exercise.xpPerUnit, 2)} XP per{' '}
                  {exercise.unit === 'seconds' ? 'second' : 'rep'} ·{' '}
                  {CATEGORY_META[exercise.category].label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(exercise.id, exercise.name)}
                className="shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:bg-white/5 hover:text-rose-300"
                aria-label={`Remove ${exercise.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Timestamp -> short date, tolerant of missing values. */
function formatDate(timestamp: unknown): string {
  const ts = int(timestamp, 0);
  if (ts <= 0) return 'Recorded';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Recorded';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
