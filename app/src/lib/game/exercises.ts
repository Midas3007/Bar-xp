import type {
  CustomExercise,
  Exercise,
  ExerciseCategory,
  ExerciseGrade,
  Profile,
} from '../types';
import { arr, num, str } from '../safe';

/**
 * The core movement catalog.
 *
 * `xpPerUnit` is XP per rep, or per second for holds — holds are deliberately
 * an order of magnitude cheaper per unit since a 60s plank is one "set".
 *
 * Access is graded rather than uniformly level-gated:
 *  - `foundation`   movements are open from level 1. Anything a beginner can
 *                   reasonably attempt — including pull-ups and dips — lives
 *                   here, because gating the basics just blocks training.
 *  - `intermediate` movements carry a light level gate reached within a few
 *                   weeks of consistent logging.
 *  - `elite`        movements are true skill work. They stay gated, but every
 *                   one carries a `progression` describing how to get there,
 *                   and can be opened early from the shop.
 */
export const EXERCISES: Exercise[] = [
  /* --- Push -------------------------------------------------------------- */
  {
    id: 'push_up',
    name: 'Push-up',
    category: 'push',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 1,
    statWeights: { strength: 0.45, endurance: 0.3, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    diagram: 'pushup',
    hint: 'The base of all pressing. Chest to fist height, elbows locked at the top.',
    formCues: [
      'Hands under the shoulders, fingers spread and gripping the floor.',
      'Squeeze glutes and brace the stomach so the body is one straight line.',
      'Elbows track back at roughly 45°, not flared straight out to the sides.',
      'Lower until the chest is a fist off the floor, then push all the way to lockout.',
    ],
    mistakes: ['Hips sagging or piking up', 'Half reps that never reach the bottom', 'Head craning forward to touch first'],
  },
  {
    id: 'incline_push_up',
    name: 'Incline Push-up',
    category: 'push',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 0.7,
    statWeights: { strength: 0.35, endurance: 0.4, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    diagram: 'incline',
    hint: 'Hands elevated on a bench or bar. The regression that builds a full push-up.',
    formCues: [
      'Hands on a bench, table, or waist-height bar.',
      'The higher the hands, the easier it is — lower the surface as you get stronger.',
      'Same straight line from heel to head as a floor push-up.',
    ],
    mistakes: ['Letting the hips lead the way down', 'Choosing a surface so high there is no challenge'],
  },
  {
    id: 'pike_push_up',
    name: 'Pike Push-up',
    category: 'push',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 2,
    statWeights: { strength: 0.55, endurance: 0.2, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    diagram: 'pike',
    hint: 'Hips high, crown of the head to the floor. The gateway to handstand pressing.',
    formCues: [
      'Walk the feet in until the hips are stacked high over the shoulders.',
      'Lower the top of the head toward the floor, just in front of the hands.',
      'Elbows point forward-ish, not straight out to the sides.',
    ],
    mistakes: ['Hips drifting back so it becomes a normal push-up', 'Only bending at the waist instead of the elbows'],
  },
  {
    id: 'dip',
    name: 'Dip',
    category: 'push',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 2.6,
    statWeights: { strength: 0.6, endurance: 0.15, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    diagram: 'dip',
    hint: 'Parallel bars, shoulders below elbows, full lockout at the top.',
    formCues: [
      'Start at the top with straight arms and shoulders pushed down away from the ears.',
      'Lean the chest forward slightly and lower under control.',
      'Descend until the shoulders are level with or just below the elbows.',
      'If a full dip is not there yet, use a bench dip or push through a band.',
    ],
    mistakes: ['Shrugging so the shoulders swallow the neck', 'Bouncing out of the bottom', 'Going far deeper than shoulder mobility allows'],
  },
  {
    id: 'diamond_push_up',
    name: 'Diamond Push-up',
    category: 'push',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 1.8,
    statWeights: { strength: 0.55, endurance: 0.2, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    diagram: 'diamond',
    hint: 'Hands together under the chest — the triceps take the load.',
    formCues: [
      'Index fingers and thumbs touching to form a diamond under the sternum.',
      'Keep the elbows close to the ribs throughout.',
      'Touch the chest to the hands, then press to full lockout.',
    ],
    mistakes: ['Elbows flaring wide, which defeats the point', 'Hands too far up under the face'],
  },
  {
    id: 'archer_push_up',
    name: 'Archer Push-up',
    category: 'push',
    grade: 'intermediate',
    unit: 'reps',
    xpPerUnit: 3.4,
    statWeights: { strength: 0.65, endurance: 0.12, aesthetics: 0.18, discipline: 0.05 },
    minLevel: 6,
    diagram: 'archer_push',
    hint: 'One arm bends and takes the load, the other stays straight.',
    formCues: [
      'Set the hands much wider than a normal push-up.',
      'Lower toward one hand, letting the far arm straighten out.',
      'Keep the hips square to the floor — do not roll onto one side.',
      'Alternate sides and count each side as a rep.',
    ],
    mistakes: ['Rotating the torso to cheat the load', 'The straight arm bending to help'],
    progression: {
      intro: 'A near-unilateral press. You want a solid set of 15 clean push-ups before starting.',
      steps: [
        { title: 'Build the base', detail: 'Work up to 3 sets of 15 strict push-ups.', exerciseId: 'push_up' },
        { title: 'Widen your stance', detail: 'Do push-ups with hands 1.5× shoulder width to get used to the wider position.', exerciseId: 'push_up' },
        { title: 'Shift your weight', detail: 'From the wide position, lower slightly toward one hand. Increase the lean over weeks.' },
        { title: 'Straighten the far arm', detail: 'Once you can take most of the load on one side, let the other arm lock out fully.' },
      ],
    },
  },
  {
    id: 'handstand_push_up',
    name: 'Handstand Push-up',
    category: 'push',
    grade: 'elite',
    unit: 'reps',
    xpPerUnit: 9,
    statWeights: { strength: 0.7, endurance: 0.1, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 16,
    unlockId: 'unlock_handstand',
    diagram: 'handstand',
    hint: 'Vertical pressing, upside down. Wall-supported reps count.',
    formCues: [
      'Kick up to a wall handstand with the stomach facing the wall if you can.',
      'Hands slightly wider than shoulders, fingers gripping hard.',
      'Lower until the head lightly touches the floor, then press to lockout.',
      'Keep the ribs down — do not arch the lower back to get up.',
    ],
    mistakes: ['Collapsing into a headstand rather than pressing', 'Elbows flaring straight out', 'Kicking off the wall for momentum'],
    progression: {
      intro: 'Vertical pressing needs shoulder strength plus the confidence to be inverted. Expect several months.',
      steps: [
        { title: 'Own the pike push-up', detail: 'Build to 3 sets of 12 with the hips stacked high.', exerciseId: 'pike_push_up' },
        { title: 'Elevate your feet', detail: 'Put your feet on a chair or box in the pike position. Raise the box over time.' },
        { title: 'Wall handstand hold', detail: 'Kick up and hold 30–60 seconds to get comfortable inverted and build shoulder endurance.' },
        { title: 'Negatives', detail: 'From a wall handstand, lower to the floor as slowly as you can. Aim for 5 seconds down.' },
        { title: 'Full reps', detail: 'Press back up from the bottom. One clean rep is a real milestone.' },
      ],
    },
  },
  {
    id: 'one_arm_push_up',
    name: 'One-arm Push-up',
    category: 'push',
    grade: 'elite',
    unit: 'reps',
    xpPerUnit: 10,
    statWeights: { strength: 0.72, endurance: 0.08, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 18,
    unlockId: 'unlock_one_arm',
    diagram: 'onearm_push',
    hint: 'One hand behind the back, hips square. As much core as it is chest.',
    formCues: [
      'Feet wider than normal for a stable base.',
      'Working hand under the centre of the chest, not out to the side.',
      'Fight hard to keep both hips facing the floor.',
      'Free hand behind the back or along the thigh.',
    ],
    mistakes: ['Twisting the hips open to cheat', 'Feet so wide it becomes a side press', 'Partial range at the bottom'],
    progression: {
      intro: 'This is a full-body tension skill as much as a pressing one. Archer push-ups come first.',
      steps: [
        { title: 'Master archers', detail: 'Build to 3 sets of 8 archer push-ups per side.', exerciseId: 'archer_push_up' },
        { title: 'Elevated one-arm', detail: 'One hand on a waist-high surface. Lower the surface over months.' },
        { title: 'Negatives on the floor', detail: 'Lower on one arm as slowly as possible, then push back with two.' },
        { title: 'Full rep', detail: 'Press up from the bottom keeping both hips level.' },
      ],
    },
  },

  /* --- Pull -------------------------------------------------------------- */
  {
    id: 'australian_row',
    name: 'Australian Row',
    category: 'pull',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 1.2,
    statWeights: { strength: 0.45, endurance: 0.3, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    diagram: 'row',
    hint: 'Body under a low bar, heels on the floor, chest to the bar.',
    formCues: [
      'Set a bar at roughly waist height and hang underneath it.',
      'Body dead straight from heel to head, glutes squeezed.',
      'Pull the chest to the bar, driving the elbows back past the ribs.',
      'The more horizontal your body, the harder it gets.',
    ],
    mistakes: ['Hips sagging toward the floor', 'Stopping short of the bar', 'Shrugging instead of rowing'],
  },
  {
    id: 'chin_up',
    name: 'Chin-up',
    category: 'pull',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 3.2,
    statWeights: { strength: 0.62, endurance: 0.15, aesthetics: 0.18, discipline: 0.05 },
    minLevel: 1,
    diagram: 'chinup',
    hint: 'Palms toward you. Easier than a pull-up — biceps get to help.',
    formCues: [
      'Underhand grip, hands about shoulder width.',
      'Start from a full dead hang with straight arms.',
      'Pull until the chin clears the bar, then lower under control.',
      'No pull-ups yet? Jump to the top and lower slowly — negatives build them fast.',
    ],
    mistakes: ['Kipping with the legs', 'Stopping halfway up', 'Dropping like a stone instead of controlling the descent'],
  },
  {
    id: 'pull_up',
    name: 'Pull-up',
    category: 'pull',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 3.6,
    statWeights: { strength: 0.65, endurance: 0.15, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 1,
    diagram: 'pullup',
    hint: 'Palms away, dead hang to chin over the bar. The signature movement.',
    formCues: [
      'Overhand grip, hands just outside shoulder width.',
      'Start from a dead hang, then pull the shoulder blades down before the arms bend.',
      'Drive the elbows down toward the ribs and clear the bar with your chin.',
      'Lower all the way to straight arms every rep.',
    ],
    mistakes: ['Swinging or kipping for momentum', 'Never reaching a full dead hang', 'Chin craning over the bar while the chest stays low'],
  },
  {
    id: 'wide_pull_up',
    name: 'Wide Pull-up',
    category: 'pull',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 4.2,
    statWeights: { strength: 0.66, endurance: 0.12, aesthetics: 0.17, discipline: 0.05 },
    minLevel: 1,
    diagram: 'wide_pullup',
    hint: 'Grip well outside the shoulders. The lats do nearly all the work.',
    formCues: [
      'Hands roughly 1.5× shoulder width.',
      'Think about pulling the bar down to you rather than you up to it.',
      'Expect fewer reps than a standard pull-up — that is normal.',
    ],
    mistakes: ['Going so wide the shoulders complain', 'Cutting the range short at the bottom'],
  },
  {
    id: 'archer_pull_up',
    name: 'Archer Pull-up',
    category: 'pull',
    grade: 'intermediate',
    unit: 'reps',
    xpPerUnit: 6.5,
    statWeights: { strength: 0.7, endurance: 0.1, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 8,
    diagram: 'archer_pullup',
    hint: 'Pull up to one hand while the far arm stays straight along the bar.',
    formCues: [
      'Take a wide grip and pull toward one hand.',
      'The far arm stays straight, sliding along the bar as support.',
      'Chin comes up beside the working hand, not in the middle.',
    ],
    mistakes: ['Bending the far arm so it becomes a wide pull-up', 'Twisting the torso instead of pulling to the side'],
    progression: {
      intro: 'The main stepping stone toward one-arm pulling. Needs a solid pull-up base first.',
      steps: [
        { title: 'Build volume', detail: 'Reach 3 sets of 8 clean pull-ups.', exerciseId: 'pull_up' },
        { title: 'Go wide', detail: 'Work wide-grip pull-ups for a few weeks.', exerciseId: 'wide_pull_up' },
        { title: 'Uneven pulls', detail: 'Hold a towel over the bar with one hand, lower than the other. Pull toward the high hand.' },
        { title: 'Full archer', detail: 'Straighten the far arm entirely along the bar.' },
      ],
    },
  },
  {
    id: 'muscle_up',
    name: 'Muscle-up',
    category: 'pull',
    grade: 'elite',
    unit: 'reps',
    xpPerUnit: 12,
    statWeights: { strength: 0.72, endurance: 0.08, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 12,
    unlockId: 'unlock_muscle_up',
    diagram: 'muscleup',
    hint: 'Pull, transition over the bar, press out. The classic rite of passage.',
    formCues: [
      'False grip helps enormously — wrists over the top of the bar.',
      'Pull explosively to sternum height, not just chin height.',
      'Lean the chest forward and over the bar as you reach the top of the pull.',
      'Finish by pressing out of the dip position to straight arms.',
    ],
    mistakes: ['Pulling only to chin height and stalling', 'Trying to muscle through without leaning over the bar', 'Enormous leg kip that hides a missing strength base'],
    progression: {
      intro: 'A muscle-up is a high pull-up, a transition, and a dip stitched together. Build all three separately.',
      steps: [
        { title: 'Strong pull-ups', detail: 'Reach 8–10 clean pull-ups from a dead hang.', exerciseId: 'pull_up' },
        { title: 'Strong dips', detail: 'Reach 10–12 full-depth dips.', exerciseId: 'dip' },
        { title: 'Chest-high pulls', detail: 'Pull explosively until the bar reaches your sternum or lower ribs.', exerciseId: 'pull_up' },
        { title: 'False grip hangs', detail: 'Hang with the wrists over the bar for 20–30 seconds to build the position.' },
        { title: 'Transition drill', detail: 'From a low bar with feet down, practise rolling the chest over the bar.' },
        { title: 'Put it together', detail: 'One clean muscle-up. Slight leg swing is fine at first.' },
      ],
    },
  },

  /* --- Legs -------------------------------------------------------------- */
  {
    id: 'squat',
    name: 'Bodyweight Squat',
    category: 'legs',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 0.6,
    statWeights: { strength: 0.3, endurance: 0.4, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    diagram: 'squat',
    hint: 'Hips below parallel, heels planted the whole way.',
    formCues: [
      'Feet about shoulder width, toes turned slightly out.',
      'Sit down and back, keeping the chest up.',
      'Go until the hip crease drops below the knee.',
      'Drive through the whole foot to stand, squeezing the glutes at the top.',
    ],
    mistakes: ['Heels lifting off the floor', 'Knees caving inward', 'Quarter-depth reps'],
  },
  {
    id: 'lunge',
    name: 'Lunge',
    category: 'legs',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 0.8,
    statWeights: { strength: 0.35, endurance: 0.35, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    diagram: 'lunge',
    hint: 'Count each leg as its own rep.',
    formCues: [
      'Step forward far enough that the front shin stays roughly vertical.',
      'Drop the back knee toward the floor, torso upright.',
      'Push through the front heel to return.',
    ],
    mistakes: ['Front knee shooting far past the toes', 'Leaning the torso forward over the front leg'],
  },
  {
    id: 'pistol_squat',
    name: 'Pistol Squat',
    category: 'legs',
    grade: 'intermediate',
    unit: 'reps',
    xpPerUnit: 5,
    statWeights: { strength: 0.6, endurance: 0.2, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 7,
    diagram: 'pistol',
    hint: 'Full single-leg squat with the free leg held out straight.',
    formCues: [
      'Arms out in front as a counterweight.',
      'Sit back and down slowly on one leg, free leg extended forward.',
      'Keep the working heel flat — ankle mobility is usually the limit.',
      'Stand without letting the free foot touch down.',
    ],
    mistakes: ['Heel lifting at the bottom', 'Crashing down instead of controlling', 'Free foot touching for balance'],
    progression: {
      intro: 'Mostly a mobility and balance problem, not a strength one. Elevate to make it easier.',
      steps: [
        { title: 'Squat depth first', detail: 'Comfortable, heels-down deep squats for 20 reps.', exerciseId: 'squat' },
        { title: 'Box pistols', detail: 'Sit down onto a chair on one leg, then stand. Lower the seat over time.' },
        { title: 'Assisted pistols', detail: 'Hold a doorframe or strap and use as little help as you can.' },
        { title: 'Full pistol', detail: 'No support, heel flat, free leg never touching down.' },
      ],
    },
  },

  /* --- Core -------------------------------------------------------------- */
  {
    id: 'plank',
    name: 'Plank',
    category: 'core',
    grade: 'foundation',
    unit: 'seconds',
    xpPerUnit: 0.25,
    statWeights: { strength: 0.2, endurance: 0.45, aesthetics: 0.2, discipline: 0.15 },
    minLevel: 1,
    diagram: 'plank',
    hint: 'Forearms down, ribs tucked. Logged in seconds held.',
    formCues: [
      'Elbows directly under the shoulders.',
      'Tuck the pelvis slightly so the lower back flattens.',
      'Squeeze glutes and quads — a plank should be hard everywhere, not just the abs.',
      'Breathe normally instead of holding your breath.',
    ],
    mistakes: ['Hips sagging into the lower back', 'Hips hiked high to make it easy', 'Holding for time with terrible position'],
  },
  {
    id: 'hollow_hold',
    name: 'Hollow Hold',
    category: 'core',
    grade: 'foundation',
    unit: 'seconds',
    xpPerUnit: 0.4,
    statWeights: { strength: 0.3, endurance: 0.4, aesthetics: 0.2, discipline: 0.1 },
    minLevel: 1,
    diagram: 'hollow',
    hint: 'On your back, lower back pinned flat. The foundation of every skill hold.',
    formCues: [
      'Lie on your back and press the lower back hard into the floor.',
      'Lift the shoulder blades and legs a few inches off the ground.',
      'Arms overhead by the ears if you can hold the position.',
      'If the back lifts, bend the knees or raise the legs higher.',
    ],
    mistakes: ['Any daylight under the lower back', 'Straining the neck instead of the abs'],
  },
  {
    id: 'leg_raise',
    name: 'Lying Leg Raise',
    category: 'core',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 1,
    statWeights: { strength: 0.35, endurance: 0.3, aesthetics: 0.3, discipline: 0.05 },
    minLevel: 1,
    diagram: 'legraise',
    hint: 'Legs straight, no arch in the lower back.',
    formCues: [
      'Hands under the hips or flat beside you.',
      'Lower back stays in contact with the floor the whole time.',
      'Raise the legs to vertical, then lower slowly without touching down.',
    ],
    mistakes: ['Lower back arching off the floor', 'Dropping the legs and bouncing'],
  },
  {
    id: 'hanging_knee_raise',
    name: 'Hanging Knee Raise',
    category: 'core',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 1.8,
    statWeights: { strength: 0.4, endurance: 0.25, aesthetics: 0.3, discipline: 0.05 },
    minLevel: 1,
    diagram: 'kneeraise',
    hint: 'Dead hang from a bar, knees to chest, no swinging.',
    formCues: [
      'Hang with straight arms and shoulders active, not fully relaxed.',
      'Curl the knees up toward the chest, rolling the pelvis under.',
      'Lower with control — no swinging into the next rep.',
    ],
    mistakes: ['Using a body swing to throw the knees up', 'Only lifting the thighs without curling the pelvis'],
  },
  {
    id: 'toes_to_bar',
    name: 'Toes to Bar',
    category: 'core',
    grade: 'intermediate',
    unit: 'reps',
    xpPerUnit: 3,
    statWeights: { strength: 0.45, endurance: 0.2, aesthetics: 0.3, discipline: 0.05 },
    minLevel: 5,
    diagram: 'toestobar',
    hint: 'Straight legs, all the way up to touch the bar.',
    formCues: [
      'Start from a hang with the shoulders engaged.',
      'Keep the legs as straight as you can and lift the toes to the bar.',
      'Lower under control rather than dropping.',
    ],
    mistakes: ['Bending the knees to reach', 'Huge kip that removes the abs from the movement'],
    progression: {
      intro: 'Hanging knee raises with the knees progressively straighter.',
      steps: [
        { title: 'Knee raises', detail: 'Build to 3 sets of 15 strict hanging knee raises.', exerciseId: 'hanging_knee_raise' },
        { title: 'Half-straight raises', detail: 'Raise with the knees only slightly bent, aiming for hip height.' },
        { title: 'Straight-leg raises', detail: 'Straight legs to horizontal, held for a beat at the top.' },
        { title: 'All the way up', detail: 'Continue past horizontal until the toes touch the bar.' },
      ],
    },
  },
  {
    id: 'l_sit',
    name: 'L-Sit',
    category: 'core',
    grade: 'intermediate',
    unit: 'seconds',
    xpPerUnit: 1.6,
    statWeights: { strength: 0.5, endurance: 0.25, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 6,
    diagram: 'lsit',
    hint: 'Supported on the hands, legs locked straight and parallel to the ground.',
    formCues: [
      'Press down hard through straight arms, pushing the shoulders away from the ears.',
      'Lift the legs to horizontal with the knees locked.',
      'Use parallettes, dip bars, or the floor — the floor is hardest.',
      'Point the toes and squeeze everything.',
    ],
    mistakes: ['Shoulders shrugged up to the ears', 'Knees bent and called an L-sit', 'Leaning far back to fake the angle'],
    progression: {
      intro: 'Straight-arm strength plus compression. Elevating the hands makes it far easier.',
      steps: [
        { title: 'Support hold', detail: 'Hold yourself up on straight arms, shoulders down, for 30 seconds.' },
        { title: 'Tuck L-sit', detail: 'Same hold with the knees tucked tight to the chest. Build to 30 seconds.' },
        { title: 'One leg out', detail: 'Extend a single leg, alternating sides.' },
        { title: 'Full L-sit', detail: 'Both legs straight and horizontal. Ten seconds is a strong result.' },
      ],
    },
  },

  /* --- Skill ------------------------------------------------------------- */
  {
    id: 'planche_lean',
    name: 'Planche Lean',
    category: 'skill',
    grade: 'elite',
    unit: 'seconds',
    xpPerUnit: 2.2,
    statWeights: { strength: 0.65, endurance: 0.15, aesthetics: 0.13, discipline: 0.07 },
    minLevel: 14,
    unlockId: 'unlock_planche',
    diagram: 'planche_lean',
    hint: 'Push-up position with the shoulders leaned far past the wrists.',
    formCues: [
      'Start in a push-up position with the hands turned slightly outward.',
      'Push the floor away hard so the upper back rounds.',
      'Lean forward until the shoulders are well past the hands.',
      'The further forward you lean, the harder it gets.',
    ],
    mistakes: ['Letting the shoulder blades pinch together', 'Bending the arms', 'Sagging the lower back'],
    progression: {
      intro: 'The entry point to all planche work, and the drill that builds the straight-arm strength for it.',
      steps: [
        { title: 'Wrist prep', detail: 'Straight-arm work is hard on the wrists. Warm them up thoroughly every session.' },
        { title: 'Plank to lean', detail: 'From a push-up plank, shift the shoulders slightly forward of the wrists. Hold 20 seconds.', exerciseId: 'plank' },
        { title: 'Increase the lean', detail: 'Add a centimetre of forward lean every week or two. Never rush this.' },
        { title: 'Protract hard', detail: 'Actively push the floor away so the upper back stays rounded throughout.' },
      ],
    },
  },
  {
    id: 'front_lever',
    name: 'Front Lever',
    category: 'skill',
    grade: 'elite',
    unit: 'seconds',
    xpPerUnit: 5,
    statWeights: { strength: 0.7, endurance: 0.1, aesthetics: 0.13, discipline: 0.07 },
    minLevel: 15,
    unlockId: 'unlock_front_lever',
    diagram: 'lever',
    hint: 'Hanging horizontal under the bar, body flat, arms straight.',
    formCues: [
      'Hang with straight arms and pull the shoulder blades down and back.',
      'Keep the arms completely locked — this is straight-arm strength.',
      'Raise the body to horizontal, hollow through the middle.',
      'Squeeze the glutes so the hips do not sag below the shoulders.',
    ],
    mistakes: ['Bent arms turning it into a hanging hold', 'Hips sagging well below the line', 'Holding the breath and losing the hollow'],
    progression: {
      intro: 'Work through tuck positions. Each step opens the body angle and multiplies the difficulty.',
      steps: [
        { title: 'Solid pull-ups', detail: 'Reach 8–10 pull-ups so the back can handle the load.', exerciseId: 'pull_up' },
        { title: 'Hollow body', detail: 'A 45-second hollow hold. The lever is a hollow body turned sideways.', exerciseId: 'hollow_hold' },
        { title: 'Tuck lever', detail: 'Hang, tuck the knees tight, raise until the back is horizontal. Build to 20 seconds.' },
        { title: 'Advanced tuck', detail: 'Open the knees to roughly 90°, keeping the back flat.' },
        { title: 'Single leg', detail: 'Extend one leg fully, keeping the other tucked. Alternate.' },
        { title: 'Full lever', detail: 'Both legs straight and horizontal. Five seconds is an excellent hold.' },
      ],
    },
  },
  {
    id: 'full_planche',
    name: 'Full Planche',
    category: 'skill',
    grade: 'elite',
    unit: 'seconds',
    xpPerUnit: 9,
    statWeights: { strength: 0.75, endurance: 0.08, aesthetics: 0.1, discipline: 0.07 },
    minLevel: 20,
    unlockId: 'unlock_planche',
    diagram: 'planche',
    hint: 'Whole body parallel to the ground, feet off, held on straight arms.',
    formCues: [
      'Deep lean with the shoulders far in front of the hands.',
      'Arms locked straight and the upper back strongly rounded.',
      'Body in one line from head to toe, glutes squeezed hard.',
      'Point the toes and hold the entire body under tension.',
    ],
    mistakes: ['Piked hips instead of a flat line', 'Any bend in the elbows', 'Chasing the full hold before the tuck versions are solid'],
    progression: {
      intro: 'One of the hardest bodyweight holds there is. Realistically two to four years of consistent straight-arm work.',
      steps: [
        { title: 'Planche lean', detail: 'A 30-second deep lean with the shoulders well past the wrists.', exerciseId: 'planche_lean' },
        { title: 'Tuck planche', detail: 'Knees tucked to the chest, feet off the floor, hips at shoulder height. Build to 20 seconds.' },
        { title: 'Advanced tuck', detail: 'Open the hips so the back is flat, knees still bent. Build to 15 seconds.' },
        { title: 'Straddle planche', detail: 'Legs straight and spread wide — much easier than a full planche.' },
        { title: 'Full planche', detail: 'Legs together and straight. Even two seconds is world-class.' },
      ],
    },
  },
  {
    id: 'human_flag',
    name: 'Human Flag',
    category: 'skill',
    grade: 'elite',
    unit: 'seconds',
    xpPerUnit: 8,
    statWeights: { strength: 0.72, endurance: 0.1, aesthetics: 0.12, discipline: 0.06 },
    minLevel: 20,
    unlockId: 'unlock_human_flag',
    diagram: 'flag',
    hint: 'Side-on to a vertical pole, body horizontal, held sideways.',
    formCues: [
      'Top hand pulls, bottom hand pushes — that opposition is the whole trick.',
      'Grip a vertical pole with the hands roughly shoulder width apart.',
      'Press the bottom arm straight and keep it locked.',
      'Stack the body in one line and squeeze the obliques hard.',
    ],
    mistakes: ['Treating it as pure core strength when it is mostly shoulders', 'Bottom arm bending', 'Hips dropping out of line'],
    progression: {
      intro: 'Far more shoulder strength than core. Build the push-pull opposition first.',
      steps: [
        { title: 'Vertical support', detail: 'Grip the pole and hold yourself vertically, feet off, for 20 seconds.' },
        { title: 'Tuck flag', detail: 'Knees tucked tight, hips lifted sideways off the ground. Build to 15 seconds.' },
        { title: 'Straddle flag', detail: 'Legs straight and spread wide to shorten the lever.' },
        { title: 'Full flag', detail: 'Legs together and horizontal. Even three seconds is impressive.' },
      ],
    },
  },

  /* --- Conditioning ------------------------------------------------------ */
  {
    id: 'burpee',
    name: 'Burpee',
    category: 'conditioning',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 1.4,
    statWeights: { strength: 0.2, endurance: 0.5, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    diagram: 'burpee',
    hint: 'Chest to the floor, jump at the top. Brutally effective.',
    formCues: [
      'Drop to the floor and let the chest touch.',
      'Jump the feet back under the hips.',
      'Explode into a jump with the hands overhead.',
    ],
    mistakes: ['Skipping the chest-to-floor portion', 'No jump at the top', 'Letting the lower back collapse when tired'],
  },
  {
    id: 'mountain_climber',
    name: 'Mountain Climber',
    category: 'conditioning',
    grade: 'foundation',
    unit: 'reps',
    xpPerUnit: 0.4,
    statWeights: { strength: 0.15, endurance: 0.55, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    diagram: 'mountain',
    hint: 'Count each knee drive as one rep.',
    formCues: [
      'Start in a strong push-up plank.',
      'Drive one knee toward the chest, then switch quickly.',
      'Keep the hips low and level — do not let them bounce up.',
    ],
    mistakes: ['Hips rising with every rep', 'Feet never really leaving the floor'],
  },
  {
    id: 'jump_rope',
    name: 'Jump Rope',
    category: 'conditioning',
    grade: 'foundation',
    unit: 'seconds',
    xpPerUnit: 0.2,
    statWeights: { strength: 0.1, endurance: 0.6, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    diagram: 'jump',
    hint: 'Logged in seconds of continuous skipping.',
    formCues: [
      'Elbows in close, turn the rope with the wrists rather than the arms.',
      'Small jumps — barely leave the floor.',
      'Land softly through the balls of the feet.',
    ],
    mistakes: ['Jumping far higher than needed', 'Swinging the whole arms and burning out'],
  },
];

export const CATEGORY_META: Record<ExerciseCategory, { label: string; color: string; ring: string }> = {
  push: { label: 'Push', color: 'text-ember', ring: 'ring-ember/30 bg-ember/10' },
  pull: { label: 'Pull', color: 'text-forge', ring: 'ring-forge/30 bg-forge/10' },
  legs: { label: 'Legs', color: 'text-vital', ring: 'ring-vital/30 bg-vital/10' },
  core: { label: 'Core', color: 'text-arcane', ring: 'ring-arcane/30 bg-arcane/10' },
  skill: { label: 'Skill', color: 'text-danger', ring: 'ring-danger/30 bg-danger/10' },
  conditioning: { label: 'Conditioning', color: 'text-tide', ring: 'ring-tide/30 bg-tide/10' },
};

export const CATEGORY_ORDER: ExerciseCategory[] = [
  'push',
  'pull',
  'legs',
  'core',
  'skill',
  'conditioning',
];

export const GRADE_META: Record<ExerciseGrade, { label: string; color: string }> = {
  foundation: { label: 'Foundation', color: 'bg-vital/10 text-vital ring-vital/30' },
  intermediate: { label: 'Intermediate', color: 'bg-warn/10 text-warn ring-warn/30' },
  elite: { label: 'Elite', color: 'bg-danger/10 text-danger ring-danger/30' },
};

/* -------------------------------------------------------------------------- */
/* Lookup + unlock gating                                                      */
/* -------------------------------------------------------------------------- */

/** Turn a stored custom exercise into a full Exercise the engine can score. */
export function customToExercise(custom: CustomExercise): Exercise {
  return {
    id: str(custom.id, 'custom'),
    name: str(custom.name, 'Custom Exercise'),
    category: custom.category ?? 'conditioning',
    grade: 'foundation',
    unit: custom.unit === 'seconds' ? 'seconds' : 'reps',
    // Clamped so a hand-authored value can never mint unbounded XP.
    xpPerUnit: Math.min(Math.max(num(custom.xpPerUnit, 1), 0.1), 8),
    statWeights: { strength: 0.3, endurance: 0.3, aesthetics: 0.25, discipline: 0.15 },
    minLevel: 1,
    diagram: 'pushup',
    formCues: ['Your own movement — log it however you defined it.'],
    mistakes: [],
    custom: true,
  };
}

/** The catalog plus this user's own movements. */
export function allExercisesFor(profile: Profile | null): Exercise[] {
  const custom = arr<CustomExercise>(profile?.customExercises).map(customToExercise);
  return [...EXERCISES, ...custom];
}

export function findExercise(profile: Profile | null, id: string): Exercise | undefined {
  return allExercisesFor(profile).find((e) => e.id === id);
}

/** Catalog lookup that does not need a profile — for progression step links. */
export function exerciseById(id: string | undefined): Exercise | undefined {
  if (!id) return undefined;
  return EXERCISES.find((e) => e.id === id);
}

/**
 * Is this movement available to the user?
 *
 * A movement opens either by reaching its `minLevel` or by buying its unlock in
 * the shop. Custom movements are always available to their author.
 */
export function isUnlocked(exercise: Exercise, profile: Profile | null): boolean {
  if (exercise.custom) return true;
  const level = num(profile?.level, 1);
  if (level >= exercise.minLevel) return true;
  if (!exercise.unlockId) return false;
  return arr<string>(profile?.inventory?.unlocks).includes(exercise.unlockId);
}

/** Short human explanation of why a movement is still locked. */
export function lockReason(exercise: Exercise, profile: Profile | null): string | null {
  if (isUnlocked(exercise, profile)) return null;
  return exercise.unlockId
    ? `Reach level ${exercise.minLevel} — or unlock it in the Shop`
    : `Reach level ${exercise.minLevel}`;
}

export function unlockedExercises(profile: Profile | null): Exercise[] {
  return allExercisesFor(profile).filter((e) => isUnlocked(e, profile));
}

export function lockedExercises(profile: Profile | null): Exercise[] {
  return allExercisesFor(profile).filter((e) => !isUnlocked(e, profile));
}

/** A YouTube search for the movement — zero-maintenance form demos. */
export function demoSearchUrl(exercise: Exercise): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${exercise.name} calisthenics proper form tutorial`,
  )}`;
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export interface PresetItem {
  exerciseId: string;
  sets: number;
  amount: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  /** Recommended level — presets above it are shown but flagged. */
  recommendedLevel: number;
  focus: ExerciseCategory;
  /** The setup this routine assumes. Used to filter by what you have access to. */
  setup: 'bodyweight' | 'bar' | 'power_tower' | 'park';
  /** Headline muscles this routine targets, for the muscle-group filter. */
  targets: string[];
  items: PresetItem[];
}

export const PRESETS: Preset[] = [
  {
    id: 'beginner_push',
    name: 'Beginner Push',
    description: 'The first pressing block. Builds the elbow and shoulder strength everything else stands on.',
    recommendedLevel: 1,
    focus: 'push',
    setup: 'bodyweight',
    targets: ['chest', 'triceps', 'abs'],
    items: [
      { exerciseId: 'push_up', sets: 3, amount: 10 },
      { exerciseId: 'incline_push_up', sets: 2, amount: 12 },
      { exerciseId: 'plank', sets: 3, amount: 30 },
    ],
  },
  {
    id: 'beginner_pull',
    name: 'Beginner Pull',
    description: 'Rows and hangs to build the back and grip that a first pull-up demands.',
    recommendedLevel: 1,
    focus: 'pull',
    setup: 'park',
    targets: ['upper_back', 'lats', 'abs'],
    items: [
      { exerciseId: 'australian_row', sets: 3, amount: 10 },
      { exerciseId: 'leg_raise', sets: 3, amount: 12 },
      { exerciseId: 'squat', sets: 3, amount: 15 },
    ],
  },
  {
    id: 'foundation_full',
    name: 'Full Body Foundation',
    description: 'A balanced push/pull/legs circuit. The best default when you are unsure what to train.',
    recommendedLevel: 1,
    focus: 'conditioning',
    setup: 'park',
    targets: ['chest', 'upper_back', 'quads', 'abs'],
    items: [
      { exerciseId: 'push_up', sets: 4, amount: 12 },
      { exerciseId: 'australian_row', sets: 4, amount: 10 },
      { exerciseId: 'squat', sets: 4, amount: 20 },
      { exerciseId: 'plank', sets: 3, amount: 45 },
    ],
  },
  {
    id: 'bar_basics',
    name: 'Bar Basics',
    description: 'Everything that hangs from a bar. The core session for building real pulling strength.',
    recommendedLevel: 1,
    focus: 'pull',
    setup: 'bar',
    targets: ['lats', 'biceps', 'abs'],
    items: [
      { exerciseId: 'pull_up', sets: 4, amount: 6 },
      { exerciseId: 'chin_up', sets: 3, amount: 8 },
      { exerciseId: 'hanging_knee_raise', sets: 3, amount: 10 },
    ],
  },
  {
    id: 'push_pull_dips',
    name: 'Push Day — Bars',
    description: 'Dips and presses together. The fastest route to visible upper-body strength.',
    recommendedLevel: 1,
    focus: 'push',
    setup: 'power_tower',
    targets: ['chest', 'triceps', 'shoulders'],
    items: [
      { exerciseId: 'dip', sets: 4, amount: 8 },
      { exerciseId: 'push_up', sets: 3, amount: 15 },
      { exerciseId: 'pike_push_up', sets: 3, amount: 10 },
    ],
  },
  {
    id: 'core_circuit',
    name: 'Core Circuit',
    description: 'Midline work that carries straight over into every skill movement.',
    recommendedLevel: 1,
    focus: 'core',
    setup: 'bar',
    targets: ['abs', 'obliques'],
    items: [
      { exerciseId: 'hollow_hold', sets: 3, amount: 30 },
      { exerciseId: 'hanging_knee_raise', sets: 3, amount: 12 },
      { exerciseId: 'plank', sets: 3, amount: 45 },
      { exerciseId: 'leg_raise', sets: 3, amount: 15 },
    ],
  },
  {
    id: 'conditioning_burn',
    name: 'Conditioning Burn',
    description: 'Short, unpleasant, effective. Big endurance gains with no equipment at all.',
    recommendedLevel: 1,
    focus: 'conditioning',
    setup: 'bodyweight',
    targets: ['quads', 'abs', 'calves'],
    items: [
      { exerciseId: 'burpee', sets: 4, amount: 12 },
      { exerciseId: 'mountain_climber', sets: 4, amount: 30 },
      { exerciseId: 'squat', sets: 3, amount: 25 },
    ],
  },
  {
    id: 'advanced_core',
    name: 'Advanced Core',
    description: 'Compression and straight-arm strength — the prerequisites for L-sits and levers.',
    recommendedLevel: 6,
    focus: 'core',
    setup: 'power_tower',
    targets: ['abs', 'obliques', 'quads'],
    items: [
      { exerciseId: 'l_sit', sets: 4, amount: 15 },
      { exerciseId: 'toes_to_bar', sets: 3, amount: 8 },
      { exerciseId: 'hollow_hold', sets: 3, amount: 45 },
    ],
  },
  {
    id: 'skill_session',
    name: 'Skill Session',
    description: 'Low volume, maximum intent. Static holds trained fresh, never to failure.',
    recommendedLevel: 14,
    focus: 'skill',
    setup: 'park',
    targets: ['shoulders', 'lats', 'abs'],
    items: [
      { exerciseId: 'planche_lean', sets: 5, amount: 15 },
      { exerciseId: 'front_lever', sets: 5, amount: 8 },
      { exerciseId: 'l_sit', sets: 3, amount: 20 },
    ],
  },
  {
    id: 'lat_width',
    name: 'Back Width',
    description: 'Everything that builds the V-taper. The highest-leverage session for how your upper body reads.',
    recommendedLevel: 1,
    focus: 'pull',
    setup: 'bar',
    targets: ['lats', 'upper_back'],
    items: [
      { exerciseId: 'wide_pull_up', sets: 4, amount: 6 },
      { exerciseId: 'pull_up', sets: 3, amount: 8 },
      { exerciseId: 'australian_row', sets: 3, amount: 12 },
    ],
  },
  {
    id: 'chest_focus',
    name: 'Chest Focus',
    description: 'Pec-biased pressing from three angles. Dips do the heavy lifting.',
    recommendedLevel: 1,
    focus: 'push',
    setup: 'power_tower',
    targets: ['chest', 'triceps'],
    items: [
      { exerciseId: 'dip', sets: 4, amount: 8 },
      { exerciseId: 'push_up', sets: 4, amount: 15 },
      { exerciseId: 'incline_push_up', sets: 3, amount: 15 },
    ],
  },
  {
    id: 'shoulder_focus',
    name: 'Shoulder Builder',
    description: 'Vertical pressing volume. Shoulder width frames everything else.',
    recommendedLevel: 1,
    focus: 'push',
    setup: 'bodyweight',
    targets: ['shoulders', 'triceps'],
    items: [
      { exerciseId: 'pike_push_up', sets: 5, amount: 10 },
      { exerciseId: 'push_up', sets: 3, amount: 15 },
      { exerciseId: 'plank', sets: 3, amount: 45 },
    ],
  },
  {
    id: 'arms_focus',
    name: 'Arm Day',
    description: 'Chin-ups for biceps, diamonds and dips for triceps. Triceps are two thirds of arm size.',
    recommendedLevel: 1,
    focus: 'pull',
    setup: 'power_tower',
    targets: ['biceps', 'triceps', 'forearms'],
    items: [
      { exerciseId: 'chin_up', sets: 4, amount: 8 },
      { exerciseId: 'diamond_push_up', sets: 4, amount: 12 },
      { exerciseId: 'dip', sets: 3, amount: 10 },
    ],
  },
  {
    id: 'legs_focus',
    name: 'Legs & Glutes',
    description: 'The session most calisthenics athletes skip. Costs no equipment and fixes your proportions.',
    recommendedLevel: 1,
    focus: 'legs',
    setup: 'bodyweight',
    targets: ['quads', 'glutes', 'hamstrings', 'calves'],
    items: [
      { exerciseId: 'squat', sets: 4, amount: 25 },
      { exerciseId: 'lunge', sets: 4, amount: 20 },
      { exerciseId: 'burpee', sets: 3, amount: 10 },
    ],
  },
  {
    id: 'abs_focus',
    name: 'Midsection',
    description: 'Direct ab and oblique work. Remember definition is mostly a body-fat story.',
    recommendedLevel: 1,
    focus: 'core',
    setup: 'bar',
    targets: ['abs', 'obliques'],
    items: [
      { exerciseId: 'hanging_knee_raise', sets: 4, amount: 12 },
      { exerciseId: 'hollow_hold', sets: 3, amount: 40 },
      { exerciseId: 'leg_raise', sets: 3, amount: 15 },
      { exerciseId: 'mountain_climber', sets: 3, amount: 30 },
    ],
  },
  {
    id: 'posture_fix',
    name: 'Posture Repair',
    description: 'Pulling-heavy work to undo rounded shoulders. Standing tall changes your silhouette more than any single muscle.',
    recommendedLevel: 1,
    focus: 'pull',
    setup: 'park',
    targets: ['upper_back', 'lats', 'lower_back'],
    items: [
      { exerciseId: 'australian_row', sets: 4, amount: 12 },
      { exerciseId: 'pull_up', sets: 3, amount: 6 },
      { exerciseId: 'plank', sets: 3, amount: 45 },
    ],
  },
  {
    id: 'hotel_room',
    name: 'Hotel Room',
    description: 'Zero equipment, zero space, no excuses. Full body in under twenty minutes.',
    recommendedLevel: 1,
    focus: 'conditioning',
    setup: 'bodyweight',
    targets: ['chest', 'quads', 'abs'],
    items: [
      { exerciseId: 'push_up', sets: 4, amount: 15 },
      { exerciseId: 'squat', sets: 4, amount: 25 },
      { exerciseId: 'plank', sets: 3, amount: 45 },
      { exerciseId: 'mountain_climber', sets: 3, amount: 40 },
    ],
  },
];
