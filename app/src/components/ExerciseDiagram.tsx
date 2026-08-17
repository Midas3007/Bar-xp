import type { DiagramKey } from '../lib/types';

/**
 * Schematic movement figures.
 *
 * Drawn inline rather than loaded as images so they work with no network, no
 * CDN and no licensing questions — which matters given the app is mostly used
 * from a phone.
 *
 * Anatomy rules these follow, because breaking them is what makes a stick
 * figure look wrong:
 *  - A bent knee puts the shin *below and behind* the knee. The shin never
 *    folds forward past the thigh.
 *  - A bent elbow puts the forearm between the elbow and a plausible hand
 *    position; on the floor the hand is under or just behind the elbow.
 *  - Every hanging figure has its hands ON the drawn bar, not near it.
 *  - Grip width is drawn to scale, so a wide pull-up reads differently from a
 *    standard one.
 *
 * Coordinate system: 200×120 viewBox, floor at y=106.
 */

const C = 'currentColor';

/** Torso and limbs. Heavier stroke for the trunk. */
function L({ d, w = 3.6 }: { d: string; w?: number }) {
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

/** Trunk — slightly thicker than limbs. */
function T({ d }: { d: string }) {
  return <L d={d} w={4.6} />;
}

/** The alternate position of the rep, drawn faintly. */
function G({ d }: { d: string }) {
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

function H({ x, y, r = 8 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={C} opacity={0.92} />;
}

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
  return <path d={d} fill="none" stroke={C} strokeWidth={w} strokeLinecap="round" opacity={0.38} />;
}

/** Marks where the hands grip, so grip width is legible. */
function Grip({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={3.2} fill={C} opacity={0.55} />;
}

const FIGURES: Record<DiagramKey, React.ReactNode> = {
  /* ---------------------------------------------------------------- Push -- */

  /* Push-up — bottom position. Elbow bent back, hand under it. */
  pushup: (
    <>
      <Floor />
      <T d="M78 80 L126 90" />
      <L d="M78 80 L92 93 L76 105" />
      <L d="M126 90 L152 96 L174 103" />
      <G d="M78 64 L77 105" />
      <H x={64} y={76} r={7.5} />
    </>
  ),

  /* Diamond push-up — hands together directly under the chest. */
  diamond: (
    <>
      <Floor />
      <T d="M80 80 L128 90" />
      <L d="M80 80 L94 92 L88 105" />
      <L d="M80 80 L86 94 L88 105" />
      <Grip x={88} y={105} />
      <L d="M128 90 L153 96 L175 103" />
      <H x={66} y={76} r={7.5} />
    </>
  ),

  /* Archer push-up — one arm bent, the other straight out wide. */
  archer_push: (
    <>
      <Floor />
      <T d="M78 78 L122 88" />
      <L d="M78 78 L66 92 L58 105" />
      <L d="M78 78 L118 100 L152 105" />
      <Grip x={58} y={105} />
      <Grip x={152} y={105} />
      <L d="M122 88 L148 93 L172 99" />
      <H x={66} y={72} r={7.5} />
    </>
  ),

  /* One-arm push-up — single hand under the chest, feet wide apart. */
  onearm_push: (
    <>
      <Floor />
      <T d="M84 78 L128 88" />
      <L d="M84 78 L98 91 L92 105" />
      <Grip x={92} y={105} />
      <L d="M128 88 L152 96 L172 104" />
      <L d="M128 88 L154 86 L178 90" />
      <H x={70} y={74} r={7.5} />
    </>
  ),

  /* Incline push-up — hands raised on a bench. */
  incline: (
    <>
      <Floor />
      <Rig d="M126 60 L190 60 M152 60 L152 106" />
      <T d="M92 90 L124 80" />
      <L d="M92 90 L64 98 L38 105" />
      <L d="M124 80 L132 70 L142 60" />
      <Grip x={142} y={60} />
      <H x={134} y={73} r={7.5} />
    </>
  ),

  /* Pike push-up — hips high, head lowered toward the floor. */
  pike: (
    <>
      <Floor />
      <T d="M88 76 L112 44" />
      <L d="M88 76 L74 92 L60 105" />
      <Grip x={60} y={105} />
      <L d="M112 44 L140 74 L158 104" />
      <H x={74} y={94} r={7.5} />
    </>
  ),

  /* Dip — arms bent, hands on parallel bars. */
  dip: (
    <>
      <Floor />
      <Rig d="M46 44 L82 44 M64 44 L64 106" />
      <Rig d="M118 44 L154 44 M136 44 L136 106" />
      <L d="M70 44 L76 56 L100 60" />
      <L d="M130 44 L124 56 L100 60" />
      <Grip x={70} y={44} />
      <Grip x={130} y={44} />
      <T d="M100 60 L100 88" />
      <L d="M100 88 L86 99 L96 110" />
      <H x={100} y={42} />
    </>
  ),

  /* Handstand push-up — bottom position, feet against a wall. */
  handstand: (
    <>
      <Floor />
      <Rig d="M172 8 L172 106" w={3} />
      <L d="M106 105 L92 90 L108 80" />
      <Grip x={106} y={105} />
      <T d="M108 80 L114 48" />
      <L d="M114 48 L118 28 L122 12" />
      <G d="M106 105 L106 72" />
      <H x={94} y={98} r={7.5} />
    </>
  ),

  /* ---------------------------------------------------------------- Pull -- */

  /* Australian row — under a low bar, chest pulled up to it. */
  row: (
    <>
      <Floor />
      <Rig d="M74 52 L126 52 M100 52 L100 106" w={3.5} />
      <Grip x={100} y={52} />
      <L d="M100 52 L84 62 L70 74" />
      <T d="M70 74 L120 84" />
      <L d="M120 84 L148 90 L176 96" />
      <H x={57} y={70} r={7.5} />
    </>
  ),

  /* Chin-up — narrow supinated grip, elbows tucked close to the ribs. */
  chinup: (
    <>
      <Rig d="M46 18 L154 18" />
      <Grip x={92} y={18} />
      <Grip x={108} y={18} />
      <L d="M92 18 L86 44 L100 58" />
      <L d="M108 18 L114 44 L100 58" />
      <T d="M100 58 L100 86" />
      <L d="M100 86 L96 102 L100 116" />
      <G d="M92 18 L94 62" />
      <H x={100} y={42} />
    </>
  ),

  /* Pull-up — standard grip just outside the shoulders. */
  pullup: (
    <>
      <Rig d="M46 18 L154 18" />
      <Grip x={84} y={18} />
      <Grip x={116} y={18} />
      <L d="M84 18 L76 42 L100 56" />
      <L d="M116 18 L124 42 L100 56" />
      <T d="M100 56 L100 86" />
      <L d="M100 86 L95 102 L99 116" />
      <G d="M84 18 L96 60" />
      <H x={100} y={41} />
    </>
  ),

  /* Wide pull-up — grip well outside the shoulders, elbows flared out. */
  wide_pullup: (
    <>
      <Rig d="M40 18 L160 18" />
      <Grip x={62} y={18} />
      <Grip x={138} y={18} />
      <L d="M62 18 L58 46 L100 60" />
      <L d="M138 18 L142 46 L100 60" />
      <T d="M100 60 L100 88" />
      <L d="M100 88 L96 103 L100 116" />
      <G d="M62 18 L92 64" />
      <H x={100} y={45} />
    </>
  ),

  /* Archer pull-up — pulled to one hand, far arm straight along the bar. */
  archer_pullup: (
    <>
      <Rig d="M40 18 L160 18" />
      <Grip x={62} y={18} />
      <Grip x={142} y={18} />
      <L d="M62 18 L56 40 L78 54" />
      <L d="M142 18 L78 54" />
      <T d="M78 54 L84 84" />
      <L d="M84 84 L82 100 L86 114" />
      <H x={80} y={39} />
    </>
  ),

  /* Muscle-up — the finish, chest and hips above the bar. */
  muscleup: (
    <>
      <Rig d="M46 56 L154 56" />
      <Grip x={86} y={56} />
      <Grip x={114} y={56} />
      <L d="M86 56 L80 46 L100 42" />
      <L d="M114 56 L120 46 L100 42" />
      <T d="M100 42 L102 72" />
      <L d="M102 72 L98 90 L104 106" />
      <G d="M86 56 L88 100" />
      <H x={100} y={28} />
    </>
  ),

  /* ---------------------------------------------------------------- Legs -- */

  /* Bodyweight squat — bottom position, hips below the knees. */
  squat: (
    <>
      <Floor />
      <T d="M96 44 L90 76" />
      <L d="M90 76 L120 80 L112 106 L128 106" />
      <L d="M96 46 L118 52 L136 46" />
      <G d="M96 22 L96 44" />
      <H x={96} y={30} />
    </>
  ),

  /* Lunge — back knee dropped, front shin vertical. */
  lunge: (
    <>
      <Floor />
      <T d="M92 42 L92 72" />
      <L d="M92 72 L124 80 L124 106 L140 106" />
      <L d="M92 72 L64 92 L48 104 L40 106" />
      <L d="M92 44 L97 60" />
      <H x={92} y={28} />
    </>
  ),

  /* Pistol squat — one leg down, the other held straight out front. */
  pistol: (
    <>
      <Floor />
      <T d="M88 48 L84 78" />
      <L d="M84 78 L112 84 L104 106 L120 106" />
      <L d="M84 78 L126 72 L164 66" />
      <L d="M88 50 L112 54 L130 50" />
      <H x={88} y={34} />
    </>
  ),

  /* ---------------------------------------------------------------- Core -- */

  /* Plank — upper arm vertical, forearm flat on the floor. */
  plank: (
    <>
      <Floor />
      <L d="M72 84 L72 104 L96 106" />
      <T d="M72 84 L122 92" />
      <L d="M122 92 L148 98 L174 104" />
      <H x={60} y={80} r={7.5} />
    </>
  ),

  /* Mountain climber — plank with one knee driven toward the chest. */
  mountain: (
    <>
      <Floor />
      <L d="M74 84 L70 105" />
      <T d="M74 84 L124 92" />
      <L d="M124 92 L150 98 L174 104" />
      <L d="M124 92 L102 92 L96 105" />
      <H x={62} y={80} r={7.5} />
    </>
  ),

  /* Hollow hold — shoulders and legs off the floor, lower back pinned down. */
  hollow: (
    <>
      <Floor />
      <T d="M64 84 Q104 102 150 76" />
      <L d="M64 84 L48 76 L36 70" />
      <G d="M86 104 L124 104" />
      <H x={60} y={80} r={7.5} />
    </>
  ),

  /* Lying leg raise — straight legs lifted toward vertical. */
  legraise: (
    <>
      <Floor />
      <T d="M54 100 L106 100" />
      <L d="M106 100 L122 76 L136 54" />
      <L d="M54 100 L42 106" />
      <G d="M106 100 L170 100" />
      <H x={44} y={97} r={7.5} />
    </>
  ),

  /* Hanging knee raise — thighs lifted, shins hanging down from the knees. */
  kneeraise: (
    <>
      <Rig d="M46 18 L154 18" />
      <Grip x={88} y={18} />
      <Grip x={112} y={18} />
      <L d="M88 18 L100 54" />
      <L d="M112 18 L100 54" />
      <T d="M100 54 L102 82" />
      <L d="M102 82 L76 70 L68 92" />
      <G d="M102 82 L104 116" />
      <H x={100} y={42} />
    </>
  ),

  /* Toes to bar — straight legs raised all the way up to the bar. */
  toestobar: (
    <>
      <Rig d="M46 18 L154 18" />
      <Grip x={88} y={18} />
      <Grip x={112} y={18} />
      <L d="M88 18 L100 56" />
      <L d="M112 18 L100 56" />
      <T d="M100 56 L100 80" />
      <L d="M100 80 L78 48 L72 24" />
      <G d="M100 80 L100 114" />
      <H x={102} y={44} />
    </>
  ),

  /* L-sit — straight arms pressing down, legs locked out horizontal. */
  lsit: (
    <>
      <Floor />
      <Rig d="M58 78 L86 78 M72 78 L72 106" w={3.5} />
      <Rig d="M114 78 L142 78 M128 78 L128 106" w={3.5} />
      <Grip x={74} y={78} />
      <Grip x={126} y={78} />
      <L d="M74 78 L100 54" />
      <L d="M126 78 L100 54" />
      <T d="M100 54 L100 78" />
      <T d="M100 78 L134 77 L170 76" />
      <H x={100} y={40} />
    </>
  ),

  /* --------------------------------------------------------------- Skill -- */

  /* Front lever — hanging horizontal, arms locked straight. */
  lever: (
    <>
      <Rig d="M46 20 L154 20" />
      <Grip x={78} y={20} />
      <L d="M78 20 L78 58" />
      <T d="M78 58 L126 60" />
      <L d="M126 60 L152 61 L180 62" />
      <G d="M78 58 L78 108" />
      <H x={66} y={57} r={7.5} />
    </>
  ),

  /* Planche lean — toes still down, shoulders pushed well past the wrists. */
  planche_lean: (
    <>
      <Floor />
      <L d="M96 105 L78 78" />
      <Grip x={96} y={105} />
      <T d="M78 78 L126 88" />
      <L d="M126 88 L152 95 L176 104" />
      <G d="M96 105 L96 78" />
      <H x={66} y={74} r={7.5} />
    </>
  ),

  /* Full planche — whole body horizontal and off the floor on straight arms. */
  planche: (
    <>
      <Floor />
      <L d="M84 105 L70 74" />
      <Grip x={84} y={105} />
      <T d="M70 74 L122 72" />
      <L d="M122 72 L150 71 L180 70" />
      <H x={58} y={71} r={7.5} />
    </>
  ),

  /* Human flag — side-on to a vertical pole, body stacked horizontal. */
  flag: (
    <>
      <Floor />
      <Rig d="M52 8 L52 106" />
      <Grip x={52} y={32} />
      <Grip x={52} y={70} />
      <L d="M52 32 L72 42 L94 52" />
      <L d="M52 70 L92 56" />
      <T d="M94 52 L142 54" />
      <L d="M142 54 L166 54 L190 54" />
      <H x={106} y={50} r={7.5} />
    </>
  ),

  /* -------------------------------------------------------- Conditioning -- */

  /* Burpee — the jump at the top of the rep. */
  burpee: (
    <>
      <Floor />
      <T d="M100 42 L100 70" />
      <L d="M100 70 L92 88 L88 100" />
      <L d="M100 70 L108 88 L112 100" />
      <L d="M100 44 L86 30 L78 14" />
      <L d="M100 44 L114 30 L122 14" />
      <G d="M62 102 L138 102" />
      <H x={100} y={28} />
    </>
  ),

  /* Jump rope — mid-skip, rope arcing beneath the feet. */
  jump: (
    <>
      <Floor />
      <T d="M100 40 L100 68" />
      <L d="M100 68 L94 86 L92 98" />
      <L d="M100 68 L106 86 L108 98" />
      <L d="M100 42 L82 52 L84 64" />
      <L d="M100 42 L118 52 L116 64" />
      <path
        d="M84 64 Q100 122 116 64"
        fill="none"
        stroke={C}
        strokeWidth={2.2}
        opacity={0.45}
        strokeLinecap="round"
      />
      <H x={100} y={26} />
    </>
  ),
};

/**
 * A movement diagram. Inherits `currentColor`, so wrap it in a text colour to
 * tint it. The dashed ghost limb shows the other end of the rep.
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
