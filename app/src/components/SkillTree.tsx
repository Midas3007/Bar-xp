import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';

import type { SkillGraph, SkillNode, SkillNodeState } from '../lib/game/skillTree';
import { CATEGORY_META } from '../lib/game/exercises';

/**
 * The skill tree, drawn as one inline SVG.
 *
 * Same register as `ExerciseDiagram.tsx`: `currentColor`, rounded caps,
 * restraint. Colour comes from `CATEGORY_META` — the Tailwind class goes on a
 * `<g>` and every shape inside inherits it, which is how the diagrams already
 * work and why nothing here needs a second palette.
 *
 * Pan and zoom move the `viewBox` rather than applying a CSS transform. A
 * transform scales the rasterised result, so strokes fatten and text blurs;
 * moving the viewBox re-renders at the new scale and the 1.5px edges stay
 * 1.5px at every zoom level.
 */

/** The authored coordinate space has generous margins around the outermost nodes. */
const PADDING = 140;

/** Node radii, in authored units. Elite skills are the point of the picture. */
const RADIUS: Record<string, number> = {
  drill: 13,
  foundation: 21,
  intermediate: 25,
  elite: 33,
};

function radiusOf(node: SkillNode): number {
  if (node.kind === 'drill') return RADIUS.drill;
  return RADIUS[node.grade ?? 'foundation'] ?? RADIUS.foundation;
}

/**
 * Muted rather than hidden. A locked skill you cannot see is a skill you do not
 * know to want, which defeats the entire feature.
 */
