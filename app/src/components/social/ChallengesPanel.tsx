import { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Trash2 } from 'lucide-react';

import type { Challenge, ChallengeScore, Profile } from '../../lib/types';
import { Button, Card, CardHeader, Chip, EmptyState, SkeletonBlock } from '../ui/Primitives';
import {
  CHALLENGE_TEMPLATES,
  challengeState,
  resolveChallenge,
  templateById,
} from '../../lib/game/challenges';
import { otherMember } from '../../lib/game/friends';
import {
  createChallenge,
  deleteChallenge,
  fetchChallengeScores,
  fetchChallenges,
  respondToChallenge,
  syncChallengeScore,
  type FriendGraph,
} from '../../lib/social';
import { useToast } from '../../context/ToastContext';
import { fmt, num } from '../../lib/safe';

/**
 * Challenges between friends.
 *
 * Every score here is self-reported, and every card says so with the time it
 * was last computed. The rules guarantee only the narrower thing that is
 * actually achievable: nobody writes anybody else's number.
 */
export function ChallengesPanel({ profile, graph }: { profile: Profile; graph: FriendGraph }) {
  const toast = useToast();
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [scores, setScores] = useState<Record<string, Record<string, ChallengeScore>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [friendUid, setFriendUid] = useState('');
  const [templateId, setTemplateId] = useState(CHALLENGE_TEMPLATES[0].id);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchChallenges(profile.uid);
      setChallenges(list);

      // Publish our own score for anything live, then read both sides back.
      const live = list.filter((c) => challengeState(c) === 'active');
      await Promise.all(
        live.map((c) =>
          syncChallengeScore(profile, c).catch((error) => {
            console.error('[challenges] score sync failed', error);
          }),
        ),
      );

      const pairs = await Promise.all(
        list.map(async (c) => [c.id, await fetchChallengeScores(c.id)] as const),
      );
      setScores(Object.fromEntries(pairs));
    } catch (error) {
      console.error('[challenges] failed to load', error);
      setChallenges([]);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const list = challenges ?? [];
    return {
      active: list.filter((c) => challengeState(c) === 'active'),
      pending: list.filter((c) => {
        const state = challengeState(c);
        return state === 'pending' || state === 'expired';
      }),
      finished: list.filter((c) => {
        const state = challengeState(c);
        return state === 'ended' || state === 'declined';
      }),
    };
  }, [challenges]);

  const act = async (key: string, run: () => Promise<void>, message?: string) => {
    setBusy(key);
    try {
      await run();
      if (message) toast.success(message);
      await load();
    } catch (error) {
      console.error('[challenges] action failed', error);
      toast.error('That did not go through', 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const template = templateById(templateId);
    if (!template || !friendUid) return;
    setCreating(true);
    try {
      await createChallenge(profile, friendUid, template);
      toast.success('Challenge sent', 'It starts as soon as they accept.');
      setFriendUid('');
      await load();
    } catch (error) {
      console.error('[challenges] create failed', error);
      toast.error('Could not create that challenge', 'You can only challenge a friend.');
    } finally {
      setCreating(false);
    }
  };

  if (challenges === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const nameFor = (uid: string) =>
    uid === profile.uid ? 'You' : (graph.people[uid]?.displayName ?? 'Your opponent');

  return (
    <div className="space-y-5">
      {/* --- New challenge --- */}
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
          <Swords className="h-4 w-4 text-slate-500" aria-hidden />
          New challenge
        </h3>
        <p className="text-xs text-slate-500">
          Runs over the week or month you are standing in, including days already trained.
        </p>

        {graph.friendUids.length === 0 ? (
          <p className="mt-3 text-xs text-slate-600">
            Add a friend first — challenges are between friends only.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Opponent</span>
              <select
                value={friendUid}
                onChange={(e) => setFriendUid(e.target.value)}
                className="w-full rounded-xl bg-ink-900 px-3 py-2.5 text-sm text-slate-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-forge-500/50"
              >
                <option value="">Pick a friend…</option>
                {graph.rows.map((row) => (
                  <option key={row.uid} value={row.uid}>
                    {row.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Contest</span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-xl bg-ink-900 px-3 py-2.5 text-sm text-slate-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-forge-500/50"
              >
                {CHALLENGE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-[11px] leading-relaxed text-slate-600">
              {templateById(templateId)?.blurb}
            </p>

            <Button disabled={creating || !friendUid} onClick={() => void create()}>
              Send challenge
            </Button>
          </div>
        )}
      </Card>

      <Group
        title="Active"
        subtitle="Running now. Scores refresh when you open this tab."
        challenges={grouped.active}
        empty="Nothing running."
        {...{ profile, scores, busy, act, nameFor }}
      />
      <Group
        title="Awaiting reply"
        subtitle="Not started until both sides agree."
        challenges={grouped.pending}
        empty="No invitations outstanding."
        {...{ profile, scores, busy, act, nameFor }}
      />
      <Group
        title="Finished"
        subtitle="Results are computed from both scores, never stored."
        challenges={grouped.finished}
        empty="Nothing finished yet."
        {...{ profile, scores, busy, act, nameFor }}
      />
    </div>
  );
}

interface GroupProps {
  title: string;
  subtitle: string;
  challenges: Challenge[];
  empty: string;
  profile: Profile;
  scores: Record<string, Record<string, ChallengeScore>>;
  busy: string | null;
  act: (key: string, run: () => Promise<void>, message?: string) => Promise<void>;
  nameFor: (uid: string) => string;
}

function Group({
  title,
  subtitle,
  challenges,
  empty,
  profile,
  scores,
  busy,
  act,
  nameFor,
}: GroupProps) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={<Swords className="h-4 w-4" aria-hidden />} />
      {challenges.length === 0 ? (
        <EmptyState title={empty} message="" />
      ) : (
        <ul className="divide-y divide-white/5">
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              profile={profile}
              scores={scores[challenge.id] ?? {}}
              busy={busy}
              act={act}
              nameFor={nameFor}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChallengeCard({
  challenge,
  profile,
  scores,
  busy,
  act,
  nameFor,
}: {
  challenge: Challenge;
  profile: Profile;
  scores: Record<string, ChallengeScore>;
  busy: string | null;
  act: GroupProps['act'];
  nameFor: (uid: string) => string;
}) {
  const state = challengeState(challenge);
  const outcome = resolveChallenge(challenge, scores);
  const opponent = otherMember(challenge.members, profile.uid);
  const template = templateById(challenge.templateId);
  const unit = template?.unit ?? '';

  const mine = num(scores[profile.uid]?.value, 0);
  const theirs = num(scores[opponent]?.value, 0);
  const lastUpdated = Math.max(
    num(scores[profile.uid]?.updatedAt, 0),
    num(scores[opponent]?.updatedAt, 0),
  );

  const canRespond = state === 'pending' && challenge.createdBy !== profile.uid;

  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">{challenge.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {challenge.startDay} — {challenge.endDay} · versus {nameFor(opponent)}
          </p>
        </div>
        <StateChip state={state} outcome={outcome} profile={profile} nameFor={nameFor} />
      </div>

      {state === 'active' || state === 'ended' ? (
        <div className="mt-3 flex items-center gap-4">
          <Score label="You" value={mine} unit={unit} winning={mine > theirs} />
          <span className="text-[11px] text-slate-700">vs</span>
          <Score
            label={nameFor(opponent)}
            value={theirs}
            unit={unit}
            winning={theirs > mine}
          />
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
        Scores are self-reported.
        {lastUpdated > 0 ? ` Last updated ${relativeTime(lastUpdated)}.` : ' Not yet computed.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {canRespond ? (
          <>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => void act(challenge.id, () => respondToChallenge(challenge.id, true), 'Challenge accepted')}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void act(challenge.id, () => respondToChallenge(challenge.id, false), 'Challenge declined')}
            >
              Decline
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void act(challenge.id, () => deleteChallenge(challenge.id), 'Challenge removed')}
          aria-label="Remove challenge"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove
        </Button>
      </div>
    </li>
  );
}

function StateChip({
  state,
  outcome,
  profile,
  nameFor,
}: {
  state: ReturnType<typeof challengeState>;
  outcome: ReturnType<typeof resolveChallenge>;
  profile: Profile;
  nameFor: (uid: string) => string;
}) {
  if (state === 'declined') return <Chip>Declined</Chip>;
  if (state === 'expired') return <Chip>Expired unanswered</Chip>;
  if (state === 'pending') return <Chip>Awaiting reply</Chip>;
  if (state === 'active') return <Chip>Running</Chip>;
  if (outcome.tie) return <Chip>Tied</Chip>;
  if (!outcome.winner) return <Chip>No scores</Chip>;
  return <Chip>{outcome.winner === profile.uid ? 'You won' : `${nameFor(outcome.winner)} won`}</Chip>;
}

function Score({
  label,
  value,
  unit,
  winning,
}: {
  label: string;
  value: number;
  unit: string;
  winning: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[11px] text-slate-500">{label}</p>
      <p
        className={`font-mono text-lg font-bold ${winning ? 'text-vital-300' : 'text-slate-300'}`}
      >
        {fmt(value)}
        <span className="ml-1 text-[11px] font-normal text-slate-600">{unit}</span>
      </p>
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
