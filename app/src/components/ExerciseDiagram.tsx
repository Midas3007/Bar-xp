import type { DiagramKey } from '../lib/types';

/**
 * Schematic movement figures.
 *
 * Drawn inline rather than loaded as images so they work with no network, no
 * CDN and no licensing questions — which matters given the app is mostly run
 * from a phone. Each figure is a side-on stick figure in the *working
 * position* of the movement, built from a consistent body plan (head, torso,
 * arms, legs) so the poses read as the same person doing different things.
 *
 * They are diagrams, not photographs — every movement also carries a
 * "Watch a demo" link for real footage.
 */

const C = 'currentColor';

/** Torso and limbs. Slightly heavier stroke for the trunk. */
function Limb({ d, w = 3.6 }: { d: string; w?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={C}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.92}
    />
  );
}

/** The alternate position of the movement, drawn faintly. */
function Ghost({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={C}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.2}
      strokeDasharray="4 5"
    />
  );
}

function Head({ x, y, r = 8 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={C} opacity={0.92} />;
}

/** Dashed floor line. */
function Floor({ y = 106 }: { y?: number }) {
  return (
    <line
      x1={10}
      y1={y}
      x2={190}
      y2={y}
      stroke={C}
      strokeWidth={1.5}
      opacity={0.22}
      strokeDasharray="5 5"
    />
  );
}

/** Solid equipment: bars, benches, poles, walls. */
function Rig({ d, w = 4 }: { d: string; w?: number }) {
  return (
    <path d={d} fill="none" stroke={C} strokeWidth={w} strokeLinecap="round" opacity={0.38} />
  );
}

const FIGURES: Record<DiagramKey, React.ReactNode> = {
  /* Push-up — bottom position, chest low, elbows bent. */
  pushup: (
    <>
      <Floor />
      <Limb d="M74 80 L126 90" w={4.4} />
      <Limb d="M74 80 L58 92 L60 106" />
      <Limb d="M126 90 L152 98 L174 104" />
      <Ghost d="M74 62 L58 78 L60 106" />
      <Head x={62} y={74} />
    </>
  ),

  /* Incline push-up — hands raised on a bench. */
  incline: (
    <>
      <Floor />
      <Rig d="M112 58 L188 58 M124 58 L124 106" />
      <Limb d="M92 90 L128 78" w={4.4} />
      <Limb d="M92 90 L66 98 L40 106" />
      <Limb d="M128 78 L128 66 L134 58" />
      <Head x={140} y={72} />
    </>
  ),

  /* Pike push-up — hips high, head toward the floor. */
  pike: (
    <>
      <Floor />
      <Limb d="M84 74 L110 44" w={4.4} />
      <Limb d="M110 44 L136 76 L156 106" />
      <Limb d="M84 74 L66 88 L60 106" />
      <Head x={72} y={92} r={7.5} />
    </>
  ),

  /* Dip — bottom position on parallel bars. */
  dip: (
    <>
      <Floor />
      <Rig d="M56 52 L80 52 M64 52 L64 106" />
      <Rig d="M120 52 L144 52 M136 52 L136 106" />
      <Limb d="M100 48 L100 80" w={4.4} />
      <Limb d="M100 48 L74 60 L66 52" />
      <Limb d="M100 48 L126 60 L134 52" />
      <Limb d="M100 80 L94 98 L108 104" />
      <Head x={100} y={34} />
    </>
  ),

  /* Australian row — under a low bar, chest pulled up to it. */
  row: (
    <>
      <Floor />
      <Rig d="M74 46 L126 46 M100 46 L100 106" w={3.5} />
      <Limb d="M58 82 L108 88" w={4.4} />
      <Limb d="M108 88 L138 94 L170 100" />
      <Limb d="M58 82 L76 64 L96 48" />
      <Head x={44} y={80} r={7.5} />
    </>
  ),

  /* Pull-up — top position, chin over the bar; ghost shows the dead hang. */
  pullup: (
    <>
      <Rig d="M46 18 L154 18" />
      <Limb d="M100 54 L100 84" w={4.4} />
      <Limb d="M86 18 L78 40 L100 54" />
      <Limb d="M114 18 L122 40 L100 54" />
      <Limb d="M100 84 L94 102 L98 116" />
      <Limb d="M100 84 L108 102 L106 116" />
      <Ghost d="M86 18 L86 62 M114 18 L114 62" />
      <Head x={100} y={40} />
    </>
  ),

  /* Bodyweight squat — bottom position, hips below the knees. */
  squat: (
    <>
      <Floor />
      <Limb d="M96 54 L92 78" w={4.4} />
      <Limb d="M92 78 L120 84 L112 106" />
      <Limb d="M96 54 L136 58" />
      <Ghost d="M96 30 L96 54" />
      <Head x={96} y={40} />
    </>
  ),

  /* Lunge — back knee dropped toward the floor. */
  lunge: (
    <>
      <Floor />
      <Limb d="M96 48 L96 74" w={4.4} />
      <Limb d="M96 74 L130 84 L130 106" />
      <Limb d="M96 74 L66 92 L52 106" />
      <Limb d="M96 52 L112 68" />
      <Head x={96} y={34} />
    </>
  ),

  /* Pistol squat — one leg down, the other held straight out front. */
  pistol: (
    <>
      <Floor />
      <Limb d="M92 52 L88 80" w={4.4} />
      <Limb d="M88 80 L112 88 L104 106" />
      <Limb d="M88 80 L130 76 L166 70" />
      <Limb d="M92 52 L132 56" />
      <Head x={92} y={38} />
    </>
  ),

  /* Plank — forearms down, body in one line. */
  plank: (
    <>
      <Floor />
      <Limb d="M62 86 L116 92" w={4.4} />
      <Limb d="M116 92 L146 98 L172 104" />
      <Limb d="M62 86 L60 106 L80 106" />
      <Head x={50} y={80} r={7.5} />
    </>
  ),

  /* Hollow hold — on the back, lower back pinned, banana shape. */
  hollow: (
    <>
      <Floor />
      <Limb d="M66 84 Q104 100 152 78" w={4.4} />
      <Limb d="M66 84 L48 74 L38 66" />
      <Head x={62} y={80} r={7.5} />
      <Ghost d="M66 96 L152 96" />
    </>
  ),

  /* Lying leg raise — legs lifted toward vertical. */
  legraise: (
    <>
      <Floor />
      <Limb d="M52 100 L104 100" w={4.4} />
      <Limb d="M104 100 L126 74 L142 52" />
      <Limb d="M52 100 L40 92" />
      <Ghost d="M104 100 L166 100" />
      <Head x={44} y={98} r={7.5} />
    </>
  ),

  /* Hanging knee raise — knees curled to the chest. */
  kneeraise: (
    <>
      <Rig d="M46 18 L154 18" />
      <Limb d="M88 18 L100 56" />
      <Limb d="M112 18 L100 56" />
      <Limb d="M100 56 L100 80" w={4.4} />
      <Limb d="M100 80 L76 76 L84 56" />
      <Ghost d="M100 80 L100 116" />
      <Head x={100} y={44} />
    </>
  ),

  /* L-sit — supported on straight arms, legs locked out horizontal. */
  lsit: (
    <>
      <Floor />
      <Rig d="M62 76 L84 76 M72 76 L72 106" w={3.5} />
      <Rig d="M116 76 L138 76 M128 76 L128 106" w={3.5} />
      <Limb d="M100 50 L100 76" w={4.4} />
      <Limb d="M100 50 L76 74" />
      <Limb d="M100 50 L124 74" />
      <Limb d="M100 76 L134 75 L168 74" />
      <Head x={100} y={36} />
    </>
  ),

  /* Front lever — hanging horizontal under the bar, arms straight. */
  lever: (
    <>
      <Rig d="M46 20 L154 20" />
      <Limb d="M76 20 L76 58" />
      <Limb d="M76 58 L126 60" w={4.4} />
      <Limb d="M126 60 L152 61 L178 62" />
      <Ghost d="M76 58 L76 108" />
      <Head x={64} y={57} r={7.5} />
    </>
  ),

  /* Planche — horizontal, held on straight arms. */
  planche: (
    <>
      <Floor />
      <Limb d="M78 106 L78 72" />
      <Limb d="M78 72 L128 70" w={4.4} />
      <Limb d="M128 70 L154 69 L178 68" />
      <Ghost d="M78 72 L46 72" />
      <Head x={66} y={70} r={7.5} />
    </>
  ),

  /* Handstand push-up — bottom position against a wall. */
  handstand: (
    <>
      <Floor />
      <Rig d="M168 10 L168 106" w={3} />
      <Limb d="M110 84 L118 50" w={4.4} />
      <Limb d="M118 50 L122 30 L126 14" />
      <Limb d="M108 106 L94 92 L110 84" />
      <Ghost d="M138 106 L138 24" />
      <Head x={98} y={94} r={7.5} />
    </>
  ),

  /* Human flag — side-on to a vertical pole, body horizontal. */
  flag: (
    <>
      <Floor />
      <Rig d="M54 8 L54 106" />
      <Limb d="M54 34 L92 56" />
      <Limb d="M54 74 L92 56" />
      <Limb d="M92 56 L140 56" w={4.4} />
      <Limb d="M140 56 L164 56 L188 56" />
      <Head x={104} y={54} r={7.5} />
    </>
  ),

  /* Burpee — the jump at the top of the rep. */
  burpee: (
    <>
      <Floor />
      <Limb d="M100 46 L100 72" w={4.4} />
      <Limb d="M100 72 L90 90 L86 102" />
      <Limb d="M100 72 L110 90 L114 102" />
      <Limb d="M100 48 L86 30 L80 14" />
      <Limb d="M100 48 L114 30 L120 14" />
      <Ghost d="M62 100 L138 100" />
      <Head x={100} y={32} />
    </>
  ),

  /* Jump rope — mid-skip, rope arcing beneath. */
  jump: (
    <>
      <Floor />
      <Limb d="M100 44 L100 70" w={4.4} />
      <Limb d="M100 70 L94 88 L92 100" />
      <Limb d="M100 70 L106 88 L108 100" />
      <Limb d="M100 46 L84 56 L80 66" />
      <Limb d="M100 46 L116 56 L120 66" />
      <path
        d="M80 66 Q100 124 120 66"
        fill="none"
        stroke={C}
        strokeWidth={2.2}
        opacity={0.45}
        strokeLinecap="round"
      />
      <Head x={100} y={30} />
    </>
  ),
};

/**
 * A movement diagram. Inherits `currentColor`, so wrap it in a text colour to
 * tint it. The dashed ghost limb shows the alternate position of the rep.
 */
export function ExerciseDiagram({
  diagram,
  className = '',
  title,
}: {
  diagram: DiagramKey;
  className?: string;
  title?: string;
}) {
  const figure = FIGURES[diagram] ?? FIGURES.pushup;
  return (
    <svg
      viewBox="0 0 200 120"
      className={className}
      role="img"
      aria-label={title ? `Diagram: ${title}` : 'Exercise diagram'}
      preserveAspectRatio="xMidYMid meet"
    >
      {title ? <title>{title}</title> : null}
      {figure}
    </svg>
  );
}