function toneFor(node: SkillNode, state: SkillNodeState): string {
  if (state === 'locked') return 'text-content-faint';
  return CATEGORY_META[node.category].color;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SkillTree({
  graph,
  states,
  focus,
  selectedId,
  onSelect,
}: {
  graph: SkillGraph;
  states: Record<string, SkillNodeState>;
  /** Where to open. A narrow screen centres on the frontier rather than fitting all. */
  focus: SkillNode | null;
  selectedId: string | null;
  onSelect: (node: SkillNode) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // `null` until the host has actually been measured. Framing against a guessed
  // size opened every desktop at the phone's zoom.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const world = useMemo(() => {
    const b = graph.bounds;
    return {
      x: b.minX - PADDING,
      y: b.minY - PADDING,
      w: b.maxX - b.minX + PADDING * 2,
      h: b.maxY - b.minY + PADDING * 2,
    };
  }, [graph.bounds]);

  const [box, setBox] = useState<Box>(world);
  /** Set once the first real measurement has framed the tree. */
  const framedRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const aspect = size ? size.w / Math.max(1, size.h) : 16 / 10;

  /** The viewBox that shows everything, letterboxed to the host's shape. */
  const fitted = useCallback((): Box => {
    const w = Math.max(world.w, world.h * aspect);
    const h = w / aspect;
    return { x: world.x + (world.w - w) / 2, y: world.y + (world.h - h) / 2, w, h };
  }, [world, aspect]);

  /**
   * A tree scaled to fit a 390px phone is unreadable and impressive to nobody,
   * so a narrow host opens centred on the athlete's frontier at a zoom where
   * the labels can be read, and lets them explore outward from there.
   */
  const opening = useCallback((): Box => {
    const whole = fitted();
    if (!size || size.w >= 900 || !focus) return whole;
    const w = Math.min(whole.w, 1100);
    const h = w / aspect;
    return { x: focus.x - w / 2, y: focus.y - h / 2, w, h };
  }, [fitted, focus, size, aspect]);

  const clamp = useCallback(
    (next: Box): Box => {
      const whole = fitted();
      // Zoom bounds: no closer than a couple of nodes filling the frame, and no
      // further out than the whole tree with a little slack.
      const w = Math.min(Math.max(next.w, 420), whole.w * 1.35);
      const h = w / aspect;
      // The frame is held inside the authored space on each axis independently,
      // so the tree can never be panned away and no amount of dragging finds
      // empty canvas. When the frame is wider than the world on an axis — which
      // it is on at least one, since the two rarely share a shape — it centres
      // there instead.
      const axis = (start: number, span: number, world0: number, worldSpan: number) =>
        span >= worldSpan
          ? world0 + (worldSpan - span) / 2
          : Math.min(Math.max(start, world0), world0 + worldSpan - span);
      const cx = next.x + next.w / 2;
      const cy = next.y + next.h / 2;
      return {
        x: axis(cx - w / 2, w, world.x, world.w),
        y: axis(cy - h / 2, h, world.y, world.h),
        w,
        h,
      };
    },
    [fitted, world, aspect],
  );

  // Frame once, when the host has been measured. Re-framing on every resize
  // would throw away the athlete's own pan the moment the keyboard opens.
  useEffect(() => {
    if (framedRef.current || !size) return;
    framedRef.current = true;
    setBox(clamp(opening()));
  }, [opening, clamp, size]);

  /** Zoom about a point given in authored coordinates, so it stays put. */
  const zoomAt = useCallback(
    (factor: number, atX: number, atY: number) => {
      setBox((current) => {
        const w = current.w * factor;
        const h = current.h * factor;
        const kx = (atX - current.x) / current.w;
        const ky = (atY - current.y) / current.h;
        return clamp({ x: atX - kx * w, y: atY - ky * h, w, h });
      });
    },
    [clamp],
  );

  const toWorld = useCallback((clientX: number, clientY: number, from: Box) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    return {
      x: from.x + ((clientX - rect.left) / rect.width) * from.w,
      y: from.y + ((clientY - rect.top) / rect.height) * from.h,
    };
  }, []);

  /* --- Pointer handling: drag to pan, two fingers to pinch ---------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; box: Box } | null>(null);
  const pinchRef = useRef<{ distance: number; box: Box } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), box };
      dragRef.current = null;
      setDragging(false);
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY, box };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const start = pinchRef.current;
      const scale = start.distance / distance;
      const w = start.box.w * scale;
      const h = start.box.h * scale;
      const centre = { x: start.box.x + start.box.w / 2, y: start.box.y + start.box.h / 2 };
      setBox(clamp({ x: centre.x - w / 2, y: centre.y - h / 2, w, h }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((event.clientX - drag.x) / rect.width) * drag.box.w;
    const dy = ((event.clientY - drag.y) / rect.height) * drag.box.h;
    // A drag only counts as a pan once it has actually moved, so a tap on a
    // node is not swallowed by the pan handler.
    if (!dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
      setDragging(true);
    }
    setBox(clamp({ ...drag.box, x: drag.box.x - dx, y: drag.box.y - dy }));
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) {
      dragRef.current = null;
      // Cleared on the next frame so the click that follows the drag can see it.
      window.setTimeout(() => setDragging(false), 0);
    }
  };

  // Wheel zoom is registered by hand: React's synthetic wheel listener is
  // passive, so `preventDefault` there does nothing and the page scrolls
  // instead of the tree zooming.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setBox((current) => {
        const at = toWorld(event.clientX, event.clientY, current);
        const factor = Math.exp(event.deltaY * 0.0016);
        const w = current.w * factor;
        const h = current.h * factor;
        const kx = (at.x - current.x) / current.w;
        const ky = (at.y - current.y) / current.h;
        return clamp({ x: at.x - kx * w, y: at.y - ky * h, w, h });
      });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [clamp, toWorld]);

  const recentre = () => setBox(clamp(opening()));

  /* --- Drawing ------------------------------------------------------------ */

  // Labels are drawn in authored units, so they shrink as the view widens.
  // Below this the drill captions are unreadable and only add noise.
  const showDrillLabels = box.w < 1700;
  const strokeScale = box.w / Math.max(1, size?.w ?? 800);

  const paths = useMemo(
    () =>
      graph.edges.map((edge) => {
        const from = graph.byId[edge.from];
        const to = graph.byId[edge.to];
        return { edge, from, to, d: bowedPath(from, to) };
      }),
    [graph],
  );

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full touch-none overflow-hidden rounded-xl bg-surface-sunken/40 ring-1 ring-inset ring-line"
    >
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className={`h-full w-full ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        role="group"
        aria-label="Skill tree"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        {/* --- Edges, behind everything --- */}
        <g fill="none" strokeLinecap="round">
          {paths.map(({ edge, from, to, d }) => {
            if (!from || !to) return null;
            const walked = states[from.id] === 'cleared' && states[to.id] === 'cleared';
            const live = states[to.id] === 'available' || states[to.id] === 'in_progress';
            return (
              <path
                key={`${edge.from}->${edge.to}${edge.support ? ':s' : ''}`}
                d={d}
                className={walked || live ? toneFor(to, states[to.id]) : 'text-content-faint'}
                stroke="currentColor"
                strokeWidth={edge.support ? 2 : walked ? 4 : 3}
                strokeDasharray={edge.support ? '10 12' : undefined}
                opacity={walked ? 0.55 : live ? 0.32 : 0.16}
              />
            );
          })}
        </g>

        {/* --- Nodes --- */}
        {graph.nodes.map((node) => (
          <Node
            key={node.id}
            node={node}
            state={states[node.id] ?? 'locked'}
            selected={selectedId === node.id}
            showLabel={node.kind === 'movement' || showDrillLabels}
            strokeScale={strokeScale}
            onActivate={() => {
              if (!dragging) onSelect(node);
            }}
          />
        ))}
      </svg>

      {/* --- Controls. A recentre button is cheaper than a perfect clamp and
              more forgiving than either. --- */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <ZoomButton
          label="Zoom in"
          onClick={() => zoomAt(1 / 1.4, box.x + box.w / 2, box.y + box.h / 2)}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </ZoomButton>
        <ZoomButton
          label="Zoom out"
          onClick={() => zoomAt(1.4, box.x + box.w / 2, box.y + box.h / 2)}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </ZoomButton>
        <ZoomButton label="Recentre" onClick={recentre}>
          <Crosshair className="h-4 w-4" aria-hidden />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg bg-surface-raised/90 p-2 text-content-muted shadow-sm ring-1 ring-line-strong backdrop-blur transition hover:bg-surface-hover hover:text-content-strong"
    >
      {children}
    </button>
  );
}

/**
 * A quadratic with a slight bow.
 *
 * Straight segments make the tree read as a flowchart; a consistent, gentle
 * curve reads as something grown. The control point is offset perpendicular to
 * the segment by a fraction of its length, so short hops stay nearly straight
 * and long spans sweep.
 */
function bowedPath(from: SkillNode | undefined, to: SkillNode | undefined): string {
  if (!from || !to) return '';
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bow = Math.min(length * 0.12, 46);
  const cx = (from.x + to.x) / 2 + (-dy / length) * bow;
  const cy = (from.y + to.y) / 2 + (dx / length) * bow;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

function Node({
  node,
  state,
  selected,
  showLabel,
  strokeScale,
  onActivate,
}: {
  node: SkillNode;
  state: SkillNodeState;
  selected: boolean;
  showLabel: boolean;
  strokeScale: number;
  onActivate: () => void;
}) {
  const r = radiusOf(node);
  const tone = toneFor(node, state);
  const cleared = state === 'cleared';
  const available = state === 'available';
  const inProgress = state === 'in_progress';

  // The fraction of its chain this node has reached, drawn as a partial ring.
  const progress =
    inProgress && node.step && node.chainLength ? node.step / (node.chainLength + 1) : 0;
  const circumference = 2 * Math.PI * (r + 7);

  const label = node.kind === 'movement' ? node.label : node.label;
  const fontSize = node.kind === 'movement' ? (node.terminal ? 26 : 21) : 17;

  return (
    <g
      className={`${tone} focus:outline-none`}
      role="button"
      tabIndex={0}
      aria-label={`${label} — ${STATE_LABEL[state]}`}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* A generous invisible target: the drill circles are 13 units across and
          a finger is not. */}
      <circle cx={node.x} cy={node.y} r={r + 16} fill="transparent" />

      {/* Available nodes breathe. `index.css` disarms every CSS animation under
          prefers-reduced-motion, so this needs no opt-out of its own. */}
      {available ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={r + 9}
          fill="currentColor"
          opacity={0.16}
          className="animate-pulse"
        />
      ) : null}

      {selected ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={r + 13}
          fill="none"
          stroke="currentColor"
          strokeWidth={3 * strokeScale}
          opacity={0.9}
        />
      ) : null}

      {inProgress ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={r + 7}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          transform={`rotate(-90 ${node.x} ${node.y})`}
          opacity={0.75}
        />
      ) : null}

      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill={cleared ? 'currentColor' : 'rgb(var(--surface-raised))'}
        fillOpacity={cleared ? 0.9 : 1}
        stroke="currentColor"
        strokeWidth={node.terminal ? 5 : 3.5}
        opacity={state === 'locked' ? 0.55 : 1}
      />

      {/* Cleared movements carry a tick; cleared drills are too small for one. */}
      {cleared && node.kind === 'movement' ? (
        <path
          d={`M ${node.x - r * 0.42} ${node.y} l ${r * 0.3} ${r * 0.34} l ${r * 0.56} ${-r * 0.66}`}
          fill="none"
          stroke="rgb(var(--surface-raised))"
          strokeWidth={r * 0.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Elite skills get a second ring — they should look like the destination. */}
      {node.terminal ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={r + 10}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          opacity={state === 'locked' ? 0.3 : 0.55}
        />
      ) : null}

      {showLabel ? (
        <text
          x={node.x}
          // Movement names sit above the node and drill captions below it.
          // Chains arrive from underneath, so a name placed below its own
          // movement would be drawn straight through the last drill of the
          // route that leads to it.
          y={node.kind === 'movement' ? node.y - r - 16 : node.y + r + 22}
          textAnchor="middle"
          fontSize={fontSize}
          className={state === 'locked' ? 'fill-content-subtle' : 'fill-content'}
          style={{ fontWeight: node.kind === 'movement' ? 600 : 400, pointerEvents: 'none' }}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

const STATE_LABEL: Record<SkillNodeState, string> = {
  cleared: 'logged',
  available: 'ready to train',
  in_progress: 'in progress',
  locked: 'locked',
};

export { STATE_LABEL };
